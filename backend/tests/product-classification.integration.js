import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { closePool, getMigrationPool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import { permissionsFor } from '../src/services/identity.service.js';
import * as products from '../src/services/products.service.js';
import * as refs from '../src/services/product-references.service.js';
import * as attributes from '../src/services/product-attributes.service.js';
import * as gtip from '../src/services/product-gtip.service.js';
import * as aliases from '../src/services/product-aliases.service.js';
import { review } from '../src/services/product-reviews.service.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
const json = value => JSON.parse(JSON.stringify(value));
test('PR-01B specifications, reviewed GTIP and exact versioned aliases', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations({ migrations: migrations.slice(0, 4) });
  const f = await createFixtures();
  const { rows: before } = await query('SELECT * FROM schema_migrations ORDER BY migration_key');
  await runMigrations(); await runMigrations();
  const { rows: after } = await query("SELECT * FROM schema_migrations WHERE migration_key <> 'm005_product_classification' ORDER BY migration_key");
  assert.deepEqual(after, before);
  const ctx = (entityId = f.alpha.entityId, userId = f.alpha.userId, tenantId = f.alpha.tenantId) => ({ identity: { tenantId, userId }, entityId, idempotencyKey: randomUUID(), requestId: 'pr01b-test' });
  const beta = () => ctx(f.beta.entityId, f.beta.userId, f.beta.tenantId);
  const manager = () => ctx(f.alpha.entityId, f.noAccess);
  const definition = (code, dataType = 'TEXT', definesStock = false) => ({ code, name: code, dataType, definesStock, unitLabel: '' });
  const unit = (await products.save(ctx(), 'units', { code: 'EA', name: 'Adet', symbol: 'ad', quantityPrecision: 0 })).item;
  const family = (await products.save(ctx(), 'families', { code: 'ZARF', name: 'Zarf' })).item;
  const makeSku = async code => (await products.save(ctx(), 'skus', { code, name: code, familyId: family.id, baseUnitId: unit.id })).item;
  const a4 = await makeSku('ZARF-A4'); const a3 = await makeSku('ZARF-A3');
  const supplier = (await refs.save(ctx(), 'suppliers', { code: 'SUPPLIER', name: 'Synthetic supplier' })).item;
  const input = overrides => ({ gtipCode: '000000000001', effectiveFrom: '2026-01-01', effectiveTo: null, sourceReference: 'Synthetic test classification, not a real code', ...overrides });
  const verifyBody = { decision: 'VERIFIED', reason: 'Evidence checked in synthetic fixture', brokerName: 'Synthetic broker', verificationReference: 'TEST-EVIDENCE-1', verifiedOn: '2026-01-01' };
  const reviewed = id => review(ctx(), 'gtip', id, { decision: 'REVIEWED', reason: 'Reviewed fixture' });
  const aliasInput = overrides => ({ supplierId: supplier.id, supplierCode: ' a-4 ', supplierDescription: '  Zarf A4\nÖzgün açıklama  ', skuId: a4.id, sourceReference: 'Synthetic supplier document', ...overrides });
  const matchInput = overrides => { const { skuId, sourceReference, ...source } = aliasInput(overrides); assert.ok(skuId && sourceReference); return source; };
  let oldGtip, nextGtip, alias;

  await t.test('upgrade grants reviewer only to assigned ADMIN, not managers/readers', async () => {
    assert.ok((await permissionsFor(ctx().identity, f.alpha.entityId)).includes('products.review'));
    assert.ok(!(await permissionsFor(ctx(f.secondEntity, f.viewer).identity, f.secondEntity)).includes('products.review'));
    const roleId = randomUUID();
    await query('INSERT INTO roles (id, tenant_id, code, name) VALUES (?, ?, ?, ?)', [roleId, f.alpha.tenantId, 'PRODUCT_MANAGER', 'Product manager']);
    for (const code of ['workspace.read', 'products.read', 'products.manage']) await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)', [f.alpha.tenantId, roleId, code]);
    await query('INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id) VALUES (?, ?, ?, ?)', [f.alpha.tenantId, f.noAccess, roleId, f.alpha.entityId]);
    assert.ok(!(await permissionsFor(manager().identity, f.alpha.entityId)).includes('products.review'));
    assert.equal((await refs.list(manager(), 'suppliers', {})).total, 1);
  });
  await t.test('typed attributes retain exact decimals/booleans and stock identity', async () => {
    const size = (await refs.save(ctx(), 'attribute-definitions', definition('SIZE', 'TEXT', true))).item;
    const weight = (await refs.save(ctx(), 'attribute-definitions', definition('WEIGHT', 'DECIMAL'))).item;
    const window = (await refs.save(ctx(), 'attribute-definitions', definition('WINDOW', 'BOOLEAN'))).item;
    await attributes.save(ctx(), a4.id, { definitionId: size.id, value: 'A4' });
    await attributes.save(ctx(), a3.id, { definitionId: size.id, value: 'A3' });
    await assert.rejects(attributes.save(ctx(), a4.id, { definitionId: size.id, value: 'A3' }), { code: 'STOCK_IDENTITY_LOCKED' });
    const decimal = await attributes.save(ctx(), a4.id, { definitionId: weight.id, value: '99999999999999.123456' });
    assert.equal(decimal.item.value, '99999999999999.123456');
    assert.equal((await attributes.save(ctx(), a4.id, { definitionId: window.id, value: false })).item.value, false);
    const key = ctx(); const payload = { definitionId: weight.id, value: '2.5' };
    assert.deepEqual(await attributes.save(key, a4.id, payload), await attributes.save(key, a4.id, payload));
    await assert.rejects(attributes.save(ctx(), a4.id, { definitionId: weight.id, value: 2.5 }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(attributes.save(ctx(), a4.id, { definitionId: weight.id, value: '1.0000001' }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(attributes.save(ctx(), a4.id, { definitionId: window.id, value: 'false' }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(refs.save(ctx(), 'attribute-definitions', { name: 'Changed', active: true, dataType: 'DECIMAL' }, size.id), { code: 'VALIDATION_ERROR' });
    await refs.save(ctx(), 'attribute-definitions', { name: 'Window', active: false }, window.id);
    await assert.rejects(attributes.save(ctx(), a4.id, { definitionId: window.id, value: true }), { code: 'INACTIVE_REFERENCE' });
    assert.equal((await attributes.list(ctx(), a4.id, { limit: '1' })).total, 3);
  });
  await t.test('GTIP strings, dates and active windows reject malformed/overlapping input', async () => {
    for (const gtipCode of ['123', '00000000000x', 123456789012]) await assert.rejects(gtip.create(ctx(), a4.id, input({ gtipCode })), { code: 'VALIDATION_ERROR' });
    await assert.rejects(gtip.create(ctx(), a4.id, input({ effectiveFrom: '2026-02-30' })), { code: 'VALIDATION_ERROR' });
    const key = ctx();
    oldGtip = (await gtip.create(key, a4.id, input())).item;
    assert.equal(oldGtip.gtipCode, '000000000001');
    assert.deepEqual(json(await gtip.create(key, a4.id, input())), json({ item: oldGtip }));
    await assert.rejects(gtip.create(ctx(), a4.id, input({ effectiveFrom: '2027-01-01' })), { code: 'GTIP_OVERLAP' });
    assert.equal((await gtip.atDate(ctx(), a4.id, { on: '2026-05-01' })).item, null);
  });
  await t.test('review sequence and broker evidence are mandatory; role and scope enforced', async () => {
    await assert.rejects(review(manager(), 'gtip', oldGtip.id, { decision: 'REVIEWED', reason: 'Try' }), { status: 403 });
    await assert.rejects(review(ctx(), 'gtip', oldGtip.id, verifyBody), { code: 'INVALID_TRANSITION' });
    await reviewed(oldGtip.id);
    await assert.rejects(review(ctx(), 'gtip', oldGtip.id, { decision: 'VERIFIED', reason: 'No broker' }), { code: 'VALIDATION_ERROR' });
    const key = ctx();
    const first = await review(key, 'gtip', oldGtip.id, verifyBody);
    assert.deepEqual(json(await review(key, 'gtip', oldGtip.id, verifyBody)), json(first));
    assert.equal(first.item.verifiedBy, f.alpha.userId);
    assert.equal(first.item.brokerName, 'Synthetic broker');
    assert.equal((await gtip.atDate(ctx(), a4.id, { on: '2026-05-01' })).item.id, oldGtip.id);
  });
  await t.test('version date boundaries retain old history and allow same GTIP on another SKU', async () => {
    await gtip.endDate(ctx(), oldGtip.id, { effectiveTo: '2026-06-30', reason: 'New classification from July' });
    await assert.rejects(gtip.endDate(ctx(), oldGtip.id, { effectiveTo: '2026-07-31', reason: 'Extend' }), { code: 'GTIP_DATE_RANGE' });
    await assert.rejects(gtip.create(ctx(), a4.id, input({ effectiveFrom: '2026-06-30' })), { code: 'GTIP_OVERLAP' });
    nextGtip = (await gtip.create(ctx(), a4.id, input({ gtipCode: '000000000002', effectiveFrom: '2026-07-01' }))).item;
    await reviewed(nextGtip.id); await review(ctx(), 'gtip', nextGtip.id, verifyBody);
    const other = (await gtip.create(ctx(), a3.id, input())).item;
    await reviewed(other.id); await review(ctx(), 'gtip', other.id, verifyBody);
    assert.equal((await gtip.atDate(ctx(), a4.id, { on: '2026-06-30' })).item.id, oldGtip.id);
    assert.equal((await gtip.atDate(ctx(), a4.id, { on: '2026-07-01' })).item.id, nextGtip.id);
    assert.equal((await gtip.atDate(ctx(), a3.id, { on: '2026-06-30' })).item.gtipCode, oldGtip.gtipCode);
    assert.equal((await gtip.list(ctx(), a4.id, {})).total, 2);
    assert.notEqual(a4.id, a3.id);
  });
  await t.test('concurrent GTIP creates and competing reviews have only valid outcomes', async () => {
    const raceSku = await makeSku('RACE');
    const results = await Promise.allSettled([gtip.create(ctx(), raceSku.id, input()), gtip.create(ctx(), raceSku.id, input())]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'GTIP_OVERLAP');
    const id = results.find(r => r.status === 'fulfilled').value.item.id;
    const decisions = await Promise.allSettled(['REVIEWED', 'REJECTED'].map(decision => review(ctx(), 'gtip', id, { decision, reason: 'Concurrent decision' })));
    // REVIEWED then REJECTED is valid; REJECTED then REVIEWED must fail.
    assert.equal((await gtip.get(ctx(), id)).item.status, 'REJECTED');
    assert.ok(decisions.some(r => r.status === 'fulfilled'));
    await gtip.create(ctx(), raceSku.id, input());
  });
  await t.test('supplier source stays exact and unverified aliases never match', async () => {
    const key = ctx(); alias = (await aliases.create(key, aliasInput())).item;
    assert.equal(alias.supplierCode, ' a-4 ');
    assert.equal(alias.supplierDescription, '  Zarf A4\nÖzgün açıklama  ');
    assert.deepEqual(json(await aliases.create(key, aliasInput())), json({ item: alias }));
    assert.equal((await aliases.match(ctx(), matchInput())).match, null);
    await review(ctx(), 'alias', alias.id, { decision: 'REVIEWED', reason: 'Compared actual specifications' });
    assert.equal((await aliases.match(ctx(), matchInput())).match, null);
    await review(ctx(), 'alias', alias.id, { decision: 'VERIFIED', reason: 'Confirmed same goods' });
    assert.equal((await aliases.match(ctx(), matchInput())).match.skuId, a4.id);
    for (const overrides of [{ supplierCode: 'a-4' }, { supplierDescription: 'Zarf A4' }, { supplierCode: ' A-4 ' }]) assert.equal((await aliases.match(ctx(), matchInput(overrides))).match, null);
    await assert.rejects(aliases.match(ctx(), { ...matchInput(), gtipCode: '000000000001' }), { code: 'VALIDATION_ERROR' });
  });
  await t.test('only one current mapping; replacement retains immutable source and prior revision', async () => {
    await assert.rejects(aliases.create(ctx(), aliasInput({ skuId: a3.id })), { code: 'ALIAS_ALREADY_ACTIVE' });
    await assert.rejects(refs.save(ctx(), 'suppliers', { name: supplier.name, active: false }, supplier.id), { code: 'PRODUCT_IN_USE' });
    await review(ctx(), 'alias', alias.id, { decision: 'RETIRED', reason: 'Replace mapping after document review' });
    assert.equal((await aliases.match(ctx(), matchInput())).match, null);
    const replacement = (await aliases.create(ctx(), aliasInput({ skuId: a3.id }))).item;
    assert.equal(replacement.revision, 2); assert.equal(replacement.sourceId, alias.sourceId);
    assert.equal((await aliases.get(ctx(), alias.id)).item.skuId, a4.id);
    await review(ctx(), 'alias', replacement.id, { decision: 'REVIEWED', reason: 'Review new candidate' });
    await review(ctx(), 'alias', replacement.id, { decision: 'VERIFIED', reason: 'Verify new candidate' });
    assert.equal((await aliases.match(ctx(), matchInput())).match.skuId, a3.id);
    await assert.rejects(query(`INSERT INTO product_aliases (id, tenant_id, legal_entity_id, source_id, current_source_id, revision, sku_id, source_reference, created_by)
      VALUES (?, ?, ?, ?, ?, 99, ?, 'SQL duplicate fixture', ?)`, [randomUUID(), f.alpha.tenantId, f.alpha.entityId, replacement.sourceId, replacement.sourceId, a4.id, f.alpha.userId]), { code: 'ER_DUP_ENTRY' });
  });
  await t.test('concurrent alias proposals cannot reserve the same source twice', async () => {
    const body = aliasInput({ supplierCode: 'RACE' });
    const results = await Promise.allSettled([aliases.create(ctx(), body), aliases.create(ctx(), body)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'ALIAS_ALREADY_ACTIVE');
  });
  await t.test('inactive SKU cannot be automatically matched and history remains readable', async () => {
    await products.save(ctx(), 'skus', { name: a3.name, description: a3.description, familyId: a3.familyId, active: false }, a3.id);
    assert.equal((await aliases.match(ctx(), matchInput())).match, null);
    assert.equal((await gtip.atDate(ctx(), a3.id, { on: '2026-01-01' })).item, null);
    assert.equal((await gtip.list(ctx(), a3.id, {})).total, 1);
    await products.save(ctx(), 'skus', { name: a3.name, description: a3.description, familyId: a3.familyId, active: true }, a3.id);
  });
  await t.test('cross-entity/tenant IDs cannot read, review or create foreign relationships', async () => {
    const foreignDefinition = (await refs.save(beta(), 'attribute-definitions', definition('FOREIGN'))).item;
    const foreignSupplier = (await refs.save(beta(), 'suppliers', { code: 'SUPPLIER', name: 'Other entity supplier' })).item;
    for (const context of [ctx(f.beta.entityId), ctx(f.unassignedEntity)]) await assert.rejects(aliases.list(context, {}), { status: 403 });
    await assert.rejects(gtip.get(beta(), oldGtip.id), { status: 404 });
    await assert.rejects(review(beta(), 'gtip', oldGtip.id, { decision: 'RETIRED', reason: 'Foreign' }), { status: 404 });
    await assert.rejects(attributes.save(ctx(), a4.id, { definitionId: foreignDefinition.id, value: 'x' }), { status: 404 });
    await assert.rejects(aliases.create(ctx(), aliasInput({ supplierId: foreignSupplier.id })), { status: 404 });
    await assert.rejects(query('INSERT INTO product_sku_attributes (id, tenant_id, legal_entity_id, sku_id, definition_id, value) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), f.alpha.tenantId, f.alpha.entityId, a4.id, foreignDefinition.id, '"foreign"']), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(query('INSERT INTO product_alias_sources (id, tenant_id, legal_entity_id, supplier_id, supplier_code, supplier_description, source_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), f.alpha.tenantId, f.alpha.entityId, foreignSupplier.id, 'x', 'x', '0'.repeat(64)]), { code: 'ER_NO_REFERENCED_ROW_2' });
  });
  await t.test('failed audit rolls back new source, mapping, review and retry response', async () => {
    const pool = getMigrationPool();
    const key = ctx();
    await pool.query("CREATE TRIGGER pr01b_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit rejection'");
    try {
      await assert.rejects(aliases.create(key, aliasInput({ supplierCode: 'ROLLBACK' })));
      await assert.rejects(review(ctx(), 'gtip', nextGtip.id, { decision: 'RETIRED', reason: 'Must roll back' }));
    } finally { await pool.query('DROP TRIGGER pr01b_audit_failure'); }
    assert.equal((await query("SELECT COUNT(*) AS n FROM product_alias_sources WHERE supplier_code = 'ROLLBACK'")).rows[0].n, 0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM idempotency_records WHERE idempotency_key = ?', [key.idempotencyKey])).rows[0].n, 0);
    assert.equal((await gtip.get(ctx(), nextGtip.id)).item.status, 'VERIFIED');
    await aliases.create(key, aliasInput({ supplierCode: 'ROLLBACK' }));
  });
  await t.test('filters/page bounds and product audit retain all review transitions', async () => {
    assert.equal((await aliases.list(ctx(), { status: 'RETIRED', supplierId: supplier.id })).total, 1);
    assert.equal((await aliases.list(ctx(), { q: '%', limit: '1' })).total, 0);
    assert.equal((await aliases.list(ctx(), { skuId: a3.id, status: 'VERIFIED' })).total, 1);
    await assert.rejects(aliases.list(ctx(), { status: 'APPROVED' }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(gtip.list(ctx(), a4.id, { limit: '101' }), { code: 'VALIDATION_ERROR' });
    const { rows } = await query('SELECT action, details FROM audit_events WHERE resource_id = ? ORDER BY created_at, id', [alias.id]);
    assert.deepEqual(rows.map(r => r.action).sort(), ['product.alias.created', 'product.alias.reviewed', 'product.alias.verified', 'product.alias.retired'].sort());
    assert.ok(rows.find(r => r.action === 'product.alias.retired').details.reason);
  });
  await t.test('HTTP protections cover new write paths and read-only exact matching', async () => {
    const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const cookies = new Map();
      const request = async (path, method = 'GET', body, headers = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
        for (const cookie of response.headers.getSetCookie()) { const [k,v] = cookie.split(';')[0].split('='); cookies.set(k,v); }
        return { status: response.status, body: await response.json() };
      };
      const base = `/entities/${f.alpha.entityId}/products`;
      assert.equal((await request(`${base}/suppliers`)).status, 401);
      const csrf = (await request('/auth/csrf')).body.csrfToken;
      await request('/auth/login', 'POST', { tenantCode: 'ALPHA', email: 'admin@alpha.test', password: f.password }, { 'X-CSRF-Token': csrf });
      const token = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request(`${base}/aliases`, 'POST', aliasInput())).status, 403);
      assert.equal((await request(`${base}/suppliers`, 'POST', { code: 'HTTP', name: 'HTTP fixture' }, { 'X-CSRF-Token': token })).body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
      assert.equal((await request(`${base}/suppliers`, 'POST', { code: 'HTTP', name: 'HTTP fixture' }, { 'X-CSRF-Token': token, 'Idempotency-Key': randomUUID() })).status, 200);
      assert.equal((await request(`${base}/alias-matches`, 'POST', matchInput(), { 'X-CSRF-Token': token })).body.match.skuId, a3.id);
      assert.equal((await request(`${base}/skus/${a4.id}/gtip-at-date?on=2026-07-01`)).body.item.id, nextGtip.id);
      assert.equal((await request(`${base}/skus/${a4.id}/attributes`)).body.total, 3);
      assert.equal((await request(`${base}/aliases/${alias.id}`, 'PATCH', {}, { 'X-CSRF-Token': token })).status, 404);
      assert.equal((await request(`/entities/${f.beta.entityId}/products/aliases`)).status, 403);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
