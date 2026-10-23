import { scopeArgs } from './entity-context.js';
import { AppError } from '../shared/AppError.js';

// Called inside the same entity write lock as receipt posting/deactivation.
export async function assertInventoryUnused(tx, context, kind, id) {
  const checks = {
    warehouses: ['inventory_balances', 'warehouse_id'],
    pools: ['inventory_pool_balances', 'pool_id'],
    skus: ['inventory_balances', 'sku_id'],
    'movement-types': ['stock_receipts', 'movement_type_id'],
  };
  const definition = checks[kind];
  if (!definition) return;
  const columns = kind === 'pools' ? ['from_pool_id', 'to_pool_id'] : [definition[1]];
  const { rows: requests } = await tx.query(`SELECT id FROM inventory_reallocations WHERE tenant_id = ? AND legal_entity_id = ?
    AND (${columns.map(column => `${column} = ?`).join(' OR ')}) AND status IN ('REQUESTED','APPROVED'${kind === 'movement-types' ? ",'EXECUTED'" : ''}) LIMIT 1`, [...scopeArgs(context), ...columns.map(() => id)]);
  if (requests.length) throw new AppError(409, 'INVENTORY_IN_USE', 'This record is used by a pending reallocation or executed movement.');
  const [table, column] = definition;
  if (kind === 'movement-types') {
    const { rows: issues } = await tx.query("SELECT id FROM inventory_issues WHERE tenant_id = ? AND legal_entity_id = ? AND movement_type_id = ? AND status = 'POSTED' LIMIT 1", [...scopeArgs(context), id]);
    if (issues.length) throw new AppError(409, 'INVENTORY_IN_USE', 'This movement type is referenced by posted dispatches.');
  } else {
    const { rows: reserved } = await tx.query(`SELECT a.id FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id
      WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND (a.${column} = ? ${kind === 'pools' ? 'OR r.destination_pool_id = ?' : ''}) AND r.status = 'ACTIVE' AND a.quantity > a.released_quantity + a.issued_quantity LIMIT 1`, [...scopeArgs(context), id, ...(kind === 'pools' ? [id] : [])]);
    if (reserved.length) throw new AppError(409, 'INVENTORY_IN_USE', 'This record is used by outstanding reserved stock.');
  }
  const { rows } = await tx.query(`SELECT ${column} FROM ${table} WHERE tenant_id = ? AND legal_entity_id = ? AND ${column} = ?
    ${kind === 'movement-types' ? "AND status = 'POSTED'" : 'AND (quantity <> 0 OR value <> 0)'} LIMIT 1`, [...scopeArgs(context), id]);
  if (rows.length) throw new AppError(409, 'INVENTORY_IN_USE', 'This record is used by inventory. Keep it active while its stock or posting history depends on it.');
}
