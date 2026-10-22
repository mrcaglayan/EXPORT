-- NEW design baseline v5, revised 22 October 2026 for PR-02B receipt layers and stock ledgers.
-- Original referenced inputs were not supplied. User-authorized replacement.
-- REFERENCE ONLY: m004_product_foundation.js, m005_product_classification.js and
-- m006_inventory_foundation.js, m007_inventory_receipts.js are executable migrations. Requires m001/m002/m003.
-- Do not run this reference against an existing schema. No inserts/imports.

CREATE TABLE unit_of_measure (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    symbol VARCHAR(16) NOT NULL,
    quantity_precision INT UNSIGNED NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY unit_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY unit_code (tenant_id, legal_entity_id, code),
    CONSTRAINT unit_precision CHECK (quantity_precision <= 6),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_families (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    parent_id CHAR(36) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY family_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY family_code (tenant_id, legal_entity_id, code),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, parent_id) REFERENCES product_families(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_skus (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    family_id CHAR(36) NOT NULL,
    base_unit_id CHAR(36) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY sku_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY sku_code (tenant_id, legal_entity_id, code),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, family_id) REFERENCES product_families(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, base_unit_id) REFERENCES unit_of_measure(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_suppliers (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY supplier_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY supplier_code (tenant_id, legal_entity_id, code),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_attribute_definitions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    data_type ENUM('TEXT','DECIMAL','BOOLEAN') NOT NULL,
    unit_label VARCHAR(16) NOT NULL,
    defines_stock BOOLEAN NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY attribute_definition_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY attribute_definition_code (tenant_id, legal_entity_id, code),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_sku_attributes (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    sku_id CHAR(36) NOT NULL,
    definition_id CHAR(36) NOT NULL,
    value JSON NOT NULL,
    UNIQUE KEY sku_attribute_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY sku_attribute_definition (tenant_id, legal_entity_id, sku_id, definition_id),
    FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, definition_id) REFERENCES product_attribute_definitions(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_gtip_history (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    sku_id CHAR(36) NOT NULL,
    gtip_code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    broker_name VARCHAR(160) NULL,
    verification_reference VARCHAR(1000) NULL,
    verified_on DATE NULL,
    status ENUM('PENDING','REVIEWED','VERIFIED','REJECTED','RETIRED') NOT NULL DEFAULT 'PENDING',
    source_reference VARCHAR(1000) NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL,
    reviewed_at DATETIME NULL,
    verified_by CHAR(36) NULL,
    verified_at DATETIME NULL,
    UNIQUE KEY gtip_scope (tenant_id, legal_entity_id, id),
    KEY gtip_windows (tenant_id, legal_entity_id, sku_id, status, effective_from, effective_to),
    CONSTRAINT gtip_digits CHECK (gtip_code REGEXP '^[0-9]{12}$'),
    CONSTRAINT gtip_dates CHECK (effective_to IS NULL OR effective_from <= effective_to),
    CONSTRAINT gtip_review_state CHECK (
      status NOT IN ('REVIEWED','VERIFIED','RETIRED') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT gtip_verified_state CHECK (
      status NOT IN ('VERIFIED','RETIRED') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL
        AND broker_name IS NOT NULL AND verification_reference IS NOT NULL AND verified_on IS NOT NULL)),
    FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, verified_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_alias_sources (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    supplier_id CHAR(36) NOT NULL,
    supplier_code VARCHAR(120) NOT NULL,
    supplier_description VARCHAR(1000) NOT NULL,
    source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY alias_source_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY alias_source_identity (tenant_id, legal_entity_id, supplier_id, source_hash),
    FOREIGN KEY (tenant_id, legal_entity_id, supplier_id) REFERENCES product_suppliers(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_aliases (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    source_id CHAR(36) NOT NULL,
    current_source_id CHAR(36) NULL,
    revision INT UNSIGNED NOT NULL,
    sku_id CHAR(36) NOT NULL,
    status ENUM('PENDING','REVIEWED','VERIFIED','REJECTED','RETIRED') NOT NULL DEFAULT 'PENDING',
    source_reference VARCHAR(1000) NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL,
    reviewed_at DATETIME NULL,
    verified_by CHAR(36) NULL,
    verified_at DATETIME NULL,
    UNIQUE KEY alias_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY alias_revision (tenant_id, legal_entity_id, source_id, revision),
    UNIQUE KEY alias_current (tenant_id, legal_entity_id, current_source_id),
    KEY alias_sku (tenant_id, legal_entity_id, sku_id, status),
    CONSTRAINT alias_positive_revision CHECK (revision > 0),
    CONSTRAINT alias_current_state CHECK (
      (status IN ('PENDING','REVIEWED','VERIFIED') AND current_source_id IS NOT NULL AND current_source_id = source_id)
      OR (status IN ('REJECTED','RETIRED') AND current_source_id IS NULL)),
    CONSTRAINT alias_review_state CHECK (
      status NOT IN ('REVIEWED','VERIFIED','RETIRED') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT alias_verified_state CHECK (
      status NOT IN ('VERIFIED','RETIRED') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
    FOREIGN KEY (tenant_id, legal_entity_id, source_id) REFERENCES product_alias_sources(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, verified_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- PR-01C implemented: product UI polish and combined release gate; no new tables.
-- PR-02C–02F contracts remain planned, NOT executable DDL here:
-- 02C approved equal/opposite pool reallocations, no physical/GL change.
-- 02D reservations/dispatch, exact SKU and source-layer consumption.
-- 02E versioned close snapshots and GL reconciliation checkpoints.
-- 02F reversals/adjustments with original-event lineage.
-- All carry tenant/entity scope. Physical movements reference SKUs, not families.
-- Refine future DDL in each stage; see companion specification for invariants.

-- PR-02A implemented in m006_inventory_foundation. Reference only.

CREATE TABLE warehouses (
  id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    location VARCHAR(500) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY warehouse_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY warehouse_code (tenant_id, legal_entity_id, code),
    CONSTRAINT warehouse_active CHECK (active IN (0,1)),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pools (
  id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    kind ENUM('GENERAL','COUNTRY') NOT NULL,
    country_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY pool_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY pool_code (tenant_id, legal_entity_id, code),
    UNIQUE KEY pool_country (tenant_id, legal_entity_id, country_code),
    CONSTRAINT pool_active CHECK (active IN (0,1)),
    CONSTRAINT pool_identity CHECK ((kind = 'GENERAL' AND country_code IS NULL AND code = 'GENERAL') OR
      (kind = 'COUNTRY' AND country_code IS NOT NULL AND code = country_code AND country_code IN ('AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'))),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_periods (
  id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    accounting_period_id CHAR(36) NOT NULL,
    status ENUM('OPEN','IN_REVIEW','CLOSED') NOT NULL DEFAULT 'OPEN',
    UNIQUE KEY inventory_period_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY inventory_period_calendar (tenant_id, legal_entity_id, accounting_period_id),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, accounting_period_id) REFERENCES accounting_periods(tenant_id, legal_entity_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_movement_types (
  id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    effect ENUM('RECEIPT','ISSUE','REALLOCATION','ADJUSTMENT_IN','ADJUSTMENT_OUT','REVALUATION') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY movement_type_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY movement_type_code (tenant_id, legal_entity_id, code),
    CONSTRAINT movement_type_active CHECK (active IN (0,1)),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- PR-02B implemented in m007_inventory_receipts. Reference only; no seed data.

CREATE TABLE stock_receipts (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
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
    FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, movement_type_id) REFERENCES inventory_movement_types(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stock_receipt_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    receipt_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
    source_line_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sku_id CHAR(36) NOT NULL, description VARCHAR(255) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, unit_cost DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY receipt_line_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY receipt_line_sku (tenant_id, legal_entity_id, id, sku_id),
    UNIQUE KEY receipt_line_number (tenant_id, legal_entity_id, receipt_id, line_number),
    UNIQUE KEY receipt_line_source (tenant_id, legal_entity_id, receipt_id, source_line_key),
    CONSTRAINT receipt_line_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value = ROUND(quantity * unit_cost, 6)),
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_id) REFERENCES stock_receipts(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_layers (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    receipt_line_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL,
    received_date DATE NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity DECIMAL(20,6) NOT NULL, unit_cost DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY layer_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY layer_grain (tenant_id, legal_entity_id, id, warehouse_id, sku_id),
    UNIQUE KEY layer_source (tenant_id, legal_entity_id, receipt_line_id),
    KEY layer_fifo (tenant_id, legal_entity_id, warehouse_id, sku_id, received_date, created_at, id),
    CONSTRAINT layer_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value = ROUND(quantity * unit_cost, 6)),
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_line_id, sku_id) REFERENCES stock_receipt_lines(tenant_id, legal_entity_id, id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_events (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    receipt_id CHAR(36) NOT NULL, kind ENUM('RECEIPT') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY event_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY event_receipt (tenant_id, legal_entity_id, receipt_id),
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_id) REFERENCES stock_receipts(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_physical_ledger (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY physical_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY physical_event_layer (tenant_id, legal_entity_id, event_id, layer_id),
    KEY physical_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_receipt_amount CHECK (quantity > 0 AND value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pool_ledger (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY pool_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY pool_event_layer (tenant_id, legal_entity_id, event_id, layer_id, pool_id),
    KEY pool_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_receipt_amount CHECK (quantity > 0 AND value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_balances (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_balance_nonnegative CHECK (quantity >= 0 AND value >= 0), FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pool_balances (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_balance_nonnegative CHECK (quantity >= 0 AND value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id) REFERENCES inventory_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Immutability and receipt reconciliation guards; runtime migration verifies these bodies.
DELIMITER $$
CREATE TRIGGER receipt_insert_guard BEFORE INSERT ON stock_receipts FOR EACH ROW BEGIN IF NEW.status <> 'ASSEMBLING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipt must be assembled before posting'; END IF; END$$

CREATE TRIGGER receipt_post_guard BEFORE UPDATE ON stock_receipts FOR EACH ROW BEGIN
    IF OLD.status <> 'ASSEMBLING' OR NEW.status <> 'POSTED'
      OR NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id)
      OR NOT (NEW.source_kind <=> OLD.source_kind) OR NOT (NEW.source_id <=> OLD.source_id) OR NOT (NEW.payload_hash <=> OLD.payload_hash)
      OR NOT (NEW.document_date <=> OLD.document_date) OR NOT (NEW.posting_date <=> OLD.posting_date)
      OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.warehouse_id <=> OLD.warehouse_id) OR NOT (NEW.movement_type_id <=> OLD.movement_type_id)
      OR NOT (NEW.currency <=> OLD.currency) OR NOT (NEW.description <=> OLD.description) OR NOT (NEW.total_value <=> OLD.total_value)
      OR NOT (NEW.created_by <=> OLD.created_by) OR NOT (NEW.created_at <=> OLD.created_at)
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Posted receipts are immutable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id
      WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.period_id AND i.status = 'OPEN' AND a.status = 'OPEN' AND NEW.posting_date BETWEEN a.start_date AND a.end_date)
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory and accounting periods must be open'; END IF;
    IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.receipt_id = NEW.id)
      OR NEW.total_value <> (SELECT SUM(l.value) FROM stock_receipt_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.receipt_id = NEW.id)
      OR NOT EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.receipt_id = NEW.id)
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipt lines and event must match header'; END IF;
    IF EXISTS (SELECT 1 FROM stock_receipt_lines l LEFT JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.receipt_id = NEW.id AND (x.id IS NULL OR x.quantity <> l.quantity OR x.unit_cost <> l.unit_cost OR x.value <> l.value OR x.warehouse_id <> NEW.warehouse_id OR x.received_date <> NEW.posting_date))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Each receipt line needs its exact source layer'; END IF;
    IF EXISTS (SELECT 1 FROM inventory_layers x JOIN stock_receipt_lines l ON l.tenant_id = x.tenant_id AND l.legal_entity_id = x.legal_entity_id AND l.id = x.receipt_line_id
      LEFT JOIN inventory_physical_ledger p ON p.tenant_id = x.tenant_id AND p.legal_entity_id = x.legal_entity_id AND p.layer_id = x.id
      LEFT JOIN inventory_balances b ON b.tenant_id = x.tenant_id AND b.legal_entity_id = x.legal_entity_id AND b.layer_id = x.id AND b.warehouse_id = x.warehouse_id AND b.sku_id = x.sku_id
      WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.receipt_id = NEW.id AND (p.id IS NULL OR p.quantity <> x.quantity OR p.value <> x.value OR b.layer_id IS NULL OR b.quantity <> p.quantity OR b.value <> p.value
        OR p.quantity <> COALESCE((SELECT SUM(v.quantity) FROM inventory_pool_ledger v WHERE v.tenant_id = p.tenant_id AND v.legal_entity_id = p.legal_entity_id AND v.layer_id = p.layer_id),0)
        OR p.value <> COALESCE((SELECT SUM(v.value) FROM inventory_pool_ledger v WHERE v.tenant_id = p.tenant_id AND v.legal_entity_id = p.legal_entity_id AND v.layer_id = p.layer_id),0)))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Physical stock and pool quantities and values must reconcile'; END IF;
    IF EXISTS (SELECT 1 FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      LEFT JOIN inventory_pool_balances b ON b.tenant_id = p.tenant_id AND b.legal_entity_id = p.legal_entity_id AND b.warehouse_id = p.warehouse_id AND b.sku_id = p.sku_id AND b.layer_id = p.layer_id AND b.pool_id = p.pool_id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.receipt_id = NEW.id AND (b.layer_id IS NULL OR b.quantity <> p.quantity OR b.value <> p.value))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pool projections must match receipt ledger'; END IF;
  END$$

CREATE TRIGGER receipt_no_delete BEFORE DELETE ON stock_receipts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipts cannot be deleted'; END$$

CREATE TRIGGER stock_receipt_lines_insert_guard BEFORE INSERT ON stock_receipt_lines FOR EACH ROW BEGIN IF NOT EXISTS (SELECT 1 FROM stock_receipts r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.receipt_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipt is not assembling'; END IF; END$$

CREATE TRIGGER inventory_events_insert_guard BEFORE INSERT ON inventory_events FOR EACH ROW BEGIN IF NOT EXISTS (SELECT 1 FROM stock_receipts r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.receipt_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipt is not assembling'; END IF; END$$

CREATE TRIGGER layer_insert_guard BEFORE INSERT ON inventory_layers FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l JOIN stock_receipts r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.receipt_id
      WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.id = NEW.receipt_line_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Layer source is not assembling'; END IF;
  END$$

CREATE TRIGGER inventory_physical_ledger_insert_guard BEFORE INSERT ON inventory_physical_ledger FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      JOIN stock_receipt_lines l ON l.tenant_id = r.tenant_id AND l.legal_entity_id = r.legal_entity_id AND l.receipt_id = r.id
      JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND x.id = NEW.layer_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger event must match an assembling source layer'; END IF;
  END$$

CREATE TRIGGER inventory_pool_ledger_insert_guard BEFORE INSERT ON inventory_pool_ledger FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      JOIN stock_receipt_lines l ON l.tenant_id = r.tenant_id AND l.legal_entity_id = r.legal_entity_id AND l.receipt_id = r.id
      JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND x.id = NEW.layer_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger event must match an assembling source layer'; END IF;
  END$$

CREATE TRIGGER stock_receipt_lines_no_update BEFORE UPDATE ON stock_receipt_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER stock_receipt_lines_no_delete BEFORE DELETE ON stock_receipt_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_layers_no_update BEFORE UPDATE ON inventory_layers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_layers_no_delete BEFORE DELETE ON inventory_layers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_events_no_update BEFORE UPDATE ON inventory_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_events_no_delete BEFORE DELETE ON inventory_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_physical_ledger_no_update BEFORE UPDATE ON inventory_physical_ledger FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_physical_ledger_no_delete BEFORE DELETE ON inventory_physical_ledger FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_pool_ledger_no_update BEFORE UPDATE ON inventory_pool_ledger FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_pool_ledger_no_delete BEFORE DELETE ON inventory_pool_ledger FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory history is immutable'; END$$

CREATE TRIGGER inventory_balances_no_delete BEFORE DELETE ON inventory_balances FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory projections cannot be deleted'; END$$

CREATE TRIGGER inventory_pool_balances_no_delete BEFORE DELETE ON inventory_pool_balances FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory projections cannot be deleted'; END$$

CREATE TRIGGER inventory_balances_identity BEFORE UPDATE ON inventory_balances FOR EACH ROW BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.legal_entity_id <> OLD.legal_entity_id OR NEW.warehouse_id <> OLD.warehouse_id OR NEW.sku_id <> OLD.sku_id OR NEW.layer_id <> OLD.layer_id 
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Projection identity is immutable'; END IF;
  END$$

CREATE TRIGGER inventory_pool_balances_identity BEFORE UPDATE ON inventory_pool_balances FOR EACH ROW BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.legal_entity_id <> OLD.legal_entity_id OR NEW.warehouse_id <> OLD.warehouse_id OR NEW.sku_id <> OLD.sku_id OR NEW.layer_id <> OLD.layer_id OR NEW.pool_id <> OLD.pool_id
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Projection identity is immutable'; END IF;
  END$$

CREATE TRIGGER inventory_balances_insert_guard BEFORE INSERT ON inventory_balances FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_physical_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.warehouse_id = NEW.warehouse_id AND p.sku_id = NEW.sku_id AND p.layer_id = NEW.layer_id 
        AND p.quantity = NEW.quantity AND p.value = NEW.value AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Projection requires its assembling receipt ledger'; END IF;
  END$$

CREATE TRIGGER inventory_pool_balances_insert_guard BEFORE INSERT ON inventory_pool_balances FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.warehouse_id = NEW.warehouse_id AND p.sku_id = NEW.sku_id AND p.layer_id = NEW.layer_id AND p.pool_id = NEW.pool_id
        AND p.quantity = NEW.quantity AND p.value = NEW.value AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Projection requires its assembling receipt ledger'; END IF;
  END$$
DELIMITER ;
