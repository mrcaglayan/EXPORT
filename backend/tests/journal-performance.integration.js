import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { query } from '../src/db/query.js';
import { closePool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import { createFixtures } from './auth-fixtures.js';
import * as setup from '../src/services/accounting-setup.service.js';
import { postJournal, getJournal } from '../src/services/journal.service.js';

assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
test('large journals and concurrent writers preserve integrity', { timeout: 120000 }, async t => {
  t.after(closePool);
  await runMigrations();
  const fixture = await createFixtures();
  const { alpha } = fixture;
  const context = (userId = alpha.userId) => ({ identity: { tenantId: alpha.tenantId, userId },
    entityId: alpha.entityId, requestId: 'journal-performance', idempotencyKey: randomUUID() });
  await query('INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id) VALUES (?, ?, ?, ?)',
    [alpha.tenantId, fixture.noAccess, alpha.roleId, alpha.entityId]);
  await setup.configure(context(), { baseCurrency: 'TRY' });
  const { fiscalYear } = await setup.createYear(context(), { code: 'PERF2026', startDate: '2026-01-01', endDate: '2026-12-31' });
  await setup.createPeriod(context(), { code: 'PERFJAN', fiscalYearId: fiscalYear.id, startDate: '2026-01-01', endDate: '2026-01-31' });
  const accounts = Array.from({ length: 1000 }, () => randomUUID());
  for (let offset = 0; offset < accounts.length; offset += 250) {
    const batch = accounts.slice(offset, offset + 250);
    await query(`INSERT INTO accounts (id, tenant_id, legal_entity_id, code, name, account_type)
      VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}`,
    batch.flatMap((id, index) => [id, alpha.tenantId, alpha.entityId, `PERF${offset + index}`, 'Synthetic performance account', 'ASSET']));
  }
  const payload = count => ({ documentDate: '2026-01-10', postingDate: '2026-01-15', currency: 'TRY',
    description: `Synthetic ${count}-line journal`, sourceModule: 'PERFORMANCE', sourceId: randomUUID(),
    lines: Array.from({ length: count }, (_, index) => ({ accountId: accounts[index], description: `Synthetic line ${index + 1}`,
      debit: index === count - 1 ? '0' : '1', credit: index === count - 1 ? String(count - 1) : '0' })) });
  for (const count of [300, 1000]) {
    const input = payload(count), ctx = context();
    const start = performance.now();
    const { journal } = await postJournal(ctx, input);
    const elapsed = performance.now() - start;
    assert.equal(journal.lines.length, count);
    assert.equal(journal.totalDebit, `${count - 1}.000000`);
    assert.equal(journal.totalCredit, journal.totalDebit);
    assert.deepEqual(journal.lines.map(line => line.lineNumber), Array.from({ length: count }, (_, i) => i + 1));
    assert.equal((await postJournal(ctx, input)).journal.id, journal.id);
    assert.equal((await getJournal(ctx, journal.id)).journal.lines.length, count);
    assert.ok(elapsed < 10000, 'Local single journal should complete within the generous 10-second regression threshold.');
    console.log(`MEASURE: ${count} lines, ${count} distinct accounts, service post ${elapsed.toFixed(1)} ms.`);
  }
  const start = performance.now();
  const pending = Array.from({ length: 6 }, (_, index) => ({ ctx: context(index % 2 ? fixture.noAccess : alpha.userId), input: payload(index % 2 ? 1000 : 300) }));
  const results = await Promise.all(pending.map(async ({ ctx, input }) => {
    const started = performance.now();
    const result = await postJournal(ctx, input);
    return { ...result, milliseconds: performance.now() - started };
  }));
  assert.equal(new Set(results.map(result => result.journal.id)).size, 6);
  assert.ok(results.every(result => result.journal.totalDebit === result.journal.totalCredit));
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 30000, 'Six concurrent local posts should finish within 30 seconds.');
  console.log(`MEASURE: two authorized users, six concurrent 300/1000-line posts, wall ${elapsed.toFixed(1)} ms; slowest ${Math.max(...results.map(result => result.milliseconds)).toFixed(1)} ms.`);
  const { rows } = await query(`SELECT j.id, j.total_debit, j.total_credit, j.status, SUM(l.debit) AS debit, SUM(l.credit) AS credit
    FROM journals j JOIN journal_lines l ON l.journal_id = j.id GROUP BY j.id`);
  assert.equal(rows.length, 8);
  for (const row of rows) {
    assert.equal(row.status, 'POSTED');
    assert.equal(row.total_debit, row.debit);
    assert.equal(row.total_credit, row.credit);
    assert.equal(row.debit, row.credit);
  }
});
