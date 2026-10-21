import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { getAuthConfig } from '../src/config/auth.js';
import { getPool, closePool } from '../src/db/pool.js';
import { query } from '../src/db/query.js';
import { runMigrations, getMigrationStatus } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { createFixtures } from './auth-fixtures.js';
import { bootstrapIdentity } from '../src/services/bootstrap-identity.service.js';
import { updateEntity } from '../src/services/identity.service.js';
import { password as validatePassword } from '../src/validators/auth.validators.js';
import { signSession } from '../src/services/session-security.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
const origin = 'http://localhost:5173';
class Client {
  constructor(url) { this.url = url; this.cookies = new Map(); }
  async request(path, method = 'GET', body, extra = {}) {
    const headers = { Origin: origin, Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...extra };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${this.url}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, value] = cookie.split(';')[0].split('=');
      this.cookies.set(key, value);
    }
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }
  async write(path, body, method = 'POST', headers = {}) {
    const csrf = await this.request('/auth/csrf');
    assert.equal(csrf.status, 200);
    return this.request(path, method, body, { 'X-CSRF-Token': csrf.body.csrfToken, ...headers });
  }
  async login(password, email = 'admin@alpha.test', tenantCode = 'ALPHA') {
    return this.write('/auth/login', { password, email, tenantCode });
  }
}

test('PR-00B identity and access integration', { timeout: 120000 }, async t => {
  t.after(closePool);
  await t.test('upgrades the foundation and preserves applied migration history', async () => {
    await runMigrations({ migrations: migrations.slice(0, 1) });
    const { rows: before } = await query("SELECT * FROM schema_migrations WHERE migration_key = 'm001_foundation'");
    await runMigrations();
    const { rows: after } = await query("SELECT * FROM schema_migrations WHERE migration_key = 'm001_foundation'");
    assert.deepEqual(after, before);
    await runMigrations();
    assert.ok((await getMigrationStatus()).every(row => row.status === 'applied' && row.attempts === 1));
  });
  const fixture = await createFixtures();
  const server = createApp({ logger: { error() {} } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = () => new Client(url);
  const signedIn = async (email, tenantCode) => {
    const c = client();
    assert.equal((await c.login(fixture.password, email, tenantCode)).status, 200);
    return c;
  };
  await t.test('anonymous access, bad credentials and unknown users fail safely', async () => {
    const c = client();
    assert.equal((await c.request('/me')).status, 401);
    assert.equal((await c.request('/organizations')).status, 401);
    const wrong = await c.login('incorrect-password');
    const missing = await c.login('incorrect-password', 'missing@alpha.test');
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.deepEqual(wrong.body.error, missing.body.error);
    // MySQL's default accent-insensitive collation must not create alternate
    // spellings that authenticate the same account under different rate buckets.
    assert.equal((await c.login(fixture.password, 'ádmin@alpha.test')).status, 401);
    assert.ok(wrong.body.requestId);
    assert.equal((await c.request('/auth/login', 'POST', {})).body.error.code, 'CSRF_INVALID');
  });
  await t.test('login cookies and profile contain no password hash or bearer token', async () => {
    const c = client();
    const response = await c.login(fixture.password);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict') && cookie.includes('Path=/')));
    assert.equal(response.body.tenant.code, 'ALPHA');
    assert.equal(response.body.entities.length, 2);
    assert.equal(response.body.activeEntity.id, fixture.alpha.entityId);
    assert.ok(!JSON.stringify(response.body).includes('password'));
    assert.ok(!JSON.stringify(response.body).includes('eyJ'));
    assert.ok(response.body.permissions.includes('organizations.update'));
  });
  await t.test('tenant A cannot list, read, switch to or mutate tenant B', async () => {
    const c = await signedIn();
    const organizations = await c.request('/organizations?limit=1');
    assert.equal(organizations.body.total, 2);
    assert.equal(organizations.body.items.length, 1);
    assert.equal((await c.request(`/organizations/${fixture.beta.entityId}`)).status, 404);
    assert.equal((await c.write('/auth/context', { legalEntityId: fixture.beta.entityId })).status, 403);
    assert.equal((await c.write(`/organizations/${fixture.beta.entityId}`, { name: 'Stolen' }, 'PATCH')).status, 403);
    assert.equal((await c.request(`/organizations?tenantId=${fixture.beta.tenantId}`)).status, 400);
    const b = await signedIn('admin@beta.test', 'BETA');
    assert.equal((await b.request(`/organizations/${fixture.beta.entityId}`)).body.organization.name, 'Beta one');
    assert.equal((await b.request(`/organizations/${fixture.alpha.entityId}`)).status, 404);
  });
  await t.test('entity scope and deny-by-default survive browser claims and direct service calls', async () => {
    const viewer = await signedIn('viewer@alpha.test');
    assert.equal((await viewer.request('/me')).body.activeEntity.id, fixture.secondEntity);
    assert.equal((await viewer.write('/auth/context', { legalEntityId: fixture.alpha.entityId })).status, 403);
    assert.equal((await viewer.write(`/organizations/${fixture.secondEntity}`, { name: 'Forbidden' }, 'PATCH')).status, 403);
    await assert.rejects(updateEntity({ tenantId: fixture.alpha.tenantId, userId: fixture.viewer }, fixture.secondEntity, 'Denied'),
      { code: 'FORBIDDEN' });
    const nobody = await signedIn('none@alpha.test');
    const profile = (await nobody.request('/me')).body;
    assert.deepEqual(profile.entities, []);
    assert.deepEqual(profile.permissions, []);
    assert.equal(profile.activeEntity, null);
    assert.equal((await nobody.write('/auth/context', { legalEntityId: fixture.secondEntity })).status, 403);
    const admin = await signedIn();
    assert.equal((await admin.write('/auth/context', { legalEntityId: fixture.unassignedEntity })).status, 403);
  });
  await t.test('authorized context selection persists and scoped updates succeed', async () => {
    const c = await signedIn();
    const selected = await c.write('/auth/context', { legalEntityId: fixture.secondEntity });
    assert.equal(selected.status, 200);
    assert.equal((await c.request('/me')).body.activeEntity.id, fixture.secondEntity);
    const updated = await c.write(`/organizations/${fixture.secondEntity}`, { name: 'Alpha renamed' }, 'PATCH');
    assert.equal(updated.status, 200);
    assert.equal(updated.body.organization.name, 'Alpha renamed');
    assert.equal((await c.write(`/organizations/${fixture.secondEntity}`, { name: 'bad', tenantId: fixture.beta.tenantId }, 'PATCH')).status, 400);
  });
  await t.test('CSRF requires the signed session-bound cookie, token, JSON and allowed Origin', async () => {
    const a = await signedIn();
    const b = await signedIn();
    const csrfA = await a.request('/auth/csrf');
    const csrfB = await b.request('/auth/csrf');
    assert.equal((await a.request('/auth/logout', 'POST', {})).status, 403);
    assert.equal((await a.request('/auth/logout', 'POST', {}, { 'X-CSRF-Token': csrfB.body.csrfToken })).status, 403);
    // Copying BOTH values from another session also fails.
    a.cookies.set('export_csrf', b.cookies.get('export_csrf'));
    assert.equal((await a.request('/auth/logout', 'POST', {}, { 'X-CSRF-Token': csrfB.body.csrfToken })).status, 403);
    assert.equal((await a.write('/auth/logout', {}, 'POST', { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await a.write('/auth/logout', {}, 'POST', { Origin: '' })).status, 403);
    assert.equal((await a.write('/auth/logout', {}, 'POST', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    const preflight = await a.request('/auth/login', 'OPTIONS', undefined, { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-CSRF-Token,Content-Type' });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-CSRF-Token/);
    assert.equal((await a.request('/auth/logout', 'POST', undefined, { 'X-CSRF-Token': csrfA.body.csrfToken })).status, 415);
  });
  await t.test('logout invalidates a copied session token and clears cookies', async () => {
    const c = await signedIn();
    const replay = client();
    replay.cookies = new Map(c.cookies);
    const result = await c.write('/auth/logout', {});
    assert.equal(result.status, 204);
    assert.ok(result.headers.getSetCookie().every(cookie => cookie.includes('Expires=Thu, 01 Jan 1970')));
    assert.equal((await replay.request('/me')).status, 401);
  });
  await t.test('expired, tampered and wrong-algorithm tokens are rejected', async () => {
    const c = await signedIn();
    const config = getAuthConfig();
    const token = c.cookies.get(config.sessionCookie);
    const claims = jwt.decode(token);
    c.cookies.set(config.sessionCookie, `${token.slice(0, -10)}tamperedxx`);
    assert.equal((await c.request('/me')).status, 401);
    c.cookies.set(config.sessionCookie, jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 }, config.secret));
    assert.equal((await c.request('/me')).status, 401);
    c.cookies.set(config.sessionCookie, jwt.sign(claims, config.secret, { algorithm: 'HS384' }));
    assert.equal((await c.request('/me')).status, 401);
    c.cookies.set(config.sessionCookie, token);
    await query('UPDATE auth_sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE id = ?', [claims.jti]);
    assert.equal((await c.request('/me')).status, 401);
    const fake = signSession({ id: claims.jti, tenantId: fixture.beta.tenantId, userId: fixture.alpha.userId }, config);
    c.cookies.set(config.sessionCookie, fake);
    assert.equal((await c.request('/me')).status, 401);
  });
  await t.test('permission revocation and account disabling take effect on existing sessions', async () => {
    const c = await signedIn('viewer@alpha.test');
    await query("DELETE FROM role_permissions WHERE tenant_id = ? AND role_id = ? AND permission_code = 'organizations.read'",
      [fixture.alpha.tenantId, fixture.viewerRole]);
    assert.equal((await c.request(`/organizations/${fixture.secondEntity}`)).status, 403);
    await query('UPDATE users SET active = 0 WHERE tenant_id = ? AND id = ?', [fixture.alpha.tenantId, fixture.viewer]);
    assert.equal((await c.request('/me')).status, 401);
  });
  await t.test('composite foreign keys reject cross-tenant assignments and sessions', async () => {
    await assert.rejects(query('INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id) VALUES (?, ?, ?, ?)',
      [fixture.alpha.tenantId, fixture.alpha.userId, fixture.alpha.roleId, fixture.beta.entityId]), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(query('UPDATE auth_sessions SET active_entity_id = ? WHERE tenant_id = ?',
      [fixture.beta.entityId, fixture.alpha.tenantId]), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(bootstrapIdentity(fixture.input), { code: 'TENANT_EXISTS' });
    assert.throws(() => validatePassword('é'.repeat(37), true), { code: 'VALIDATION_ERROR' });
  });
  await t.test('persistent rate limits reject repeated login attempts before password work', async () => {
    await query('DELETE FROM auth_rate_limits');
    const c = client();
    for (let i = 0; i < 20; i++) assert.equal((await c.login('wrong-password')).status, 401);
    const limited = await c.login(fixture.password);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '900');
    const other = client();
    assert.equal((await other.login(fixture.password)).status, 429);
    await query('UPDATE auth_rate_limits SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)');
    assert.equal((await other.login(fixture.password)).status, 200);
  });
  await t.test('production cookies require TLS and configuration rejects weak secrets', async () => {
    assert.throws(() => getAuthConfig({ AUTH_SECRET: 'weak' }), /AUTH_SECRET/);
    assert.throws(() => getAuthConfig({ AUTH_SECRET: 'a'.repeat(64), AUTH_SESSION_SECONDS: '1' }), /AUTH_SESSION_SECONDS/);
    const config = getAuthConfig({ AUTH_SECRET: 'a'.repeat(64), NODE_ENV: 'production' });
    assert.equal(config.secure, true);
    assert.match(config.sessionCookie, /^__Host-/);
    assert.equal((await getPool().execute('SELECT COUNT(*) AS count FROM tenants'))[0][0].count, 2);
  });
});
