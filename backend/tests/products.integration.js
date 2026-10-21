import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { getMigrationPool, closePool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import { permissionsFor } from '../src/services/identity.service.js';
import * as products from '../src/services/products.service.js';
import * as accounting from '../src/services/accounting-setup.service.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
test('PR-01A catalogue migration, scopes, lifecycle and atomic writes', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations({ migrations: migrations.slice(0, 3) });
  const f = await createFixtures();
  const { rows: before } = await query('SELECT * FROM schema_migrations ORDER BY migration_key');
  await runMigrations();
  await runMigrations();
  const { rows: after } = await query("SELECT * FROM schema_migrations WHERE migration_key IN ('m001_foundation', 'm002_auth_roles_scopes', 'm003_accounting_foundation') ORDER BY migration_key");
  assert.deepEqual(after, before);
  const ctx = (entityId = f.alpha.entityId, userId = f.alpha.userId, tenantId = f.alpha.tenantId) =>
    ({ identity: { tenantId, userId }, entityId, idempotencyKey: randomUUID(), requestId: 'products-test' });
  const viewer = () => ctx(f.secondEntity, f.viewer);
  const beta = () => ctx(f.beta.entityId, f.beta.userId, f.beta.tenantId);
  const unitBody = (code = 'EA') => ({ code, name: 'Adet', symbol: 'ad', quantityPrecision: 0 });
  const familyBody = (code = 'ZARF') => ({ code, name: 'Zarf', parentId: null });
  const update = item => ({ name: item.name, active: item.active,
    ...('symbol' in item ? { symbol: item.symbol } : 'parentId' in item ? { parentId: item.parentId }
      : { familyId: item.familyId, description: item.description }) });
  let unit, family, a4, a3;
  await t.test('upgrade preserves history, grants only ADMIN and starts empty', async () => {
    assert.ok((await permissionsFor(ctx().identity, f.alpha.entityId)).includes('products.manage'));
    assert.ok(!(await permissionsFor(viewer().identity, f.secondEntity)).includes('products.manage'));
    assert.equal((await products.list(ctx(), 'skus', {})).total, 0);
    await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)', [f.alpha.tenantId, f.viewerRole, 'products.read']);
    assert.equal((await products.list(viewer(), 'skus', {})).total, 0);
    await assert.rejects(products.save(viewer(), 'units', unitBody()), { status: 403 });
    await assert.rejects(products.list(viewer(), 'audit-events', {}), { status: 403 });
  });
  await t.test('creates independent A4/A3 SKUs with scoped units and family', async () => {
    unit = (await products.save(ctx(), 'units', unitBody())).item;
    family = (await products.save(ctx(), 'families', familyBody())).item;
    for (const code of ['ZARF-A4', 'ZARF-A3']) {
      const item = (await products.save(ctx(), 'skus', { code, name: code, description: 'Synthetic fixture only', familyId: family.id, baseUnitId: unit.id })).item;
      if (code === 'ZARF-A4') a4 = item; else a3 = item;
    }
    const result = await products.list(ctx(), 'skus', { familyId: family.id });
    assert.equal(result.total, 2);
    assert.deepEqual(result.items.map(row => row.code), ['ZARF-A3', 'ZARF-A4']);
    assert.equal(a4.familyCode, 'ZARF');
    assert.equal(a4.baseUnitCode, 'EA');
    assert.equal((await products.get(ctx(), 'skus', a3.id)).item.id, a3.id);
  });
  await t.test('idempotency replays one write and rejects changed payload', async () => {
    const context = ctx();
    const first = await products.save(context, 'units', unitBody('KG'));
    assert.deepEqual(await products.save(context, 'units', unitBody('KG')), first);
    await assert.rejects(products.save(context, 'units', unitBody('L')), { status: 409 });
    const { rows } = await query('SELECT COUNT(*) AS n FROM audit_events WHERE resource_id = ?', [first.item.id]);
    assert.equal(rows[0].n, 1);
  });
  await t.test('concurrent duplicate code submits leave exactly one record', async () => {
    const results = await Promise.allSettled([products.save(ctx(), 'units', unitBody('RACE')), products.save(ctx(), 'units', unitBody('race'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DUPLICATE_CODE');
    assert.equal((await products.list(ctx(), 'units', { q: 'RACE' })).total, 1);
  });
  await t.test('tenant/entity service guards and composite SQL FKs reject foreign references', async () => {
    const foreignUnit = (await products.save(beta(), 'units', unitBody())).item;
    const secondUnit = (await products.save(ctx(f.secondEntity), 'units', unitBody())).item;
    assert.equal((await products.list(ctx(f.secondEntity), 'units', {})).total, 1);
    for (const context of [ctx(f.beta.entityId), ctx(f.unassignedEntity)]) {
      await assert.rejects(products.list(context, 'units', {}), { status: 403 });
    }
    await assert.rejects(products.get(ctx(), 'units', foreignUnit.id), { status: 404 });
    for (const baseUnitId of [foreignUnit.id, secondUnit.id]) {
      await assert.rejects(products.save(ctx(), 'skus', { code: 'FOREIGN', name: 'Foreign', familyId: family.id, baseUnitId }), { status: 404 });
      await assert.rejects(query(`INSERT INTO product_skus (id, tenant_id, legal_entity_id, code, name, description, family_id, base_unit_id)
        VALUES (?, ?, ?, 'BAD', 'Bad', '', ?, ?)`, [randomUUID(), f.alpha.tenantId, f.alpha.entityId, family.id, baseUnitId]), { code: 'ER_NO_REFERENCED_ROW_2' });
    }
  });
  await t.test('hierarchy rejects self/descendant cycles including concurrent reparenting', async () => {
    const child = (await products.save(ctx(), 'families', { ...familyBody('CHILD'), parentId: family.id })).item;
    for (const parentId of [family.id, child.id]) await assert.rejects(products.save(ctx(), 'families', { ...update(family), parentId }, family.id), { code: 'FAMILY_CYCLE' });
    const x = (await products.save(ctx(), 'families', familyBody('X'))).item;
    const y = (await products.save(ctx(), 'families', familyBody('Y'))).item;
    const results = await Promise.allSettled([
      products.save(ctx(), 'families', { ...update(x), parentId: y.id }, x.id),
      products.save(ctx(), 'families', { ...update(y), parentId: x.id }, y.id),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'FAMILY_CYCLE');
    await assert.rejects(products.save(ctx(), 'families', { ...update(family), active: false }, family.id), { code: 'PRODUCT_IN_USE' });
  });
  await t.test('deactivation preserves identities and enforces active dependencies', async () => {
    await assert.rejects(products.save(ctx(), 'units', { ...update(unit), active: false }, unit.id), { code: 'PRODUCT_IN_USE' });
    for (const sku of [a4, a3]) await products.save(ctx(), 'skus', { ...update(sku), active: false }, sku.id);
    await products.save(ctx(), 'units', { ...update(unit), active: false }, unit.id);
    await assert.rejects(products.save(ctx(), 'skus', update(a4), a4.id), { code: 'INACTIVE_REFERENCE' });
    assert.equal((await products.list(ctx(), 'skus', { active: 'false' })).total, 2);
    await products.save(ctx(), 'units', update(unit), unit.id);
    await products.save(ctx(), 'skus', update(a4), a4.id);
    assert.equal((await products.get(ctx(), 'skus', a4.id)).item.active, true);
  });
  await t.test('strict validation fixes codes/base units/precision and scopes pagination', async () => {
    await assert.rejects(products.save(ctx(), 'skus', { ...update(a4), baseUnitId: randomUUID() }, a4.id), { code: 'VALIDATION_ERROR' });
    await assert.rejects(products.save(ctx(), 'units', { ...update(unit), quantityPrecision: 6 }, unit.id), { code: 'VALIDATION_ERROR' });
    await assert.rejects(products.save(ctx(), 'units', { ...unitBody('INVALID'), quantityPrecision: 7 }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(products.save(ctx(), 'families', { ...update(family), code: 'NEW' }, family.id), { code: 'VALIDATION_ERROR' });
    await assert.rejects(products.list(ctx(), 'skus', { limit: '101' }), { code: 'VALIDATION_ERROR' });
    assert.equal((await products.list(ctx(), 'skus', { q: '%' })).total, 0);
    assert.equal((await products.list(ctx(), 'skus', { q: 'a4', active: 'true' })).total, 1);
    const first = await products.list(ctx(), 'units', { limit: '1' });
    const next = await products.list(ctx(), 'units', { limit: '1', offset: '1' });
    assert.equal(first.items.length, 1);
    assert.notEqual(first.items[0].id, next.items[0].id);
    assert.equal(first.total, next.total);
  });
  await t.test('failed audit rolls back product and idempotency together; retry succeeds', async () => {
    const pool = getMigrationPool();
    const context = ctx();
    await pool.query("CREATE TRIGGER product_test_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'");
    try { await assert.rejects(products.save(context, 'units', unitBody('ROLLBACK'))); }
    finally { await pool.query('DROP TRIGGER product_test_audit'); }
    assert.equal((await products.list(ctx(), 'units', { q: 'ROLLBACK' })).total, 0);
    const { rows } = await query('SELECT COUNT(*) AS n FROM idempotency_records WHERE idempotency_key = ?', [context.idempotencyKey]);
    assert.equal(rows[0].n, 0);
    await products.save(context, 'units', unitBody('ROLLBACK'));
    const audit = await products.list(ctx(), 'audit-events', {});
    assert.ok(audit.items.every(row => row.action.startsWith('product.')));
  });
  await t.test('HTTP enforces sessions, CSRF, idempotency, scope and no destructive route', async () => {
    const server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const cookies = new Map();
      const request = async (path, method = 'GET', body, headers = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method,
          headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...headers },
          body: body === undefined ? undefined : JSON.stringify(body) });
        for (const cookie of response.headers.getSetCookie()) { const [k, v] = cookie.split(';')[0].split('='); cookies.set(k, v); }
        return { status: response.status, body: await response.json() };
      };
      const path = `/entities/${f.alpha.entityId}/products`;
      assert.equal((await request(`${path}/skus`)).status, 401);
      const csrf = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request('/auth/login', 'POST', { tenantCode: 'ALPHA', email: 'admin@alpha.test', password: f.password }, { 'X-CSRF-Token': csrf })).status, 200);
      const token = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request(`${path}/units`, 'POST', unitBody('HTTP'))).status, 403);
      assert.equal((await request(`${path}/units`, 'POST', unitBody('HTTP'), { 'X-CSRF-Token': token })).body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
      const headers = { 'X-CSRF-Token': token, 'Idempotency-Key': randomUUID() };
      const made = await request(`${path}/units`, 'POST', unitBody('HTTP'), headers);
      assert.equal(made.status, 200);
      assert.equal((await request(`${path}/units`, 'POST', unitBody('HTTP'), headers)).body.item.id, made.body.item.id);
      assert.equal((await request(`${path}/units/${made.body.item.id}`, 'PATCH', { name: 'Updated HTTP', symbol: 'u', active: true }, { ...headers, 'Idempotency-Key': randomUUID() })).status, 200);
      assert.equal((await request(`${path}/units/${made.body.item.id}`, 'DELETE', {}, headers)).status, 404);
      assert.equal((await request(`/entities/${f.beta.entityId}/products/skus`)).status, 403);
      assert.equal((await request(`${path}/skus?limit=1`)).body.items.length, 1);
      assert.equal((await request(`${path}/skus/${a4.id}`)).body.item.code, 'ZARF-A4');
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await t.test('shared audit storage respects each module audit permission boundary', async () => {
    await accounting.configure(ctx(), { baseCurrency: 'TRY' });
    const accountingAudit = await accounting.list(ctx(), 'audit_events', {});
    assert.equal(accountingAudit.total, 1);
    assert.equal(accountingAudit.items[0].action, 'accounting.configured');
    const productAudit = await products.list(ctx(), 'audit-events', {});
    assert.ok(productAudit.total > 0);
    assert.ok(productAudit.items.every(row => row.action.startsWith('product.')));
  });
});
