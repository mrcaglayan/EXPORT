import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { entityId } from '../validators/auth.validators.js';
import { product, filters } from '../validators/products.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';

const resources = {
  units: { table: 'unit_of_measure', fields: 'symbol, quantity_precision AS quantityPrecision' },
  families: { table: 'product_families', fields: `parent_id AS parentId,
    (SELECT p.code FROM product_families p WHERE p.tenant_id = product_families.tenant_id
      AND p.legal_entity_id = product_families.legal_entity_id AND p.id = product_families.parent_id) AS parentCode` },
  skus: { table: 'product_skus', fields: `description, family_id AS familyId, base_unit_id AS baseUnitId,
    (SELECT f.code FROM product_families f WHERE f.tenant_id = product_skus.tenant_id
      AND f.legal_entity_id = product_skus.legal_entity_id AND f.id = product_skus.family_id) AS familyCode,
    (SELECT u.code FROM unit_of_measure u WHERE u.tenant_id = product_skus.tenant_id
      AND u.legal_entity_id = product_skus.legal_entity_id AND u.id = product_skus.base_unit_id) AS baseUnitCode` },
};
function resource(kind) {
  if (!Object.hasOwn(resources, kind)) throw notFound();
  return resources[kind];
}
const shape = row => ({ ...row, active: Boolean(row.active) });
async function read(tx, context, kind, id) {
  const { table, fields } = resource(kind);
  const { rows } = await tx.query(`SELECT id, code, name, active, ${fields} FROM ${table}
    WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  return shape(rows[0]);
}
export async function get(context, kind, id) {
  await authorize(context, 'products.read');
  return { item: await read({ query }, context, kind, entityId(id)) };
}
export async function list(context, kind, input) {
  await authorize(context, kind === 'audit-events' ? 'products.audit.read' : 'products.read');
  const page = filters(input, kind);
  const isAudit = kind === 'audit-events';
  const { table, fields } = isAudit ? { table: 'audit_events', fields: 'id, actor_id AS actorId, action, resource_id AS resourceId, request_id AS requestId, details, created_at AS createdAt' } : resource(kind);
  let where = 'tenant_id = ? AND legal_entity_id = ?';
  const args = scopeArgs(context);
  if (isAudit) where += " AND action LIKE 'product.%'";
  else {
    if (page.q) {
      where += " AND (code LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!')";
      const pattern = `%${page.q.replace(/[!%_]/g, match => `!${match}`)}%`;
      args.push(pattern, pattern);
    }
    if (page.active !== undefined) { where += ' AND active = ?'; args.push(page.active); }
    if (page.familyId) { where += ' AND family_id = ?'; args.push(page.familyId); }
  }
  const { rows: totals } = await query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`, args);
  const { rows } = await query(`SELECT ${isAudit ? fields : `id, code, name, active, ${fields}`} FROM ${table}
    WHERE ${where} ORDER BY ${isAudit ? 'created_at DESC, id' : 'code, id'} LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  return { items: isAudit ? rows : rows.map(shape), total: totals[0].total, limit: page.limit, offset: page.offset };
}
const conflict = (code, message) => new AppError(409, code, message);
async function validateLinks(tx, context, kind, item, id) {
  if (kind === 'families') {
    let parentId = item.parentId;
    const seen = new Set([id]);
    while (parentId) {
      if (seen.has(parentId)) throw conflict('FAMILY_CYCLE', 'Choose a parent outside this family’s descendants.');
      seen.add(parentId);
      const parent = await read(tx, context, 'families', parentId);
      if (item.active && !parent.active) throw conflict('INACTIVE_REFERENCE', 'An active family needs active parent families.');
      parentId = parent.parentId;
    }
  }
  if (kind === 'skus') {
    const family = await read(tx, context, 'families', item.familyId);
    const unit = await read(tx, context, 'units', item.baseUnitId);
    if (item.active && (!family.active || !unit.active)) throw conflict('INACTIVE_REFERENCE', 'Choose an active family and unit for an active SKU.');
  }
  if (!item.active && kind !== 'skus') {
    const { rows } = await tx.query(`SELECT id FROM product_skus WHERE tenant_id = ? AND legal_entity_id = ?
      AND ${kind === 'units' ? 'base_unit_id' : 'family_id'} = ? AND active = 1 LIMIT 1`, [...scopeArgs(context), id]);
    if (rows.length) throw conflict('PRODUCT_IN_USE', 'Deactivate the active SKUs using this record first.');
    if (kind === 'families') {
      const { rows: children } = await tx.query(`SELECT id FROM product_families
        WHERE tenant_id = ? AND legal_entity_id = ? AND parent_id = ? AND active = 1 LIMIT 1`, [...scopeArgs(context), id]);
      if (children.length) throw conflict('PRODUCT_IN_USE', 'Deactivate or move the active child families first.');
    }
  }
}
export async function save(context, kind, body, id) {
  const { table } = resource(kind);
  const updating = id !== undefined;
  if (updating) id = entityId(id);
  const value = product(body, kind, updating);
  return entityWrite(context, 'products.manage', `product.${kind}.${updating ? 'update' : 'create'}`,
    { id: id ?? null, ...value }, async tx => {
      const before = updating ? await read(tx, context, kind, id) : null;
      const item = { ...before, ...value, id: id ?? randomUUID() };
      await validateLinks(tx, context, kind, item, item.id);
      const columns = { name: item.name, active: item.active,
        ...(kind === 'units' ? { symbol: item.symbol } : kind === 'families' ? { parent_id: item.parentId }
          : { description: item.description, family_id: item.familyId }) };
      if (updating) await tx.query(`UPDATE ${table} SET ${Object.keys(columns).map(c => `${c} = ?`).join(', ')}
        WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...Object.values(columns), ...scopeArgs(context), id]);
      else {
        Object.assign(columns, { id: item.id, tenant_id: context.identity.tenantId, legal_entity_id: context.entityId, code: item.code },
          kind === 'units' ? { quantity_precision: item.quantityPrecision } : kind === 'skus' ? { base_unit_id: item.baseUnitId } : {});
        await tx.query(`INSERT INTO ${table} (${Object.keys(columns).join(', ')}) VALUES (${Object.keys(columns).map(() => '?').join(', ')})`, Object.values(columns));
      }
      const saved = await read(tx, context, kind, item.id);
      await audit(tx, context, `product.${kind}.${updating ? 'updated' : 'created'}`, item.id, { before, after: saved });
      return { item: saved };
    });
}
