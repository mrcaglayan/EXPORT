import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { getMigrationPool, closePool } from '../src/db/pool.js';
import { runMigrations, getMigrationStatus } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import * as setup from '../src/services/accounting-setup.service.js';
import { postJournal, getJournal } from '../src/services/journal.service.js';
import { enqueueRequest, processRequest, getRequest } from '../src/services/posting-requests.service.js';
import { permissionsFor } from '../src/services/identity.service.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
test('PR-00C scoped accounting, posting and concurrency', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations({ migrations: migrations.slice(0, 2) });
  const fixture = await createFixtures();
  const { rows: before } = await query('SELECT * FROM schema_migrations ORDER BY migration_key');
  await runMigrations();
  const { rows: after } = await query("SELECT * FROM schema_migrations WHERE migration_key IN ('m001_foundation', 'm002_auth_roles_scopes') ORDER BY migration_key");
  assert.deepEqual(after, before);
  await runMigrations();
  assert.ok((await getMigrationStatus()).every(row => row.status === 'applied' && row.attempts === 1));
  const ctx = (entityId = fixture.alpha.entityId, identity = { tenantId: fixture.alpha.tenantId, userId: fixture.alpha.userId }) =>
    ({ identity, entityId, idempotencyKey: randomUUID(), requestId: 'accounting-integration' });
  const beta = () => ctx(fixture.beta.entityId, { tenantId: fixture.beta.tenantId, userId: fixture.beta.userId });
  const viewer = () => ctx(fixture.secondEntity, { tenantId: fixture.alpha.tenantId, userId: fixture.viewer });
  let debit, credit, year, january;
  const payload = (overrides = {}) => ({
    documentDate: '2025-12-31', postingDate: '2026-01-15', currency: 'TRY', description: 'Synthetic journal',
    sourceModule: 'TEST', sourceId: randomUUID(),
    lines: [{ accountId: debit, debit: '0.1', credit: '0' },
      { accountId: debit, debit: '0.2', credit: '0' },
      { accountId: credit, debit: '0', credit: '0.3' }],
    ...overrides,
  });
  await t.test('upgrade grants explicit admin permissions without elevating readers', async () => {
    assert.ok((await permissionsFor(ctx().identity, fixture.alpha.entityId)).includes('accounting.post'));
    assert.ok(!(await permissionsFor(viewer().identity, fixture.secondEntity)).includes('accounting.post'));
    assert.equal((await setup.getSettings(ctx())).settings, null);
    await assert.rejects(setup.configure(viewer(), { baseCurrency: 'TRY' }), { code: 'FORBIDDEN' });
  });
  await t.test('currency, scoped chart and non-overlapping year/period identity', async () => {
    await setup.configure(ctx(), { baseCurrency: 'TRY' });
    await assert.rejects(setup.configure(ctx(), { baseCurrency: 'USD' }), { code: 'CURRENCY_LOCKED' });
    debit = (await setup.createAccount(ctx(), { code: '100.01', name: 'Synthetic debit', accountType: 'ASSET' })).account.id;
    credit = (await setup.createAccount(ctx(), { code: '320', name: 'Synthetic credit', accountType: 'LIABILITY' })).account.id;
    year = (await setup.createYear(ctx(), { code: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' })).fiscalYear.id;
    january = (await setup.createPeriod(ctx(), { code: 'JAN', fiscalYearId: year, startDate: '2026-01-01', endDate: '2026-01-31' })).period.id;
    await assert.rejects(setup.createYear(ctx(), { code: 'OVERLAP', startDate: '2026-12-01', endDate: '2027-12-31' }), { code: 'DATE_OVERLAP' });
    await assert.rejects(setup.createPeriod(ctx(), { code: 'OVERLAP', fiscalYearId: year, startDate: '2026-01-31', endDate: '2026-02-28' }), { code: 'DATE_OVERLAP' });
    await assert.rejects(setup.createPeriod(ctx(), { code: 'OUTSIDE', fiscalYearId: year, startDate: '2025-12-01', endDate: '2025-12-31' }), { code: 'PERIOD_OUTSIDE_YEAR' });
    await assert.rejects(setup.createAccount(ctx(), { code: '320', name: 'Duplicate', accountType: 'ASSET' }), { code: 'DUPLICATE_CODE' });
  });
  let posted;
  await t.test('balanced posting preserves exact decimals and separate document/posting dates', async () => {
    posted = (await postJournal(ctx(), payload())).journal;
    assert.equal(posted.totalDebit, '0.300000');
    assert.equal(posted.totalCredit, '0.300000');
    assert.equal(posted.documentDate, '2025-12-31');
    assert.equal(posted.postingDate, '2026-01-15');
    assert.equal(posted.status, 'POSTED');
    assert.equal(posted.lines.length, 3);
    assert.equal((await getJournal(ctx(), posted.id)).journal.id, posted.id);
  });
  await t.test('unbalanced, float, cross-entity and foreign-currency entries are rejected', async () => {
    await assert.rejects(postJournal(ctx(), payload({ lines: [{ accountId: debit, debit: '1', credit: '0' }, { accountId: credit, debit: '0', credit: '0.99' }] })), { code: 'UNBALANCED_JOURNAL' });
    await assert.rejects(postJournal(ctx(), payload({ lines: [{ accountId: debit, debit: 0.3, credit: '0' }, { accountId: credit, debit: '0', credit: '0.3' }] })), { code: 'INVALID_AMOUNT' });
    await assert.rejects(postJournal(ctx(), payload({ currency: 'USD' })), { code: 'CURRENCY_MISMATCH' });
    await assert.rejects(postJournal(ctx(), payload({ postingDate: '2026-12-31' })), { code: 'PERIOD_NOT_FOUND' });
    await setup.configure(beta(), { baseCurrency: 'TRY' });
    const other = (await setup.createAccount(beta(), { code: '100', name: 'Other tenant', accountType: 'ASSET' })).account.id;
    await assert.rejects(postJournal(ctx(), payload({ lines: [{ accountId: other, debit: '1', credit: '0' }, { accountId: credit, debit: '0', credit: '1' }] })), { code: 'ACCOUNT_UNAVAILABLE' });
    await assert.rejects(getJournal(beta(), posted.id), { code: 'NOT_FOUND' });
    await assert.rejects(setup.list(ctx(fixture.beta.entityId), 'journals', {}), { code: 'FORBIDDEN' });
    await assert.rejects(postJournal(viewer(), payload()), { code: 'FORBIDDEN' });
    await assert.rejects(setup.list(viewer(), 'audit_events', {}), { code: 'FORBIDDEN' });
  });
  await t.test('concurrent same-key and same-source submissions commit exactly once', async () => {
    const context = ctx();
    const input = payload();
    const results = await Promise.all(Array.from({ length: 8 }, () => postJournal(context, input)));
    assert.equal(new Set(results.map(r => r.journal.id)).size, 1);
    const anotherKey = await postJournal(ctx(), input);
    assert.equal(anotherKey.journal.id, results[0].journal.id);
    await assert.rejects(postJournal(context, { ...input, description: 'Changed' }), { code: 'IDEMPOTENCY_CONFLICT' });
    await assert.rejects(postJournal(ctx(), { ...input, description: 'Changed' }), { code: 'SOURCE_CONFLICT' });
    const { rows } = await query('SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = ?', [results[0].journal.id, 'journal.posted']);
    assert.equal(rows[0].count, 1);
  });
  await t.test('posted journals, lines and audit rows cannot be edited through SQL', async () => {
    await assert.rejects(query('UPDATE journals SET description = ? WHERE id = ?', ['Changed', posted.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query('DELETE FROM journals WHERE id = ?', [posted.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query('UPDATE journal_lines SET debit = ? WHERE journal_id = ?', ['5', posted.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query('DELETE FROM journal_lines WHERE journal_id = ?', [posted.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query(`INSERT INTO journal_lines (id, tenant_id, legal_entity_id, journal_id, line_number, account_id, description, debit, credit)
      VALUES (?, ?, ?, ?, 99, ?, '', 1, 0)`, [randomUUID(), fixture.alpha.tenantId, fixture.alpha.entityId, posted.id, debit]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(query('DELETE FROM audit_events WHERE resource_id = ?', [posted.id]), { code: 'ER_SIGNAL_EXCEPTION' });
  });
  await t.test('journal, audit and idempotency all roll back when audit insertion fails', async () => {
    const input = payload({ sourceId: 'rollback-probe', lines: Array.from({ length: 200 }, () => payload().lines).flat() });
    const context = ctx();
    await getMigrationPool().query(`CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW
      BEGIN IF NEW.action = 'journal.posted' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.details, '$.sourceId')) = 'rollback-probe'
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'; END IF; END`);
    try { await assert.rejects(postJournal(context, input), { code: 'ER_SIGNAL_EXCEPTION' }); }
    finally { await getMigrationPool().query('DROP TRIGGER test_audit_failure'); }
    const { rows: journals } = await query('SELECT id FROM journals WHERE source_id = ?', [input.sourceId]);
    const { rows: keys } = await query('SELECT response FROM idempotency_records WHERE idempotency_key = ?', [context.idempotencyKey]);
    assert.equal(journals.length, 0);
    assert.equal(keys.length, 0);
    assert.equal((await postJournal(context, input)).journal.status, 'POSTED');
  });
  await t.test('outbox remains pending/failed until a matching balanced journal exists', async () => {
    const enqueued = (await enqueueRequest(ctx(), payload())).postingRequest;
    assert.equal(enqueued.status, 'PENDING');
    assert.equal(enqueued.journalId, null);
    await assert.rejects(query("UPDATE posting_requests SET status = 'POSTED', journal_id = ? WHERE id = ?", [posted.id, enqueued.id]), { code: 'ER_SIGNAL_EXCEPTION' });
    await assert.rejects(setup.closePeriod(ctx(), january, { reason: 'Test close' }), { code: 'UNPOSTED_REQUESTS' });
    await setup.updateAccount(ctx(), debit, { name: 'Synthetic debit', active: false });
    const failed = (await processRequest(ctx(), enqueued.id)).postingRequest;
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.errorCode, 'ACCOUNT_UNAVAILABLE');
    assert.equal(failed.journalId, null);
    assert.equal(failed.attempts, 1);
    await assert.rejects(setup.closePeriod(ctx(), january, { reason: 'Test close' }), { code: 'UNPOSTED_REQUESTS' });
    await setup.updateAccount(ctx(), debit, { name: 'Synthetic debit', active: true });
    const results = await Promise.all(Array.from({ length: 5 }, () => processRequest(ctx(), enqueued.id)));
    assert.ok(results.every(r => r.postingRequest.status === 'POSTED' && r.postingRequest.attempts === 2));
    assert.equal(new Set(results.map(r => r.postingRequest.journalId)).size, 1);
    assert.equal((await getRequest(ctx(), enqueued.id)).postingRequest.status, 'POSTED');
    await assert.rejects(getRequest(beta(), enqueued.id), { code: 'NOT_FOUND' });
  });
  await t.test('closed periods reject new postings and queues but replay existing success', async () => {
    const key = ctx();
    const input = payload();
    const original = await postJournal(key, input);
    assert.equal((await setup.closePeriod(ctx(), january, { reason: 'Synthetic closing' })).period.status, 'CLOSED');
    await assert.rejects(postJournal(ctx(), payload()), { code: 'PERIOD_CLOSED' });
    await assert.rejects(enqueueRequest(ctx(), payload()), { code: 'PERIOD_CLOSED' });
    assert.equal((await postJournal(key, input)).journal.id, original.journal.id);
    assert.equal((await postJournal(ctx(), input)).journal.id, original.journal.id);
    await assert.rejects(setup.closePeriod(viewer(), january, { reason: 'Denied' }), { code: 'FORBIDDEN' });
  });
  await t.test('close/post and close/enqueue races have only consistent outcomes', async () => {
    for (const [code, startDate, endDate, action] of [
      ['FEB', '2026-02-01', '2026-02-28', postJournal],
      ['MAR', '2026-03-01', '2026-03-31', enqueueRequest],
    ]) {
      const period = (await setup.createPeriod(ctx(), { code, startDate, endDate, fiscalYearId: year })).period;
      const input = payload({ postingDate: startDate });
      const results = await Promise.allSettled([
        action(ctx(), input), setup.closePeriod(ctx(), period.id, { reason: 'Race test' }),
      ]);
      assert.ok(results.some(r => r.status === 'fulfilled'));
      for (const result of results) if (result.status === 'rejected') assert.ok(['PERIOD_CLOSED', 'UNPOSTED_REQUESTS'].includes(result.reason.code));
      const { rows } = await query('SELECT status FROM accounting_periods WHERE id = ?', [period.id]);
      const { rows: pending } = await query("SELECT id FROM posting_requests WHERE period_id = ? AND status <> 'POSTED'", [period.id]);
      assert.ok(rows[0].status !== 'CLOSED' || pending.length === 0);
    }
  });
  await t.test('HTTP accounting routes enforce authentication, CSRF, scope and idempotency header', async () => {
    const server = createApp({ logger: { error() {} } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/v1`;
      const cookies = new Map();
      const request = async (path, method = 'GET', body, headers = {}) => {
        const response = await fetch(`${base}${path}`, { method, headers: { Origin: 'http://localhost:5173',
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body) });
        for (const cookie of response.headers.getSetCookie()) {
          const [key, value] = cookie.split(';')[0].split('='); cookies.set(key, value);
        }
        return { status: response.status, body: await response.json() };
      };
      const path = `/entities/${fixture.alpha.entityId}/accounting`;
      assert.equal((await request(`${path}/settings`)).status, 401);
      const csrf = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request('/auth/login', 'POST', { tenantCode: 'ALPHA', email: 'admin@alpha.test', password: fixture.password }, { 'X-CSRF-Token': csrf })).status, 200);
      const token = (await request('/auth/csrf')).body.csrfToken;
      assert.equal((await request(`${path}/settings`, 'POST', { baseCurrency: 'TRY' })).status, 403);
      assert.equal((await request(`${path}/settings`, 'POST', { baseCurrency: 'TRY' }, { 'X-CSRF-Token': token })).body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
      assert.equal((await request(`${path}/accounts?limit=1`)).body.items.length, 1);
      assert.equal((await request(`${path}/accounts?limit=101`)).status, 400);
      assert.equal((await request(`/entities/${fixture.beta.entityId}/accounting/accounts`)).status, 403);
      assert.equal((await request(`${path}/journals`, 'POST', payload(), { 'X-CSRF-Token': token, 'Idempotency-Key': randomUUID() })).body.error.code, 'PERIOD_CLOSED');
      assert.equal((await request(`${path}/audit-events`)).status, 200);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await t.test('all persisted journals balance and no assembling journal escaped its transaction', async () => {
    const { rows } = await query(`SELECT j.id, j.total_debit, j.total_credit, j.status,
      SUM(l.debit) AS debit, SUM(l.credit) AS credit FROM journals j
      JOIN journal_lines l ON l.journal_id = j.id GROUP BY j.id`);
    assert.ok(rows.length >= 4);
    for (const row of rows) {
      assert.equal(row.status, 'POSTED');
      assert.equal(row.total_debit, row.total_credit);
      assert.equal(row.total_debit, row.debit);
      assert.equal(row.debit, row.credit);
    }
  });
});
