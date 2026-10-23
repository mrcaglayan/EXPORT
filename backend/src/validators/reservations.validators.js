import { object, text, entityId, invalid } from './auth.validators.js';
import { date, page } from './accounting.validators.js';
import { positive } from './receipts.validators.js';

function reference(value) {
  const result = text(value,64);
  if (!/^[A-Za-z0-9._:-]+$/.test(result)) throw invalid();
  return result;
}
export function reservation(body) {
  object(body,['reference','warehouseId','destinationPoolId','reservationDate','reason','lines']);
  if (!Array.isArray(body.lines) || !body.lines.length) throw invalid();
  return { reference: reference(body.reference), warehouseId: entityId(body.warehouseId), destinationPoolId: entityId(body.destinationPoolId), reservationDate: date(body.reservationDate), reason: text(body.reason,255),
    lines: body.lines.map(l => { object(l,['skuId','quantity']); return { skuId: entityId(l.skuId), quantity: positive(l.quantity) }; }) };
}
function quantities(lines) {
  if (!Array.isArray(lines) || !lines.length) throw invalid();
  const ids = new Set();
  return lines.map(l => {
    object(l,['reservationLineId','quantity']); const id = entityId(l.reservationLineId);
    if (ids.has(id)) throw invalid(); ids.add(id);
    return { reservationLineId: id, quantity: positive(l.quantity) };
  }).sort((a,b) => a.reservationLineId.localeCompare(b.reservationLineId));
}
export function release(body, cancel = false) {
  object(body,cancel?['reason']:['reason','lines']);
  return { reason: text(body.reason,255), ...(cancel?{}:{lines:quantities(body.lines)}) };
}
export function issue(body) {
  object(body,['reference','dispatchDate','postingDate','movementTypeId','description','lines']);
  return { reference:reference(body.reference),dispatchDate:date(body.dispatchDate),postingDate:date(body.postingDate),movementTypeId:entityId(body.movementTypeId),description:text(body.description,255),lines:quantities(body.lines) };
}
export function filters(input, kind = 'reservations') {
  const allowed = kind === 'reservations' ? ['status','warehouseId'] : kind === 'issues' ? ['reservationId'] : [];
  object(input,['limit','offset',...allowed]);
  if (input.status !== undefined && !['ACTIVE','CLOSED','CANCELLED'].includes(input.status)) throw invalid();
  return { ...page({limit:input.limit,offset:input.offset}), ...(input.status?{status:input.status}:{}), ...(input.warehouseId?{warehouseId:entityId(input.warehouseId)}:{}), ...(input.reservationId?{reservationId:entityId(input.reservationId)}:{}) };
}
