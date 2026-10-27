import { entityId, object, text, code, invalid } from './auth.validators.js';
import { amount, sumAmounts } from '../shared/money.js';
import { AppError } from '../shared/AppError.js';

export { entityId, object, text, code };
export function date(value) {
  if (typeof value !== 'string' || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw invalid();
  return value;
}
export function currency(value) {
  // Technical currency contract; no exchange-rate or tax policy is inferred.
  if (typeof value !== 'string' || !['TRY', 'USD', 'EUR', 'GBP'].includes(value)) {
    throw new AppError(422, 'UNSUPPORTED_CURRENCY', 'Select TRY, USD, EUR or GBP for this foundation release.');
  }
  return value;
}
export function page(input) {
  object(input, ['offset', 'limit']);
  const offset = Number(input.offset ?? 0);
  const limit = Number(input.limit ?? 25);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw invalid();
  return { offset, limit };
}
export function key(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key of 8–128 safe characters.');
  }
  return value;
}
export function account(body) {
  object(body, ['code', 'name', 'accountType']);
  if (!['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].includes(body.accountType)) throw invalid();
  const accountCode = text(body.code, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(accountCode)) throw invalid();
  return { code: accountCode, name: text(body.name, 160), accountType: body.accountType };
}
export function accountUpdate(body) {
  object(body, ['name', 'active']);
  if (typeof body.active !== 'boolean') throw invalid();
  return { name: text(body.name, 160), active: body.active };
}
export function dates(body, period = false) {
  object(body, period ? ['code', 'startDate', 'endDate', 'fiscalYearId'] : ['code', 'startDate', 'endDate']);
  const result = { code: code(body.code), startDate: date(body.startDate), endDate: date(body.endDate) };
  if (result.startDate > result.endDate) throw invalid();
  if (period) result.fiscalYearId = entityId(body.fiscalYearId);
  return result;
}
export function journal(body) {
  object(body, ['documentDate', 'postingDate', 'currency', 'description', 'sourceModule', 'sourceId', 'lines']);
  if (!Array.isArray(body.lines) || body.lines.length < 2) throw invalid();
  const lines = body.lines.map(line => {
    object(line, ['accountId', 'description', 'debit', 'credit']);
    const result = { accountId: entityId(line.accountId), description: text(line.description ?? '', 255, 0),
      debit: amount(line.debit), credit: amount(line.credit) };
    if ((result.debit === '0.000000') === (result.credit === '0.000000')) {
      throw new AppError(422, 'INVALID_JOURNAL_LINE', 'Each line must have one positive debit or credit.');
    }
    return result;
  });
  const totalDebit = sumAmounts(lines.map(l => l.debit));
  const totalCredit = sumAmounts(lines.map(l => l.credit));
  if (totalDebit !== totalCredit) throw new AppError(422, 'UNBALANCED_JOURNAL', 'Journal debits and credits must match exactly.');
  const sourceModule = code(body.sourceModule);
  if(sourceModule==='PURCHASE_INVOICE')throw new AppError(422,'SOURCE_RESERVED','Purchase invoice journals are created only by the approved goods receipt workflow.');
  const sourceId = text(body.sourceId, 128);
  if (!/^[A-Za-z0-9._:-]+$/.test(sourceId)) throw invalid();
  return { documentDate: date(body.documentDate), postingDate: date(body.postingDate), currency: currency(body.currency),
    description: text(body.description, 255), sourceModule, sourceId, lines };
}
