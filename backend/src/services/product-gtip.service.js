import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { entityId, object, text } from '../validators/auth.validators.js';
import { date } from '../validators/accounting.validators.js';
import { gtip, listing } from '../validators/product-classification.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { paged, sku, conflict } from './product-classification-context.js';

const fields = `id, sku_id AS skuId, gtip_code AS gtipCode, effective_from AS effectiveFrom, effective_to AS effectiveTo,
  status, source_reference AS sourceReference, broker_name AS brokerName, verification_reference AS verificationReference,
  verified_on AS verifiedOn, created_by AS createdBy, created_at AS createdAt, reviewed_by AS reviewedBy,
  reviewed_at AS reviewedAt, verified_by AS verifiedBy, verified_at AS verifiedAt`;
export async function readGtip(tx, context, id) {
  const { rows } = await tx.query(`SELECT ${fields} FROM product_gtip_history WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  return rows[0];
}
export async function noOverlap(tx, context, skuId, input, exceptId = null) {
  const { rows } = await tx.query(`SELECT id FROM product_gtip_history WHERE tenant_id = ? AND legal_entity_id = ? AND sku_id = ?
    AND status IN ('PENDING','REVIEWED','VERIFIED') AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
    AND (? IS NULL OR id <> ?) LIMIT 1`, [...scopeArgs(context), skuId, input.effectiveTo ?? '2199-12-31', input.effectiveFrom, exceptId, exceptId]);
  if (rows.length) throw conflict('GTIP_OVERLAP', 'This SKU already has a pending, reviewed or verified GTİP entry in that date range. End, reject or retire that entry first.');
}
export async function get(context, id) {
  await authorize(context, 'products.read');
  return { item: await readGtip({ query }, context, entityId(id)) };
}
export async function list(context, skuId, input) {
  await authorize(context, 'products.read');
  skuId = entityId(skuId); await sku({ query }, context, skuId);
  const page = listing(input, ['status']);
  const args = [...scopeArgs(context), skuId];
  let where = 'tenant_id = ? AND legal_entity_id = ? AND sku_id = ?';
  if (page.status) { where += ' AND status = ?'; args.push(page.status); }
  return paged(fields, 'product_gtip_history', where, args, 'effective_from DESC, created_at DESC, id', page);
}
export async function atDate(context, skuId, input) {
  await authorize(context, 'products.read');
  skuId = entityId(skuId); object(input, ['on']); const on = date(input.on);
  const product = await sku({ query }, context, skuId);
  if (!product.active) return { item: null };
  const { rows } = await query(`SELECT ${fields} FROM product_gtip_history WHERE tenant_id = ? AND legal_entity_id = ? AND sku_id = ?
    AND status = 'VERIFIED' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`, [...scopeArgs(context), skuId, on, on]);
  if (rows.length > 1) throw conflict('GTIP_AMBIGUOUS', 'Conflicting verified entries require review.');
  return { item: rows[0] ?? null };
}
export async function create(context, skuId, body) {
  skuId = entityId(skuId); const input = gtip(body);
  return entityWrite(context, 'products.manage', 'product.gtip.create', { skuId, ...input }, async tx => {
    await sku(tx, context, skuId, true); await noOverlap(tx, context, skuId, input);
    const id = randomUUID();
    await tx.query(`INSERT INTO product_gtip_history (id, tenant_id, legal_entity_id, sku_id, gtip_code, effective_from, effective_to, source_reference, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, ...scopeArgs(context), skuId, input.gtipCode, input.effectiveFrom, input.effectiveTo, input.sourceReference, context.identity.userId]);
    const item = await readGtip(tx, context, id);
    await audit(tx, context, 'product.gtip.created', id, { before: null, after: item });
    return { item };
  });
}
export async function endDate(context, id, body) {
  id = entityId(id); object(body, ['effectiveTo', 'reason']);
  const input = { effectiveTo: date(body.effectiveTo), reason: text(body.reason, 1000) };
  return entityWrite(context, 'products.review', 'product.gtip.endDate', { id, ...input }, async tx => {
    const before = await readGtip(tx, context, id);
    if (before.status !== 'VERIFIED') throw conflict('INVALID_TRANSITION', 'Only a verified GTİP entry can have its date range shortened.');
    if (input.effectiveTo < before.effectiveFrom || (before.effectiveTo && input.effectiveTo > before.effectiveTo)) throw conflict('GTIP_DATE_RANGE', 'The end date must stay within the existing date range.');
    if (before.effectiveTo === input.effectiveTo) return { item: before };
    await tx.query('UPDATE product_gtip_history SET effective_to = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?', [input.effectiveTo, ...scopeArgs(context), id]);
    const item = await readGtip(tx, context, id);
    await audit(tx, context, 'product.gtip.ended', id, { before, after: item, reason: input.reason });
    return { item };
  });
}
