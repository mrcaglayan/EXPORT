import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { fingerprint } from '../shared/idempotency.js';
import { entityId } from '../validators/auth.validators.js';
import { receipt, filters } from '../validators/receipts.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { settings } from './accounting-context.js';
import { micro, decimal } from './inventory-stock.js';

// No client-controlled source bypass. PR-03 must introduce an authorized purchasing
// adapter before real receipt posting. The harness verifies the owned MySQL datadir.
export const fixturePostingEnabled = () => process.env.NODE_ENV === 'test'
  && /^export_accounting_test_[a-f0-9]{16}$/.test(process.env.DB_NAME ?? '')
  && process.env.PR00_TEST_DATABASE === process.env.DB_NAME;
const fail = (code, message, status = 409) => new AppError(status, code, message);
const headerFields = `id, source_kind AS sourceKind, source_id AS sourceId, document_date AS documentDate,
  posting_date AS postingDate, period_id AS periodId, warehouse_id AS warehouseId, movement_type_id AS movementTypeId,
  currency, description, total_value AS totalValue, status, created_at AS createdAt`;
async function header(tx, context, id) {
  const { rows } = await tx.query(`SELECT ${headerFields} FROM stock_receipts WHERE tenant_id = ? AND legal_entity_id = ? AND id = ? AND status = 'POSTED'`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  return { receipt: { ...rows[0], createdAt: rows[0].createdAt.toISOString() } };
}
export async function getReceipt(context, id) {
  await authorize(context, 'inventory.read');
  return header({ query }, context, entityId(id));
}
export async function receiptLines(context, id, input) {
  await authorize(context, 'inventory.read');
  await header({ query }, context, entityId(id));
  const page = filters(input, 'receipt-lines');
  const { rows: count } = await query('SELECT COUNT(*) AS total FROM stock_receipt_lines WHERE tenant_id = ? AND legal_entity_id = ? AND receipt_id = ?', [...scopeArgs(context), id]);
  const { rows } = await query(`SELECT l.id, l.line_number AS lineNumber, l.source_line_key AS sourceLineKey, l.sku_id AS skuId, s.code AS skuCode, l.description,
    l.quantity, l.unit_cost AS unitCost, l.value, x.id AS layerId, u.code AS unitCode
    FROM stock_receipt_lines l JOIN product_skus s ON s.tenant_id = l.tenant_id AND s.legal_entity_id = l.legal_entity_id AND s.id = l.sku_id
    JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
    JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
    WHERE l.tenant_id = ? AND l.legal_entity_id = ? AND l.receipt_id = ? ORDER BY l.line_number LIMIT ${page.limit} OFFSET ${page.offset}`, [...scopeArgs(context), id]);
  let allocations = [];
  if (rows.length) ({ rows: allocations } = await query(`SELECT p.layer_id AS layerId, p.pool_id AS poolId, d.code AS poolCode, p.quantity, p.value FROM inventory_pool_ledger p
    JOIN inventory_pools d ON d.tenant_id = p.tenant_id AND d.legal_entity_id = p.legal_entity_id AND d.id = p.pool_id
    JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
    WHERE p.tenant_id = ? AND p.legal_entity_id = ? AND e.receipt_id = ? AND p.layer_id IN (${rows.map(() => '?').join(',')}) ORDER BY d.code`, [...scopeArgs(context), id, ...rows.map(row => row.layerId)]));
  return { items: rows.map(row => ({ ...row, allocations: allocations.filter(a => a.layerId === row.layerId).map(({ layerId: _layerId, ...a }) => a) })), total: count[0].total, ...page };
}

const kinds = { layers: 'inventory_layers', 'physical-ledger': 'inventory_physical_ledger', 'pool-ledger': 'inventory_pool_ledger', balances: 'inventory_balances', 'pool-balances': 'inventory_pool_balances' };
export async function list(context, kind, input) {
  await authorize(context, 'inventory.read');
  const page = filters(input, kind), args = scopeArgs(context);
  let from, fields, where, order;
  if (kind === 'receipts') {
    from = 'stock_receipts r'; fields = headerFields; where = "r.tenant_id = ? AND r.legal_entity_id = ? AND r.status = 'POSTED'";
    if (page.q) { where += " AND (r.source_id LIKE ? ESCAPE '!' OR r.description LIKE ? ESCAPE '!')"; const pattern = `%${page.q.replace(/[!%_]/g, c => `!${c}`)}%`; args.push(pattern, pattern); }
    order = 'r.posting_date DESC, r.created_at DESC, r.id';
  } else {
    if (!Object.hasOwn(kinds, kind)) throw notFound();
    const layer = kind === 'layers', pool = kind.startsWith('pool-'), ledger = kind.endsWith('ledger');
    from = `${kinds[kind]} r ${layer ? '' : 'JOIN inventory_layers x ON x.tenant_id = r.tenant_id AND x.legal_entity_id = r.legal_entity_id AND x.id = r.layer_id'}
      JOIN stock_receipt_lines l ON l.tenant_id = r.tenant_id AND l.legal_entity_id = r.legal_entity_id AND l.id = ${layer ? 'r' : 'x'}.receipt_line_id
      JOIN stock_receipts h ON h.tenant_id = l.tenant_id AND h.legal_entity_id = l.legal_entity_id AND h.id = l.receipt_id
      JOIN warehouses w ON w.tenant_id = r.tenant_id AND w.legal_entity_id = r.legal_entity_id AND w.id = r.warehouse_id
      JOIN product_skus s ON s.tenant_id = r.tenant_id AND s.legal_entity_id = r.legal_entity_id AND s.id = r.sku_id
      JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
      ${ledger ? 'JOIN inventory_events e ON e.tenant_id = r.tenant_id AND e.legal_entity_id = r.legal_entity_id AND e.id = r.event_id LEFT JOIN inventory_reallocations a ON a.tenant_id = e.tenant_id AND a.legal_entity_id = e.legal_entity_id AND a.id = e.reallocation_id LEFT JOIN inventory_issues d ON d.tenant_id = e.tenant_id AND d.legal_entity_id = e.legal_entity_id AND d.id = e.issue_id LEFT JOIN inventory_corrections c ON c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id AND c.id = e.correction_id' : ''}
      ${pool ? 'JOIN inventory_pools p ON p.tenant_id = r.tenant_id AND p.legal_entity_id = r.legal_entity_id AND p.id = r.pool_id' : ''}`;
    fields = `${layer || ledger ? 'r.id' : pool ? "CONCAT(r.layer_id, ':', r.pool_id) AS id" : 'r.layer_id AS id'},
      r.warehouse_id AS warehouseId, w.code AS warehouseCode, r.sku_id AS skuId, s.code AS skuCode, u.code AS unitCode,
      ${layer ? 'r.id' : 'r.layer_id'} AS layerId, r.quantity, r.value, ${layer ? 'r' : 'x'}.unit_cost AS unitCost,
      ${layer ? 'r' : 'x'}.received_date AS receivedDate, h.currency, h.id AS receiptId, h.source_id AS sourceId, l.source_line_key AS sourceLineKey
      ${pool ? ', r.pool_id AS poolId, p.code AS poolCode' : ''}${ledger ? ', r.event_id AS eventId, e.kind AS eventKind, e.reallocation_id AS reallocationId, a.reference AS reallocationReference, e.issue_id AS issueId, d.reference AS issueReference, e.posting_date AS postingDate, e.correction_id AS correctionId, c.reference AS correctionReference, e.reverses_event_id AS reversesEventId' : ''}`;
    if (kind.endsWith('balances')) fields += `, COALESCE((SELECT SUM(v.quantity-v.released_quantity-v.issued_quantity) FROM inventory_reservation_allocations v
      JOIN inventory_reservations z ON z.tenant_id = v.tenant_id AND z.legal_entity_id = v.legal_entity_id AND z.id = v.reservation_id
      WHERE v.tenant_id = r.tenant_id AND v.legal_entity_id = r.legal_entity_id AND v.layer_id = r.layer_id ${pool ? 'AND v.pool_id = r.pool_id' : ''} AND z.status = 'ACTIVE'),0) AS reservedQuantity`;
    where = "r.tenant_id = ? AND r.legal_entity_id = ? AND h.status = 'POSTED'";
    // Stable FIFO provenance order; no consumption or reservations in PR-02B.
    order = `${layer ? 'r' : 'x'}.received_date, ${layer ? 'r' : 'x'}.created_at, ${layer ? 'r' : 'x'}.id${pool ? ', r.pool_id' : ''}`;
    if (ledger) order += ', e.created_at, e.id, r.id';
  }
  for (const [key, column] of [['warehouseId', 'warehouse_id'], ['skuId', 'sku_id'], ['poolId', 'pool_id']]) if (page[key]) { where += ` AND r.${column} = ?`; args.push(page[key]); }
  const { rows: count } = await query(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`, args);
  const { rows } = await query(`SELECT ${fields} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${page.limit} OFFSET ${page.offset}`, args);
  return { items: rows.map(row => kind.endsWith('balances') ? { ...row, availableQuantity: decimal(micro(row.quantity)-micro(row.reservedQuantity)) } : row), total: count[0].total, limit: page.limit, offset: page.offset };
}
async function activeRows(tx, context, table, ids, fields = '') {
  const rows = [];
  const sorted = [...new Set(ids)].sort();
  for (let offset = 0; offset < sorted.length; offset += 500) {
    const batch = sorted.slice(offset, offset + 500);
    const result = await tx.query(`SELECT id, active ${fields} FROM ${table} WHERE tenant_id = ? AND legal_entity_id = ? AND id IN (${batch.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, [...scopeArgs(context), ...batch]);
    if (result.rows.length !== batch.length) throw notFound();
    if (result.rows.some(row => !row.active)) throw fail('INACTIVE_REFERENCE', 'Receipt references must be active.');
    rows.push(...result.rows);
  }
  return rows;
}
async function insertRows(tx, table, columns, rows) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    await tx.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',')}`, batch.flat());
  }
}
export async function postFixture(context, body) {
  if (!fixturePostingEnabled()) throw fail('SOURCE_NOT_AVAILABLE', 'Purchase receipt sources are not connected yet.', 403);
  const input = receipt(body);
  return entityWrite(context, 'inventory.receipt.post', 'inventory.receipt.post', input, async tx => {
    const hash = fingerprint(input);
    const { rows: prior } = await tx.query("SELECT id, payload_hash AS payloadHash, status FROM stock_receipts WHERE tenant_id = ? AND legal_entity_id = ? AND source_kind = 'TEST_FIXTURE' AND source_id = ? FOR UPDATE", [...scopeArgs(context), input.sourceId]);
    if (prior.length) {
      if (prior[0].payloadHash !== hash || prior[0].status !== 'POSTED') throw fail('SOURCE_CONFLICT', 'This receipt source already has different content.');
      return header(tx, context, prior[0].id);
    }
    if (input.currency !== (await settings(tx, context)).baseCurrency) throw fail('CURRENCY_MISMATCH', 'Receipt cost must use the company base currency.', 422);
    const { rows: periods } = await tx.query(`SELECT i.id, i.status, a.status AS accountingStatus FROM inventory_periods i JOIN accounting_periods a
      ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id
      WHERE i.tenant_id = ? AND i.legal_entity_id = ? AND ? BETWEEN a.start_date AND a.end_date FOR UPDATE`, [...scopeArgs(context), input.postingDate]);
    if (!periods.length) throw fail('PERIOD_NOT_FOUND', 'Configure an inventory period for the posting date.', 422);
    if (periods[0].status !== 'OPEN' || periods[0].accountingStatus !== 'OPEN') throw fail('PERIOD_CLOSED', 'Both inventory and accounting periods must be open.');
    await activeRows(tx, context, 'warehouses', [input.warehouseId]);
    const [movement] = await activeRows(tx, context, 'inventory_movement_types', [input.movementTypeId], ', effect');
    if (movement.effect !== 'RECEIPT') throw fail('MOVEMENT_EFFECT_MISMATCH', 'Choose a receipt movement type.');
    await activeRows(tx, context, 'inventory_pools', input.lines.flatMap(line => line.allocations.map(a => a.poolId)));
    const skus = await activeRows(tx, context, 'product_skus', input.lines.map(line => line.skuId), ', base_unit_id AS unitId, family_id AS familyId');
    const units = await activeRows(tx, context, 'unit_of_measure', skus.map(sku => sku.unitId), ', quantity_precision AS quantityPrecision');
    await activeRows(tx, context, 'product_families', skus.map(sku => sku.familyId));
    const precision = new Map(skus.map(sku => [sku.id, units.find(u => u.id === sku.unitId).quantityPrecision]));
    for (const line of input.lines) for (const quantity of [line.quantity, ...line.allocations.map(a => a.quantity)]) {
      if (/[1-9]/.test(quantity.split('.')[1].slice(precision.get(line.skuId)))) throw fail('QUANTITY_PRECISION', 'Quantity must respect the SKU base-unit precision.', 422);
    }
    const id = randomUUID(), eventId = randomUUID(), scope = scopeArgs(context);
    await insertRows(tx, 'stock_receipts', ['id', 'tenant_id', 'legal_entity_id', 'source_kind', 'source_id', 'payload_hash', 'document_date', 'posting_date', 'period_id', 'warehouse_id', 'movement_type_id', 'currency', 'description', 'total_value', 'created_by'],
      [[id, ...scope, 'TEST_FIXTURE', input.sourceId, hash, input.documentDate, input.postingDate, periods[0].id, input.warehouseId, input.movementTypeId, input.currency, input.description, input.totalValue, context.identity.userId]]);
    const lines = input.lines.map((line, index) => ({ ...line, id: randomUUID(), layerId: randomUUID(), number: index + 1 }));
    await insertRows(tx, 'stock_receipt_lines', ['id', 'tenant_id', 'legal_entity_id', 'receipt_id', 'line_number', 'source_line_key', 'sku_id', 'description', 'quantity', 'unit_cost', 'value'],
      lines.map(line => [line.id, ...scope, id, line.number, line.sourceLineKey, line.skuId, line.description, line.quantity, line.unitCost, line.value]));
    await insertRows(tx, 'inventory_layers', ['id', 'tenant_id', 'legal_entity_id', 'receipt_line_id', 'warehouse_id', 'sku_id', 'received_date', 'quantity', 'unit_cost', 'value'],
      lines.map(line => [line.layerId, ...scope, line.id, input.warehouseId, line.skuId, input.postingDate, line.quantity, line.unitCost, line.value]));
    await insertRows(tx, 'inventory_events', ['id', 'tenant_id', 'legal_entity_id', 'receipt_id', 'kind'], [[eventId, ...scope, id, 'RECEIPT']]);
    await insertRows(tx, 'inventory_physical_ledger', ['id', 'tenant_id', 'legal_entity_id', 'warehouse_id', 'sku_id', 'layer_id', 'event_id', 'quantity', 'value'],
      lines.map(line => [randomUUID(), ...scope, input.warehouseId, line.skuId, line.layerId, eventId, line.quantity, line.value]));
    await insertRows(tx, 'inventory_pool_ledger', ['id', 'tenant_id', 'legal_entity_id', 'warehouse_id', 'sku_id', 'layer_id', 'event_id', 'pool_id', 'quantity', 'value'],
      lines.flatMap(line => line.allocations.map(a => [randomUUID(), ...scope, input.warehouseId, line.skuId, line.layerId, eventId, a.poolId, a.quantity, a.value])));
    // New layers are unique; insert projections in their primary-key order.
    // The common entity lock prevents absent-row races across all writers.
    const ordered = [...lines].sort((a, b) => a.skuId.localeCompare(b.skuId) || a.layerId.localeCompare(b.layerId));
    await insertRows(tx, 'inventory_balances', ['tenant_id', 'legal_entity_id', 'warehouse_id', 'sku_id', 'layer_id', 'quantity', 'value'],
      ordered.map(line => [...scope, input.warehouseId, line.skuId, line.layerId, line.quantity, line.value]));
    await insertRows(tx, 'inventory_pool_balances', ['tenant_id', 'legal_entity_id', 'warehouse_id', 'sku_id', 'layer_id', 'pool_id', 'quantity', 'value'],
      ordered.flatMap(line => line.allocations.map(a => [...scope, input.warehouseId, line.skuId, line.layerId, a.poolId, a.quantity, a.value])));
    // INSERT owns exclusive locks on these new projection rows until commit.
    // Existing warehouse history is neither scanned nor locked for a new receipt.
    // DB guard independently verifies source layers, ledgers and projections.
    await tx.query("UPDATE stock_receipts SET status = 'POSTED' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?", [...scope, id]);
    await audit(tx, context, 'inventory.receipt.posted', id, { sourceKind: 'TEST_FIXTURE', sourceId: input.sourceId, eventId, lineCount: lines.length, totalValue: input.totalValue, currency: input.currency });
    return header(tx, context, id);
  });
}
