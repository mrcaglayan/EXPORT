// PR-02D. Frozen m008 baseline plus reservations and issues. Preserve after application.
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
const priorTables = [
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
const priorTriggers = [
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
const priorPermissions = [
  ['inventory.receipt.post', 'Post receipts from authorized inventory sources'],
  ['inventory.reallocation.request', 'Request and cancel pool reallocations'],
  ['inventory.reallocation.review', 'Review pool reallocations; independent for country borrowing'],
  ['inventory.reallocation.execute', 'Execute approved pool reallocations'],
];
const scopedId = name => `UNIQUE KEY ${name}_scope (tenant_id, legal_entity_id, id)`;
const reservations = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  warehouse_id CHAR(36) NOT NULL, destination_pool_id CHAR(36) NOT NULL,
  reservation_date DATE NOT NULL, period_id CHAR(36) NOT NULL, reason VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','ACTIVE','CLOSED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${scopedId('reservation')}, UNIQUE KEY reservation_reference (tenant_id, legal_entity_id, reference),
  KEY reservation_status (tenant_id, legal_entity_id, status, created_at, id),
  ${fk('warehouse_id','warehouses')}, ${fk('destination_pool_id','inventory_pools')}, ${fk('period_id','inventory_periods')},
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)`;
const reservationLines = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
  reservation_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL,
  ${scopedId('reservation_line')}, UNIQUE KEY reservation_line_number (tenant_id, legal_entity_id, reservation_id, line_number),
  UNIQUE KEY reservation_line_grain (tenant_id, legal_entity_id, id, reservation_id, sku_id),
  CONSTRAINT reservation_line_amount CHECK (quantity > 0),
  ${fk('reservation_id','inventory_reservations')}, ${fk('sku_id','product_skus')}`;
const allocations = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
  reservation_id CHAR(36) NOT NULL, reservation_line_id CHAR(36) NOT NULL, allocation_number INT UNSIGNED NOT NULL,
  ${grain}, pool_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL,
  released_quantity DECIMAL(20,6) NOT NULL DEFAULT 0, issued_quantity DECIMAL(20,6) NOT NULL DEFAULT 0,
  ${scopedId('reservation_allocation')},
  UNIQUE KEY reservation_allocation_number (tenant_id, legal_entity_id, reservation_id, allocation_number),
  UNIQUE KEY reservation_allocation_source (tenant_id, legal_entity_id, reservation_line_id, layer_id, pool_id),
  UNIQUE KEY reservation_allocation_grain (tenant_id, legal_entity_id, id, reservation_id, warehouse_id, sku_id, layer_id, pool_id),
  KEY reservation_stock (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
  CONSTRAINT reservation_allocation_amount CHECK (quantity > 0 AND released_quantity >= 0 AND issued_quantity >= 0 AND released_quantity + issued_quantity <= quantity),
  ${fk('reservation_line_id, reservation_id, sku_id','inventory_reservation_lines','id, reservation_id, sku_id')},
  ${fk('warehouse_id, sku_id, layer_id, pool_id','inventory_pool_balances','warehouse_id, sku_id, layer_id, pool_id')}`;
const releases = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, reservation_id CHAR(36) NOT NULL,
  kind ENUM('RELEASE','CANCEL') NOT NULL, reason VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${scopedId('reservation_release')}, ${fk('reservation_id','inventory_reservations')},
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)`;
const releaseLines = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, release_id CHAR(36) NOT NULL,
  allocation_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL,
  ${scopedId('reservation_release_line')}, UNIQUE KEY release_allocation (tenant_id, legal_entity_id, release_id, allocation_id),
  CONSTRAINT release_line_amount CHECK (quantity > 0), ${fk('release_id','inventory_reservation_releases')}, ${fk('allocation_id','inventory_reservation_allocations')}`;
const issues = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, reservation_id CHAR(36) NOT NULL,
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dispatch_date DATE NOT NULL, posting_date DATE NOT NULL, period_id CHAR(36) NOT NULL,
  movement_type_id CHAR(36) NOT NULL, description VARCHAR(255) NOT NULL, currency CHAR(3) NOT NULL,
  total_value DECIMAL(20,6) NOT NULL, status ENUM('ASSEMBLING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${scopedId('issue')}, UNIQUE KEY issue_reference (tenant_id, legal_entity_id, reference),
  KEY issue_date (tenant_id, legal_entity_id, posting_date, id),
  CONSTRAINT issue_value CHECK (total_value >= 0), ${fk('reservation_id','inventory_reservations')},
  ${fk('period_id','inventory_periods')}, ${fk('movement_type_id','inventory_movement_types')},
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)`;
const issueLines = `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, issue_id CHAR(36) NOT NULL,
  allocation_id CHAR(36) NOT NULL, reservation_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
  ${grain}, pool_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
  ${scopedId('issue_line')}, UNIQUE KEY issue_line_number (tenant_id, legal_entity_id, issue_id, line_number),
  UNIQUE KEY issue_allocation (tenant_id, legal_entity_id, issue_id, allocation_id),
  CONSTRAINT issue_line_amount CHECK (quantity > 0 AND value >= 0), ${fk('issue_id','inventory_issues')},
  ${fk('allocation_id, reservation_id, warehouse_id, sku_id, layer_id, pool_id','inventory_reservation_allocations','id, reservation_id, warehouse_id, sku_id, layer_id, pool_id')}`;
const newTables = [['inventory_reservations',reservations],['inventory_reservation_lines',reservationLines],['inventory_reservation_allocations',allocations],['inventory_reservation_releases',releases],['inventory_reservation_release_lines',releaseLines],['inventory_issues',issues],['inventory_issue_lines',issueLines]];
const newEvent = priorTables.find(([name])=>name==='inventory_events')[1]
  .replace("ENUM('RECEIPT','REALLOCATION')","ENUM('RECEIPT','REALLOCATION','ISSUE')")
  .replace(/,\s*CONSTRAINT event_source CHECK[\s\S]*$/,'')
  + `, issue_id CHAR(36) NULL, UNIQUE KEY event_issue (tenant_id, legal_entity_id, issue_id), ${fk('issue_id','inventory_issues')},
    CONSTRAINT event_source CHECK ((kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL AND issue_id IS NULL)
      OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL AND issue_id IS NULL)
      OR (kind = 'ISSUE' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NOT NULL))`;
export const tables = [...priorTables.map(([name,definition])=>[name,name==='inventory_events'?newEvent:name==='inventory_physical_ledger'?definition.replace('physical_receipt_amount CHECK (quantity > 0 AND value >= 0)','physical_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0))'):definition]),...newTables];
const priorTrigger = name => priorTriggers.find(t=>t[0]===name)[3];
const existsIssue = `SELECT 1 FROM inventory_issues i WHERE ${own('i')} AND i.id = NEW.issue_id AND i.status = 'ASSEMBLING'`;
const activeReservation = alias => `SELECT 1 FROM inventory_reservations r WHERE r.tenant_id = ${alias}.tenant_id AND r.legal_entity_id = ${alias}.legal_entity_id AND r.id = ${alias}.reservation_id AND r.status = 'ACTIVE'`;
const sameGrain = (a,b,pool=true) => `${a}.tenant_id = ${b}.tenant_id AND ${a}.legal_entity_id = ${b}.legal_entity_id AND ${a}.warehouse_id = ${b}.warehouse_id AND ${a}.sku_id = ${b}.sku_id AND ${a}.layer_id = ${b}.layer_id${pool?` AND ${a}.pool_id = ${b}.pool_id`:''}`;
const remaining = alias => `${alias}.quantity - ${alias}.released_quantity - ${alias}.issued_quantity`;
const reserved = (row,pool=true) => `SELECT COALESCE(SUM(${remaining('a')}),0) FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id WHERE ${sameGrain('a',row,pool)} AND r.status IN ('ASSEMBLING','ACTIVE')`;
const replacementsD = [
 ['inventory_events_insert_guard','INSERT','inventory_events',`BEGIN
   IF NEW.kind = 'ISSUE' THEN IF NOT EXISTS (${existsIssue}) THEN ${reject('Issue event requires an assembling issue')} END IF;
   ELSE ${priorTrigger('inventory_events_insert_guard')}; END IF; END`],
 ...['inventory_physical_ledger','inventory_pool_ledger'].map(table=>{
  const pool=table==='inventory_pool_ledger';
  return [`${table}_insert_guard`,'INSERT',table,`BEGIN
   IF EXISTS (SELECT 1 FROM inventory_events e WHERE ${own('e')} AND e.id = NEW.event_id AND e.kind = 'ISSUE') THEN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN inventory_issues i ON i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id AND i.id = e.issue_id
      WHERE ${own('e')} AND e.id = NEW.event_id AND i.status = 'ASSEMBLING'
      AND NEW.quantity = -(SELECT SUM(l.quantity) FROM inventory_issue_lines l WHERE ${sameGrain('l','NEW',pool)} AND l.issue_id = i.id)
      AND NEW.value = -(SELECT SUM(l.value) FROM inventory_issue_lines l WHERE ${sameGrain('l','NEW',pool)} AND l.issue_id = i.id))
    THEN ${reject('Issue ledger must match exact consumption lines')} END IF;
   ELSE ${priorTrigger(`${table}_insert_guard`)}; END IF; END`];
 }),
];
const closedPeriod = (dateField='posting_date')=>`NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods p ON p.tenant_id = i.tenant_id AND p.legal_entity_id = i.legal_entity_id AND p.id = i.accounting_period_id WHERE ${own('i')} AND i.id = NEW.period_id AND i.status = 'OPEN' AND p.status = 'OPEN' AND NEW.${dateField} BETWEEN p.start_date AND p.end_date)`;
const immutable = (table,events=['UPDATE','DELETE'])=>events.map(event=>[`${table}_no_${event.toLowerCase()}`,event,table,`BEGIN ${reject('Inventory reservation and issue history is immutable')} END`]);
export const triggers = [
 ...priorTriggers.map(t=>replacementsD.find(([name])=>name===t[0])??t),
 ['reservation_insert_guard','INSERT','inventory_reservations',`BEGIN
   IF NEW.status <> 'ASSEMBLING' OR NOT EXISTS (SELECT 1 FROM inventory_pools p WHERE ${own('p')} AND p.id = NEW.destination_pool_id AND p.kind = 'COUNTRY') THEN ${reject('Reservation requires an assembling country destination')} END IF; END`],
 ['reservation_transition','UPDATE','inventory_reservations',`BEGIN
   IF ${fixed(['id','tenant_id','legal_entity_id','reference','warehouse_id','destination_pool_id','reservation_date','period_id','reason','created_by','created_at'])}
     OR NOT ((OLD.status = 'ASSEMBLING' AND NEW.status = 'ACTIVE') OR (OLD.status = 'ACTIVE' AND NEW.status IN ('CLOSED','CANCELLED'))) THEN ${reject('Reservation identity and terminal state are immutable')} END IF;
   IF NEW.status = 'ACTIVE' THEN
     IF ${closedPeriod('reservation_date')} THEN ${reject('Both reservation periods must be open')} END IF;
     IF NOT EXISTS (SELECT 1 FROM inventory_reservation_lines l WHERE ${own('l')} AND l.reservation_id = NEW.id)
       OR EXISTS (SELECT 1 FROM inventory_reservation_lines l WHERE ${own('l')} AND l.reservation_id = NEW.id AND l.quantity <> COALESCE((SELECT SUM(a.quantity) FROM inventory_reservation_allocations a WHERE a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.reservation_line_id = l.id),0)) THEN ${reject('Reservation lines must match exact allocations')} END IF;
   ELSEIF EXISTS (SELECT 1 FROM inventory_reservation_allocations a WHERE ${own('a')} AND a.reservation_id = NEW.id AND ${remaining('a')} > 0) THEN ${reject('Cannot close a reservation with outstanding stock')} END IF;
   IF NEW.status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM inventory_reservation_releases x WHERE ${own('x')} AND x.reservation_id = NEW.id AND x.kind = 'CANCEL' AND x.status = 'POSTED') THEN ${reject('Cancellation needs a posted release')} END IF;
 END`],
 ...immutable('inventory_reservations',['DELETE']),
 ['reservation_line_insert_guard','INSERT','inventory_reservation_lines',`BEGIN IF NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE ${own('r')} AND r.id = NEW.reservation_id AND r.status = 'ASSEMBLING') THEN ${reject('Reservation line requires its assembling header')} END IF; END`],
 ...immutable('inventory_reservation_lines'),
 ['reservation_allocation_insert_guard','INSERT','inventory_reservation_allocations',`BEGIN
   IF NEW.released_quantity <> 0 OR NEW.issued_quantity <> 0 OR NOT EXISTS (SELECT 1 FROM inventory_reservations r JOIN inventory_pools p ON p.tenant_id = r.tenant_id AND p.legal_entity_id = r.legal_entity_id AND p.id = NEW.pool_id
     WHERE ${own('r')} AND r.id = NEW.reservation_id AND r.status = 'ASSEMBLING' AND r.warehouse_id = NEW.warehouse_id AND (p.id = r.destination_pool_id OR p.kind = 'GENERAL')) THEN ${reject('Reservation pool must be destination or GENERAL')} END IF;
   IF NEW.quantity + (${reserved('NEW')}) > COALESCE((SELECT b.quantity FROM inventory_pool_balances b WHERE ${sameGrain('b','NEW')}),0) THEN ${reject('Reservation exceeds available pool stock')} END IF;
 END`],
 ['reservation_allocation_update_guard','UPDATE','inventory_reservation_allocations',`BEGIN
   IF ${fixed(['id','tenant_id','legal_entity_id','reservation_id','reservation_line_id','allocation_number','warehouse_id','sku_id','layer_id','pool_id','quantity'])}
     OR NOT EXISTS (${activeReservation('NEW')}) OR NEW.released_quantity < OLD.released_quantity OR NEW.issued_quantity < OLD.issued_quantity
     OR NOT ((NEW.released_quantity > OLD.released_quantity AND NEW.issued_quantity = OLD.issued_quantity) OR (NEW.issued_quantity > OLD.issued_quantity AND NEW.released_quantity = OLD.released_quantity)) THEN ${reject('Reservation allocation identity is immutable')} END IF;
   IF NEW.released_quantity <> COALESCE((SELECT SUM(l.quantity) FROM inventory_reservation_release_lines l WHERE ${own('l')} AND l.allocation_id = NEW.id),0)
     OR NEW.issued_quantity <> COALESCE((SELECT SUM(l.quantity) FROM inventory_issue_lines l WHERE ${own('l')} AND l.allocation_id = NEW.id),0) THEN ${reject('Reservation counters require matching immutable action lines')} END IF;
 END`],
 ...immutable('inventory_reservation_allocations',['DELETE']),
 ['reservation_release_insert_guard','INSERT','inventory_reservation_releases',`BEGIN IF NEW.status <> 'ASSEMBLING' OR NOT EXISTS (${activeReservation('NEW')}) THEN ${reject('Release requires an active reservation')} END IF; END`],
 ['reservation_release_line_insert_guard','INSERT','inventory_reservation_release_lines',`BEGIN
   IF NOT EXISTS (SELECT 1 FROM inventory_reservation_releases r JOIN inventory_reservation_allocations a ON a.tenant_id = r.tenant_id AND a.legal_entity_id = r.legal_entity_id AND a.reservation_id = r.reservation_id
     WHERE ${own('r')} AND r.id = NEW.release_id AND r.status = 'ASSEMBLING' AND a.id = NEW.allocation_id AND NEW.quantity <= ${remaining('a')}) THEN ${reject('Release exceeds its outstanding allocation')} END IF; END`],
 ['reservation_release_post_guard','UPDATE','inventory_reservation_releases',`BEGIN
   IF ${fixed(['id','tenant_id','legal_entity_id','reservation_id','kind','reason','created_by','created_at'])} OR OLD.status <> 'ASSEMBLING' OR NEW.status <> 'POSTED'
     OR NOT EXISTS (SELECT 1 FROM inventory_reservation_release_lines l WHERE ${own('l')} AND l.release_id = NEW.id) THEN ${reject('Release is immutable and needs lines')} END IF;
   IF EXISTS (SELECT 1 FROM inventory_reservation_release_lines l JOIN inventory_reservation_allocations a ON a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.id = l.allocation_id
      WHERE ${own('l')} AND l.release_id = NEW.id AND a.released_quantity <> (SELECT SUM(x.quantity) FROM inventory_reservation_release_lines x WHERE x.tenant_id = a.tenant_id AND x.legal_entity_id = a.legal_entity_id AND x.allocation_id = a.id)) THEN ${reject('Release counters must reconcile')} END IF;
 END`],
 ...immutable('inventory_reservation_releases',['DELETE']), ...immutable('inventory_reservation_release_lines'),
 ['issue_insert_guard','INSERT','inventory_issues',`BEGIN IF NEW.status <> 'ASSEMBLING' OR NOT EXISTS (${activeReservation('NEW')}) THEN ${reject('Issue requires an active reservation')} END IF; END`],
 ['issue_line_insert_guard','INSERT','inventory_issue_lines',`BEGIN
   IF NOT EXISTS (SELECT 1 FROM inventory_issues i JOIN inventory_reservation_allocations a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.reservation_id = i.reservation_id
      WHERE ${own('i')} AND i.id = NEW.issue_id AND i.status = 'ASSEMBLING' AND i.reservation_id = NEW.reservation_id AND a.id = NEW.allocation_id AND NEW.quantity <= ${remaining('a')}) THEN ${reject('Issue exceeds its outstanding reserved allocation')} END IF; END`],
 ...immutable('inventory_issues',['DELETE']), ...immutable('inventory_issue_lines'),
 ['issue_post_guard','UPDATE','inventory_issues',`BEGIN
   IF ${fixed(['id','tenant_id','legal_entity_id','reservation_id','reference','payload_hash','dispatch_date','posting_date','period_id','movement_type_id','description','currency','total_value','created_by','created_at'])}
     OR OLD.status <> 'ASSEMBLING' OR NEW.status <> 'POSTED' THEN ${reject('Posted issues are immutable')} END IF;
   IF ${closedPeriod()} THEN ${reject('Both issue periods must be open')} END IF;
   IF NOT EXISTS (SELECT 1 FROM inventory_issue_lines l WHERE ${own('l')} AND l.issue_id = NEW.id)
     OR NEW.total_value <> (SELECT SUM(l.value) FROM inventory_issue_lines l WHERE ${own('l')} AND l.issue_id = NEW.id)
     OR NOT EXISTS (SELECT 1 FROM inventory_events e WHERE ${own('e')} AND e.issue_id = NEW.id) THEN ${reject('Issue lines and event must match header')} END IF;
   IF EXISTS (SELECT 1 FROM inventory_issue_lines l JOIN inventory_reservation_allocations a ON a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.id = l.allocation_id
     WHERE ${own('l')} AND l.issue_id = NEW.id AND (a.issued_quantity <> (SELECT SUM(x.quantity) FROM inventory_issue_lines x WHERE x.tenant_id = a.tenant_id AND x.legal_entity_id = a.legal_entity_id AND x.allocation_id = a.id)
       OR NOT EXISTS (SELECT 1 FROM inventory_physical_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id WHERE ${sameGrain('p','l',false)} AND e.issue_id = NEW.id)
       OR NOT EXISTS (SELECT 1 FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id WHERE ${sameGrain('p','l')} AND e.issue_id = NEW.id))) THEN ${reject('Issue must consume both physical and reserved pool stock')} END IF;
   ${[['inventory_balances','inventory_physical_ledger',false],['inventory_pool_balances','inventory_pool_ledger',true]].map(([balance,ledger,pool])=>`IF EXISTS (SELECT 1 FROM inventory_issue_lines l JOIN ${balance} b ON ${sameGrain('b','l',pool)} WHERE ${own('l')} AND l.issue_id = NEW.id AND (b.quantity <> (SELECT SUM(p.quantity) FROM ${ledger} p WHERE ${sameGrain('p','b',pool)}) OR b.value <> (SELECT SUM(p.value) FROM ${ledger} p WHERE ${sameGrain('p','b',pool)}))) THEN ${reject('Issue projections must reconcile to their ledgers')} END IF;`).join('\n')}
 END`],
 ...['inventory_balances','inventory_pool_balances'].map(table=>[`${table}_reserved_guard`,'UPDATE',table,`BEGIN IF NEW.quantity < (${reserved('NEW',table==='inventory_pool_balances')}) THEN ${reject('Stock cannot fall below outstanding reservations')} END IF; END`]),
];
const permissions = [...priorPermissions,['inventory.reservation.manage','Reserve stock and release or cancel outstanding allocations'],['inventory.issue.post','Post physical dispatch against reserved source layers']];
const normalize = sql => sql.replace(/\s+/g, ' ').trim().toLowerCase();

async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? (type.startsWith('DECIMAL') ? '0.000000' : '0')
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
 key:'m009_inventory_reservations_issues', description:'Exact pool/layer reservations, partial releases and FIFO physical dispatch.',
 replacesVerificationFor:['m007_inventory_receipts','m008_inventory_reallocations'],
 async up(connection) {
   for(const [name,definition] of newTables) await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
   const [columns]=await connection.query('SHOW COLUMNS FROM inventory_events');
   if(!columns.some(c=>c.Field==='issue_id')) await connection.query(`ALTER TABLE inventory_events MODIFY kind ENUM('RECEIPT','REALLOCATION','ISSUE') NOT NULL,
     ADD issue_id CHAR(36) NULL, ADD UNIQUE KEY event_issue (tenant_id,legal_entity_id,issue_id), ADD ${fk('issue_id','inventory_issues')},
     DROP CHECK event_source, ADD CONSTRAINT event_source CHECK ((kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL AND issue_id IS NULL)
      OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL AND issue_id IS NULL)
      OR (kind = 'ISSUE' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NOT NULL))`);
   const [checks]=await connection.execute("SELECT CONSTRAINT_NAME FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'inventory_physical_ledger' AND constraint_name = 'physical_receipt_amount'");
   if(checks.length) await connection.query('ALTER TABLE inventory_physical_ledger DROP CHECK physical_receipt_amount, ADD CONSTRAINT physical_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0))');
   for(const [name,event,table,body] of triggers) {
     const [[existing]]=await connection.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ?',[name]);
     if(existing && normalize(existing.body)===normalize(body)) continue;
     const old=priorTriggers.find(t=>t[0]===name);
     if(existing && (!old || normalize(existing.body)!==normalize(old[3]))) throw new Error(`Unexpected trigger before extension: ${name}`);
     if(existing) await connection.query(`DROP TRIGGER ${name}`);
     await connection.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
   }
   for(const [code,description] of permissions) {
     await connection.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code = code',[code,description]);
     await connection.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code = 'ADMIN' ON DUPLICATE KEY UPDATE permission_code = permission_code",[code]);
   }
 },verify,
};
