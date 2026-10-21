import { AppError } from '../shared/AppError.js';
import { scopeArgs, authorize as authorizeEntity } from './entity-context.js';
export { scopeArgs, audit, notFound, entityWrite as accountingWrite } from './entity-context.js';
export const authorize = (context, permission = 'accounting.read', tx) => authorizeEntity(context, permission, tx);
export async function settings(tx, context) {
  const { rows } = await tx.query('SELECT base_currency AS baseCurrency FROM accounting_settings WHERE tenant_id = ? AND legal_entity_id = ?', scopeArgs(context));
  if (!rows[0]) throw new AppError(409, 'ACCOUNTING_NOT_CONFIGURED', 'Set the base currency before creating accounting records.');
  return rows[0];
}
