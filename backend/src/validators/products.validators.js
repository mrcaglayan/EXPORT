import { object, text, code, entityId, invalid } from './auth.validators.js';
import { page } from './accounting.validators.js';

export function product(body, kind, updating = false) {
  const common = updating ? ['name', 'active'] : ['code', 'name'];
  const extra = kind === 'units' ? ['symbol', ...(updating ? [] : ['quantityPrecision'])]
    : kind === 'families' ? ['parentId'] : ['description', 'familyId', ...(updating ? [] : ['baseUnitId'])];
  object(body, [...common, ...extra]);
  const result = { name: text(body.name, 160) };
  if (updating) {
    if (typeof body.active !== 'boolean') throw invalid();
    result.active = body.active;
  } else { result.code = code(body.code); result.active = true; }
  if (kind === 'units') {
    result.symbol = text(body.symbol, 16);
    if (!updating) {
      if (!Number.isInteger(body.quantityPrecision) || body.quantityPrecision < 0 || body.quantityPrecision > 6) throw invalid();
      result.quantityPrecision = body.quantityPrecision;
    }
  } else if (kind === 'families') result.parentId = body.parentId == null ? null : entityId(body.parentId);
  else {
    result.description = text(body.description ?? '', 1000, 0);
    result.familyId = entityId(body.familyId);
    if (!updating) result.baseUnitId = entityId(body.baseUnitId);
  }
  return result;
}
export function filters(input, kind) {
  object(input, kind === 'audit-events' ? ['limit', 'offset'] : ['limit', 'offset', 'q', 'active', ...(kind === 'skus' ? ['familyId'] : [])]);
  const result = page({ limit: input.limit, offset: input.offset });
  result.q = text(input.q ?? '', 160, 0);
  if (input.active !== undefined && !['true', 'false'].includes(input.active)) throw invalid();
  result.active = input.active === undefined ? undefined : input.active === 'true';
  if (input.familyId !== undefined) result.familyId = entityId(input.familyId);
  return result;
}
