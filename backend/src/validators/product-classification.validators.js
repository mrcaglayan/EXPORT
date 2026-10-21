import Decimal from 'decimal.js';
import { object, text, code, entityId, invalid } from './auth.validators.js';
import { date, page } from './accounting.validators.js';

export const states = ['PENDING', 'REVIEWED', 'VERIFIED', 'REJECTED', 'RETIRED'];
export function reference(body, kind, updating) {
  object(body, updating ? ['name', 'active'] : kind === 'suppliers' ? ['code', 'name'] : ['code', 'name', 'dataType', 'unitLabel', 'definesStock']);
  const result = { name: text(body.name, 160) };
  if (updating) {
    if (typeof body.active !== 'boolean') throw invalid();
    result.active = body.active;
  } else {
    result.code = code(body.code); result.active = true;
    if (kind === 'attribute-definitions') {
      if (!['TEXT', 'DECIMAL', 'BOOLEAN'].includes(body.dataType) || typeof body.definesStock !== 'boolean') throw invalid();
      Object.assign(result, { dataType: body.dataType, unitLabel: text(body.unitLabel ?? '', 16, 0), definesStock: body.definesStock });
    }
  }
  return result;
}
export function attributeValue(value, type) {
  if (type === 'BOOLEAN') { if (typeof value !== 'boolean') throw invalid(); return value; }
  if (type === 'TEXT') return text(value, 1000);
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(value)) throw invalid();
  return new Decimal(value).toFixed(6);
}
export function gtip(body) {
  object(body, ['gtipCode', 'effectiveFrom', 'effectiveTo', 'sourceReference']);
  if (typeof body.gtipCode !== 'string' || !/^[0-9]{12}$/.test(body.gtipCode)) throw invalid();
  const result = { gtipCode: body.gtipCode, effectiveFrom: date(body.effectiveFrom),
    effectiveTo: body.effectiveTo == null ? null : date(body.effectiveTo), sourceReference: text(body.sourceReference, 1000) };
  if (result.effectiveTo && result.effectiveTo < result.effectiveFrom) throw invalid();
  return result;
}
// Keep original supplier wording byte-for-byte (including whitespace and case).
function original(value, max, required) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw invalid();
  return value;
}
export function aliasSource(body, matching = false) {
  object(body, ['supplierId', 'supplierCode', 'supplierDescription', ...(matching ? [] : ['skuId', 'sourceReference'])]);
  return { supplierId: entityId(body.supplierId), supplierCode: original(body.supplierCode ?? '', 120, false),
    supplierDescription: original(body.supplierDescription, 1000, true),
    ...(!matching && { skuId: entityId(body.skuId), sourceReference: text(body.sourceReference, 1000) }) };
}
export function review(body, kind) {
  object(body, ['decision', 'reason', ...(kind === 'gtip' && body.decision === 'VERIFIED' ? ['brokerName', 'verificationReference', 'verifiedOn'] : [])]);
  if (!states.slice(1).includes(body.decision)) throw invalid();
  return { decision: body.decision, reason: text(body.reason, 1000),
    ...(kind === 'gtip' && body.decision === 'VERIFIED' && { brokerName: text(body.brokerName, 160),
      verificationReference: text(body.verificationReference, 1000), verifiedOn: date(body.verifiedOn) }) };
}
export function listing(input, allowed = []) {
  object(input, ['limit', 'offset', ...allowed]);
  const result = page({ offset: input.offset, limit: input.limit });
  if (input.q !== undefined) result.q = text(input.q, 160, 0);
  if (input.active !== undefined) {
    if (!['true', 'false'].includes(input.active)) throw invalid();
    result.active = input.active === 'true';
  }
  if (input.status !== undefined) { if (!states.includes(input.status)) throw invalid(); result.status = input.status; }
  for (const field of ['skuId', 'supplierId']) if (input[field] !== undefined) result[field] = entityId(input[field]);
  return result;
}
