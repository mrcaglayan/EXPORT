import { object, text, entityId, invalid } from './auth.validators.js';
import { date, currency, page } from './accounting.validators.js';
import { amount, multiplyAmounts, sumAmounts } from '../shared/money.js';
import { AppError } from '../shared/AppError.js';

const units = value => BigInt(amount(value).replace('.', ''));
const decimal = value => `${value / 1000000n}.${String(value % 1000000n).padStart(6, '0')}`;
export function positive(value) {
  const result = amount(value);
  if (result === '0.000000') throw new AppError(422, 'INVALID_QUANTITY', 'Receipt quantities must be positive.');
  return result;
}
function sourceKey(value, length) {
  const result = text(value, length);
  if (!/^[A-Za-z0-9._:-]+$/.test(result)) throw invalid();
  return result;
}
// Largest remainder allocation in integer millionths. Tie-break by pool UUID.
// Allocate the rounded line value once; never sum independently rounded pool costs.
export function allocateValue(allocations, quantity, value) {
  const total = units(value), qty = units(quantity);
  const rows = allocations.map(row => ({ ...row, micro: total * units(row.quantity) / qty, remainder: total * units(row.quantity) % qty }));
  let leftover = total - rows.reduce((sum, row) => sum + row.micro, 0n);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.poolId.localeCompare(b.poolId) : a.remainder > b.remainder ? -1 : 1)) {
    if (leftover === 0n) break;
    row.micro++; leftover--;
  }
  return rows.map(({ poolId, quantity: q, micro }) => ({ poolId, quantity: q, value: decimal(micro) }));
}
export function receipt(body) {
  object(body, ['sourceId', 'documentDate', 'postingDate', 'warehouseId', 'movementTypeId', 'currency', 'description', 'lines']);
  if (!Array.isArray(body.lines) || body.lines.length === 0) throw invalid();
  const keys = new Set();
  const lines = body.lines.map(line => {
    object(line, ['sourceLineKey', 'skuId', 'description', 'quantity', 'unitCost', 'allocations']);
    const sourceLineKey = sourceKey(line.sourceLineKey, 64);
    if (keys.has(sourceLineKey)) throw invalid();
    keys.add(sourceLineKey);
    const quantity = positive(line.quantity), unitCost = amount(line.unitCost);
    const value = multiplyAmounts(quantity, unitCost);
    if (!Array.isArray(line.allocations) || !line.allocations.length) throw invalid();
    const pools = new Set();
    const allocations = line.allocations.map(a => {
      object(a, ['poolId', 'quantity']);
      const poolId = entityId(a.poolId);
      if (pools.has(poolId)) throw invalid();
      pools.add(poolId);
      return { poolId, quantity: positive(a.quantity) };
    }).sort((a, b) => a.poolId.localeCompare(b.poolId));
    if (sumAmounts(allocations.map(a => a.quantity)) !== quantity) throw new AppError(422, 'ALLOCATION_MISMATCH', 'Pool quantities must equal the receipt line quantity.');
    return { sourceLineKey, skuId: entityId(line.skuId), description: text(line.description ?? '', 255, 0), quantity, unitCost, value, allocations: allocateValue(allocations, quantity, value) };
  });
  return { sourceId: sourceKey(body.sourceId, 128), documentDate: date(body.documentDate), postingDate: date(body.postingDate), warehouseId: entityId(body.warehouseId), movementTypeId: entityId(body.movementTypeId), currency: currency(body.currency), description: text(body.description, 255), totalValue: sumAmounts(lines.map(l => l.value)), lines };
}
export function filters(input, kind) {
  const fields = kind === 'receipts' ? ['q', 'warehouseId'] : kind === 'receipt-lines' ? [] : ['warehouseId', 'skuId', 'poolId'];
  if (['layers', 'physical-ledger', 'balances'].includes(kind)) fields.splice(fields.indexOf('poolId'), 1);
  object(input, ['limit', 'offset', ...fields]);
  const result = page({ limit: input.limit, offset: input.offset });
  for (const key of fields) if (input[key] !== undefined) result[key] = key === 'q' ? text(input[key], 128, 0) : entityId(input[key]);
  return result;
}
