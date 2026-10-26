import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { countries } from '../shared/country-codes.js';
import { entityId, object } from '../validators/auth.validators.js';
import { metadata, filters } from '../validators/inventory.validators.js';
import { authorize, scopeArgs, entityWrite, audit, notFound } from './entity-context.js';
import { assertInventoryUnused } from './inventory-usage.js';

const resources = {
  warehouses: { table: 'warehouses', fields: 'r.code, r.name, r.location, r.active' },
  pools: { table: 'inventory_pools', fields: 'r.code, r.name, r.kind, r.country_code AS countryCode, r.active' },
  'movement-types': { table: 'inventory_movement_types', fields: 'r.code, r.name, r.effect, r.active' },
  periods: { table: 'inventory_periods', fields: 'r.accounting_period_id AS accountingPeriodId, r.status, p.code, p.start_date AS startDate, p.end_date AS endDate, p.status AS accountingStatus',
    join: 'JOIN accounting_periods p ON p.tenant_id = r.tenant_id AND p.legal_entity_id = r.legal_entity_id AND p.id = r.accounting_period_id', search: ['p.code'] },
  'accounting-periods': { table: 'accounting_periods', fields: 'r.code, r.start_date AS startDate, r.end_date AS endDate, r.status, i.id AS inventoryPeriodId',
    join: 'LEFT JOIN inventory_periods i ON i.tenant_id = r.tenant_id AND i.legal_entity_id = r.legal_entity_id AND i.accounting_period_id = r.id', search: ['r.code'] },
  'audit-events': { table: 'audit_events', fields: 'r.actor_id AS actorId, r.action, r.resource_id AS resourceId, r.request_id AS requestId, r.details, r.created_at AS createdAt' },
};
function resource(kind) {
  if (!Object.hasOwn(resources, kind)) throw notFound();
  return resources[kind];
}
const shape = row => ({ ...row, ...('active' in row && { active: Boolean(row.active) }),
  ...('startDate' in row && { name: `${row.startDate} → ${row.endDate} · ${row.status}` }) });
async function read(tx, context, kind, id) {
  const { table, fields, join = '' } = resource(kind);
  const { rows } = await tx.query(`SELECT r.id, ${fields} FROM ${table} r ${join}
    WHERE r.tenant_id = ? AND r.legal_entity_id = ? AND r.id = ?`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  return shape(rows[0]);
}
export async function get(context, kind, id) {
  if (kind === 'audit-events') throw notFound();
  await authorize(context, 'inventory.read');
  return { item: await read({ query }, context, kind, entityId(id)) };
}
export async function listCountries(context, input) {
  await authorize(context, 'inventory.read');
  object(input, []);
  return { items: countries };
}
export async function list(context, kind, input) {
  const { table, fields, join = '', search = ['r.code', 'r.name'] } = resource(kind);
  const isAudit = kind === 'audit-events';
  await authorize(context, isAudit ? 'inventory.audit.read' : 'inventory.read');
  const page = filters(input, kind);
  const args = scopeArgs(context);
  let where = 'r.tenant_id = ? AND r.legal_entity_id = ?';
  if (isAudit) where += " AND r.action LIKE 'inventory.%'";
  else {
    if (page.q) {
      where += ` AND (${search.map(field => `${field} LIKE ? ESCAPE '!'`).join(' OR ')})`;
      args.push(...search.map(() => `%${page.q.replace(/[!%_]/g, char => `!${char}`)}%`));
    }
    for (const key of ['active', 'kind', 'status']) if (page[key] !== undefined) { where += ` AND r.${key} = ?`; args.push(page[key]); }
  }
  const from = `${table} r ${join}`;
  const { rows: count } = await query(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`, args);
  const order = isAudit ? 'r.created_at DESC, r.id' : kind === 'periods' ? 'p.start_date DESC, r.id' : kind === 'accounting-periods' ? 'r.start_date DESC, r.id' : 'r.code, r.id';
  const { rows } = await query(`SELECT r.id, ${fields} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  return { items: rows.map(shape), total: count[0].total, limit: page.limit, offset: page.offset };
}
export async function save(context, kind, body, id) {
  if (!['warehouses', 'pools', 'periods', 'movement-types'].includes(kind) || (kind === 'periods' && id !== undefined)) throw notFound();
  const { table } = resource(kind);
  const updating = id !== undefined;
  if (updating) id = entityId(id);
  const value = metadata(body, kind, updating);
  return entityWrite(context, 'inventory.configure', `inventory.${kind}.${updating ? 'update' : 'create'}`, { id: id ?? null, ...value }, async tx => {
    const before = updating ? await read(tx, context, kind, id) : null;
    const item = { ...before, ...value, id: id ?? randomUUID() };
    if (updating && !item.active) await assertInventoryUnused(tx, context, kind, item.id);
    let columns;
    if (kind === 'periods') {
      const { rows } = await tx.query('SELECT status FROM accounting_periods WHERE tenant_id = ? AND legal_entity_id = ? AND id = ? FOR UPDATE', [...scopeArgs(context), item.accountingPeriodId]);
      if (!rows[0]) throw notFound();
      if (rows[0].status !== 'OPEN') throw new AppError(409, 'ACCOUNTING_PERIOD_CLOSED', 'Choose an open accounting period.');
      const { rows: later } = await tx.query(`SELECT p.id FROM inventory_periods p JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
        JOIN accounting_periods n ON n.tenant_id = a.tenant_id AND n.legal_entity_id = a.legal_entity_id AND n.id = ?
        WHERE p.tenant_id = ? AND p.legal_entity_id = ? AND a.start_date > n.start_date AND p.status <> 'OPEN' LIMIT 1`, [item.accountingPeriodId, ...scopeArgs(context)]);
      if (later.length) throw new AppError(409, 'LATER_PERIOD_LOCKED', 'Reopen later inventory periods before adding an earlier period.');
      columns = { accounting_period_id: item.accountingPeriodId };
    } else columns = { name: item.name, active: item.active, ...(kind === 'warehouses' && { location: item.location }) };
    if (updating) await tx.query(`UPDATE ${table} SET ${Object.keys(columns).map(c => `${c} = ?`).join(', ')} WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...Object.values(columns), ...scopeArgs(context), id]);
    else {
      Object.assign(columns, { id: item.id, tenant_id: context.identity.tenantId, legal_entity_id: context.entityId },
        kind === 'periods' ? {} : { code: item.code }, kind === 'pools' ? { kind: item.kind, country_code: item.countryCode } : kind === 'movement-types' ? { effect: item.effect } : {});
      await tx.query(`INSERT INTO ${table} (${Object.keys(columns).join(', ')}) VALUES (${Object.keys(columns).map(() => '?').join(', ')})`, Object.values(columns));
    }
    const saved = await read(tx, context, kind, item.id);
    await audit(tx, context, `inventory.${kind}.${updating ? 'updated' : 'created'}`, item.id, { before, after: saved });
    return { item: saved };
  });
}
