import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { getMigrationPool, closePool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { countryCodes } from '../src/shared/country-codes.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import { permissionsFor } from '../src/services/identity.service.js';
import * as inventory from '../src/services/inventory-foundation.service.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as products from '../src/services/products.service.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
test('PR-02A warehouse, pool, period and movement metadata', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations({ migrations: migrations.slice(0, 5) });
  const f = await createFixtures();
  const ctx = (entityId = f.alpha.entityId, userId = f.alpha.userId, tenantId = f.alpha.tenantId) => ({ identity: { tenantId, userId }, entityId, idempotencyKey: randomUUID(), requestId: 'inventory-test' });
  const beta = () => ctx(f.beta.entityId, f.beta.userId, f.beta.tenantId);
  const viewer = () => ctx(f.secondEntity, f.viewer);
  const warehouse = (code = 'IST') => ({ code, name: 'İstanbul warehouse', location: 'İstanbul' });
  const pool = countryCode => ({ name: countryCode ?? 'General', kind: countryCode ? 'COUNTRY' : 'GENERAL', countryCode: countryCode ?? null });
  const { rows: history } = await query('SELECT * FROM schema_migrations ORDER BY migration_key');
  await accounting.configure(ctx(), { baseCurrency: 'TRY' });
  const year = (await accounting.createYear(ctx(), { code: '2026', startDate: '2026-01-01', endDate: '2026-12-31' })).fiscalYear;
  const period = (await accounting.createPeriod(ctx(), { code: 'JAN', startDate: '2026-01-01', endDate: '2026-01-31', fiscalYearId: year.id })).period;
  const { rows: beforePeriods } = await query('SELECT * FROM accounting_periods');
  await runMigrations();
  await runMigrations();
  let ist, general, af, cm, movement, inventoryPeriod;

  await t.test('upgrade preserves history/calendar and grants configuration only to ADMIN', async () => {
    const { rows: old } = await query(`SELECT * FROM schema_migrations WHERE migration_key IN (${history.map(() => '?').join(',')}) ORDER BY migration_key`, history.map(row => row.migration_key));
    assert.deepEqual(old, history);
    assert.deepEqual((await query('SELECT * FROM accounting_periods')).rows, beforePeriods);
    assert.equal((await query('SHOW TABLES')).rows.length,111);
    for (const kind of ['warehouses', 'pools', 'periods', 'movement-types']) assert.equal((await inventory.list(ctx(), kind, {})).total, 0);
    assert.ok((await permissionsFor(ctx().identity, ctx().entityId)).includes('inventory.configure'));
    assert.ok(!(await permissionsFor(viewer().identity, f.secondEntity)).includes('inventory.configure'));
    await assert.rejects(inventory.list(viewer(), 'warehouses', {}), { status: 403 });
    await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)', [f.alpha.tenantId, f.viewerRole, 'inventory.read']);
    assert.equal((await inventory.list(viewer(), 'warehouses', {})).total, 0);
    await assert.rejects(inventory.save(viewer(), 'warehouses', warehouse()), { status: 403 });
    await assert.rejects(inventory.list(viewer(), 'audit-events', {}), { status: 403 });
  });
  await t.test('one physical Istanbul warehouse plus GENERAL/AF/CM creates no stock or GL', async () => {
    ist = (await inventory.save(ctx(), 'warehouses', warehouse())).item;
    general = (await inventory.save(ctx(), 'pools', pool())).item;
    af = (await inventory.save(ctx(), 'pools', pool('af'))).item;
    cm = (await inventory.save(ctx(), 'pools', pool('CM'))).item;
    assert.deepEqual([general.code, af.code, cm.code], ['GENERAL', 'AF', 'CM']);
    assert.equal((await inventory.list(ctx(), 'warehouses', {})).total, 1);
    assert.equal((await inventory.list(ctx(), 'pools', {})).total, 3);
    assert.equal((await query('SELECT COUNT(*) AS n FROM journals')).rows[0].n, 0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM accounts')).rows[0].n, 0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM posting_requests')).rows[0].n, 0);
    for (const table of ['stock_receipts', 'inventory_layers', 'inventory_balances']) assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n, 0);
  });
  await t.test('country assignments and pool identity are constrained in the API and SQL', async () => {
    const result = await inventory.listCountries(ctx(), {});
    assert.equal(new Set(countryCodes).size, 249);
    assert.equal(result.items.length, 249);
    assert.equal(result.items.find(item => item.code === 'AF').name, 'Afghanistan');
    for (const invalid of ['ZZ', 'EU', 'XK', 'AFG', '', '12']) await assert.rejects(inventory.save(ctx(), 'pools', { ...pool('AF'), countryCode: invalid }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(inventory.save(ctx(), 'pools', { ...pool(), countryCode: 'TR' }), { code: 'VALIDATION_ERROR' });
    for (const [code, kind, country] of [['XX', 'GENERAL', null], ['TR', 'GENERAL', 'TR'], ['XX', 'COUNTRY', null], ['ZZ', 'COUNTRY', 'ZZ']]) {
      await assert.rejects(query('INSERT INTO inventory_pools (id, tenant_id, legal_entity_id, code, name, kind, country_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), f.alpha.tenantId, f.alpha.entityId, code, 'Bad', kind, country]), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    }
    // Exercise every frozen SQL country value without retaining business fixtures.
    const connection = await getMigrationPool().getConnection();
    try {
      await connection.beginTransaction();
      for (const code of countryCodes.filter(c => !['AF', 'CM'].includes(c))) await connection.query('INSERT INTO inventory_pools (id, tenant_id, legal_entity_id, code, name, kind, country_code) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), f.alpha.tenantId, f.alpha.entityId, code, code, 'COUNTRY', code]);
    } finally { await connection.rollback(); connection.release(); }
  });
  await t.test('duplicate pools, inactive codes and concurrent requests remain unique', async () => {
    await assert.rejects(inventory.save(ctx(), 'pools', pool()), { code: 'DUPLICATE_CODE' });
    await inventory.save(ctx(), 'pools', { name: af.name, active: false }, af.id);
    await assert.rejects(inventory.save(ctx(), 'pools', pool('AF')), { code: 'DUPLICATE_CODE' });
    await inventory.save(ctx(), 'pools', { name: af.name, active: true }, af.id);
    const results = await Promise.allSettled([inventory.save(ctx(), 'pools', pool('TR')), inventory.save(ctx(), 'pools', pool('TR'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DUPLICATE_CODE');
    const context = ctx();
    const [first, repeat] = await Promise.all([inventory.save(context, 'warehouses', warehouse('RETRY')), inventory.save(context, 'warehouses', warehouse('RETRY'))]);
    assert.equal(first.item.id, repeat.item.id);
    await assert.rejects(inventory.save(context, 'warehouses', warehouse('CHANGED')), { code: 'IDEMPOTENCY_CONFLICT' });
  });
  await t.test('calendar-linked periods reuse dates and cannot link a closed period', async () => {
    inventoryPeriod = (await inventory.save(ctx(), 'periods', { accountingPeriodId: period.id })).item;
    assert.equal(inventoryPeriod.code, 'JAN');
    assert.equal(inventoryPeriod.startDate, '2026-01-01');
    assert.equal(inventoryPeriod.status, 'OPEN');
    await assert.rejects(inventory.save(ctx(), 'periods', { accountingPeriodId: period.id }), { code: 'DUPLICATE_CODE' });
    await accounting.closePeriod(ctx(), period.id, { reason: 'Test closure' });
    const result = (await inventory.get(ctx(), 'periods', inventoryPeriod.id)).item;
    assert.equal(result.accountingStatus, 'CLOSED');
    assert.equal(result.status, 'OPEN'); // Separate inventory closing is PR-02E, never inferred from GL.
    await assert.rejects(inventory.save(ctx(), 'periods', { accountingPeriodId: period.id }), { code: 'ACCOUNTING_PERIOD_CLOSED' });
    await assert.rejects(inventory.save(ctx(), 'periods', { accountingPeriodId: period.id, status: 'CLOSED' }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(inventory.save(ctx(), 'periods', { status: 'CLOSED' }, inventoryPeriod.id), { status: 404 });
  });
  await t.test('tenant/entity guards and composite period FK reject foreign identity', async () => {
    for (const context of [ctx(f.beta.entityId), ctx(f.unassignedEntity)]) await assert.rejects(inventory.list(context, 'pools', {}), { status: 403 });
    const foreign = (await inventory.save(beta(), 'warehouses', warehouse())).item;
    await assert.rejects(inventory.get(ctx(), 'warehouses', foreign.id), { status: 404 });
    await inventory.save(beta(), 'pools', pool()); // Same code is independent in another tenant.
    for (const context of [ctx(f.secondEntity), beta()]) {
      await assert.rejects(inventory.save(context, 'periods', { accountingPeriodId: period.id }), { status: 404 });
      await assert.rejects(query('INSERT INTO inventory_periods (id, tenant_id, legal_entity_id, accounting_period_id) VALUES (?, ?, ?, ?)', [randomUUID(), context.identity.tenantId, context.entityId, period.id]), { code: 'ER_NO_REFERENCED_ROW_2' });
    }
    await assert.rejects(query('INSERT INTO warehouses (id, tenant_id, legal_entity_id, code, name, location) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), f.alpha.tenantId, f.beta.entityId, 'BAD', 'Bad', 'Bad']), { code: 'ER_NO_REFERENCED_ROW_2' });
  });
  await t.test('metadata identity/effects stay immutable; names and active flags can change', async () => {
    movement = (await inventory.save(ctx(), 'movement-types', { code: 'POOL_MOVE', name: 'Pool allocation', effect: 'REALLOCATION' })).item;
    assert.equal(movement.effect, 'REALLOCATION');
    await assert.rejects(inventory.save(ctx(), 'movement-types', { name: 'Bad', active: true, effect: 'RECEIPT' }, movement.id), { code: 'VALIDATION_ERROR' });
    await assert.rejects(inventory.save(ctx(), 'pools', { name: 'Bad', active: true, countryCode: 'TR' }, cm.id), { code: 'VALIDATION_ERROR' });
    await assert.rejects(inventory.save(ctx(), 'warehouses', { name: 'Bad', active: true, code: 'NEW' }, ist.id), { code: 'VALIDATION_ERROR' });
    const updated = (await inventory.save(ctx(), 'warehouses', { name: 'İstanbul updated', location: 'Same physical site', active: false }, ist.id)).item;
    assert.equal(updated.code, 'IST');
    assert.equal(updated.active, false);
    await assert.rejects(inventory.save(ctx(), 'warehouses', warehouse()), { code: 'DUPLICATE_CODE' });
  });
  await t.test('list filters, literal searches and pagination stay bounded', async () => {
    assert.equal((await inventory.list(ctx(), 'pools', { kind: 'GENERAL' })).total, 1);
    assert.equal((await inventory.list(ctx(), 'warehouses', { active: 'false' })).total, 1);
    assert.equal((await inventory.list(ctx(), 'pools', { q: '%' })).total, 0);
    const a = await inventory.list(ctx(), 'pools', { limit: '1' });
    const b = await inventory.list(ctx(), 'pools', { limit: '1', offset: '1' });
    assert.equal(a.items.length, 1); assert.notEqual(a.items[0].id, b.items[0].id);
    for (const input of [{ limit: '101' }, { offset: '-1' }, { warehouseId: ist.id }, { active: '1' }]) await assert.rejects(inventory.list(ctx(), 'pools', input), { code: 'VALIDATION_ERROR' });
    assert.equal((await inventory.list(ctx(), 'accounting-periods', { status: 'CLOSED' })).total, 1);
  });
  await t.test('audit failure rolls back metadata and retry record; audit namespaces remain separate', async () => {
    const context = ctx();
    await getMigrationPool().query("CREATE TRIGGER inventory_test_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'");
    try { await assert.rejects(inventory.save(context, 'warehouses', warehouse('ROLLBACK'))); }
    finally { await getMigrationPool().query('DROP TRIGGER inventory_test_audit'); }
    assert.equal((await inventory.list(ctx(), 'warehouses', { q: 'ROLLBACK' })).total, 0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM idempotency_records WHERE idempotency_key = ?', [context.idempotencyKey])).rows[0].n, 0);
    await inventory.save(context, 'warehouses', warehouse('ROLLBACK'));
    assert.ok((await inventory.list(ctx(), 'audit-events', {})).items.every(r => r.action.startsWith('inventory.')));
    assert.ok((await accounting.list(ctx(), 'audit_events', {})).items.every(r => !r.action.startsWith('inventory.')));
    assert.equal((await products.list(ctx(), 'audit-events', {})).total, 0);
  });
  await t.test('HTTP enforces sessions, scope, CSRF, idempotency, receipt validation and absent deletion/close routes', async () => {
    const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const cookies = new Map();
    const request = async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const cookie of response.headers.getSetCookie()) { const [k, v] = cookie.split(';')[0].split('='); cookies.set(k, v); }
      return { status: response.status, body: await response.json() };
    };
    try {
      const path = `/entities/${f.alpha.entityId}/inventory`;
      assert.equal((await request(`${path}/warehouses`)).status, 401);
      const csrf = (await request('/auth/csrf')).body.csrfToken;
      await request('/auth/login', 'POST', { tenantCode: 'ALPHA', email: 'admin@alpha.test', password: f.password }, { 'X-CSRF-Token': csrf });
      const token = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request(`${path}/warehouses`, 'POST', warehouse('HTTP'))).status, 403);
      assert.equal((await request(`${path}/warehouses`, 'POST', warehouse('HTTP'), { 'X-CSRF-Token': token })).body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
      const headers = { 'X-CSRF-Token': token, 'Idempotency-Key': randomUUID() };
      const saved = await request(`${path}/warehouses`, 'POST', warehouse('HTTP'), headers);
      assert.equal(saved.status, 200);
      assert.equal((await request(`${path}/warehouses`, 'POST', warehouse('HTTP'), headers)).body.item.id, saved.body.item.id);
      assert.equal((await request(`${path}/warehouses/${saved.body.item.id}`, 'DELETE')).status, 404);
      assert.equal((await request(`${path}/receipts`, 'POST', {}, headers)).status, 400);
      assert.equal((await request(`${path}/periods/${inventoryPeriod.id}/close`, 'POST', {}, headers)).status, 404);
      assert.equal((await request(`/entities/${f.beta.entityId}/inventory/countries`)).status, 403);
      assert.equal((await request(`${path}/countries`)).body.items.length, 249);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
