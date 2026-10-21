import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { getDatabaseConfig, getServerConfig } from '../src/config/env.js';

test('health responds without attempting database access; unknown APIs remain absent', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.deepEqual(health, { service: 'export-accounting-api', status: 'ok', requestId: response.headers.get('x-request-id') });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  const missing = await fetch(`${url}/api/v1/products`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
    requestId: missing.headers.get('x-request-id'),
  });
});

test('database configuration never invents credentials', () => {
  assert.throws(() => getDatabaseConfig({}), /DB_HOST, DB_NAME, DB_USER, DB_PASSWORD/);
  assert.throws(() => getDatabaseConfig({
    DB_HOST: '127.0.0.1', DB_NAME: 'export_accounting_dev', DB_USER: 'export_app', DB_PASSWORD: ' ',
  }), /DB_PASSWORD/);
});

test('invalid ports and pool limits fail before attempting a connection', () => {
  for (const PORT of ['0', '-1', '65536', '3000oops', '3.5', '']) {
    assert.throws(() => getServerConfig({ PORT }), /PORT must be an integer/);
  }
  const source = { DB_HOST: '127.0.0.1', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'test-only' };
  assert.throws(() => getDatabaseConfig({ ...source, DB_PORT: 'oops' }), /DB_PORT/);
  assert.throws(() => getDatabaseConfig({ ...source, DB_CONNECTION_LIMIT: '0' }), /DB_CONNECTION_LIMIT/);
});
