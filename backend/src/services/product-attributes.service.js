import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { entityId, object } from '../validators/auth.validators.js';
import { listing, attributeValue } from '../validators/product-classification.validators.js';
import { scopeArgs, authorize, entityWrite, audit } from './entity-context.js';
import { paged, sku, conflict } from './product-classification-context.js';
import { readReference } from './product-references.service.js';

const fields = 'a.id, a.sku_id AS skuId, a.definition_id AS definitionId, a.value, d.code, d.name, d.data_type AS dataType, d.unit_label AS unitLabel, d.defines_stock AS definesStock, d.active AS definitionActive';
const from = 'product_sku_attributes a JOIN product_attribute_definitions d ON d.tenant_id = a.tenant_id AND d.legal_entity_id = a.legal_entity_id AND d.id = a.definition_id';
const shape = row => ({ ...row, definesStock: Boolean(row.definesStock), definitionActive: Boolean(row.definitionActive) });
export async function list(context, skuId, input) {
  await authorize(context, 'products.read');
  skuId = entityId(skuId);
  await sku({ query }, context, skuId);
  const result = await paged(fields, from, 'a.tenant_id = ? AND a.legal_entity_id = ? AND a.sku_id = ?', [...scopeArgs(context), skuId], 'd.code, a.id', listing(input));
  return { ...result, items: result.items.map(shape) };
}
export async function save(context, skuId, body) {
  skuId = entityId(skuId);
  object(body, ['definitionId', 'value']);
  const definitionId = entityId(body.definitionId);
  // Type validation occurs inside the transaction against the persisted definition.
  const value = body.value;
  if (!['string', 'boolean'].includes(typeof value)) attributeValue(value, 'TEXT');
  return entityWrite(context, 'products.manage', 'product.attribute.save', { skuId, definitionId, value }, async tx => {
    await sku(tx, context, skuId, true);
    const definition = await readReference(tx, context, 'attribute-definitions', definitionId, true);
    const normalized = attributeValue(value, definition.dataType);
    const { rows } = await tx.query(`SELECT ${fields} FROM ${from} WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND a.sku_id = ? AND a.definition_id = ?`, [...scopeArgs(context), skuId, definitionId]);
    const before = rows[0] ? shape(rows[0]) : null;
    if (before && definition.definesStock && before.value !== normalized) throw conflict('STOCK_IDENTITY_LOCKED', 'This specification defines stock identity. Create a separate SKU for different goods.');
    if (before?.value === normalized) return { item: before };
    const id = before?.id ?? randomUUID();
    if (before) await tx.query('UPDATE product_sku_attributes SET value = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?', [JSON.stringify(normalized), ...scopeArgs(context), id]);
    else await tx.query('INSERT INTO product_sku_attributes (id, tenant_id, legal_entity_id, sku_id, definition_id, value) VALUES (?, ?, ?, ?, ?, ?)', [id, ...scopeArgs(context), skuId, definitionId, JSON.stringify(normalized)]);
    const { rows: saved } = await tx.query(`SELECT ${fields} FROM ${from} WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND a.id = ?`, [...scopeArgs(context), id]);
    const item = shape(saved[0]);
    await audit(tx, context, 'product.attribute.saved', id, { before, after: item });
    return { item };
  });
}
