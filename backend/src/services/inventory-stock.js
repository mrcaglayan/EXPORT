import { amount } from '../shared/money.js';
import { AppError } from '../shared/AppError.js';
import { scopeArgs, notFound } from './entity-context.js';

const fail = (code, message, status = 409) => new AppError(status, code, message);
export const micro = value => BigInt(value.replace('.', ''));
export const decimal = value => amount(`${value / 1000000n}.${String(value % 1000000n).padStart(6, '0')}`);
// Transfer the remaining carrying value proportionally. Emptying a pool moves
// its entire residual value, including receipt-allocation rounding millionths.
export const transferValue = (quantity, available, value) => decimal((micro(value) * micro(quantity) + micro(available) / 2n) / micro(available));
const own = alias => `${alias}.tenant_id = ? AND ${alias}.legal_entity_id = ?`;
export async function references(tx, context, input, effect = 'REALLOCATION') {
  const scope = scopeArgs(context);
  const { rows: warehouses } = await tx.query(`SELECT active FROM warehouses WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...scope, input.warehouseId]);
  const { rows: skus } = await tx.query(`SELECT s.active, u.active AS unitActive, f.active AS familyActive, u.quantity_precision AS precisionValue
    FROM product_skus s JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
    JOIN product_families f ON f.tenant_id = s.tenant_id AND f.legal_entity_id = s.legal_entity_id AND f.id = s.family_id WHERE ${own('s')} AND s.id = ?`, [...scope, input.skuId]);
  const ids = [input.toPoolId, ...(input.fromPoolId ? [input.fromPoolId] : [])];
  const { rows: pools } = await tx.query(`SELECT id, active, kind FROM inventory_pools WHERE tenant_id = ? AND legal_entity_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [...scope, ...ids]);
  if (!warehouses.length || !skus.length || pools.length !== ids.length) throw notFound();
  if (!warehouses[0].active || !skus[0].active || !skus[0].unitActive || !skus[0].familyActive || pools.some(p => !p.active)) throw fail('INACTIVE_REFERENCE', 'Choose active inventory references.');
  if (pools.find(p => p.id === input.toPoolId).kind !== 'COUNTRY') throw fail('DESTINATION_REQUIRED', 'Choose a country destination pool.', 422);
  if (/[1-9]/.test(input.quantity.split('.')[1].slice(skus[0].precisionValue))) throw fail('QUANTITY_PRECISION', 'Quantity must respect the SKU base-unit precision.', 422);
  if (input.movementTypeId) {
    const { rows } = await tx.query('SELECT active, effect FROM inventory_movement_types WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?', [...scope, input.movementTypeId]);
    if (!rows.length) throw notFound();
    if (!rows[0].active || rows[0].effect !== effect) throw fail('MOVEMENT_EFFECT_MISMATCH', `Choose an active ${effect.toLowerCase()} movement type.`);
  }
  return { ...pools.find(p => p.id === input.fromPoolId), quantityPrecision: skus[0].precisionValue };
}
export async function period(tx, context, date) {
  const { rows } = await tx.query(`SELECT i.id, i.status, a.status AS accountingStatus FROM inventory_periods i JOIN accounting_periods a
    ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id
    WHERE ${own('i')} AND ? BETWEEN a.start_date AND a.end_date`, [...scopeArgs(context), date]);
  if (!rows.length) throw fail('PERIOD_NOT_FOUND', 'Configure an inventory period for the posting date.', 422);
  if (rows[0].status !== 'OPEN' || rows[0].accountingStatus !== 'OPEN') throw fail('PERIOD_CLOSED', 'Both inventory and accounting periods must be open.');
  return rows[0].id;
}
// The current projection is not historical stock. Exclude any layer with a later
// pool event so a backdated transfer cannot spend stock before it was available.
export async function available(tx, context, input, poolId) {
  const { rows } = await tx.query(`SELECT b.layer_id AS layerId, b.quantity AS onHandQuantity, b.value,
    COALESCE((SELECT SUM(a.quantity - a.released_quantity - a.issued_quantity) FROM inventory_reservation_allocations a
      JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id
      WHERE a.tenant_id = b.tenant_id AND a.legal_entity_id = b.legal_entity_id AND a.layer_id = b.layer_id AND a.pool_id = b.pool_id AND r.status IN ('ASSEMBLING','ACTIVE')),0) AS reservedQuantity, x.received_date AS receivedDate,
    (SELECT MAX(e.posting_date) FROM inventory_pool_ledger p
      JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      LEFT JOIN inventory_reallocations r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.reallocation_id
      LEFT JOIN inventory_issues i ON i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id AND i.id = e.issue_id
      LEFT JOIN stock_receipts h ON h.tenant_id = e.tenant_id AND h.legal_entity_id = e.legal_entity_id AND h.id = e.receipt_id
      WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id) AS lastMovementDate
    FROM inventory_pool_balances b JOIN inventory_layers x ON x.tenant_id = b.tenant_id AND x.legal_entity_id = b.legal_entity_id AND x.id = b.layer_id
    WHERE ${own('b')} AND b.warehouse_id = ? AND b.sku_id = ? AND b.pool_id = ? AND b.quantity > 0
    ORDER BY x.received_date, x.created_at, x.id`, [...scopeArgs(context), input.warehouseId, input.skuId, poolId]);
  return rows.filter(row => row.receivedDate <= input.postingDate && row.lastMovementDate <= input.postingDate)
    .map(row => ({ ...row, quantity: decimal(micro(row.onHandQuantity) - micro(row.reservedQuantity)) }));
}
export function plan(rows, quantity) {
  let remaining = micro(quantity);
  const selected = [];
  for (const row of rows) {
    if (!remaining) break;
    if (micro(row.quantity) <= 0n) continue;
    const take = micro(row.quantity) < remaining ? micro(row.quantity) : remaining;
    selected.push({ ...row, quantity: decimal(take) }); remaining -= take;
  }
  return { selected, remaining: decimal(remaining) };
}
