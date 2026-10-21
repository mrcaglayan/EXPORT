import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import * as validate from '../validators/accounting.validators.js';
import { accountingWrite, audit, authorize, scopeArgs, settings, notFound } from './accounting-context.js';

export async function getSettings(context) {
  await authorize(context);
  const { rows } = await query('SELECT base_currency AS baseCurrency FROM accounting_settings WHERE tenant_id = ? AND legal_entity_id = ?', scopeArgs(context));
  return { settings: rows[0] ?? null };
}
export async function configure(context, body) {
  validate.object(body, ['baseCurrency']);
  const baseCurrency = validate.currency(body.baseCurrency);
  return accountingWrite(context, 'accounting.configure', 'accounting.configure', { baseCurrency }, async tx => {
    const { rows } = await tx.query('SELECT base_currency AS baseCurrency FROM accounting_settings WHERE tenant_id = ? AND legal_entity_id = ?', scopeArgs(context));
    if (rows[0]) {
      if (rows[0].baseCurrency !== baseCurrency) throw new AppError(409, 'CURRENCY_LOCKED', 'Base currency is fixed after setup.');
      return { settings: rows[0] };
    }
    await tx.query('INSERT INTO accounting_settings (tenant_id, legal_entity_id, base_currency) VALUES (?, ?, ?)', [...scopeArgs(context), baseCurrency]);
    await audit(tx, context, 'accounting.configured', context.entityId, { baseCurrency });
    return { settings: { baseCurrency } };
  });
}
export async function createAccount(context, body) {
  const input = validate.account(body);
  return accountingWrite(context, 'accounting.configure', 'account.create', input, async tx => {
    await settings(tx, context);
    const id = randomUUID();
    await tx.query('INSERT INTO accounts (id, tenant_id, legal_entity_id, code, name, account_type) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ...scopeArgs(context), input.code, input.name, input.accountType]);
    await audit(tx, context, 'account.created', id, input);
    return { account: { id, ...input, active: true } };
  });
}
export async function updateAccount(context, id, body) {
  validate.entityId(id);
  const input = validate.accountUpdate(body);
  return accountingWrite(context, 'accounting.configure', `account.update:${id}`, input, async tx => {
    const { rows } = await tx.query('SELECT id, code, name, account_type AS accountType, active FROM accounts WHERE tenant_id = ? AND legal_entity_id = ? AND id = ? FOR UPDATE',
      [...scopeArgs(context), id]);
    if (!rows[0]) throw notFound();
    await tx.query('UPDATE accounts SET name = ?, active = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?', [input.name, input.active, ...scopeArgs(context), id]);
    await audit(tx, context, 'account.updated', id, { before: rows[0], after: input });
    return { account: { ...rows[0], ...input } };
  });
}
export async function createYear(context, body) {
  const input = validate.dates(body);
  return accountingWrite(context, 'accounting.configure', 'fiscalYear.create', input, async tx => {
    await settings(tx, context);
    const { rows } = await tx.query(`SELECT id FROM fiscal_years WHERE tenant_id = ? AND legal_entity_id = ?
      AND start_date <= ? AND end_date >= ?`, [...scopeArgs(context), input.endDate, input.startDate]);
    if (rows.length) throw new AppError(409, 'DATE_OVERLAP', 'Fiscal years cannot overlap.');
    const id = randomUUID();
    await tx.query('INSERT INTO fiscal_years (id, tenant_id, legal_entity_id, code, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ...scopeArgs(context), input.code, input.startDate, input.endDate]);
    await audit(tx, context, 'fiscalYear.created', id, input);
    return { fiscalYear: { id, ...input } };
  });
}
export async function createPeriod(context, body) {
  const input = validate.dates(body, true);
  return accountingWrite(context, 'accounting.configure', 'period.create', input, async tx => {
    const { rows: years } = await tx.query('SELECT start_date AS startDate, end_date AS endDate FROM fiscal_years WHERE tenant_id = ? AND legal_entity_id = ? AND id = ? FOR UPDATE',
      [...scopeArgs(context), input.fiscalYearId]);
    if (!years[0]) throw notFound();
    if (input.startDate < years[0].startDate || input.endDate > years[0].endDate) throw new AppError(422, 'PERIOD_OUTSIDE_YEAR', 'Period dates must be within the fiscal year.');
    const { rows } = await tx.query('SELECT id FROM accounting_periods WHERE tenant_id = ? AND legal_entity_id = ? AND start_date <= ? AND end_date >= ?',
      [...scopeArgs(context), input.endDate, input.startDate]);
    if (rows.length) throw new AppError(409, 'DATE_OVERLAP', 'Accounting periods cannot overlap.');
    const id = randomUUID();
    await tx.query('INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year_id, code, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, ...scopeArgs(context), input.fiscalYearId, input.code, input.startDate, input.endDate]);
    await audit(tx, context, 'period.created', id, input);
    return { period: { id, ...input, status: 'OPEN' } };
  });
}
export async function closePeriod(context, id, body) {
  validate.entityId(id);
  validate.object(body, ['reason']);
  const reason = validate.text(body.reason, 255);
  return accountingWrite(context, 'accounting.period.close', `period.close:${id}`, { reason }, async tx => {
    const { rows } = await tx.query('SELECT id, code, status FROM accounting_periods WHERE tenant_id = ? AND legal_entity_id = ? AND id = ? FOR UPDATE', [...scopeArgs(context), id]);
    if (!rows[0]) throw notFound();
    if (rows[0].status === 'CLOSED') return { period: rows[0] };
    const { rows: pending } = await tx.query(`SELECT id FROM posting_requests WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ? AND status <> 'POSTED' LIMIT 1`, [...scopeArgs(context), id]);
    if (pending.length) throw new AppError(409, 'UNPOSTED_REQUESTS', 'Resolve pending or failed posting requests before closing this period.');
    const { rows: drafts } = await tx.query("SELECT id FROM journals WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ? AND status <> 'POSTED' LIMIT 1", [...scopeArgs(context), id]);
    if (drafts.length) throw new AppError(409, 'UNPOSTED_JOURNALS', 'Unposted journals prevent period closing.');
    await tx.query("UPDATE accounting_periods SET status = 'CLOSED', closed_at = UTC_TIMESTAMP() WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [...scopeArgs(context), id]);
    await audit(tx, context, 'period.closed', id, { reason });
    return { period: { ...rows[0], status: 'CLOSED' } };
  });
}
const listings = {
  accounts: { fields: 'id, code, name, account_type AS accountType, active', order: 'code' },
  fiscal_years: { fields: 'id, code, start_date AS startDate, end_date AS endDate', order: 'start_date DESC, id' },
  accounting_periods: { fields: 'id, fiscal_year_id AS fiscalYearId, code, start_date AS startDate, end_date AS endDate, status', order: 'start_date DESC, id' },
  journals: { fields: 'id, period_id AS periodId, document_date AS documentDate, posting_date AS postingDate, currency, description, source_module AS sourceModule, source_id AS sourceId, status, total_debit AS totalDebit, total_credit AS totalCredit', order: 'posting_date DESC, id', filter: " AND status = 'POSTED'" },
  posting_requests: { fields: 'id, source_module AS sourceModule, source_id AS sourceId, status, journal_id AS journalId, error_code AS errorCode, attempts, created_at AS createdAt', order: 'created_at DESC, id' },
  audit_events: { fields: 'id, actor_id AS actorId, action, resource_id AS resourceId, request_id AS requestId, details, created_at AS createdAt', order: 'created_at DESC, id', permission: 'accounting.audit.read',
    filter: " AND (action LIKE 'accounting.%' OR action LIKE 'account.%' OR action LIKE 'fiscalYear.%' OR action LIKE 'period.%' OR action LIKE 'journal.%' OR action LIKE 'postingRequest.%')" },
};
export async function list(context, table, pagination) {
  const spec = listings[table];
  if (!spec) throw notFound();
  await authorize(context, spec.permission);
  const { offset, limit } = validate.page(pagination);
  const scope = `FROM ${table} WHERE tenant_id = ? AND legal_entity_id = ?${spec.filter ?? ''}`;
  const { rows } = await query(`SELECT ${spec.fields} ${scope} ORDER BY ${spec.order} LIMIT ${limit} OFFSET ${offset}`, scopeArgs(context));
  const { rows: count } = await query(`SELECT COUNT(*) AS total ${scope}`, scopeArgs(context));
  return { items: rows.map(r => table === 'accounts' ? { ...r, active: Boolean(r.active) } : r), total: count[0].total, offset, limit };
}
