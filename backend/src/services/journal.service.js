import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { sumAmounts } from '../shared/money.js';
import { fingerprint } from '../shared/idempotency.js';
import * as validate from '../validators/accounting.validators.js';
import { accountingWrite, audit, authorize, scopeArgs, settings, notFound } from './accounting-context.js';

export async function validatePosting(tx, context, input) {
  const config = await settings(tx, context);
  if (input.currency !== config.baseCurrency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Journal currency must match the entity base currency.');
  const { rows: periods } = await tx.query(`SELECT id, status FROM accounting_periods
    WHERE tenant_id = ? AND legal_entity_id = ? AND ? BETWEEN start_date AND end_date FOR SHARE`,
  [...scopeArgs(context), input.postingDate]);
  if (periods.length !== 1) throw new AppError(422, 'PERIOD_NOT_FOUND', 'The posting date must belong to one configured period.');
  if (periods[0].status !== 'OPEN') throw new AppError(409, 'PERIOD_CLOSED', 'Posting into a closed period is not allowed.');
  const accountIds = [...new Set(input.lines.map(line => line.accountId))].sort();
  const { rows: mapped } = await tx.query('SELECT account_id AS accountId FROM inventory_reconciliation_accounts WHERE tenant_id = ? AND legal_entity_id = ?', scopeArgs(context));
  if (mapped.some(row => accountIds.includes(row.accountId))) {
    const { rows: locked } = await tx.query(`SELECT c.period_id FROM inventory_period_controls c JOIN inventory_periods p ON p.tenant_id = c.tenant_id AND p.legal_entity_id = c.legal_entity_id AND p.id = c.period_id
      JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
      WHERE c.tenant_id = ? AND c.legal_entity_id = ? AND a.end_date >= ? AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL) LIMIT 1`, [...scopeArgs(context), input.postingDate]);
    if (locked.length) throw new AppError(409, 'INVENTORY_PERIOD_LOCKED', 'Mapped inventory accounts are locked through the stock review or close date. Use the approved stock reopen workflow first.');
  }
  for (let offset = 0; offset < accountIds.length; offset += 500) {
    const batch = accountIds.slice(offset, offset + 500);
    const { rows } = await tx.query(`SELECT id, active FROM accounts WHERE tenant_id = ? AND legal_entity_id = ?
      AND id IN (${batch.map(() => '?').join(',')}) ORDER BY id FOR SHARE`, [...scopeArgs(context), ...batch]);
    if (rows.length !== batch.length || rows.some(row => !row.active)) throw new AppError(422, 'ACCOUNT_UNAVAILABLE', 'Every journal account must be active and belong to this legal entity.');
  }
  return periods[0];
}
export async function journalDetails(tx, context, id) {
  const { rows } = await tx.query(`SELECT id, period_id AS periodId, document_date AS documentDate,
    posting_date AS postingDate, currency, description, source_module AS sourceModule, source_id AS sourceId,
    status, total_debit AS totalDebit, total_credit AS totalCredit
    FROM journals WHERE tenant_id = ? AND legal_entity_id = ? AND id = ? AND status = 'POSTED'`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  const { rows: lines } = await tx.query(`SELECT line_number AS lineNumber, account_id AS accountId, description, debit, credit
    FROM journal_lines WHERE tenant_id = ? AND legal_entity_id = ? AND journal_id = ? ORDER BY line_number`, [...scopeArgs(context), id]);
  return { journal: { ...rows[0], lines } };
}
export async function getJournal(context, id) {
  validate.entityId(id);
  await authorize(context);
  return journalDetails({ query }, context, id);
}
export async function postInTransaction(tx, context, input) {
  const hash = fingerprint(input);
  const { rows: existing } = await tx.query(`SELECT id, payload_hash AS payloadHash, status FROM journals
    WHERE tenant_id = ? AND legal_entity_id = ? AND source_module = ? AND source_id = ?`,
  [...scopeArgs(context), input.sourceModule, input.sourceId]);
  if (existing.length) {
    if (existing[0].payloadHash !== hash || existing[0].status !== 'POSTED') {
      throw new AppError(409, 'SOURCE_CONFLICT', 'This source reference already has different journal content.');
    }
    return journalDetails(tx, context, existing[0].id);
  }
  const period = await validatePosting(tx, context, input);
  const id = randomUUID();
  const totalDebit = sumAmounts(input.lines.map(line => line.debit));
  const totalCredit = sumAmounts(input.lines.map(line => line.credit));
  await tx.query(`INSERT INTO journals (id, tenant_id, legal_entity_id, period_id, document_date, posting_date,
    currency, description, source_module, source_id, payload_hash, total_debit, total_credit, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, ...scopeArgs(context), period.id, input.documentDate, input.postingDate,
    input.currency, input.description, input.sourceModule, input.sourceId, hash, totalDebit, totalCredit, context.identity.userId]);
  // Bound each SQL statement, not the journal. Every batch remains in this
  // transaction; a later failure rolls back all prior batches and the header.
  for (let offset = 0; offset < input.lines.length; offset += 250) {
    const batch = input.lines.slice(offset, offset + 250);
    await tx.query(`INSERT INTO journal_lines
      (id, tenant_id, legal_entity_id, journal_id, line_number, account_id, description, debit, credit)
      VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`,
    batch.flatMap((line, index) => [randomUUID(), ...scopeArgs(context), id, offset + index + 1, line.accountId, line.description, line.debit, line.credit]));
  }
  // DB trigger independently verifies line totals and rejects later edits.
  await tx.query("UPDATE journals SET status = 'POSTED' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [...scopeArgs(context), id]);
  await audit(tx, context, 'journal.posted', id, { sourceModule: input.sourceModule, sourceId: input.sourceId, totalDebit, totalCredit });
  return journalDetails(tx, context, id);
}
export async function postJournal(context, body) {
  const input = validate.journal(body);
  return accountingWrite(context, 'accounting.post', 'journal.post', input, tx => postInTransaction(tx, context, input));
}
