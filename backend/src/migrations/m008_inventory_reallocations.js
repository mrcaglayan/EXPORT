// PR-02C. Frozen receipt baseline plus forward extensions; verifies the complete evolved schema.
const scope = 'tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk = (columns, table, targets = 'id') => `FOREIGN KEY (tenant_id, legal_entity_id, ${columns}) REFERENCES ${table}(tenant_id, legal_entity_id, ${targets})`;
const grain = 'warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL';
const layerFk = fk('layer_id, warehouse_id, sku_id', 'inventory_layers', 'id, warehouse_id, sku_id');
const receiptTables = [
  ['stock_receipts', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    source_kind ENUM('TEST_FIXTURE') NOT NULL,
    source_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_date DATE NOT NULL, posting_date DATE NOT NULL,
    period_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, movement_type_id CHAR(36) NOT NULL,
    currency CHAR(3) NOT NULL, description VARCHAR(255) NOT NULL,
    total_value DECIMAL(20,6) NOT NULL,
    status ENUM('ASSEMBLING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
    created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY receipt_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY receipt_source (tenant_id, legal_entity_id, source_kind, source_id),
    KEY receipt_date (tenant_id, legal_entity_id, posting_date, id),
    CONSTRAINT receipt_value CHECK (total_value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),
    ${fk('period_id', 'inventory_periods')}, ${fk('warehouse_id', 'warehouses')}, ${fk('movement_type_id', 'inventory_movement_types')},
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)`],
  ['stock_receipt_lines', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    receipt_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
    source_line_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sku_id CHAR(36) NOT NULL, description VARCHAR(255) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, unit_cost DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY receipt_line_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY receipt_line_sku (tenant_id, legal_entity_id, id, sku_id),
    UNIQUE KEY receipt_line_number (tenant_id, legal_entity_id, receipt_id, line_number),
    UNIQUE KEY receipt_line_source (tenant_id, legal_entity_id, receipt_id, source_line_key),
    CONSTRAINT receipt_line_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value = ROUND(quantity * unit_cost, 6)),
    ${fk('receipt_id', 'stock_receipts')}, ${fk('sku_id', 'product_skus')}`],
  ['inventory_layers', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    receipt_line_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL,
    received_date DATE NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity DECIMAL(20,6) NOT NULL, unit_cost DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY layer_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY layer_grain (tenant_id, legal_entity_id, id, warehouse_id, sku_id),
    UNIQUE KEY layer_source (tenant_id, legal_entity_id, receipt_line_id),
    KEY layer_fifo (tenant_id, legal_entity_id, warehouse_id, sku_id, received_date, created_at, id),
    CONSTRAINT layer_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value = ROUND(quantity * unit_cost, 6)),
    ${fk('receipt_line_id, sku_id', 'stock_receipt_lines', 'id, sku_id')}, ${fk('warehouse_id', 'warehouses')}`],
  ['inventory_events', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    receipt_id CHAR(36) NOT NULL, kind ENUM('RECEIPT') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY event_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY event_receipt (tenant_id, legal_entity_id, receipt_id),
    ${fk('receipt_id', 'stock_receipts')}`],
  ['inventory_physical_ledger', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, ${grain},
    event_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY physical_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY physical_event_layer (tenant_id, legal_entity_id, event_id, layer_id),
    KEY physical_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_receipt_amount CHECK (quantity > 0 AND value >= 0),
    ${layerFk}, ${fk('event_id', 'inventory_events')}`],
  ['inventory_pool_ledger', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, ${grain},
    event_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY pool_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY pool_event_layer (tenant_id, legal_entity_id, event_id, layer_id, pool_id),
    KEY pool_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_receipt_amount CHECK (quantity > 0 AND value >= 0),
    ${layerFk}, ${fk('event_id', 'inventory_events')}, ${fk('pool_id', 'inventory_pools')}`],
  ['inventory_balances', `${scope}, ${grain},
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_balance_nonnegative CHECK (quantity >= 0 AND value >= 0), ${layerFk}`],
  ['inventory_pool_balances', `${scope}, ${grain}, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_balance_nonnegative CHECK (quantity >= 0 AND value >= 0),
    ${fk('warehouse_id, sku_id, layer_id', 'inventory_balances', 'warehouse_id, sku_id, layer_id')}, ${fk('pool_id', 'inventory_pools')}`],
];
const reject = message => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${message}';`;
const own = alias => `${alias}.tenant_id = NEW.tenant_id AND ${alias}.legal_entity_id = NEW.legal_entity_id`;
const assemblingReceipt = `SELECT 1 FROM stock_receipts r WHERE ${own('r')} AND r.id = NEW.receipt_id AND r.status = 'ASSEMBLING'`;
const receiptTriggers = [
  ['receipt_insert_guard', 'INSERT', 'stock_receipts', `BEGIN IF NEW.status <> 'ASSEMBLING' THEN ${reject('Receipt must be assembled before posting')} END IF; END`],
  ['receipt_post_guard', 'UPDATE', 'stock_receipts', `BEGIN
    IF OLD.status <> 'ASSEMBLING' OR NEW.status <> 'POSTED'
      OR NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id)
      OR NOT (NEW.source_kind <=> OLD.source_kind) OR NOT (NEW.source_id <=> OLD.source_id) OR NOT (NEW.payload_hash <=> OLD.payload_hash)
      OR NOT (NEW.document_date <=> OLD.document_date) OR NOT (NEW.posting_date <=> OLD.posting_date)
      OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.warehouse_id <=> OLD.warehouse_id) OR NOT (NEW.movement_type_id <=> OLD.movement_type_id)
      OR NOT (NEW.currency <=> OLD.currency) OR NOT (NEW.description <=> OLD.description) OR NOT (NEW.total_value <=> OLD.total_value)
      OR NOT (NEW.created_by <=> OLD.created_by) OR NOT (NEW.created_at <=> OLD.created_at)
    THEN ${reject('Posted receipts are immutable')} END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id
      WHERE ${own('i')} AND i.id = NEW.period_id AND i.status = 'OPEN' AND a.status = 'OPEN' AND NEW.posting_date BETWEEN a.start_date AND a.end_date)
    THEN ${reject('Inventory and accounting periods must be open')} END IF;
    IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l WHERE ${own('l')} AND l.receipt_id = NEW.id)
      OR NEW.total_value <> (SELECT SUM(l.value) FROM stock_receipt_lines l WHERE ${own('l')} AND l.receipt_id = NEW.id)
      OR NOT EXISTS (SELECT 1 FROM inventory_events e WHERE ${own('e')} AND e.receipt_id = NEW.id)
    THEN ${reject('Receipt lines and event must match header')} END IF;
    IF EXISTS (SELECT 1 FROM stock_receipt_lines l LEFT JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE ${own('l')} AND l.receipt_id = NEW.id AND (x.id IS NULL OR x.quantity <> l.quantity OR x.unit_cost <> l.unit_cost OR x.value <> l.value OR x.warehouse_id <> NEW.warehouse_id OR x.received_date <> NEW.posting_date))
    THEN ${reject('Each receipt line needs its exact source layer')} END IF;
    IF EXISTS (SELECT 1 FROM inventory_layers x JOIN stock_receipt_lines l ON l.tenant_id = x.tenant_id AND l.legal_entity_id = x.legal_entity_id AND l.id = x.receipt_line_id
      LEFT JOIN inventory_physical_ledger p ON p.tenant_id = x.tenant_id AND p.legal_entity_id = x.legal_entity_id AND p.layer_id = x.id
      LEFT JOIN inventory_balances b ON b.tenant_id = x.tenant_id AND b.legal_entity_id = x.legal_entity_id AND b.layer_id = x.id AND b.warehouse_id = x.warehouse_id AND b.sku_id = x.sku_id
      WHERE ${own('l')} AND l.receipt_id = NEW.id AND (p.id IS NULL OR p.quantity <> x.quantity OR p.value <> x.value OR b.layer_id IS NULL OR b.quantity <> p.quantity OR b.value <> p.value
        OR p.quantity <> COALESCE((SELECT SUM(v.quantity) FROM inventory_pool_ledger v WHERE v.tenant_id = p.tenant_id AND v.legal_entity_id = p.legal_entity_id AND v.layer_id = p.layer_id),0)
        OR p.value <> COALESCE((SELECT SUM(v.value) FROM inventory_pool_ledger v WHERE v.tenant_id = p.tenant_id AND v.legal_entity_id = p.legal_entity_id AND v.layer_id = p.layer_id),0)))
    THEN ${reject('Physical stock and pool quantities and values must reconcile')} END IF;
    IF EXISTS (SELECT 1 FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      LEFT JOIN inventory_pool_balances b ON b.tenant_id = p.tenant_id AND b.legal_entity_id = p.legal_entity_id AND b.warehouse_id = p.warehouse_id AND b.sku_id = p.sku_id AND b.layer_id = p.layer_id AND b.pool_id = p.pool_id
      WHERE ${own('e')} AND e.receipt_id = NEW.id AND (b.layer_id IS NULL OR b.quantity <> p.quantity OR b.value <> p.value))
    THEN ${reject('Pool projections must match receipt ledger')} END IF;
  END`],
  ['receipt_no_delete', 'DELETE', 'stock_receipts', `BEGIN ${reject('Receipts cannot be deleted')} END`],
  ...['stock_receipt_lines', 'inventory_events'].map(table => [`${table}_insert_guard`, 'INSERT', table, `BEGIN IF NOT EXISTS (${assemblingReceipt}) THEN ${reject('Receipt is not assembling')} END IF; END`]),
  ['layer_insert_guard', 'INSERT', 'inventory_layers', `BEGIN
    IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l JOIN stock_receipts r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.receipt_id
      WHERE ${own('l')} AND l.id = NEW.receipt_line_id AND r.status = 'ASSEMBLING') THEN ${reject('Layer source is not assembling')} END IF;
  END`],
  ...['inventory_physical_ledger', 'inventory_pool_ledger'].map(table => [`${table}_insert_guard`, 'INSERT', table, `BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      JOIN stock_receipt_lines l ON l.tenant_id = r.tenant_id AND l.legal_entity_id = r.legal_entity_id AND l.receipt_id = r.id
      JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE ${own('e')} AND e.id = NEW.event_id AND x.id = NEW.layer_id AND r.status = 'ASSEMBLING') THEN ${reject('Ledger event must match an assembling source layer')} END IF;
  END`]),
  ...['stock_receipt_lines', 'inventory_layers', 'inventory_events', 'inventory_physical_ledger', 'inventory_pool_ledger'].flatMap(table => ['UPDATE', 'DELETE'].map(event =>
    [`${table}_no_${event.toLowerCase()}`, event, table, `BEGIN ${reject('Inventory history is immutable')} END`])),
  ...['inventory_balances', 'inventory_pool_balances'].map(table => [`${table}_no_delete`, 'DELETE', table, `BEGIN ${reject('Inventory projections cannot be deleted')} END`]),
  ...['inventory_balances', 'inventory_pool_balances'].map(table => [`${table}_identity`, 'UPDATE', table, `BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.legal_entity_id <> OLD.legal_entity_id OR NEW.warehouse_id <> OLD.warehouse_id OR NEW.sku_id <> OLD.sku_id OR NEW.layer_id <> OLD.layer_id ${table === 'inventory_pool_balances' ? 'OR NEW.pool_id <> OLD.pool_id' : ''}
    THEN ${reject('Projection identity is immutable')} END IF;
  END`]),
  ...[['inventory_balances', 'inventory_physical_ledger'], ['inventory_pool_balances', 'inventory_pool_ledger']].map(([table, ledger]) => [`${table}_insert_guard`, 'INSERT', table, `BEGIN
    IF NOT EXISTS (SELECT 1 FROM ${ledger} p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      WHERE ${own('p')} AND p.warehouse_id = NEW.warehouse_id AND p.sku_id = NEW.sku_id AND p.layer_id = NEW.layer_id ${table === 'inventory_pool_balances' ? 'AND p.pool_id = NEW.pool_id' : ''}
        AND p.quantity = NEW.quantity AND p.value = NEW.value AND r.status = 'ASSEMBLING') THEN ${reject('Projection requires its assembling receipt ledger')} END IF;
  END`]),
];
const requestDefinition = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL,
  from_pool_id CHAR(36) NOT NULL, to_pool_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, posting_date DATE NOT NULL,
  period_id CHAR(36) NOT NULL, movement_type_id CHAR(36) NOT NULL, reason VARCHAR(255) NOT NULL,
  requires_independent BOOLEAN NOT NULL,
  status ENUM('DRAFT','REQUESTED','APPROVED','REJECTED','CANCELLED','EXECUTING','EXECUTED') NOT NULL DEFAULT 'DRAFT',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
  cancelled_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
  executed_by CHAR(36) NULL, executed_at TIMESTAMP NULL, total_value DECIMAL(20,6) NULL,
  UNIQUE KEY reallocation_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY reallocation_reference (tenant_id, legal_entity_id, reference),
  KEY reallocation_status (tenant_id, legal_entity_id, status, requested_at, id),
  CONSTRAINT reallocation_amount CHECK (quantity > 0 AND (total_value IS NULL OR total_value >= 0)),
  CONSTRAINT reallocation_pools CHECK (from_pool_id <> to_pool_id),
  ${fk('warehouse_id', 'warehouses')}, ${fk('sku_id', 'product_skus')},
  ${fk('from_pool_id', 'inventory_pools')}, ${fk('to_pool_id', 'inventory_pools')},
  ${fk('period_id', 'inventory_periods')}, ${fk('movement_type_id', 'inventory_movement_types')},
  FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, executed_by) REFERENCES users(tenant_id, id)`;
const lineDefinition = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
  request_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, ${grain},
  quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NULL,
  UNIQUE KEY reallocation_line_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY reallocation_line_number (tenant_id, legal_entity_id, request_id, line_number),
  UNIQUE KEY reallocation_line_layer (tenant_id, legal_entity_id, request_id, layer_id),
  CONSTRAINT reallocation_line_amount CHECK (quantity > 0 AND (value IS NULL OR value >= 0)),
  ${fk('request_id', 'inventory_reallocations')}, ${layerFk}`;
const eventDefinition = receiptTables.find(([name]) => name === 'inventory_events')[1]
  .replace("receipt_id CHAR(36) NOT NULL, kind ENUM('RECEIPT')", "receipt_id CHAR(36) NULL, kind ENUM('RECEIPT','REALLOCATION')")
  + `, reallocation_id CHAR(36) NULL,
    UNIQUE KEY event_reallocation (tenant_id, legal_entity_id, reallocation_id),
    ${fk('reallocation_id', 'inventory_reallocations')},
    CONSTRAINT event_source CHECK ((kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL)
      OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL))`;
export const tables = [
  ...receiptTables.map(([name, definition]) => [name, name === 'inventory_events' ? eventDefinition
    : name === 'inventory_pool_ledger' ? definition.replace('pool_receipt_amount CHECK (quantity > 0 AND value >= 0)',
      'pool_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0))') : definition]),
  ['inventory_reallocations', requestDefinition], ['inventory_reallocation_lines', lineDefinition],
];
const fixed = fields => fields.map(field => `NOT (NEW.${field} <=> OLD.${field})`).join(' OR ');
const immutableRequest = fixed(['id','tenant_id','legal_entity_id','reference','warehouse_id','sku_id','from_pool_id','to_pool_id','quantity','posting_date','period_id','movement_type_id','reason','requires_independent','requested_by','requested_at']);
const reviewFields = fixed(['reviewed_by','reviewed_at','review_reason']);
const cancelFields = fixed(['cancelled_at','cancel_reason']);
const executionFields = fixed(['executed_by','executed_at','total_value']);
const assemblingPool = receiptTriggers.find(([name]) => name === 'inventory_pool_ledger_insert_guard')[3];
const poolReceiptQuery = assemblingPool.slice(assemblingPool.indexOf('SELECT 1'), assemblingPool.indexOf(") THEN"));
const projectionBody = receiptTriggers.find(([name]) => name === 'inventory_pool_balances_insert_guard')[3];
const projectionQuery = projectionBody.slice(projectionBody.indexOf('SELECT 1'), projectionBody.indexOf(") THEN"));
const executingLine = `SELECT 1 FROM inventory_reallocation_lines l JOIN inventory_reallocations r
  ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.request_id
  WHERE ${own('l')} AND l.layer_id = NEW.layer_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND r.status = 'EXECUTING'`;
const replacements = [
  ['inventory_events_insert_guard', 'INSERT', 'inventory_events', `BEGIN
    IF NOT ((NEW.kind = 'RECEIPT' AND NEW.reallocation_id IS NULL AND EXISTS (${assemblingReceipt}))
      OR (NEW.kind = 'REALLOCATION' AND NEW.receipt_id IS NULL AND EXISTS (SELECT 1 FROM inventory_reallocations r WHERE ${own('r')} AND r.id = NEW.reallocation_id AND r.status = 'EXECUTING')))
    THEN ${reject('Event requires an assembling receipt or executing reallocation')} END IF; END`],
  ['inventory_pool_ledger_insert_guard', 'INSERT', 'inventory_pool_ledger', `BEGIN
    IF NOT ((NEW.quantity > 0 AND NEW.value >= 0 AND EXISTS (${poolReceiptQuery}))
      OR EXISTS (${executingLine} AND l.value IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_events e WHERE ${own('e')} AND e.id = NEW.event_id AND e.reallocation_id = r.id)
        AND ((NEW.pool_id = r.from_pool_id AND NEW.quantity = -l.quantity AND NEW.value = -l.value)
          OR (NEW.pool_id = r.to_pool_id AND NEW.quantity = l.quantity AND NEW.value = l.value))))
    THEN ${reject('Pool entry must match its source event and approved layer')} END IF; END`],
  ['inventory_pool_balances_insert_guard', 'INSERT', 'inventory_pool_balances', `BEGIN
    IF NOT (EXISTS (${projectionQuery}) OR (NEW.quantity = 0 AND NEW.value = 0 AND EXISTS (${executingLine} AND r.to_pool_id = NEW.pool_id)))
    THEN ${reject('Pool projection requires a receipt or executing target layer')} END IF; END`],
];
export const triggers = [
  ...receiptTriggers.map(t => replacements.find(([name]) => name === t[0]) ?? t),
  ['reallocation_insert_guard', 'INSERT', 'inventory_reallocations', `BEGIN
    IF NEW.status <> 'DRAFT' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
      OR NEW.executed_by IS NOT NULL OR NEW.executed_at IS NOT NULL OR NEW.total_value IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.cancel_reason IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM inventory_pools p WHERE ${own('p')} AND p.id = NEW.from_pool_id AND NEW.requires_independent = (p.kind = 'COUNTRY'))
      OR NOT EXISTS (SELECT 1 FROM inventory_pools p WHERE ${own('p')} AND p.id = NEW.to_pool_id AND p.kind = 'COUNTRY')
    THEN ${reject('Reallocation must start as a country allocation draft')} END IF; END`],
  ['reallocation_transition', 'UPDATE', 'inventory_reallocations', `BEGIN
    IF ${immutableRequest} THEN ${reject('Reallocation plan is immutable')} END IF;
    IF NOT ((OLD.status = 'DRAFT' AND NEW.status = 'REQUESTED')
      OR (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('EXECUTING','CANCELLED'))
      OR (OLD.status = 'EXECUTING' AND NEW.status = 'EXECUTED')) THEN ${reject('Invalid reallocation transition')} END IF;
    IF OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN
      IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR COALESCE(CHAR_LENGTH(TRIM(NEW.review_reason)),0) = 0
        OR (NEW.requires_independent = 1 AND NEW.reviewed_by = NEW.requested_by) THEN ${reject('Country borrowing requires an independent reviewer')} END IF;
    ELSEIF ${reviewFields} THEN ${reject('Review is immutable')} END IF;
    IF NEW.status = 'CANCELLED' THEN
      IF NEW.cancelled_at IS NULL OR COALESCE(CHAR_LENGTH(TRIM(NEW.cancel_reason)),0) = 0 THEN ${reject('Cancellation needs a reason')} END IF;
    ELSEIF ${cancelFields} THEN ${reject('Cancellation is immutable')} END IF;
    IF NEW.status = 'EXECUTED' THEN
      IF NEW.executed_by IS NULL OR NEW.executed_at IS NULL OR NEW.total_value IS NULL THEN ${reject('Execution needs actor and value')} END IF;
    ELSEIF ${executionFields} THEN ${reject('Execution fields are immutable')} END IF;
    IF NEW.status IN ('REQUESTED','APPROVED','EXECUTING','EXECUTED') THEN
      IF NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id
        WHERE ${own('i')} AND i.id = NEW.period_id AND i.status = 'OPEN' AND a.status = 'OPEN' AND NEW.posting_date BETWEEN a.start_date AND a.end_date)
      THEN ${reject('Inventory and accounting periods must be open')} END IF;
      IF NEW.quantity <> COALESCE((SELECT SUM(l.quantity) FROM inventory_reallocation_lines l WHERE ${own('l')} AND l.request_id = NEW.id),0)
      THEN ${reject('Requested quantity must match planned layers')} END IF;
    END IF;
    IF NEW.status = 'EXECUTED' THEN
      IF NOT EXISTS (SELECT 1 FROM inventory_events e WHERE ${own('e')} AND e.reallocation_id = NEW.id)
        OR NEW.total_value <> (SELECT SUM(l.value) FROM inventory_reallocation_lines l WHERE ${own('l')} AND l.request_id = NEW.id)
        OR EXISTS (SELECT 1 FROM inventory_physical_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id WHERE ${own('e')} AND e.reallocation_id = NEW.id)
      THEN ${reject('Reallocation must preserve physical stock')} END IF;
      IF EXISTS (SELECT 1 FROM inventory_reallocation_lines l WHERE ${own('l')} AND l.request_id = NEW.id
        AND (l.value IS NULL OR 2 <> (SELECT COUNT(*) FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
          WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.layer_id = l.layer_id AND e.reallocation_id = NEW.id)))
      THEN ${reject('Every layer requires equal and opposite pool entries')} END IF;
      IF EXISTS (SELECT 1 FROM inventory_reallocation_lines l JOIN inventory_pool_balances b ON b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.layer_id = l.layer_id
        WHERE ${own('l')} AND l.request_id = NEW.id AND b.pool_id IN (NEW.from_pool_id, NEW.to_pool_id)
        AND (b.quantity <> COALESCE((SELECT SUM(p.quantity) FROM inventory_pool_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id AND p.pool_id = b.pool_id),0)
          OR b.value <> COALESCE((SELECT SUM(p.value) FROM inventory_pool_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id AND p.pool_id = b.pool_id),0)))
      THEN ${reject('Pool projections must reconcile to the ledger')} END IF;
      IF EXISTS (SELECT 1 FROM inventory_reallocation_lines l WHERE ${own('l')} AND l.request_id = NEW.id
        AND (2 <> (SELECT COUNT(*) FROM inventory_pool_balances b WHERE b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.layer_id = l.layer_id AND b.pool_id IN (NEW.from_pool_id,NEW.to_pool_id))))
      THEN ${reject('Both pool projections are required')} END IF;
    END IF;
  END`],
  ['reallocation_no_delete', 'DELETE', 'inventory_reallocations', `BEGIN ${reject('Reallocation history is immutable')} END`],
  ['reallocation_line_insert', 'INSERT', 'inventory_reallocation_lines', `BEGIN
    IF NEW.value IS NOT NULL OR NOT EXISTS (SELECT 1 FROM inventory_reallocations r WHERE ${own('r')} AND r.id = NEW.request_id AND r.status = 'DRAFT' AND r.warehouse_id = NEW.warehouse_id AND r.sku_id = NEW.sku_id)
    THEN ${reject('Layer plan requires its matching draft request')} END IF; END`],
  ['reallocation_line_update', 'UPDATE', 'inventory_reallocation_lines', `BEGIN
    IF ${fixed(['id','tenant_id','legal_entity_id','request_id','line_number','warehouse_id','sku_id','layer_id','quantity'])}
      OR OLD.value IS NOT NULL OR NEW.value IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_reallocations r WHERE ${own('r')} AND r.id = NEW.request_id AND r.status = 'EXECUTING')
    THEN ${reject('Layer plan is immutable; execution may assign value once')} END IF; END`],
  ['reallocation_line_no_delete', 'DELETE', 'inventory_reallocation_lines', `BEGIN ${reject('Reallocation layers are immutable')} END`],
];
const permissions = [
  ['inventory.receipt.post', 'Post receipts from authorized inventory sources'],
  ['inventory.reallocation.request', 'Request and cancel pool reallocations'],
  ['inventory.reallocation.review', 'Review pool reallocations; independent for country borrowing'],
  ['inventory.reallocation.execute', 'Execute approved pool reallocations'],
];
const normalize = sql => sql.replace(/\s+/g, ' ').trim().toLowerCase();

async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? '0'
          : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : options.match(/DEFAULT '(\w+)'/)?.[1] ?? null,
        collation: /CHAR/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : 'utf8mb4_0900_ai_ci'
          : type.startsWith('ENUM') ? 'utf8mb4_0900_ai_ci' : null,
      }));
    const actual = columns.map(c => ({ name: c.Field, type: c.Type.toLowerCase(), nullable: c.Null, default: c.Default, collation: c.Collation }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Inventory receipt columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Inventory receipt table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Inventory receipt foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Inventory receipt indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Inventory receipt check missing: ${constraint}`);
    }
  }
  for (const [name, event, table, body] of triggers) {
    const [[trigger]] = await connection.execute(`SELECT ACTION_STATEMENT AS body, EVENT_MANIPULATION AS event,
      EVENT_OBJECT_TABLE AS tableName, ACTION_TIMING AS timing FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() AND trigger_name = ?`, [name]);
    if (!trigger || trigger.event !== event || trigger.tableName !== table || trigger.timing !== 'BEFORE'
      || normalize(trigger.body) !== normalize(body)) throw new Error(`Inventory receipt trigger differs: ${name}`);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing inventory receipt permissions');
}


export default {
  key: 'm008_inventory_reallocations', description: 'Country allocation and independently approved pool borrowing.',
  replacesVerificationFor: ['m007_inventory_receipts'],
  async up(connection) {
    for (const [name, definition] of tables.slice(-2)) await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    const [columns] = await connection.query('SHOW COLUMNS FROM inventory_events');
    if (!columns.some(c => c.Field === 'reallocation_id')) await connection.query(`ALTER TABLE inventory_events
      MODIFY receipt_id CHAR(36) NULL, MODIFY kind ENUM('RECEIPT','REALLOCATION') NOT NULL,
      ADD reallocation_id CHAR(36) NULL,
      ADD UNIQUE KEY event_reallocation (tenant_id, legal_entity_id, reallocation_id),
      ADD ${fk('reallocation_id', 'inventory_reallocations')},
      ADD CONSTRAINT event_source CHECK ((kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL) OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL))`);
    const [checks] = await connection.execute("SELECT CONSTRAINT_NAME FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'inventory_pool_ledger' AND constraint_name = 'pool_receipt_amount'");
    if (checks.length) await connection.query(`ALTER TABLE inventory_pool_ledger DROP CHECK pool_receipt_amount,
      ADD CONSTRAINT pool_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0))`);
    for (const [name, event, table, body] of [...replacements, ...triggers.filter(t => t[0].startsWith('reallocation_'))]) {
      const [[existing]] = await connection.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ?', [name]);
      if (existing && normalize(existing.body) === normalize(body)) continue;
      const old = receiptTriggers.find(t => t[0] === name);
      if (existing && (!old || normalize(existing.body) !== normalize(old[3]))) throw new Error(`Unexpected trigger before extension: ${name}`);
      if (existing) await connection.query(`DROP TRIGGER ${name}`);
      await connection.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
    }
    for (const [code, description] of permissions) {
      await connection.execute('INSERT INTO permissions (code, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE code = code', [code, description]);
      await connection.execute(`INSERT INTO role_permissions (tenant_id, role_id, permission_code) SELECT tenant_id, id, ? FROM roles WHERE code = 'ADMIN' ON DUPLICATE KEY UPDATE permission_code = permission_code`, [code]);
    }
  }, verify,
};
