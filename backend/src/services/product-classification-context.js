import { query } from '../db/query.js';
import { scopeArgs, notFound } from './entity-context.js';
import { AppError } from '../shared/AppError.js';

export const conflict = (code, message) => new AppError(409, code, message);
export const pattern = value => `%${value.replace(/[!%_]/g, match => `!${match}`)}%`;
export async function sku(tx, context, id, active = false) {
  const { rows } = await tx.query('SELECT id, code, name, active FROM product_skus WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?', [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  if (active && !rows[0].active) throw conflict('INACTIVE_REFERENCE', 'Choose an active SKU.');
  return rows[0];
}
export async function paged(fields, from, where, args, order, page) {
  const { rows: count } = await query(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`, args);
  const { rows } = await query(`SELECT ${fields} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  return { items: rows, total: count[0].total, limit: page.limit, offset: page.offset };
}
