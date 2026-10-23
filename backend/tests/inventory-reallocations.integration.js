import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { closePool, getMigrationPool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { tables, triggers } from '../src/migrations/m008_inventory_reallocations.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as products from '../src/services/products.service.js';
import * as inventory from '../src/services/inventory-foundation.service.js';
import * as receipts from '../src/services/inventory-receipts.service.js';
import * as reallocations from '../src/services/inventory-reallocations.service.js';

assert.equal(process.env.DB_NAME, process.env.PR00_TEST_DATABASE);
test('PR-02C allocation, independent review and atomic pool borrowing', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations({ migrations: migrations.slice(0, 7) });
  const f = await createFixtures();
  const ctx = (userId = f.alpha.userId, entityId = f.alpha.entityId) => ({ identity: { tenantId: f.alpha.tenantId, userId }, entityId, idempotencyKey: randomUUID(), requestId: 'reallocation-test' });
  await accounting.configure(ctx(), { baseCurrency: 'TRY' });
  const year = (await accounting.createYear(ctx(), { code: '2026', startDate: '2026-01-01', endDate: '2026-12-31' })).fiscalYear;
  const calendar = (await accounting.createPeriod(ctx(), { code: 'JAN', fiscalYearId: year.id, startDate: '2026-01-01', endDate: '2026-01-31' })).period;
  const period = (await inventory.save(ctx(), 'periods', { accountingPeriodId: calendar.id })).item;
  const warehouse = (await inventory.save(ctx(), 'warehouses', { code: 'IST', name: 'Istanbul' })).item;
  const receive = (await inventory.save(ctx(), 'movement-types', { code: 'RECEIVE', name: 'Receive', effect: 'RECEIPT' })).item;
  const move = (await inventory.save(ctx(), 'movement-types', { code: 'MOVE', name: 'Move pools', effect: 'REALLOCATION' })).item;
  const pools = [];
  for (const country of [null, 'AF', 'CM']) pools.push((await inventory.save(ctx(), 'pools', { name: country ?? 'General', kind: country ? 'COUNTRY' : 'GENERAL', countryCode: country })).item);
  const [general, af, cm] = pools;
  const family = (await products.save(ctx(), 'families', { code: 'GOODS', name: 'Goods', parentId: null })).item;
  const unit = (await products.save(ctx(), 'units', { code: 'EA', name: 'Each', symbol: 'ea', quantityPrecision: 6 })).item;
  const sku = (await products.save(ctx(), 'skus', { code: 'A4', name: 'A4 goods', description: '', familyId: family.id, baseUnitId: unit.id })).item;
  const body = { sourceId: 'BEFORE-UPGRADE', documentDate: '2026-01-01', postingDate: '2026-01-01', warehouseId: warehouse.id, movementTypeId: receive.id, currency: 'TRY', description: 'Synthetic stock', lines: [{ sourceLineKey: '1', skuId: sku.id, quantity: '100', unitCost: '500', allocations: [{ poolId: general.id, quantity: '30' }, { poolId: af.id, quantity: '30' }, { poolId: cm.id, quantity: '40' }] }] };
  const receipt = (await receipts.postFixture(ctx(), body)).receipt;
  const beforeLines = await receipts.receiptLines(ctx(), receipt.id, {});
  const { rows: beforeHistory } = await query('SELECT * FROM schema_migrations ORDER BY migration_key');
  const snapshot = async names => Object.fromEntries(await Promise.all(names.map(async name => [name, (await query(`SELECT * FROM ${name}`)).rows])));
  const physicalTables = ['inventory_layers','inventory_physical_ledger','inventory_balances','stock_receipts','stock_receipt_lines','journals','posting_requests'];
  const physical = await snapshot(physicalTables);
  await t.test('forward extension preserves receipts and immutable checksums; complete verification reruns', async () => {
    const legacy = migrations.slice(0,8);
    await runMigrations({ migrations: legacy }); await runMigrations({ migrations: legacy });
    assert.equal((await query('SHOW TABLES')).rows.length, 43);
    assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key <> 'm008_inventory_reallocations' ORDER BY migration_key")).rows, beforeHistory);
    assert.deepEqual(await snapshot(physicalTables), physical);
    await assert.rejects(runMigrations({ migrations: migrations.map((m, i) => i === 7 ? { ...m, replacesVerificationFor: ['unknown'] } : m) }), { code: 'MIGRATION_REGISTRY_INVALID' });
    const trigger = triggers.find(t => t[0] === 'inventory_layers_no_update');
    await getMigrationPool().query(`DROP TRIGGER ${trigger[0]}`);
    try { await assert.rejects(runMigrations({ migrations: legacy }), /trigger differs/); }
    finally { await getMigrationPool().query(`CREATE TRIGGER ${trigger[0]} BEFORE ${trigger[1]} ON ${trigger[2]} FOR EACH ROW ${trigger[3]}`); }
    // Simulate interruption after forward DDL: only an explicit retry can hand
    // verification to the successor; original sources/history remain intact.
    await query("UPDATE schema_migrations SET status = 'running' WHERE migration_key = 'm008_inventory_reallocations'");
    await assert.rejects(runMigrations({ migrations: legacy }), { code: 'MIGRATION_RECOVERY_REQUIRED' });
    await runMigrations({ migrations: legacy, retryKey: 'm008_inventory_reallocations' });
    await runMigrations({ migrations: legacy });
  });
  await runMigrations();
  for (const permission of ['inventory.read', 'inventory.reallocation.review']) await query('INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,?)', [f.alpha.tenantId,f.viewerRole,permission]);
  await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)', [f.alpha.tenantId,f.viewer,f.viewerRole,f.alpha.entityId]);
  const request = (overrides = {}) => ({ reference: randomUUID(), warehouseId: warehouse.id, skuId: sku.id, fromPoolId: cm.id, toPoolId: af.id, quantity: '20', postingDate: '2026-01-10', movementTypeId: move.id, reason: 'Destination order demand', ...overrides });
  const selection = quantity => ({ warehouseId: warehouse.id, skuId: sku.id, toPoolId: af.id, quantity, postingDate: '2026-01-10' });
  const act = (id, action, user = f.alpha.userId) => reallocations.act(ctx(user), id, action, action === 'execute' ? {} : { reason: 'Reviewed demand' });
  let first;
  await t.test('priority is destination then GENERAL with explicit shortfall, never silent country borrowing', async () => {
    const result = await reallocations.preview(ctx(), selection('80'));
    assert.deepEqual([result.destinationQuantity,result.generalQuantity,result.shortfall], ['30.000000','30.000000','20.000000']);
    const small = await reallocations.preview(ctx(), selection('10'));
    assert.equal(small.destinationQuantity, '10.000000'); assert.equal(small.generalQuantity, '0.000000');
    assert.deepEqual(await snapshot(physicalTables), physical);
  });
  await t.test('country request needs another reviewer; execution moves CM20 to AF preserving 100 physical and value', async () => {
    const context = ctx(), input = request();
    first = (await reallocations.create(context, input)).reallocation;
    assert.equal(first.status, 'REQUESTED'); assert.equal(first.requiresIndependent, true);
    assert.deepEqual(await reallocations.create(context, input), { reallocation: first });
    await assert.rejects(reallocations.create(context, { ...input, quantity: '21' }), { code: 'IDEMPOTENCY_CONFLICT' });
    await assert.rejects(act(first.id, 'execute'), { code: 'INVALID_STATE' });
    await assert.rejects(act(first.id, 'approve'), { code: 'INDEPENDENT_REVIEW_REQUIRED' });
    await assert.rejects(act(first.id, 'reject'), { code: 'INDEPENDENT_REVIEW_REQUIRED' });
    await act(first.id, 'approve', f.viewer);
    await assert.rejects(act(first.id, 'execute', f.viewer), { status: 403 });
    const executed = await act(first.id, 'execute');
    assert.equal(executed.reallocation.status, 'EXECUTED'); assert.equal(executed.reallocation.totalValue, '10000.000000');
    assert.deepEqual(await act(first.id, 'execute'), executed);
    const stock = await receipts.list(ctx(), 'pool-balances', {});
    assert.equal(stock.items.find(p => p.poolCode === 'AF').quantity, '50.000000');
    assert.equal(stock.items.find(p => p.poolCode === 'CM').quantity, '20.000000');
    assert.deepEqual(await snapshot(physicalTables), physical);
    assert.deepEqual(await receipts.receiptLines(ctx(), receipt.id, {}), beforeLines);
    const ledger = await receipts.list(ctx(), 'pool-ledger', {});
    const entries = ledger.items.filter(l => l.reallocationId === first.id);
    assert.equal(entries.length, 2); assert.ok(entries.every(e => e.eventKind === 'REALLOCATION' && e.postingDate === '2026-01-10'));
    assert.deepEqual(entries.map(e => e.quantity).sort(), ['-20.000000','20.000000']);
  });
  await t.test('concurrent approved requests do not reserve or overdraw the same source layer', async () => {
    const requests = await Promise.all([reallocations.create(ctx(), request()), reallocations.create(ctx(), request())]);
    for (const r of requests) await act(r.reallocation.id, 'approve', f.viewer);
    const results = await Promise.allSettled(requests.map(r => act(r.reallocation.id, 'execute')));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'INSUFFICIENT_STOCK');
    const loser = requests[results.findIndex(r => r.status === 'rejected')].reallocation.id;
    assert.equal((await reallocations.get(ctx(), loser)).reallocation.status, 'APPROVED');
    await act(loser, 'cancel');
  });
  await t.test('GENERAL requests allow same authorized reviewer, cancellation/rejection retain history', async () => {
    const r = (await reallocations.create(ctx(), request({ fromPoolId: general.id, quantity: '5' }))).reallocation;
    assert.equal(r.requiresIndependent, false);
    await act(r.id, 'approve');
    await assert.rejects(act(r.id, 'cancel', f.viewer), { status: 403 });
    await act(r.id, 'cancel');
    await assert.rejects(act(r.id, 'execute'), { code: 'INVALID_STATE' });
    const rejected = (await reallocations.create(ctx(), request({ fromPoolId: general.id, quantity: '5' }))).reallocation;
    await act(rejected.id, 'reject');
    await assert.rejects(act(rejected.id, 'approve'), { code: 'INVALID_STATE' });
    assert.equal((await reallocations.list(ctx(), { status: 'REJECTED' })).total, 1);
    await assert.rejects(inventory.save(ctx(), 'movement-types', { name: move.name, active: false }, move.id), { code: 'INVENTORY_IN_USE' });
  });
  await t.test('audit failure rolls back entries, projections, state, values and idempotency', async () => {
    const r = (await reallocations.create(ctx(), request({ fromPoolId: general.id, quantity: '5' }))).reallocation;
    await act(r.id, 'approve');
    const names = tables.map(([name]) => name), before = await snapshot(names), context = ctx();
    await getMigrationPool().query("CREATE TRIGGER reallocation_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic failure'");
    try { await assert.rejects(reallocations.act(context, r.id, 'execute', {})); }
    finally { await getMigrationPool().query('DROP TRIGGER reallocation_audit_failure'); }
    assert.deepEqual(await snapshot(names), before);
    assert.equal((await query('SELECT COUNT(*) AS n FROM idempotency_records WHERE idempotency_key = ?', [context.idempotencyKey])).rows[0].n, 0);
    await reallocations.act(context, r.id, 'execute', {});
  });
  await t.test('rounding and full depletion transfer remaining value exactly, including zero-cost stock', async () => {
    assert.equal(reallocations.transferValue('1.000000','3.000000','0.000002'), '0.000001');
    const fine = (await products.save(ctx(), 'skus', { code: 'FINE', name: 'Fine', description: '', familyId: family.id, baseUnitId: unit.id })).item;
    await receipts.postFixture(ctx(), { ...body, sourceId: 'FINE', lines: [{ sourceLineKey: '1', skuId: fine.id, quantity: '0.000003', unitCost: '0.5', allocations: [{ poolId: general.id, quantity: '0.000003' }] }, { sourceLineKey: '2', skuId: fine.id, quantity: '0.000001', unitCost: '0', allocations: [{ poolId: general.id, quantity: '0.000001' }] }] });
    for (const quantity of ['0.000001', '0.000003']) {
      const r = (await reallocations.create(ctx(), request({ skuId: fine.id, fromPoolId: general.id, quantity }))).reallocation;
      await act(r.id, 'approve'); await act(r.id, 'execute');
    }
    const balances = (await receipts.list(ctx(), 'pool-balances', { skuId: fine.id, poolId: general.id })).items;
    assert.ok(balances.every(b => b.quantity === '0.000000' && b.value === '0.000000'));
  });
  await t.test('closed periods, backdates and invalid scope/reference/effects cannot execute', async () => {
    const r = (await reallocations.create(ctx(), request({ fromPoolId: general.id, quantity: '1' }))).reallocation;
    await act(r.id, 'approve');
    await query("UPDATE inventory_periods SET status = 'IN_REVIEW' WHERE id = ?", [period.id]);
    await assert.rejects(act(r.id, 'execute'), { code: 'PERIOD_CLOSED' });
    await query("UPDATE inventory_periods SET status = 'OPEN' WHERE id = ?", [period.id]);
    await query("UPDATE accounting_periods SET status = 'CLOSED' WHERE id = ?", [calendar.id]);
    await assert.rejects(act(r.id, 'execute'), { code: 'PERIOD_CLOSED' });
    await query("UPDATE accounting_periods SET status = 'OPEN' WHERE id = ?", [calendar.id]);
    await assert.rejects(reallocations.create(ctx(), request({ fromPoolId: general.id, postingDate: '2026-01-09', quantity: '1' })), { code: 'INSUFFICIENT_STOCK' });
    await assert.rejects(reallocations.create(ctx(), request({ movementTypeId: receive.id })), { code: 'MOVEMENT_EFFECT_MISMATCH' });
    await assert.rejects(reallocations.get(ctx(f.alpha.userId, f.secondEntity), r.id), { status: 404 });
    await assert.rejects(reallocations.create(ctx(f.viewer), request()), { status: 403 });
    await assert.rejects(reallocations.preview(ctx(), { ...selection('1'), toPoolId: general.id }), { code: 'DESTINATION_REQUIRED' });
    await act(r.id, 'cancel');
  });
  await t.test('SQL guards prevent rewritten plans, forged review and invalid signed entries', async () => {
    await assert.rejects(query('UPDATE inventory_reallocation_lines SET quantity = quantity + 1 LIMIT 1'), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query('DELETE FROM inventory_reallocations LIMIT 1'), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query('UPDATE inventory_reallocations SET quantity = quantity + 1 LIMIT 1'), { code: 'ER_SIGNAL_EXCEPTION' });
    const r = (await reallocations.create(ctx(), request({ fromPoolId: af.id, toPoolId: cm.id, quantity: '1' }))).reallocation;
    await assert.rejects(query("UPDATE inventory_reallocations SET status = 'APPROVED', reviewed_by = requested_by, reviewed_at = CURRENT_TIMESTAMP, review_reason = 'Bypass' WHERE id = ?", [r.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query("UPDATE inventory_reallocations SET status = 'EXECUTED' WHERE id = ?", [r.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await act(r.id, 'cancel');
    const { rows: [entry] } = await query('SELECT * FROM inventory_pool_ledger LIMIT 1');
    await assert.rejects(query('INSERT INTO inventory_pool_ledger (id,tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id,event_id,pool_id,quantity,value) VALUES (?,?,?,?,?,?,?,?,?,?)', [randomUUID(),entry.tenant_id,entry.legal_entity_id,entry.warehouse_id,entry.sku_id,entry.layer_id,entry.event_id,entry.pool_id,'-1','-1']), { code: 'ER_SIGNAL_EXCEPTION' });
  });
  await t.test('HTTP routes require auth, CSRF and idempotency; reader can inspect but not mutate', async () => {
    const server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
    const cookies = new Map(), root = `/entities/${f.alpha.entityId}/inventory`;
    const call = async (path, method = 'GET', body, extra = {}) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of res.headers.getSetCookie()) { const [k,v] = c.split(';')[0].split('='); cookies.set(k,v); }
      return { status: res.status, body: await res.json() };
    };
    try {
      assert.equal((await call(`${root}/reallocations`)).status,401);
      let csrf = (await call('/auth/csrf')).body.csrfToken;
      await call('/auth/login','POST',{ tenantCode:'ALPHA',email:'admin@alpha.test',password:f.password },{'X-CSRF-Token':csrf});
      csrf = (await call('/auth/csrf')).body.csrfToken;
      assert.equal((await call(`${root}/reallocations`,'POST',request())).status,403);
      assert.equal((await call(`${root}/reallocations`,'POST',request(),{'X-CSRF-Token':csrf})).body.error.code,'IDEMPOTENCY_KEY_REQUIRED');
      assert.equal((await call(`${root}/reallocations/${first.id}`)).status,200);
      assert.equal((await call(`${root}/reallocations/${first.id}/lines?limit=1`)).body.total,1);
      assert.equal((await call(`${root}/skus?active=true`)).status,200);
      assert.equal((await call(`${root}/reallocations/${first.id}`,'PATCH',{}, {'X-CSRF-Token':csrf})).status,404);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await t.test('301 fixed source layers execute atomically and remain paginated without a document cap', async () => {
    const bulk = (await products.save(ctx(), 'skus', { code: 'MANY', name: 'Many layers', description: '', familyId: family.id, baseUnitId: unit.id })).item;
    await receipts.postFixture(ctx(), { ...body, sourceId: 'MANY-LAYERS', lines: Array.from({ length: 301 }, (_, i) => ({ sourceLineKey: String(i + 1), skuId: bulk.id, quantity: '1', unitCost: '0.123456', allocations: [{ poolId: general.id, quantity: '1' }] })) });
    const r = (await reallocations.create(ctx(), request({ skuId: bulk.id, fromPoolId: general.id, quantity: '301' }))).reallocation;
    const plans = await reallocations.lines(ctx(), r.id, { limit: '100', offset: '300' });
    assert.equal(plans.total,301); assert.equal(plans.items.length,1); assert.equal(plans.items[0].lineNumber,301);
    const context = ctx();
    const approvals = await Promise.all([reallocations.act(context,r.id,'approve',{reason:'Confirmed'}),reallocations.act(context,r.id,'approve',{reason:'Confirmed'})]);
    assert.deepEqual(approvals[0],approvals[1]);
    const started = performance.now();
    assert.equal((await act(r.id,'execute')).reallocation.totalValue,'37.160256');
    console.log(`301-layer execution: ${Math.round(performance.now()-started)} ms in disposable local schema (not a deployment SLA).`);
    assert.equal((await receipts.list(ctx(),'pool-ledger',{skuId:bulk.id})).total,903);
    assert.ok((await receipts.list(ctx(),'pool-balances',{skuId:bulk.id,poolId:general.id})).items.every(b=>b.quantity==='0.000000'&&b.value==='0.000000'));
  });
  await t.test('all pool deltas and projections reconcile without physical or GL effects', async () => {
    const { rows } = await query(`SELECT b.layer_id FROM inventory_balances b WHERE b.quantity <> (SELECT SUM(p.quantity) FROM inventory_pool_balances p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id)
      OR b.value <> (SELECT SUM(p.value) FROM inventory_pool_balances p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id)`);
    assert.equal(rows.length,0);
    assert.equal((await query("SELECT COUNT(*) AS n FROM inventory_reallocations WHERE status IN ('DRAFT','EXECUTING')")).rows[0].n,0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM journals')).rows[0].n,0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM posting_requests')).rows[0].n,0);
    await runMigrations();
  });
});
