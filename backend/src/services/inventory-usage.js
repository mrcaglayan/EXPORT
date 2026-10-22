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
  const [table, column] = definition;
  const { rows } = await tx.query(`SELECT ${column} FROM ${table} WHERE tenant_id = ? AND legal_entity_id = ? AND ${column} = ?
    ${kind === 'movement-types' ? "AND status = 'POSTED'" : 'AND (quantity <> 0 OR value <> 0)'} LIMIT 1`, [...scopeArgs(context), id]);
  if (rows.length) throw new AppError(409, 'INVENTORY_IN_USE', 'This record is used by inventory. Keep it active while its stock or posting history depends on it.');
}
