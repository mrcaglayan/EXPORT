import { createHash, randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { entityId } from '../validators/auth.validators.js';
import { aliasSource, listing } from '../validators/product-classification.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { paged, sku, pattern, conflict } from './product-classification-context.js';
import { readReference } from './product-references.service.js';

const hash = input => createHash('sha256').update(JSON.stringify([input.supplierCode, input.supplierDescription])).digest('hex');
const from = `product_aliases a JOIN product_alias_sources s ON s.tenant_id = a.tenant_id AND s.legal_entity_id = a.legal_entity_id AND s.id = a.source_id
  JOIN product_suppliers p ON p.tenant_id = s.tenant_id AND p.legal_entity_id = s.legal_entity_id AND p.id = s.supplier_id
  JOIN product_skus k ON k.tenant_id = a.tenant_id AND k.legal_entity_id = a.legal_entity_id AND k.id = a.sku_id`;
const fields = `a.id, a.source_id AS sourceId, a.revision, a.sku_id AS skuId, k.code AS skuCode, s.supplier_id AS supplierId,
  p.code AS supplierReferenceCode, p.name AS supplierName, s.supplier_code AS supplierCode, s.supplier_description AS supplierDescription,
  a.status, a.source_reference AS sourceReference, a.created_by AS createdBy, a.created_at AS createdAt,
  a.reviewed_by AS reviewedBy, a.reviewed_at AS reviewedAt, a.verified_by AS verifiedBy, a.verified_at AS verifiedAt`;
export async function readAlias(tx, context, id) {
  const { rows } = await tx.query(`SELECT ${fields} FROM ${from} WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND a.id = ?`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  return rows[0];
}
export async function get(context, id) {
  await authorize(context, 'products.read'); return { item: await readAlias({ query }, context, entityId(id)) };
}
export async function list(context, input) {
  await authorize(context, 'products.read'); const page = listing(input, ['q', 'skuId', 'supplierId', 'status']);
  let where = 'a.tenant_id = ? AND a.legal_entity_id = ?'; const args = scopeArgs(context);
  if (page.q) { where += " AND (s.supplier_code LIKE ? ESCAPE '!' OR s.supplier_description LIKE ? ESCAPE '!' OR k.code LIKE ? ESCAPE '!')"; args.push(...Array(3).fill(pattern(page.q))); }
  for (const [key, column] of [['skuId', 'a.sku_id'], ['supplierId', 's.supplier_id'], ['status', 'a.status']]) if (page[key]) { where += ` AND ${column} = ?`; args.push(page[key]); }
  return paged(fields, from, where, args, 'a.created_at DESC, a.id', page);
}
export async function create(context, body) {
  const input = aliasSource(body);
  return entityWrite(context, 'products.manage', 'product.alias.create', input, async tx => {
    await sku(tx, context, input.skuId, true);
    await readReference(tx, context, 'suppliers', input.supplierId, true);
    const sourceHash = hash(input);
    const { rows } = await tx.query(`SELECT id, supplier_code AS supplierCode, supplier_description AS supplierDescription FROM product_alias_sources
      WHERE tenant_id = ? AND legal_entity_id = ? AND supplier_id = ? AND source_hash = ?`, [...scopeArgs(context), input.supplierId, sourceHash]);
    let sourceId = rows[0]?.id;
    if (sourceId && (rows[0].supplierCode !== input.supplierCode || rows[0].supplierDescription !== input.supplierDescription)) throw conflict('ALIAS_SOURCE_CONFLICT', 'The source identity requires manual review.');
    if (!sourceId) {
      sourceId = randomUUID();
      await tx.query('INSERT INTO product_alias_sources (id, tenant_id, legal_entity_id, supplier_id, supplier_code, supplier_description, source_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sourceId, ...scopeArgs(context), input.supplierId, input.supplierCode, input.supplierDescription, sourceHash]);
    }
    const { rows: active } = await tx.query('SELECT id FROM product_aliases WHERE tenant_id = ? AND legal_entity_id = ? AND current_source_id = ?', [...scopeArgs(context), sourceId]);
    if (active.length) throw conflict('ALIAS_ALREADY_ACTIVE', 'This exact supplier item already has an active mapping. Reject or retire it before proposing a replacement.');
    const { rows: revisions } = await tx.query('SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM product_aliases WHERE tenant_id = ? AND legal_entity_id = ? AND source_id = ?', [...scopeArgs(context), sourceId]);
    const id = randomUUID();
    await tx.query(`INSERT INTO product_aliases (id, tenant_id, legal_entity_id, source_id, current_source_id, revision, sku_id, source_reference, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, ...scopeArgs(context), sourceId, sourceId, revisions[0].revision, input.skuId, input.sourceReference, context.identity.userId]);
    const item = await readAlias(tx, context, id);
    await audit(tx, context, 'product.alias.created', id, { before: null, after: item });
    return { item };
  });
}
export async function match(context, body) {
  await authorize(context, 'products.read'); const input = aliasSource(body, true);
  const supplier = await readReference({ query }, context, 'suppliers', input.supplierId);
  if (!supplier.active) return { match: null };
  // Exact supplier + original code + original description only. No fuzzy/GTIP/VAT/country matching.
  const { rows } = await query(`SELECT ${fields} FROM ${from} WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND s.supplier_id = ?
    AND s.source_hash = ? AND a.status = 'VERIFIED' AND a.current_source_id = a.source_id AND k.active = 1 AND p.active = 1`,
    [...scopeArgs(context), input.supplierId, hash(input)]);
  if (rows.length > 1) throw conflict('ALIAS_AMBIGUOUS', 'Conflicting verified mappings require review.');
  const item = rows[0];
  return { match: item && item.supplierCode === input.supplierCode && item.supplierDescription === input.supplierDescription ? item : null };
}
