import { object, text, entityId, invalid } from './auth.validators.js';
import { date, page } from './accounting.validators.js';
import { positive } from './receipts.validators.js';

const selectionFields = ['warehouseId', 'skuId', 'toPoolId', 'quantity', 'postingDate'];
export function selection(input, request = false) {
  object(input, [...selectionFields, ...(request ? ['reference', 'fromPoolId', 'movementTypeId', 'reason'] : [])]);
  const result = { warehouseId: entityId(input.warehouseId), skuId: entityId(input.skuId), toPoolId: entityId(input.toPoolId), quantity: positive(input.quantity), postingDate: date(input.postingDate) };
  if (request) {
    const reference = text(input.reference, 64);
    if (!/^[A-Za-z0-9._:-]+$/.test(reference)) throw invalid();
    Object.assign(result, { reference, fromPoolId: entityId(input.fromPoolId), movementTypeId: entityId(input.movementTypeId), reason: text(input.reason, 255) });
    if (result.fromPoolId === result.toPoolId) throw invalid();
  }
  return result;
}
export function review(input, action) {
  object(input, action === 'execute' ? [] : ['reason']);
  return action === 'execute' ? {} : { reason: text(input.reason, 255) };
}
export function filters(input, lines = false) {
  object(input, ['limit', 'offset', ...(lines ? [] : ['status'])]);
  if (input.status && !['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED'].includes(input.status)) throw invalid();
  return { ...page({ limit: input.limit, offset: input.offset }), ...(input.status ? { status: input.status } : {}) };
}
