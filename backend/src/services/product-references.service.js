import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { entityId } from '../validators/auth.validators.js';
import * as validate from '../validators/product-classification.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { paged, pattern, conflict } from './product-classification-context.js';

const resources = {
  suppliers: { table: 'product_suppliers', fields: 'id, code, name, active' },
  'attribute-definitions': { table: 'product_attribute_definitions', fields: 'id, code, name, active, data_type AS dataType, unit_label AS unitLabel, defines_stock AS definesStock' },
};
function resource(kind) { if (!Object.hasOwn(resources, kind)) throw notFound(); return resources[kind]; }
const shape = item => ({ ...item, active: Boolean(item.active), ...('definesStock' in item && { definesStock: Boolean(item.definesStock) }) });
export async function readReference(tx, context, kind, id, active = false) {
  const { table, fields } = resource(kind);
  const { rows } = await tx.query(`SELECT ${fields} FROM ${table} WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  if (active && !rows[0].active) throw conflict('INACTIVE_REFERENCE', 'Choose an active supplier or specification definition.');
  return shape(rows[0]);
}
export async function get(context, kind, id) {
  await authorize(context, 'products.read');
  return { item: await readReference({ query }, context, kind, entityId(id)) };
}
export async function list(context, kind, input) {
  await authorize(context, 'products.read');
  const { table, fields } = resource(kind);
  const page = validate.listing(input, ['q', 'active']);
  let where = 'tenant_id = ? AND legal_entity_id = ?';
  const args = scopeArgs(context);
  if (page.q) { where += " AND (code LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!')"; args.push(pattern(page.q), pattern(page.q)); }
  if (page.active !== undefined) { where += ' AND active = ?'; args.push(page.active); }
  const result = await paged(fields, table, where, args, 'code, id', page);
  return { ...result, items: result.items.map(shape) };
}
export async function save(context, kind, body, id) {
  const { table } = resource(kind);
  if (id !== undefined) id = entityId(id);
  const input = validate.reference(body, kind, id !== undefined);
  return entityWrite(context, 'products.manage', `product.${kind}.${id ? 'update' : 'create'}`, { id: id ?? null, ...input }, async tx => {
    const before = id ? await readReference(tx, context, kind, id) : null;
    if (id && kind === 'suppliers' && !input.active) {
      const { rows } = await tx.query(`SELECT a.id FROM product_aliases a JOIN product_alias_sources s
        ON s.tenant_id = a.tenant_id AND s.legal_entity_id = a.legal_entity_id AND s.id = a.source_id
        WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND s.supplier_id = ? AND a.current_source_id IS NOT NULL LIMIT 1`, [...scopeArgs(context), id]);
      if (rows.length) throw conflict('PRODUCT_IN_USE', 'Reject or retire this supplier’s active alias mappings first.');
    }
    const savedId = id ?? randomUUID();
    if (id) await tx.query(`UPDATE ${table} SET name = ?, active = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [input.name, input.active, ...scopeArgs(context), id]);
    else {
      const columns = { id: savedId, tenant_id: context.identity.tenantId, legal_entity_id: context.entityId, code: input.code, name: input.name,
        ...(kind === 'attribute-definitions' && { data_type: input.dataType, unit_label: input.unitLabel, defines_stock: input.definesStock }) };
      await tx.query(`INSERT INTO ${table} (${Object.keys(columns).join(', ')}) VALUES (${Object.keys(columns).map(() => '?').join(', ')})`, Object.values(columns));
    }
    const item = await readReference(tx, context, kind, savedId);
    await audit(tx, context, `product.${kind}.${id ? 'updated' : 'created'}`, savedId, { before, after: item });
    return { item };
  });
}
