import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { getServerConfig } from '../src/config/env.js';
import { AppError } from '../src/shared/AppError.js';
import { checkReadiness } from '../src/services/readiness.js';
import { withTransaction } from '../src/db/query.js';

const config = getServerConfig({ NODE_ENV: 'test' });
async function serve(t, options = {}) {
  const logs = [];
  const server = createApp({ config, logger: { error: entry => logs.push(entry) }, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, logs };
}

test('CORS config requires explicit exact origins in production', () => {
  assert.throws(() => getServerConfig({ NODE_ENV: 'production' }), /explicitly configured/);
  for (const CORS_ORIGIN of ['*', 'null', 'https://example.com/path', 'https://user:pass@example.com', '']) {
    assert.throws(() => getServerConfig({ CORS_ORIGIN }), /CORS_ORIGIN/);
  }
  assert.deepEqual(getServerConfig({ CORS_ORIGIN: 'http://localhost:5173,https://example.com' }).corsOrigins,
    ['http://localhost:5173', 'https://example.com']);
});

test('request IDs, security headers and preflight are consistent', async t => {
  const { url } = await serve(t);
  const response = await fetch(`${url}/health`, { headers: { 'X-Request-Id': 'test.request-1' } });
  assert.equal(response.headers.get('x-request-id'), 'test.request-1');
  assert.equal((await response.json()).requestId, 'test.request-1');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
  const invalidId = await fetch(`${url}/health`, { headers: { 'X-Request-Id': 'unsafe value' } });
  assert.match(invalidId.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  const preflight = await fetch(`${url}/api/v1/ready`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(preflight.headers.get('x-request-id'));
});

test('disallowed browser origin gets a safe structured 403', async t => {
  const { url } = await serve(t);
  const response = await fetch(`${url}/health`, { headers: { Origin: 'https://unapproved.example' } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await response.json()).error.code, 'ORIGIN_NOT_ALLOWED');
});

test('JSON parsing and size errors use the public error contract', async t => {
  const { url } = await serve(t);
  for (const [body, status, code] of [['{invalid', 400, 'INVALID_JSON'], [JSON.stringify('x'.repeat(1024 * 1024)), 413, 'PAYLOAD_TOO_LARGE']]) {
    const response = await fetch(`${url}/api/v1/unknown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(result.error.code, code);
    assert.equal(result.requestId, response.headers.get('x-request-id'));
    assert.ok(!JSON.stringify(result).includes(body.slice(0, 100)));
  }
});

test('readiness reports 200 and request ID when dependencies are ready', async t => {
  const { url } = await serve(t, { checkReadiness: async () => ({ status: 'ready', checks: { database: 'up', schema: 'current' } }) });
  const response = await fetch(`${url}/api/v1/ready`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.checks, { database: 'up', schema: 'current' });
  assert.equal(body.requestId, response.headers.get('x-request-id'));
});

test('database unavailability returns 503 while liveness remains 200', async t => {
  const { url } = await serve(t, { checkReadiness: async () => { throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable.'); } });
  const ready = await fetch(`${url}/api/v1/ready`);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).error.code, 'DATABASE_UNAVAILABLE');
  assert.equal((await fetch(`${url}/health`)).status, 200);
});

test('unexpected errors do not leak SQL, credentials or stack traces', async t => {
  const secretMessage = 'SELECT password FROM secret_table; password=do-not-leak';
  const { url, logs } = await serve(t, { checkReadiness: async () => { throw new Error(secretMessage); } });
  const response = await fetch(`${url}/api/v1/ready`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify({ body, logs }).includes(secretMessage));
  assert.deepEqual(Object.keys(body).sort(), ['error', 'requestId']);
});

test('readiness bounds pool acquisition and destroys a late connection', async () => {
  let resolveConnection;
  let destroyed = false;
  const pool = { getConnection: () => new Promise(resolve => { resolveConnection = resolve; }) };
  await assert.rejects(checkReadiness({ pool, timeoutMs: 10 }), { code: 'DATABASE_UNAVAILABLE' });
  resolveConnection({ destroy() { destroyed = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(destroyed, true);
});

test('rollback failure destroys the connection and preserves both errors', async () => {
  const original = new Error('work failed');
  const rollback = new Error('rollback failed');
  const calls = [];
  const connection = {
    beginTransaction: async () => {},
    rollback: async () => { throw rollback; },
    destroy: () => calls.push('destroy'),
    release: () => calls.push('release'),
  };
  await assert.rejects(withTransaction(async () => { throw original; }, { getConnection: async () => connection }),
    error => error instanceof AggregateError && error.cause === original && error.errors[1] === rollback);
  assert.deepEqual(calls, ['destroy']);
});
