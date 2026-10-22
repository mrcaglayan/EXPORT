import { object, text, code, entityId, invalid } from './auth.validators.js';
import { page } from './accounting.validators.js';
import { isCountryCode } from '../shared/country-codes.js';

export const effects = ['RECEIPT', 'ISSUE', 'REALLOCATION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVALUATION'];
export function metadata(body, kind, updating) {
  if (kind === 'periods') {
    object(body, ['accountingPeriodId']);
    return { accountingPeriodId: entityId(body.accountingPeriodId) };
  }
  object(body, ['name', ...(updating ? ['active'] : kind === 'pools' ? ['kind', 'countryCode'] : ['code']),
    ...(kind === 'warehouses' ? ['location'] : kind === 'movement-types' && !updating ? ['effect'] : [])]);
  const value = { name: text(body.name, 160), active: true };
  if (updating) {
    if (typeof body.active !== 'boolean') throw invalid();
    value.active = body.active;
  } else if (kind === 'pools') {
    if (!['GENERAL', 'COUNTRY'].includes(body.kind)) throw invalid();
    value.kind = body.kind;
    value.countryCode = body.countryCode == null ? null : text(body.countryCode, 2).toUpperCase();
    if (body.kind === 'GENERAL' ? value.countryCode !== null : !isCountryCode(value.countryCode)) throw invalid();
    value.code = body.kind === 'GENERAL' ? 'GENERAL' : value.countryCode;
  } else value.code = code(body.code);
  if (kind === 'warehouses') value.location = text(body.location ?? '', 500, 0);
  if (kind === 'movement-types' && !updating) {
    if (!effects.includes(body.effect)) throw invalid();
    value.effect = body.effect;
  }
  return value;
}
export function filters(input, kind) {
  const fields = kind === 'audit-events' ? [] : ['q', ...(['periods', 'accounting-periods'].includes(kind) ? ['status'] : ['active']), ...(kind === 'pools' ? ['kind'] : [])];
  object(input, ['limit', 'offset', ...fields]);
  const result = { ...page({ limit: input.limit, offset: input.offset }), q: text(input.q ?? '', 160, 0) };
  if (input.active !== undefined) {
    if (!['true', 'false'].includes(input.active)) throw invalid();
    result.active = input.active === 'true';
  }
  if (input.kind !== undefined) {
    if (!['GENERAL', 'COUNTRY'].includes(input.kind)) throw invalid();
    result.kind = input.kind;
  }
  if (input.status !== undefined) {
    if (!(kind === 'accounting-periods' ? ['OPEN', 'CLOSED'] : ['OPEN', 'IN_REVIEW', 'CLOSED']).includes(input.status)) throw invalid();
    result.status = input.status;
  }
  return result;
}
