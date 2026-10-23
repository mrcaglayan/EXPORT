import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { closePool, getMigrationPool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { tables } from '../src/migrations/m007_inventory_receipts.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import { permissionsFor } from '../src/services/identity.service.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as product from '../src/services/products.service.js';
import * as inventory from '../src/services/inventory-foundation.service.js';
import * as receipts from '../src/services/inventory-receipts.service.js';
import { receipt as validateReceipt } from '../src/validators/receipts.validators.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.DB_NAME, process.env.PR00_TEST_DATABASE);
test('PR-02B receipt sources, exact layers, immutable ledgers and atomic projections', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations({ migrations: migrations.slice(0, 6) });
  const f = await createFixtures();
  const ctx = (entityId = f.alpha.entityId, userId = f.alpha.userId, tenantId = f.alpha.tenantId) => ({ identity: { tenantId, userId }, entityId, idempotencyKey: randomUUID(), requestId: 'receipt-test' });
  await accounting.configure(ctx(), { baseCurrency: 'TRY' });
  const year = (await accounting.createYear(ctx(), { code: '2026', startDate: '2026-01-01', endDate: '2026-12-31' })).fiscalYear;
  const calendar = (await accounting.createPeriod(ctx(), { code: 'JAN', fiscalYearId: year.id, startDate: '2026-01-01', endDate: '2026-01-31' })).period;
  const period = (await inventory.save(ctx(), 'periods', { accountingPeriodId: calendar.id })).item;
  const warehouse = (await inventory.save(ctx(), 'warehouses', { code: 'IST', name: 'İstanbul' })).item;
  const movement = (await inventory.save(ctx(), 'movement-types', { code: 'RECEIVE', name: 'Receipt', effect: 'RECEIPT' })).item;
  const pools = [];
  for (const country of [null, 'AF', 'CM']) pools.push((await inventory.save(ctx(), 'pools', { name: country ?? 'General', kind: country ? 'COUNTRY' : 'GENERAL', countryCode: country })).item);
  const family = (await product.save(ctx(), 'families', { code: 'GOODS', name: 'Goods', parentId: null })).item;
  const unit = (await product.save(ctx(), 'units', { code: 'EA', name: 'Each', symbol: 'ea', quantityPrecision: 0 })).item;
  const fineUnit = (await product.save(ctx(), 'units', { code: 'KG', name: 'Kilograms', symbol: 'kg', quantityPrecision: 6 })).item;
  const makeSku = (code, baseUnitId) => product.save(ctx(), 'skus', { code, name: code, description: '', familyId: family.id, baseUnitId }).then(r => r.item);
  const sku = await makeSku('A4', unit.id), fineSku = await makeSku('BULK', fineUnit.id);
  const { rows: history } = await query('SELECT * FROM schema_migrations ORDER BY migration_key');
  const { rows: oldWarehouse } = await query('SELECT * FROM warehouses');
  await runMigrations(); await runMigrations();
  const input = (sourceId = randomUUID()) => ({ sourceId, documentDate: '2025-12-31', postingDate: '2026-01-10', warehouseId: warehouse.id, movementTypeId: movement.id, currency: 'TRY', description: 'Synthetic purchase fixture',
    lines: [{ sourceLineKey: '1', skuId: sku.id, description: 'A4 goods', quantity: '100', unitCost: '500', allocations: [{ poolId: pools[0].id, quantity: '60' }, { poolId: pools[1].id, quantity: '30' }, { poolId: pools[2].id, quantity: '10' }] }] });
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async ([name]) => [name, (await query(`SELECT COUNT(*) AS n FROM ${name}`)).rows[0].n])));
  let first;
  await t.test('forward upgrade preserves prior data/history and grants ADMIN only', async () => {
    assert.deepEqual((await query(`SELECT * FROM schema_migrations WHERE migration_key IN (${history.map(() => '?').join(',')}) ORDER BY migration_key`, history.map(row => row.migration_key))).rows, history);
    assert.deepEqual((await query('SELECT * FROM warehouses')).rows, oldWarehouse);
    assert.equal((await query('SHOW TABLES')).rows.length, 50);
    assert.ok(Object.values(await counts()).every(n => n === 0));
    assert.ok((await permissionsFor(ctx().identity, ctx().entityId)).includes('inventory.receipt.post'));
    assert.ok(!(await permissionsFor(ctx(f.secondEntity, f.viewer).identity, f.secondEntity)).includes('inventory.receipt.post'));
  });
  await t.test('100 physical units equal 100 pool units and exact cost; no GL or VAT', async () => {
    first = (await receipts.postFixture(ctx(), input('SOURCE-100'))).receipt;
    assert.equal(first.totalValue, '50000.000000');
    assert.equal(first.status, 'POSTED');
    const lines = await receipts.receiptLines(ctx(), first.id, {});
    assert.equal(lines.items[0].quantity, '100.000000');
    assert.deepEqual(lines.items[0].allocations.map(a => [a.poolCode, a.quantity, a.value]), [['AF', '30.000000', '15000.000000'], ['CM', '10.000000', '5000.000000'], ['GENERAL', '60.000000', '30000.000000']]);
    const physical = await receipts.list(ctx(), 'balances', {});
    assert.equal(physical.items[0].quantity, '100.000000');
    assert.equal(physical.items[0].value, '50000.000000');
    assert.equal((await receipts.list(ctx(), 'layers', {})).total, 1);
    for (const table of ['journals', 'posting_requests']) assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n, 0);
  });
  await t.test('same key/source replays once; changed content and concurrent duplicates conflict', async () => {
    const body = input('DOUBLE'), context = ctx();
    const sameKey = await Promise.all([receipts.postFixture(context, body), receipts.postFixture(context, body)]);
    assert.deepEqual(sameKey[0], sameKey[1]);
    const sourceReplay = await Promise.all([receipts.postFixture(ctx(), body), receipts.postFixture(ctx(), body)]);
    assert.equal(sourceReplay[0].receipt.id, sameKey[0].receipt.id);
    assert.equal(sourceReplay[1].receipt.id, sameKey[0].receipt.id);
    await assert.rejects(receipts.postFixture(context, { ...body, description: 'Changed' }), { code: 'IDEMPOTENCY_CONFLICT' });
    await assert.rejects(receipts.postFixture(ctx(), { ...body, description: 'Changed' }), { code: 'SOURCE_CONFLICT' });
    const raced = input('SOURCE-RACE');
    const results = await Promise.allSettled([receipts.postFixture(ctx(), raced), receipts.postFixture(ctx(), { ...raced, description: 'Different' })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'SOURCE_CONFLICT');
    await Promise.all(Array.from({ length: 6 }, () => receipts.postFixture(ctx(), input())));
    assert.equal((await receipts.list(ctx(), 'receipts', {})).total, 9);
  });
  await t.test('multi-SKU, repeated SKU, free goods and rounding preserve independent source lines', async () => {
    const body = input('MULTILINE');
    body.lines = [body.lines[0], { sourceLineKey: '2', skuId: sku.id, quantity: '3', unitCost: '0', allocations: [{ poolId: pools[0].id, quantity: '3' }] },
      { sourceLineKey: '3', skuId: fineSku.id, quantity: '0.000003', unitCost: '0.5', allocations: pools.map(pool => ({ poolId: pool.id, quantity: '0.000001' })) }];
    const posted = (await receipts.postFixture(ctx(), body)).receipt;
    const lines = (await receipts.receiptLines(ctx(), posted.id, {})).items;
    assert.equal(lines.length, 3); assert.equal(new Set(lines.map(l => l.layerId)).size, 3);
    assert.equal(lines[1].value, '0.000000'); assert.equal(lines[2].value, '0.000002');
    assert.deepEqual(lines[2].allocations.map(a => a.value).sort(), ['0.000000', '0.000001', '0.000001']);
    assert.equal(posted.totalValue, '50000.000002');
    const reordered = structuredClone(body); reordered.lines[2].allocations.reverse();
    assert.equal((await receipts.postFixture(ctx(), reordered)).receipt.id, posted.id);
  });
  await t.test('invalid amounts, allocation totals, line identity, precision and overflow cannot post', async () => {
    const before = await counts();
    for (const quantity of [0, '0', '-1', '1e3', '01', '0.0000001']) {
      const body = input(); body.lines[0].quantity = quantity;
      await assert.rejects(receipts.postFixture(ctx(), body));
    }
    const badAllocation = input(); badAllocation.lines[0].allocations[0].quantity = '61';
    await assert.rejects(receipts.postFixture(ctx(), badAllocation), { code: 'ALLOCATION_MISMATCH' });
    const precision = input(); precision.lines[0].quantity = '0.5'; precision.lines[0].allocations = [{ poolId: pools[0].id, quantity: '0.5' }];
    await assert.rejects(receipts.postFixture(ctx(), precision), { code: 'QUANTITY_PRECISION' });
    const duplicate = input(); duplicate.lines.push(duplicate.lines[0]);
    assert.throws(() => validateReceipt(duplicate), { code: 'VALIDATION_ERROR' });
    const overflow = input(); overflow.lines[0].unitCost = '99999999999999';
    await assert.rejects(receipts.postFixture(ctx(), overflow), { code: 'INVALID_AMOUNT' });
    await assert.rejects(receipts.postFixture(ctx(), { ...input(), currency: 'USD' }), { code: 'CURRENCY_MISMATCH' });
    assert.deepEqual(await counts(), before);
  });
  await t.test('scope, active references, movement effects and deactivation guards share the entity lock', async () => {
    await assert.rejects(receipts.getReceipt(ctx(f.secondEntity), first.id), { status: 404 });
    await assert.rejects(receipts.list(ctx(f.beta.entityId), 'balances', {}), { status: 403 });
    const foreign = (await inventory.save(ctx(f.secondEntity), 'warehouses', { code: 'FOREIGN', name: 'Foreign' })).item;
    await assert.rejects(receipts.postFixture(ctx(), { ...input(), warehouseId: foreign.id }), { status: 404 });
    const wrong = (await inventory.save(ctx(), 'movement-types', { code: 'ISSUE', name: 'Issue', effect: 'ISSUE' })).item;
    await assert.rejects(receipts.postFixture(ctx(), { ...input(), movementTypeId: wrong.id }), { code: 'MOVEMENT_EFFECT_MISMATCH' });
    for (const [kind, item] of [['warehouses', warehouse], ['pools', pools[0]], ['movement-types', movement]]) await assert.rejects(inventory.save(ctx(), kind, { name: item.name, active: false }, item.id), { code: 'INVENTORY_IN_USE' });
    await assert.rejects(product.save(ctx(), 'skus', { name: sku.name, description: '', familyId: family.id, active: false }, sku.id), { code: 'INVENTORY_IN_USE' });
    const unused = await makeSku('UNUSED', unit.id);
    const raceBody = input('DEACTIVATE-RACE'); raceBody.lines[0].skuId = unused.id;
    const race = await Promise.allSettled([product.save(ctx(), 'skus', { name: unused.name, description: '', familyId: family.id, active: false }, unused.id), receipts.postFixture(ctx(), raceBody)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(['INACTIVE_REFERENCE', 'INVENTORY_IN_USE'].includes(race.find(r => r.status === 'rejected').reason.code));
    await assert.rejects(query('INSERT INTO inventory_events (id, tenant_id, legal_entity_id, receipt_id, kind) VALUES (?, ?, ?, ?, ?)', [randomUUID(), f.alpha.tenantId, f.secondEntity, first.id, 'RECEIPT']));
  });
  await t.test('database rejects history edits, late lines and incomplete posting', async () => {
    for (const table of ['stock_receipts', 'stock_receipt_lines', 'inventory_layers', 'inventory_events', 'inventory_physical_ledger', 'inventory_pool_ledger']) {
      await assert.rejects(query(`UPDATE ${table} SET id = id LIMIT 1`), { code: 'ER_SIGNAL_EXCEPTION' });
      await assert.rejects(query(`DELETE FROM ${table} LIMIT 1`), { code: 'ER_SIGNAL_EXCEPTION' });
    }
    const { rows: [row] } = await query('SELECT * FROM inventory_physical_ledger LIMIT 1');
    await assert.rejects(query('INSERT INTO inventory_physical_ledger (id, tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, event_id, quantity, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), row.tenant_id, row.legal_entity_id, row.warehouse_id, row.sku_id, row.layer_id, row.event_id, '1', '1']), { code: 'ER_SIGNAL_EXCEPTION' });
    const connection = await getMigrationPool().getConnection();
    try {
      await connection.beginTransaction();
      const id = randomUUID();
      await connection.execute(`INSERT INTO stock_receipts (id, tenant_id, legal_entity_id, source_kind, source_id, payload_hash, document_date, posting_date, period_id, warehouse_id, movement_type_id, currency, description, total_value, created_by)
        SELECT ?, tenant_id, legal_entity_id, source_kind, ?, payload_hash, document_date, posting_date, period_id, warehouse_id, movement_type_id, currency, description, total_value, created_by FROM stock_receipts WHERE id = ?`, [id, randomUUID(), first.id]);
      await assert.rejects(connection.execute("UPDATE stock_receipts SET status = 'POSTED' WHERE id = ?", [id]), { code: 'ER_SIGNAL_EXCEPTION' });
      await assert.rejects(connection.execute('UPDATE inventory_balances SET quantity = -1 LIMIT 1'), error => ['ER_CHECK_CONSTRAINT_VIOLATED','ER_SIGNAL_EXCEPTION'].includes(error.code));
    } finally { await connection.rollback(); connection.release(); }
  });
  await t.test('failure at audit rolls back every stock table and retry record', async () => {
    const before = await counts(), context = ctx(), body = input('ROLLBACK');
    await getMigrationPool().query("CREATE TRIGGER receipt_test_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'");
    try { await assert.rejects(receipts.postFixture(context, body)); }
    finally { await getMigrationPool().query('DROP TRIGGER receipt_test_audit'); }
    assert.deepEqual(await counts(), before);
    assert.equal((await query('SELECT COUNT(*) AS n FROM idempotency_records WHERE idempotency_key = ?', [context.idempotencyKey])).rows[0].n, 0);
    await receipts.postFixture(context, body);
  });
  await t.test('301 lines are batched atomically and browsed with stable pages/FIFO provenance', async () => {
    const body = input('MANY-LINES'); body.postingDate = '2026-01-01';
    body.lines = Array.from({ length: 301 }, (_, index) => ({ sourceLineKey: String(index + 1), skuId: sku.id, quantity: '1', unitCost: '0.123456', allocations: [{ poolId: pools[0].id, quantity: '1' }] }));
    const result = (await receipts.postFixture(ctx(), body)).receipt;
    assert.equal(result.totalValue, '37.160256');
    const firstPage = await receipts.receiptLines(ctx(), result.id, { limit: '100' });
    const lastPage = await receipts.receiptLines(ctx(), result.id, { limit: '100', offset: '300' });
    assert.equal(firstPage.total, 301); assert.equal(lastPage.items[0].lineNumber, 301);
    assert.equal((await receipts.list(ctx(), 'layers', { limit: '1', skuId: sku.id })).items[0].receivedDate, '2026-01-01');
    assert.equal((await receipts.list(ctx(), 'receipts', { q: '%' })).total, 0);
    await assert.rejects(receipts.list(ctx(), 'layers', { limit: '101' }), { code: 'VALIDATION_ERROR' });
  });
  await t.test('both period locks block new postings but allow stable successful retries', async () => {
    await query("UPDATE inventory_periods SET status = 'IN_REVIEW' WHERE id = ?", [period.id]);
    await assert.rejects(receipts.postFixture(ctx(), input()), { code: 'PERIOD_CLOSED' });
    await query("UPDATE inventory_periods SET status = 'OPEN' WHERE id = ?", [period.id]);
    const results = await Promise.allSettled([accounting.closePeriod(ctx(), calendar.id, { reason: 'Synthetic close race' }), receipts.postFixture(ctx(), input('CLOSE-RACE'))]);
    assert.equal(results[0].status, 'fulfilled');
    if (results[1].status === 'rejected') assert.equal(results[1].reason.code, 'PERIOD_CLOSED');
    await assert.rejects(receipts.postFixture(ctx(), input()), { code: 'PERIOD_CLOSED' });
    assert.equal((await receipts.postFixture(ctx(), input('SOURCE-100'))).receipt.id, first.id);
    await assert.rejects(receipts.postFixture(ctx(), { ...input(), postingDate: '2027-01-01' }), { code: 'PERIOD_NOT_FOUND' });
  });
  await t.test('all persisted layers, ledgers and projections reconcile at their exact grain', async () => {
    const { rows } = await query(`SELECT b.layer_id FROM inventory_balances b JOIN inventory_physical_ledger p ON p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id
      WHERE b.quantity <> p.quantity OR b.value <> p.value OR b.quantity <> (SELECT SUM(v.quantity) FROM inventory_pool_balances v WHERE v.tenant_id = b.tenant_id AND v.legal_entity_id = b.legal_entity_id AND v.layer_id = b.layer_id)
      OR b.value <> (SELECT SUM(v.value) FROM inventory_pool_balances v WHERE v.tenant_id = b.tenant_id AND v.legal_entity_id = b.legal_entity_id AND v.layer_id = b.layer_id)`);
    assert.equal(rows.length, 0);
    assert.equal((await query("SELECT COUNT(*) AS n FROM stock_receipts WHERE status <> 'POSTED'")).rows[0].n, 0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM journals')).rows[0].n, 0);
  });
  await t.test('HTTP auth/CSRF/permissions, scoped reads and fixture-only posting boundary', async () => {
    const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const cookies = new Map();
    const request = async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const cookie of response.headers.getSetCookie()) { const [k, v] = cookie.split(';')[0].split('='); cookies.set(k, v); }
      return { status: response.status, body: await response.json() };
    };
    try {
      const root = `/entities/${f.alpha.entityId}/inventory`;
      assert.equal((await request(`${root}/receipts`)).status, 401);
      const csrf = (await request('/auth/csrf')).body.csrfToken;
      await request('/auth/login', 'POST', { tenantCode: 'ALPHA', email: 'admin@alpha.test', password: f.password }, { 'X-CSRF-Token': csrf });
      const token = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request(`${root}/receipts`, 'POST', input())).status, 403);
      assert.equal((await request(`${root}/receipts`, 'POST', input(), { 'X-CSRF-Token': token })).body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
      const headers = { 'X-CSRF-Token': token, 'Idempotency-Key': randomUUID() };
      assert.equal((await request(`${root}/receipts`, 'POST', input('SOURCE-100'), headers)).body.receipt.id, first.id);
      assert.equal((await request(`${root}/receipts/${first.id}/lines`)).status, 200);
      assert.equal((await request(`${root}/receipts/${first.id}`, 'PATCH', {}, headers)).status, 404);
      assert.equal((await request(`/entities/${f.secondEntity}/inventory/receipts/${first.id}`)).status, 404);
      const readOnly = ctx(f.secondEntity, f.viewer);
      await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)', [f.alpha.tenantId, f.viewerRole, 'inventory.read']);
      assert.equal((await receipts.list(readOnly, 'balances', {})).total, 0);
      await assert.rejects(receipts.postFixture(readOnly, input()), { status: 403 });
      const env = process.env.PR00_TEST_DATABASE;
      delete process.env.PR00_TEST_DATABASE;
      try {
        assert.equal(receipts.fixturePostingEnabled(), false);
        await assert.rejects(receipts.postFixture(ctx(), input()), { code: 'SOURCE_NOT_AVAILABLE' });
        const normal = createApp().listen(0, '127.0.0.1'); await once(normal, 'listening');
        try {
          const response = await fetch(`http://127.0.0.1:${normal.address().port}/api/v1${root}/receipts`, { method: 'POST', headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input()) });
          assert.equal(response.status, 404);
        } finally { await new Promise(resolve => normal.close(resolve)); }
      } finally { process.env.PR00_TEST_DATABASE = env; }
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
