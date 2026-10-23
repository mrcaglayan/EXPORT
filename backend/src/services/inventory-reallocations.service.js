import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { sumAmounts } from '../shared/money.js';
import { entityId } from '../validators/auth.validators.js';
import { filters as metadataFilters } from '../validators/inventory.validators.js';
import { selection, review, filters } from '../validators/reallocations.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';

import { references, period, available, plan, micro, transferValue } from './inventory-stock.js';
export { transferValue } from './inventory-stock.js';

const fail = (code, message, status = 409) => new AppError(status, code, message);
const own = alias => `${alias}.tenant_id = ? AND ${alias}.legal_entity_id = ?`;
const headerFields = `r.id, r.reference, r.warehouse_id AS warehouseId, w.code AS warehouseCode,
  r.sku_id AS skuId, s.code AS skuCode, r.from_pool_id AS fromPoolId, f.code AS fromPoolCode,
  r.to_pool_id AS toPoolId, t.code AS toPoolCode, r.quantity, r.posting_date AS postingDate,
  r.period_id AS periodId, r.movement_type_id AS movementTypeId, r.reason, r.status,
  r.requires_independent AS requiresIndependent, r.requested_by AS requestedBy, r.requested_at AS requestedAt,
  r.reviewed_by AS reviewedBy, r.reviewed_at AS reviewedAt, r.review_reason AS reviewReason,
  r.cancelled_at AS cancelledAt, r.cancel_reason AS cancelReason, r.executed_by AS executedBy,
  r.executed_at AS executedAt, r.total_value AS totalValue,
  maker.display_name AS requestedByName, reviewer.display_name AS reviewedByName, executor.display_name AS executedByName`;
const headerFrom = `inventory_reallocations r
  JOIN warehouses w ON w.tenant_id = r.tenant_id AND w.legal_entity_id = r.legal_entity_id AND w.id = r.warehouse_id
  JOIN product_skus s ON s.tenant_id = r.tenant_id AND s.legal_entity_id = r.legal_entity_id AND s.id = r.sku_id
  JOIN inventory_pools f ON f.tenant_id = r.tenant_id AND f.legal_entity_id = r.legal_entity_id AND f.id = r.from_pool_id
  JOIN inventory_pools t ON t.tenant_id = r.tenant_id AND t.legal_entity_id = r.legal_entity_id AND t.id = r.to_pool_id
  JOIN users maker ON maker.tenant_id = r.tenant_id AND maker.id = r.requested_by
  LEFT JOIN users reviewer ON reviewer.tenant_id = r.tenant_id AND reviewer.id = r.reviewed_by
  LEFT JOIN users executor ON executor.tenant_id = r.tenant_id AND executor.id = r.executed_by`;
const serialize = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : key === 'requiresIndependent' ? !!value : value]));
async function header(tx, context, id) {
  const { rows } = await tx.query(`SELECT ${headerFields} FROM ${headerFrom} WHERE ${own('r')} AND r.id = ?`, [...scopeArgs(context), id]);
  if (!rows.length) throw notFound();
  return { reallocation: serialize(rows[0]) };
}
export async function get(context, id) {
  await authorize(context, 'inventory.read');
  return header({ query }, context, entityId(id));
}
export async function list(context, input) {
  await authorize(context, 'inventory.read');
  const page = filters(input), args = scopeArgs(context);
  const where = `${own('r')}${page.status ? ' AND r.status = ?' : ''}`;
  if (page.status) args.push(page.status);
  const { rows: count } = await query(`SELECT COUNT(*) AS total FROM inventory_reallocations r WHERE ${where}`, args);
  const { rows } = await query(`SELECT ${headerFields} FROM ${headerFrom} WHERE ${where} ORDER BY r.requested_at DESC, r.id LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  return { items: rows.map(serialize), total: count[0].total, limit: page.limit, offset: page.offset };
}
export async function lines(context, id, input) {
  await authorize(context, 'inventory.read');
  await header({ query }, context, entityId(id));
  const page = filters(input, true), args = [...scopeArgs(context), id];
  const { rows: count } = await query(`SELECT COUNT(*) AS total FROM inventory_reallocation_lines l WHERE ${own('l')} AND l.request_id = ?`, args);
  const { rows } = await query(`SELECT l.id, l.line_number AS lineNumber, l.layer_id AS layerId, l.quantity, l.value,
    x.received_date AS receivedDate, h.source_id AS sourceId, h.id AS receiptId, h.currency
    FROM inventory_reallocation_lines l JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.id = l.layer_id
    JOIN stock_receipt_lines s ON s.tenant_id = x.tenant_id AND s.legal_entity_id = x.legal_entity_id AND s.id = x.receipt_line_id
    JOIN stock_receipts h ON h.tenant_id = s.tenant_id AND h.legal_entity_id = s.legal_entity_id AND h.id = s.receipt_id
    WHERE ${own('l')} AND l.request_id = ? ORDER BY l.line_number LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  return { items: rows, total: count[0].total, ...page };
}
// Inventory permission suffices to select a SKU; exposes no product write access.
export async function skus(context, input, id) {
  await authorize(context, 'inventory.read');
  const page = metadataFilters(input, 'skus'), args = scopeArgs(context);
  let where = own('s');
  if (id) { where += ' AND s.id = ?'; args.push(entityId(id)); }
  if (page.active !== undefined) { where += ' AND s.active = ? AND f.active = ? AND u.active = ?'; args.push(page.active, page.active, page.active); }
  if (page.q) { where += " AND (s.code LIKE ? ESCAPE '!' OR s.name LIKE ? ESCAPE '!')"; const q = `%${page.q.replace(/[!%_]/g, c => `!${c}`)}%`; args.push(q, q); }
  const from = `product_skus s JOIN product_families f ON f.tenant_id = s.tenant_id AND f.legal_entity_id = s.legal_entity_id AND f.id = s.family_id
    JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id`;
  const { rows: count } = await query(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`, args);
  const { rows } = await query(`SELECT s.id, s.code, s.name, s.active, u.code AS unitCode, u.quantity_precision AS quantityPrecision FROM ${from} WHERE ${where} ORDER BY s.code, s.id LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  const items = rows.map(row => ({ ...row, active: !!row.active }));
  if (id) { if (!items.length) throw notFound(); return { item: items[0] }; }
  return { items, total: count[0].total, limit: page.limit, offset: page.offset };
}
export async function preview(context, input) {
  await authorize(context, 'inventory.read');
  const selectionInput = selection(input);
  await references({ query }, context, selectionInput);
  const { rows: general } = await query("SELECT id FROM inventory_pools WHERE tenant_id = ? AND legal_entity_id = ? AND kind = 'GENERAL' AND active = 1", scopeArgs(context));
  const destination = plan(await available({ query }, context, selectionInput, selectionInput.toPoolId), selectionInput.quantity);
  const common = plan(general.length ? await available({ query }, context, selectionInput, general[0].id) : [], destination.remaining);
  return { quantity: selectionInput.quantity, destinationQuantity: sumAmounts(destination.selected.map(l => l.quantity)), generalQuantity: sumAmounts(common.selected.map(l => l.quantity)), shortfall: common.remaining, generalPoolId: general[0]?.id ?? null };
}
export async function create(context, body) {
  const input = selection(body, true);
  return entityWrite(context, 'inventory.reallocation.request', 'inventory.reallocation.request', input, async tx => {
    const from = await references(tx, context, input), periodId = await period(tx, context, input.postingDate);
    const { selected, remaining } = plan(await available(tx, context, input, input.fromPoolId), input.quantity);
    if (remaining !== '0.000000') throw fail('INSUFFICIENT_STOCK', 'The source pool has insufficient eligible stock on this posting date.');
    const id = randomUUID(), scope = scopeArgs(context);
    await tx.query(`INSERT INTO inventory_reallocations (id,tenant_id,legal_entity_id,reference,warehouse_id,sku_id,from_pool_id,to_pool_id,quantity,posting_date,period_id,movement_type_id,reason,requires_independent,requested_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id,...scope,input.reference,input.warehouseId,input.skuId,input.fromPoolId,input.toPoolId,input.quantity,input.postingDate,periodId,input.movementTypeId,input.reason,from.kind === 'COUNTRY',context.identity.userId]);
    for (let offset = 0; offset < selected.length; offset += 250) {
      const batch = selected.slice(offset, offset + 250);
      await tx.query(`INSERT INTO inventory_reallocation_lines (id,tenant_id,legal_entity_id,request_id,line_number,warehouse_id,sku_id,layer_id,quantity) VALUES ${batch.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`,
        batch.flatMap((line, index) => [randomUUID(),...scope,id,offset+index+1,input.warehouseId,input.skuId,line.layerId,line.quantity]));
    }
    await tx.query("UPDATE inventory_reallocations SET status = 'REQUESTED' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [...scope, id]);
    await audit(tx, context, 'inventory.reallocation.requested', id, { ...input, layerCount: selected.length, requiresIndependent: from.kind === 'COUNTRY' });
    return header(tx, context, id);
  });
}
export async function act(context, requestId, action, body) {
  const id = entityId(requestId), input = review(body, action);
  const permission = action === 'execute' ? 'execute' : action === 'cancel' ? 'request' : 'review';
  return entityWrite(context, `inventory.reallocation.${permission}`, `inventory.reallocation.${action}`, { id, ...input }, async tx => {
    const { reallocation: r } = await header(tx, context, id), scope = scopeArgs(context);
    if (action === 'cancel') {
      if (r.requestedBy !== context.identity.userId) throw fail('REQUESTER_REQUIRED', 'Only the requester can cancel this request.', 403);
      if (!['REQUESTED', 'APPROVED'].includes(r.status)) throw fail('INVALID_STATE', 'This request can no longer be cancelled.');
      await tx.query("UPDATE inventory_reallocations SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [input.reason, ...scope, id]);
    } else if (['approve', 'reject'].includes(action)) {
      if (r.requiresIndependent && r.requestedBy === context.identity.userId) throw fail('INDEPENDENT_REVIEW_REQUIRED', 'Another authorized person must review borrowing from a country pool.', 403);
      if (r.status !== 'REQUESTED') throw fail('INVALID_STATE', 'Only a requested reallocation can be reviewed.');
      if (action === 'approve') { await references(tx, context, r); await period(tx, context, r.postingDate); }
      await tx.query(`UPDATE inventory_reallocations SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_reason = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [action === 'approve' ? 'APPROVED' : 'REJECTED', context.identity.userId, input.reason,...scope,id]);
    } else if (action === 'execute') {
      if (r.status === 'EXECUTED') return header(tx, context, id);
      if (r.status !== 'APPROVED') throw fail('INVALID_STATE', 'Approval is required before execution.');
      await references(tx, context, r); await period(tx, context, r.postingDate);
      const { rows: layers } = await tx.query(`SELECT id, layer_id AS layerId, quantity FROM inventory_reallocation_lines WHERE tenant_id = ? AND legal_entity_id = ? AND request_id = ? ORDER BY line_number`, [...scope, id]);
      const balances = new Map((await available(tx, context, r, r.fromPoolId)).map(l => [l.layerId, l]));
      for (const line of layers) {
        const b = balances.get(line.layerId);
        if (!b || micro(b.quantity) < micro(line.quantity)) throw fail('INSUFFICIENT_STOCK', 'An approved source layer is no longer available on this date. Cancel and submit a new request.');
        line.value = transferValue(line.quantity, b.onHandQuantity, b.value);
      }
      await tx.query("UPDATE inventory_reallocations SET status = 'EXECUTING' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [...scope, id]);
      const eventId = randomUUID();
      await tx.query("INSERT INTO inventory_events (id,tenant_id,legal_entity_id,kind,reallocation_id) VALUES (?,?,?,'REALLOCATION',?)", [eventId,...scope,id]);
      for (const l of layers) {
        await tx.query('UPDATE inventory_reallocation_lines SET value = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?', [l.value,...scope,l.id]);
        const grain = [...scope,r.warehouseId,r.skuId,l.layerId];
        // INSERT IGNORE would conceal invalid references/check failures. Explicit
        // existence check is safe under the shared entity lock.
        const { rows: target } = await tx.query('SELECT pool_id FROM inventory_pool_balances WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND sku_id = ? AND layer_id = ? AND pool_id = ?', [...grain,r.toPoolId]);
        if (!target.length) await tx.query('INSERT INTO inventory_pool_balances (tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id,pool_id,quantity,value) VALUES (?,?,?,?,?,?,0,0)', [...grain,r.toPoolId]);
        await tx.query(`INSERT INTO inventory_pool_ledger (id,tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id,event_id,pool_id,quantity,value) VALUES (?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?)`,
          [randomUUID(),...grain,eventId,r.fromPoolId,`-${l.quantity}`,`-${l.value}`,randomUUID(),...grain,eventId,r.toPoolId,l.quantity,l.value]);
        await tx.query('UPDATE inventory_pool_balances SET quantity = quantity - ?, value = value - ? WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND sku_id = ? AND layer_id = ? AND pool_id = ?', [l.quantity,l.value,...grain,r.fromPoolId]);
        await tx.query('UPDATE inventory_pool_balances SET quantity = quantity + ?, value = value + ? WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND sku_id = ? AND layer_id = ? AND pool_id = ?', [l.quantity,l.value,...grain,r.toPoolId]);
      }
      await tx.query("UPDATE inventory_reallocations SET status = 'EXECUTED', executed_by = ?, executed_at = CURRENT_TIMESTAMP, total_value = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [context.identity.userId,sumAmounts(layers.map(l => l.value)),...scope,id]);
    } else throw notFound();
    const result = await header(tx, context, id);
    await audit(tx, context, `inventory.reallocation.${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'cancel' ? 'cancelled' : 'executed'}`, id, { reason: input.reason ?? null, status: result.reallocation.status, totalValue: result.reallocation.totalValue });
    return result;
  });
}
