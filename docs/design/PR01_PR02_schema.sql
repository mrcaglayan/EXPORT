-- NEW design baseline v9, revised 26 October 2026 for PR-02F corrections and inventory release gate.
-- Original referenced inputs were not supplied. User-authorized replacement.
-- REFERENCE ONLY: m004_product_foundation.js, m005_product_classification.js and
-- m006_inventory_foundation.js, m007_inventory_receipts.js and m008_inventory_reallocations.js and m009_inventory_reservations_issues.js and m010_inventory_period_close.js and m011_inventory_corrections.js are executable migrations. Requires m001/m002/m003.
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
-- PR-02D–02F contracts remain planned, NOT executable DDL here:
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

-- Final evolved stock schema verified by m011; close additions verified by m010.
-- Reference only. Preserve all applied JavaScript migration sources.

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
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_id) REFERENCES stock_receipts(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_layers (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    receipt_line_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL,
    received_date DATE NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity DECIMAL(20,6) NOT NULL, unit_cost DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY layer_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY layer_grain (tenant_id, legal_entity_id, id, warehouse_id, sku_id),
    UNIQUE KEY layer_source (tenant_id, legal_entity_id, receipt_line_id),
    KEY layer_fifo (tenant_id, legal_entity_id, warehouse_id, sku_id, received_date, created_at, id),
    CONSTRAINT layer_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value = ROUND(quantity * unit_cost, 6)),
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_line_id, sku_id) REFERENCES stock_receipt_lines(tenant_id, legal_entity_id, id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_events (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    receipt_id CHAR(36) NULL, kind ENUM('RECEIPT','REALLOCATION','ISSUE','CORRECTION') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY event_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY event_receipt (tenant_id, legal_entity_id, receipt_id),
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_id) REFERENCES stock_receipts(tenant_id, legal_entity_id, id), reallocation_id CHAR(36) NULL,
    UNIQUE KEY event_reallocation (tenant_id, legal_entity_id, reallocation_id),
    FOREIGN KEY (tenant_id, legal_entity_id, reallocation_id) REFERENCES inventory_reallocations(tenant_id, legal_entity_id, id), issue_id CHAR(36) NULL, UNIQUE KEY event_issue (tenant_id, legal_entity_id, issue_id), FOREIGN KEY (tenant_id, legal_entity_id, issue_id) REFERENCES inventory_issues(tenant_id, legal_entity_id, id),
 correction_id CHAR(36) NULL, reverses_event_id CHAR(36) NULL, posting_date DATE NOT NULL DEFAULT '1000-01-01',
 UNIQUE KEY event_correction (tenant_id, legal_entity_id, correction_id),
 UNIQUE KEY event_reversal (tenant_id, legal_entity_id, reverses_event_id),
 KEY event_posting (tenant_id, legal_entity_id, posting_date, id),
 KEY event_cursor (tenant_id, legal_entity_id, created_at, id),
 FOREIGN KEY (tenant_id, legal_entity_id, reverses_event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id),
 CONSTRAINT event_source CHECK (
 (kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL AND issue_id IS NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL AND issue_id IS NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'ISSUE' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NOT NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'CORRECTION' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NULL AND correction_id IS NOT NULL))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_physical_ledger (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY physical_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY physical_event_layer (tenant_id, legal_entity_id, event_id, layer_id),
    KEY physical_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value <> 0)),
    FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id), KEY movement_cursor (tenant_id, legal_entity_id, event_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pool_ledger (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY pool_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY pool_event_layer (tenant_id, legal_entity_id, event_id, layer_id, pool_id),
    KEY pool_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value <> 0)),
    FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), KEY movement_cursor (tenant_id, legal_entity_id, event_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_balances (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_balance_nonnegative CHECK (quantity >= 0 AND value >= 0), FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), CONSTRAINT inventory_balances_no_orphan CHECK (quantity > 0 OR value = 0)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pool_balances (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_balance_nonnegative CHECK (quantity >= 0 AND value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id) REFERENCES inventory_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), CONSTRAINT inventory_pool_balances_no_orphan CHECK (quantity > 0 OR value = 0)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reallocations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
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
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, from_pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, to_pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, movement_type_id) REFERENCES inventory_movement_types(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, executed_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reallocation_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NULL,
  UNIQUE KEY reallocation_line_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY reallocation_line_number (tenant_id, legal_entity_id, request_id, line_number),
  UNIQUE KEY reallocation_line_layer (tenant_id, legal_entity_id, request_id, layer_id),
  CONSTRAINT reallocation_line_amount CHECK (quantity > 0 AND (value IS NULL OR value >= 0)),
  FOREIGN KEY (tenant_id, legal_entity_id, request_id) REFERENCES inventory_reallocations(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  warehouse_id CHAR(36) NOT NULL, destination_pool_id CHAR(36) NOT NULL,
  reservation_date DATE NOT NULL, period_id CHAR(36) NOT NULL, reason VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','ACTIVE','CLOSED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY reservation_scope (tenant_id, legal_entity_id, id), UNIQUE KEY reservation_reference (tenant_id, legal_entity_id, reference),
  KEY reservation_status (tenant_id, legal_entity_id, status, created_at, id),
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, destination_pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  reservation_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL,
  UNIQUE KEY reservation_line_scope (tenant_id, legal_entity_id, id), UNIQUE KEY reservation_line_number (tenant_id, legal_entity_id, reservation_id, line_number),
  UNIQUE KEY reservation_line_grain (tenant_id, legal_entity_id, id, reservation_id, sku_id),
  CONSTRAINT reservation_line_amount CHECK (quantity > 0),
  FOREIGN KEY (tenant_id, legal_entity_id, reservation_id) REFERENCES inventory_reservations(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_allocations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  reservation_id CHAR(36) NOT NULL, reservation_line_id CHAR(36) NOT NULL, allocation_number INT UNSIGNED NOT NULL,
  warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL,
  released_quantity DECIMAL(20,6) NOT NULL DEFAULT 0, issued_quantity DECIMAL(20,6) NOT NULL DEFAULT 0,
  UNIQUE KEY reservation_allocation_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY reservation_allocation_number (tenant_id, legal_entity_id, reservation_id, allocation_number),
  UNIQUE KEY reservation_allocation_source (tenant_id, legal_entity_id, reservation_line_id, layer_id, pool_id),
  UNIQUE KEY reservation_allocation_grain (tenant_id, legal_entity_id, id, reservation_id, warehouse_id, sku_id, layer_id, pool_id),
  KEY reservation_stock (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
  CONSTRAINT reservation_allocation_amount CHECK (quantity > 0 AND released_quantity >= 0 AND issued_quantity >= 0 AND released_quantity + issued_quantity <= quantity),
  FOREIGN KEY (tenant_id, legal_entity_id, reservation_line_id, reservation_id, sku_id) REFERENCES inventory_reservation_lines(tenant_id, legal_entity_id, id, reservation_id, sku_id),
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id) REFERENCES inventory_pool_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_releases (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reservation_id CHAR(36) NOT NULL,
  kind ENUM('RELEASE','CANCEL') NOT NULL, reason VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY reservation_release_scope (tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, reservation_id) REFERENCES inventory_reservations(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_release_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, release_id CHAR(36) NOT NULL,
  allocation_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL,
  UNIQUE KEY reservation_release_line_scope (tenant_id, legal_entity_id, id), UNIQUE KEY release_allocation (tenant_id, legal_entity_id, release_id, allocation_id),
  CONSTRAINT release_line_amount CHECK (quantity > 0), FOREIGN KEY (tenant_id, legal_entity_id, release_id) REFERENCES inventory_reservation_releases(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, allocation_id) REFERENCES inventory_reservation_allocations(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_issues (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reservation_id CHAR(36) NOT NULL,
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dispatch_date DATE NOT NULL, posting_date DATE NOT NULL, period_id CHAR(36) NOT NULL,
  movement_type_id CHAR(36) NOT NULL, description VARCHAR(255) NOT NULL, currency CHAR(3) NOT NULL,
  total_value DECIMAL(20,6) NOT NULL, status ENUM('ASSEMBLING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY issue_scope (tenant_id, legal_entity_id, id), UNIQUE KEY issue_reference (tenant_id, legal_entity_id, reference),
  KEY issue_date (tenant_id, legal_entity_id, posting_date, id),
  CONSTRAINT issue_value CHECK (total_value >= 0), FOREIGN KEY (tenant_id, legal_entity_id, reservation_id) REFERENCES inventory_reservations(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, movement_type_id) REFERENCES inventory_movement_types(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_issue_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, issue_id CHAR(36) NOT NULL,
  allocation_id CHAR(36) NOT NULL, reservation_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
  warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
  UNIQUE KEY issue_line_scope (tenant_id, legal_entity_id, id), UNIQUE KEY issue_line_number (tenant_id, legal_entity_id, issue_id, line_number),
  UNIQUE KEY issue_allocation (tenant_id, legal_entity_id, issue_id, allocation_id),
  CONSTRAINT issue_line_amount CHECK (quantity > 0 AND value >= 0), FOREIGN KEY (tenant_id, legal_entity_id, issue_id) REFERENCES inventory_issues(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, allocation_id, reservation_id, warehouse_id, sku_id, layer_id, pool_id) REFERENCES inventory_reservation_allocations(tenant_id, legal_entity_id, id, reservation_id, warehouse_id, sku_id, layer_id, pool_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_corrections (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('REVERSAL','COUNT','REVALUATION') NOT NULL, original_event_id CHAR(36) NULL,
  posting_date DATE NOT NULL, period_id CHAR(36) NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','POSTING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
  posted_by CHAR(36) NULL, posted_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
  UNIQUE KEY correction_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY correction_reference (tenant_id, legal_entity_id, reference),
  KEY correction_status (tenant_id, legal_entity_id, status, requested_at, id),
  CONSTRAINT correction_source CHECK ((kind = 'REVERSAL' AND original_event_id IS NOT NULL) OR (kind <> 'REVERSAL' AND original_event_id IS NULL)),
  FOREIGN KEY (tenant_id, legal_entity_id, original_event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, posted_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_correction_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, correction_id CHAR(36) NOT NULL,
  line_number INT UNSIGNED NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL,
  layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL, source_entry_id CHAR(36) NULL,
  before_quantity DECIMAL(20,6) NOT NULL, before_value DECIMAL(20,6) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
  observed_quantity DECIMAL(20,6) NULL, target_value DECIMAL(20,6) NULL,
  movement_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  UNIQUE KEY correction_line_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY correction_line_number (tenant_id, legal_entity_id, correction_id, line_number),
  UNIQUE KEY correction_line_grain (tenant_id, legal_entity_id, correction_id, layer_id, pool_id),
  CONSTRAINT correction_line_amount CHECK (before_quantity >= 0 AND before_value >= 0 AND (quantity <> 0 OR value <> 0)
    AND before_quantity + quantity >= 0 AND before_value + value >= 0
    AND (before_quantity + quantity > 0 OR before_value + value = 0)
    AND (quantity = 0 OR (quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0))),
  FOREIGN KEY (tenant_id, legal_entity_id, correction_id) REFERENCES inventory_corrections(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, source_entry_id) REFERENCES inventory_pool_ledger(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id),
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id) REFERENCES inventory_pool_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reconciliation_accounts (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, account_id), FOREIGN KEY (tenant_id, legal_entity_id, account_id) REFERENCES accounts(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_period_snapshots (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, UNIQUE KEY stock_snapshot_scope (tenant_id, legal_entity_id, id), period_id CHAR(36) NOT NULL, version INT UNSIGNED NOT NULL,
    base_snapshot_id CHAR(36) NULL, status ENUM('ASSEMBLING','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'ASSEMBLING',
    content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    line_count INT UNSIGNED NOT NULL, summary JSON NOT NULL, reason VARCHAR(255) NOT NULL,
    prepared_by CHAR(36) NOT NULL, prepared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME NULL, review_reason VARCHAR(255) NULL,
    UNIQUE KEY stock_snapshot_version (tenant_id, legal_entity_id, period_id, version),
    UNIQUE KEY stock_snapshot_period (tenant_id, legal_entity_id, id, period_id),
    CONSTRAINT stock_snapshot_version_positive CHECK (version > 0),
    FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, base_snapshot_id) REFERENCES inventory_period_snapshots(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, prepared_by) REFERENCES users(tenant_id, id), FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_snapshot_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, UNIQUE KEY stock_snapshot_line_scope (tenant_id, legal_entity_id, id), snapshot_id CHAR(36) NOT NULL,
    grain ENUM('PHYSICAL','POOL') NOT NULL, grain_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, family_id CHAR(36) NOT NULL, unit_id CHAR(36) NOT NULL,
    layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NULL, identity_data JSON NOT NULL,
    opening_quantity DECIMAL(30,6) NOT NULL, opening_value DECIMAL(30,6) NOT NULL,
    incoming_quantity DECIMAL(30,6) NOT NULL, incoming_value DECIMAL(30,6) NOT NULL,
    outgoing_quantity DECIMAL(30,6) NOT NULL, outgoing_value DECIMAL(30,6) NOT NULL,
    closing_quantity DECIMAL(30,6) NOT NULL, closing_value DECIMAL(30,6) NOT NULL,
    reserved_quantity DECIMAL(30,6) NOT NULL,
    UNIQUE KEY stock_snapshot_grain (tenant_id, legal_entity_id, snapshot_id, grain, grain_key),
    KEY stock_snapshot_report (tenant_id, legal_entity_id, snapshot_id, grain, sku_id, layer_id),
    CONSTRAINT stock_snapshot_pool CHECK ((grain = 'PHYSICAL' AND pool_id IS NULL) OR (grain = 'POOL' AND pool_id IS NOT NULL)),
    CONSTRAINT stock_snapshot_equation CHECK (closing_quantity = opening_quantity + incoming_quantity - outgoing_quantity AND closing_value = opening_value + incoming_value - outgoing_value),
    CONSTRAINT stock_snapshot_amounts CHECK (opening_quantity >= 0 AND opening_value >= 0 AND incoming_quantity >= 0 AND incoming_value >= 0 AND outgoing_quantity >= 0 AND outgoing_value >= 0 AND closing_quantity >= reserved_quantity AND reserved_quantity >= 0 AND closing_value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, snapshot_id) REFERENCES inventory_period_snapshots(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, family_id) REFERENCES product_families(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, unit_id) REFERENCES unit_of_measure(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_snapshot_events (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, snapshot_id CHAR(36) NOT NULL, event_id CHAR(36) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, snapshot_id, event_id),
    FOREIGN KEY (tenant_id, legal_entity_id, snapshot_id) REFERENCES inventory_period_snapshots(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_period_controls (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, period_id CHAR(36) NOT NULL,
    current_snapshot_id CHAR(36) NULL, pending_snapshot_id CHAR(36) NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, period_id),
    CONSTRAINT inventory_control_pointer CHECK (current_snapshot_id IS NULL OR pending_snapshot_id IS NULL),
    FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, current_snapshot_id, period_id) REFERENCES inventory_period_snapshots(tenant_id, legal_entity_id, id, period_id),
    FOREIGN KEY (tenant_id, legal_entity_id, pending_snapshot_id, period_id) REFERENCES inventory_period_snapshots(tenant_id, legal_entity_id, id, period_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_period_reopens (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, UNIQUE KEY inventory_reopen_scope (tenant_id, legal_entity_id, id), period_id CHAR(36) NOT NULL,
    status ENUM('REQUESTED','APPROVED','REJECTED') NOT NULL DEFAULT 'REQUESTED', reason VARCHAR(255) NOT NULL,
    requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME NULL, review_reason VARCHAR(255) NULL,
    KEY inventory_reopen_status (tenant_id, legal_entity_id, status, period_id),
    FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id, id), FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reopen_periods (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, UNIQUE KEY inventory_reopen_period_scope (tenant_id, legal_entity_id, id), reopen_id CHAR(36) NOT NULL, period_id CHAR(36) NOT NULL,
    snapshot_id CHAR(36) NOT NULL, accounting_closed BOOLEAN NOT NULL,
    UNIQUE KEY inventory_reopen_affected (tenant_id, legal_entity_id, reopen_id, period_id),
    CONSTRAINT inventory_reopen_accounting_status CHECK (accounting_closed IN (0,1)),
    FOREIGN KEY (tenant_id, legal_entity_id, reopen_id) REFERENCES inventory_period_reopens(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, snapshot_id, period_id) REFERENCES inventory_period_snapshots(tenant_id, legal_entity_id, id, period_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE inventory_events ADD FOREIGN KEY (tenant_id, legal_entity_id, correction_id) REFERENCES inventory_corrections(tenant_id, legal_entity_id, id);

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
CREATE TRIGGER inventory_events_insert_guard BEFORE INSERT ON inventory_events FOR EACH ROW BEGIN
  IF NEW.kind = 'CORRECTION' THEN
   IF NOT EXISTS (SELECT 1 FROM inventory_corrections c WHERE c.tenant_id = NEW.tenant_id AND c.legal_entity_id = NEW.legal_entity_id AND c.id = NEW.correction_id AND c.status = 'POSTING' AND (c.original_event_id <=> NEW.reverses_event_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction event requires its approved posting request'; END IF;
   SET NEW.posting_date = (SELECT posting_date FROM inventory_corrections WHERE id = NEW.correction_id);
  ELSE
   BEGIN
   IF NEW.kind = 'ISSUE' THEN IF NOT EXISTS (SELECT 1 FROM inventory_issues i WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.issue_id AND i.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue event requires an assembling issue'; END IF;
   ELSE BEGIN
    IF NOT ((NEW.kind = 'RECEIPT' AND NEW.reallocation_id IS NULL AND EXISTS (SELECT 1 FROM stock_receipts r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.receipt_id AND r.status = 'ASSEMBLING'))
      OR (NEW.kind = 'REALLOCATION' AND NEW.receipt_id IS NULL AND EXISTS (SELECT 1 FROM inventory_reallocations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reallocation_id AND r.status = 'EXECUTING')))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Event requires an assembling receipt or executing reallocation'; END IF; END; END IF; END;
   SET NEW.posting_date = COALESCE((SELECT posting_date FROM stock_receipts WHERE id = NEW.receipt_id),(SELECT posting_date FROM inventory_reallocations WHERE id = NEW.reallocation_id),(SELECT posting_date FROM inventory_issues WHERE id = NEW.issue_id));
  END IF;
 END$$
CREATE TRIGGER layer_insert_guard BEFORE INSERT ON inventory_layers FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l JOIN stock_receipts r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.receipt_id
      WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.id = NEW.receipt_line_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Layer source is not assembling'; END IF;
  END$$
CREATE TRIGGER inventory_physical_ledger_insert_guard BEFORE INSERT ON inventory_physical_ledger FOR EACH ROW BEGIN
   IF EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND e.kind = 'CORRECTION') THEN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN inventory_corrections c ON c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id AND c.id = e.correction_id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND c.status = 'POSTING'
      AND NEW.quantity = (SELECT SUM(l.quantity) FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.layer_id = NEW.layer_id AND l.correction_id = c.id)
      AND NEW.value = (SELECT SUM(l.value) FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.layer_id = NEW.layer_id AND l.correction_id = c.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction ledger must match its retained plan'; END IF;
   ELSE BEGIN
   IF EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND e.kind = 'ISSUE') THEN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN inventory_issues i ON i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id AND i.id = e.issue_id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND i.status = 'ASSEMBLING'
      AND NEW.quantity = -(SELECT SUM(l.quantity) FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND l.layer_id = NEW.layer_id AND l.issue_id = i.id)
      AND NEW.value = -(SELECT SUM(l.value) FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND l.layer_id = NEW.layer_id AND l.issue_id = i.id))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue ledger must match exact consumption lines'; END IF;
   ELSE BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      JOIN stock_receipt_lines l ON l.tenant_id = r.tenant_id AND l.legal_entity_id = r.legal_entity_id AND l.receipt_id = r.id
      JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND x.id = NEW.layer_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger event must match an assembling source layer'; END IF;
  END; END IF; END; END IF;
  END$$
CREATE TRIGGER inventory_pool_ledger_insert_guard BEFORE INSERT ON inventory_pool_ledger FOR EACH ROW BEGIN
   IF EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND e.kind = 'CORRECTION') THEN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN inventory_corrections c ON c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id AND c.id = e.correction_id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND c.status = 'POSTING'
      AND NEW.quantity = (SELECT SUM(l.quantity) FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.layer_id = NEW.layer_id AND l.pool_id = NEW.pool_id AND l.correction_id = c.id)
      AND NEW.value = (SELECT SUM(l.value) FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.layer_id = NEW.layer_id AND l.pool_id = NEW.pool_id AND l.correction_id = c.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction ledger must match its retained plan'; END IF;
   ELSE BEGIN
   IF EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND e.kind = 'ISSUE') THEN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN inventory_issues i ON i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id AND i.id = e.issue_id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND i.status = 'ASSEMBLING'
      AND NEW.quantity = -(SELECT SUM(l.quantity) FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND l.layer_id = NEW.layer_id AND l.pool_id = NEW.pool_id AND l.issue_id = i.id)
      AND NEW.value = -(SELECT SUM(l.value) FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND l.layer_id = NEW.layer_id AND l.pool_id = NEW.pool_id AND l.issue_id = i.id))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue ledger must match exact consumption lines'; END IF;
   ELSE BEGIN
    IF NOT ((NEW.quantity > 0 AND NEW.value >= 0 AND EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      JOIN stock_receipt_lines l ON l.tenant_id = r.tenant_id AND l.legal_entity_id = r.legal_entity_id AND l.receipt_id = r.id
      JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.receipt_line_id = l.id
      WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND x.id = NEW.layer_id AND r.status = 'ASSEMBLING'))
      OR EXISTS (SELECT 1 FROM inventory_reallocation_lines l JOIN inventory_reallocations r
  ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.request_id
  WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.layer_id = NEW.layer_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND r.status = 'EXECUTING' AND l.value IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.event_id AND e.reallocation_id = r.id)
        AND ((NEW.pool_id = r.from_pool_id AND NEW.quantity = -l.quantity AND NEW.value = -l.value)
          OR (NEW.pool_id = r.to_pool_id AND NEW.quantity = l.quantity AND NEW.value = l.value))))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pool entry must match its source event and approved layer'; END IF; END; END IF; END; END IF;
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
    IF NOT (EXISTS (SELECT 1 FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
      JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
      WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.warehouse_id = NEW.warehouse_id AND p.sku_id = NEW.sku_id AND p.layer_id = NEW.layer_id AND p.pool_id = NEW.pool_id
        AND p.quantity = NEW.quantity AND p.value = NEW.value AND r.status = 'ASSEMBLING') OR (NEW.quantity = 0 AND NEW.value = 0 AND EXISTS (SELECT 1 FROM inventory_reallocation_lines l JOIN inventory_reallocations r
  ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.request_id
  WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.layer_id = NEW.layer_id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id AND r.status = 'EXECUTING' AND r.to_pool_id = NEW.pool_id)))
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pool projection requires a receipt or executing target layer'; END IF; END$$
CREATE TRIGGER reallocation_insert_guard BEFORE INSERT ON inventory_reallocations FOR EACH ROW BEGIN
    IF NEW.status <> 'DRAFT' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
      OR NEW.executed_by IS NOT NULL OR NEW.executed_at IS NOT NULL OR NEW.total_value IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.cancel_reason IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM inventory_pools p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.id = NEW.from_pool_id AND NEW.requires_independent = (p.kind = 'COUNTRY'))
      OR NOT EXISTS (SELECT 1 FROM inventory_pools p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.id = NEW.to_pool_id AND p.kind = 'COUNTRY')
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reallocation must start as a country allocation draft'; END IF; END$$
CREATE TRIGGER reallocation_transition BEFORE UPDATE ON inventory_reallocations FOR EACH ROW BEGIN
    IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.reference <=> OLD.reference) OR NOT (NEW.warehouse_id <=> OLD.warehouse_id) OR NOT (NEW.sku_id <=> OLD.sku_id) OR NOT (NEW.from_pool_id <=> OLD.from_pool_id) OR NOT (NEW.to_pool_id <=> OLD.to_pool_id) OR NOT (NEW.quantity <=> OLD.quantity) OR NOT (NEW.posting_date <=> OLD.posting_date) OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.movement_type_id <=> OLD.movement_type_id) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.requires_independent <=> OLD.requires_independent) OR NOT (NEW.requested_by <=> OLD.requested_by) OR NOT (NEW.requested_at <=> OLD.requested_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reallocation plan is immutable'; END IF;
    IF NOT ((OLD.status = 'DRAFT' AND NEW.status = 'REQUESTED')
      OR (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('EXECUTING','CANCELLED'))
      OR (OLD.status = 'EXECUTING' AND NEW.status = 'EXECUTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid reallocation transition'; END IF;
    IF OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN
      IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR COALESCE(CHAR_LENGTH(TRIM(NEW.review_reason)),0) = 0
        OR (NEW.requires_independent = 1 AND NEW.reviewed_by = NEW.requested_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Country borrowing requires an independent reviewer'; END IF;
    ELSEIF NOT (NEW.reviewed_by <=> OLD.reviewed_by) OR NOT (NEW.reviewed_at <=> OLD.reviewed_at) OR NOT (NEW.review_reason <=> OLD.review_reason) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Review is immutable'; END IF;
    IF NEW.status = 'CANCELLED' THEN
      IF NEW.cancelled_at IS NULL OR COALESCE(CHAR_LENGTH(TRIM(NEW.cancel_reason)),0) = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation needs a reason'; END IF;
    ELSEIF NOT (NEW.cancelled_at <=> OLD.cancelled_at) OR NOT (NEW.cancel_reason <=> OLD.cancel_reason) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation is immutable'; END IF;
    IF NEW.status = 'EXECUTED' THEN
      IF NEW.executed_by IS NULL OR NEW.executed_at IS NULL OR NEW.total_value IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Execution needs actor and value'; END IF;
    ELSEIF NOT (NEW.executed_by <=> OLD.executed_by) OR NOT (NEW.executed_at <=> OLD.executed_at) OR NOT (NEW.total_value <=> OLD.total_value) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Execution fields are immutable'; END IF;
    IF NEW.status IN ('REQUESTED','APPROVED','EXECUTING','EXECUTED') THEN
      IF NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id
        WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.period_id AND i.status = 'OPEN' AND a.status = 'OPEN' AND NEW.posting_date BETWEEN a.start_date AND a.end_date)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory and accounting periods must be open'; END IF;
      IF NEW.quantity <> COALESCE((SELECT SUM(l.quantity) FROM inventory_reallocation_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.request_id = NEW.id),0)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requested quantity must match planned layers'; END IF;
    END IF;
    IF NEW.status = 'EXECUTED' THEN
      IF NOT EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.reallocation_id = NEW.id)
        OR NEW.total_value <> (SELECT SUM(l.value) FROM inventory_reallocation_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.request_id = NEW.id)
        OR EXISTS (SELECT 1 FROM inventory_physical_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.reallocation_id = NEW.id)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reallocation must preserve physical stock'; END IF;
      IF EXISTS (SELECT 1 FROM inventory_reallocation_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.request_id = NEW.id
        AND (l.value IS NULL OR 2 <> (SELECT COUNT(*) FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id
          WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.layer_id = l.layer_id AND e.reallocation_id = NEW.id)))
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Every layer requires equal and opposite pool entries'; END IF;
      IF EXISTS (SELECT 1 FROM inventory_reallocation_lines l JOIN inventory_pool_balances b ON b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.layer_id = l.layer_id
        WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.request_id = NEW.id AND b.pool_id IN (NEW.from_pool_id, NEW.to_pool_id)
        AND (b.quantity <> COALESCE((SELECT SUM(p.quantity) FROM inventory_pool_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id AND p.pool_id = b.pool_id),0)
          OR b.value <> COALESCE((SELECT SUM(p.value) FROM inventory_pool_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id AND p.pool_id = b.pool_id),0)))
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pool projections must reconcile to the ledger'; END IF;
      IF EXISTS (SELECT 1 FROM inventory_reallocation_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.request_id = NEW.id
        AND (2 <> (SELECT COUNT(*) FROM inventory_pool_balances b WHERE b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.layer_id = l.layer_id AND b.pool_id IN (NEW.from_pool_id,NEW.to_pool_id))))
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both pool projections are required'; END IF;
    END IF;
  END$$
CREATE TRIGGER reallocation_no_delete BEFORE DELETE ON inventory_reallocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reallocation history is immutable'; END$$
CREATE TRIGGER reallocation_line_insert BEFORE INSERT ON inventory_reallocation_lines FOR EACH ROW BEGIN
    IF NEW.value IS NOT NULL OR NOT EXISTS (SELECT 1 FROM inventory_reallocations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.request_id AND r.status = 'DRAFT' AND r.warehouse_id = NEW.warehouse_id AND r.sku_id = NEW.sku_id)
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Layer plan requires its matching draft request'; END IF; END$$
CREATE TRIGGER reallocation_line_update BEFORE UPDATE ON inventory_reallocation_lines FOR EACH ROW BEGIN
    IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.request_id <=> OLD.request_id) OR NOT (NEW.line_number <=> OLD.line_number) OR NOT (NEW.warehouse_id <=> OLD.warehouse_id) OR NOT (NEW.sku_id <=> OLD.sku_id) OR NOT (NEW.layer_id <=> OLD.layer_id) OR NOT (NEW.quantity <=> OLD.quantity)
      OR OLD.value IS NOT NULL OR NEW.value IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_reallocations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.request_id AND r.status = 'EXECUTING')
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Layer plan is immutable; execution may assign value once'; END IF; END$$
CREATE TRIGGER reallocation_line_no_delete BEFORE DELETE ON inventory_reallocation_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reallocation layers are immutable'; END$$
CREATE TRIGGER reservation_insert_guard BEFORE INSERT ON inventory_reservations FOR EACH ROW BEGIN
   IF NEW.status <> 'ASSEMBLING' OR NOT EXISTS (SELECT 1 FROM inventory_pools p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.id = NEW.destination_pool_id AND p.kind = 'COUNTRY') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation requires an assembling country destination'; END IF; END$$
CREATE TRIGGER reservation_transition BEFORE UPDATE ON inventory_reservations FOR EACH ROW BEGIN
   IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.reference <=> OLD.reference) OR NOT (NEW.warehouse_id <=> OLD.warehouse_id) OR NOT (NEW.destination_pool_id <=> OLD.destination_pool_id) OR NOT (NEW.reservation_date <=> OLD.reservation_date) OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.created_by <=> OLD.created_by) OR NOT (NEW.created_at <=> OLD.created_at)
     OR NOT ((OLD.status = 'ASSEMBLING' AND NEW.status = 'ACTIVE') OR (OLD.status = 'ACTIVE' AND NEW.status IN ('CLOSED','CANCELLED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation identity and terminal state are immutable'; END IF;
   IF NEW.status = 'ACTIVE' THEN
     IF NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods p ON p.tenant_id = i.tenant_id AND p.legal_entity_id = i.legal_entity_id AND p.id = i.accounting_period_id WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.period_id AND i.status = 'OPEN' AND p.status = 'OPEN' AND NEW.reservation_date BETWEEN p.start_date AND p.end_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both reservation periods must be open'; END IF;
     IF NOT EXISTS (SELECT 1 FROM inventory_reservation_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.reservation_id = NEW.id)
       OR EXISTS (SELECT 1 FROM inventory_reservation_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.reservation_id = NEW.id AND l.quantity <> COALESCE((SELECT SUM(a.quantity) FROM inventory_reservation_allocations a WHERE a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.reservation_line_id = l.id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation lines must match exact allocations'; END IF;
   ELSEIF EXISTS (SELECT 1 FROM inventory_reservation_allocations a WHERE a.tenant_id = NEW.tenant_id AND a.legal_entity_id = NEW.legal_entity_id AND a.reservation_id = NEW.id AND a.quantity - a.released_quantity - a.issued_quantity > 0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot close a reservation with outstanding stock'; END IF;
   IF NEW.status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM inventory_reservation_releases x WHERE x.tenant_id = NEW.tenant_id AND x.legal_entity_id = NEW.legal_entity_id AND x.reservation_id = NEW.id AND x.kind = 'CANCEL' AND x.status = 'POSTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation needs a posted release'; END IF;
 END$$
CREATE TRIGGER inventory_reservations_no_delete BEFORE DELETE ON inventory_reservations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER reservation_line_insert_guard BEFORE INSERT ON inventory_reservation_lines FOR EACH ROW BEGIN IF NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reservation_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation line requires its assembling header'; END IF; END$$
CREATE TRIGGER inventory_reservation_lines_no_update BEFORE UPDATE ON inventory_reservation_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER inventory_reservation_lines_no_delete BEFORE DELETE ON inventory_reservation_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER reservation_allocation_insert_guard BEFORE INSERT ON inventory_reservation_allocations FOR EACH ROW BEGIN
   IF NEW.released_quantity <> 0 OR NEW.issued_quantity <> 0 OR NOT EXISTS (SELECT 1 FROM inventory_reservations r JOIN inventory_pools p ON p.tenant_id = r.tenant_id AND p.legal_entity_id = r.legal_entity_id AND p.id = NEW.pool_id
     WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reservation_id AND r.status = 'ASSEMBLING' AND r.warehouse_id = NEW.warehouse_id AND (p.id = r.destination_pool_id OR p.kind = 'GENERAL')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation pool must be destination or GENERAL'; END IF;
   IF NEW.quantity + (SELECT COALESCE(SUM(a.quantity - a.released_quantity - a.issued_quantity),0) FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id WHERE a.tenant_id = NEW.tenant_id AND a.legal_entity_id = NEW.legal_entity_id AND a.warehouse_id = NEW.warehouse_id AND a.sku_id = NEW.sku_id AND a.layer_id = NEW.layer_id AND a.pool_id = NEW.pool_id AND r.status IN ('ASSEMBLING','ACTIVE')) > COALESCE((SELECT b.quantity FROM inventory_pool_balances b WHERE b.tenant_id = NEW.tenant_id AND b.legal_entity_id = NEW.legal_entity_id AND b.warehouse_id = NEW.warehouse_id AND b.sku_id = NEW.sku_id AND b.layer_id = NEW.layer_id AND b.pool_id = NEW.pool_id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation exceeds available pool stock'; END IF;
 END$$
CREATE TRIGGER reservation_allocation_update_guard BEFORE UPDATE ON inventory_reservation_allocations FOR EACH ROW BEGIN
   IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.reservation_id <=> OLD.reservation_id) OR NOT (NEW.reservation_line_id <=> OLD.reservation_line_id) OR NOT (NEW.allocation_number <=> OLD.allocation_number) OR NOT (NEW.warehouse_id <=> OLD.warehouse_id) OR NOT (NEW.sku_id <=> OLD.sku_id) OR NOT (NEW.layer_id <=> OLD.layer_id) OR NOT (NEW.pool_id <=> OLD.pool_id) OR NOT (NEW.quantity <=> OLD.quantity)
     OR NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reservation_id AND r.status = 'ACTIVE') OR NEW.released_quantity < OLD.released_quantity OR NEW.issued_quantity < OLD.issued_quantity
     OR NOT ((NEW.released_quantity > OLD.released_quantity AND NEW.issued_quantity = OLD.issued_quantity) OR (NEW.issued_quantity > OLD.issued_quantity AND NEW.released_quantity = OLD.released_quantity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation allocation identity is immutable'; END IF;
   IF NEW.released_quantity <> COALESCE((SELECT SUM(l.quantity) FROM inventory_reservation_release_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.allocation_id = NEW.id),0)
     OR NEW.issued_quantity <> COALESCE((SELECT SUM(l.quantity) FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.allocation_id = NEW.id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reservation counters require matching immutable action lines'; END IF;
 END$$
CREATE TRIGGER inventory_reservation_allocations_no_delete BEFORE DELETE ON inventory_reservation_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER reservation_release_insert_guard BEFORE INSERT ON inventory_reservation_releases FOR EACH ROW BEGIN IF NEW.status <> 'ASSEMBLING' OR NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reservation_id AND r.status = 'ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Release requires an active reservation'; END IF; END$$
CREATE TRIGGER reservation_release_line_insert_guard BEFORE INSERT ON inventory_reservation_release_lines FOR EACH ROW BEGIN
   IF NOT EXISTS (SELECT 1 FROM inventory_reservation_releases r JOIN inventory_reservation_allocations a ON a.tenant_id = r.tenant_id AND a.legal_entity_id = r.legal_entity_id AND a.reservation_id = r.reservation_id
     WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.release_id AND r.status = 'ASSEMBLING' AND a.id = NEW.allocation_id AND NEW.quantity <= a.quantity - a.released_quantity - a.issued_quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Release exceeds its outstanding allocation'; END IF; END$$
CREATE TRIGGER reservation_release_post_guard BEFORE UPDATE ON inventory_reservation_releases FOR EACH ROW BEGIN
   IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.reservation_id <=> OLD.reservation_id) OR NOT (NEW.kind <=> OLD.kind) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.created_by <=> OLD.created_by) OR NOT (NEW.created_at <=> OLD.created_at) OR OLD.status <> 'ASSEMBLING' OR NEW.status <> 'POSTED'
     OR NOT EXISTS (SELECT 1 FROM inventory_reservation_release_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.release_id = NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Release is immutable and needs lines'; END IF;
   IF EXISTS (SELECT 1 FROM inventory_reservation_release_lines l JOIN inventory_reservation_allocations a ON a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.id = l.allocation_id
      WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.release_id = NEW.id AND a.released_quantity <> (SELECT SUM(x.quantity) FROM inventory_reservation_release_lines x WHERE x.tenant_id = a.tenant_id AND x.legal_entity_id = a.legal_entity_id AND x.allocation_id = a.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Release counters must reconcile'; END IF;
 END$$
CREATE TRIGGER inventory_reservation_releases_no_delete BEFORE DELETE ON inventory_reservation_releases FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER inventory_reservation_release_lines_no_update BEFORE UPDATE ON inventory_reservation_release_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER inventory_reservation_release_lines_no_delete BEFORE DELETE ON inventory_reservation_release_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER issue_insert_guard BEFORE INSERT ON inventory_issues FOR EACH ROW BEGIN IF NEW.status <> 'ASSEMBLING' OR NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reservation_id AND r.status = 'ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue requires an active reservation'; END IF; END$$
CREATE TRIGGER issue_line_insert_guard BEFORE INSERT ON inventory_issue_lines FOR EACH ROW BEGIN
   IF NOT EXISTS (SELECT 1 FROM inventory_issues i JOIN inventory_reservation_allocations a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.reservation_id = i.reservation_id
      WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.issue_id AND i.status = 'ASSEMBLING' AND i.reservation_id = NEW.reservation_id AND a.id = NEW.allocation_id AND NEW.quantity <= a.quantity - a.released_quantity - a.issued_quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue exceeds its outstanding reserved allocation'; END IF; END$$
CREATE TRIGGER inventory_issues_no_delete BEFORE DELETE ON inventory_issues FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER inventory_issue_lines_no_update BEFORE UPDATE ON inventory_issue_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER inventory_issue_lines_no_delete BEFORE DELETE ON inventory_issue_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reservation and issue history is immutable'; END$$
CREATE TRIGGER issue_post_guard BEFORE UPDATE ON inventory_issues FOR EACH ROW BEGIN
   IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.reservation_id <=> OLD.reservation_id) OR NOT (NEW.reference <=> OLD.reference) OR NOT (NEW.payload_hash <=> OLD.payload_hash) OR NOT (NEW.dispatch_date <=> OLD.dispatch_date) OR NOT (NEW.posting_date <=> OLD.posting_date) OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.movement_type_id <=> OLD.movement_type_id) OR NOT (NEW.description <=> OLD.description) OR NOT (NEW.currency <=> OLD.currency) OR NOT (NEW.total_value <=> OLD.total_value) OR NOT (NEW.created_by <=> OLD.created_by) OR NOT (NEW.created_at <=> OLD.created_at)
     OR OLD.status <> 'ASSEMBLING' OR NEW.status <> 'POSTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Posted issues are immutable'; END IF;
   IF NOT EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods p ON p.tenant_id = i.tenant_id AND p.legal_entity_id = i.legal_entity_id AND p.id = i.accounting_period_id WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.period_id AND i.status = 'OPEN' AND p.status = 'OPEN' AND NEW.posting_date BETWEEN p.start_date AND p.end_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both issue periods must be open'; END IF;
   IF NOT EXISTS (SELECT 1 FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.issue_id = NEW.id)
     OR NEW.total_value <> (SELECT SUM(l.value) FROM inventory_issue_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.issue_id = NEW.id)
     OR NOT EXISTS (SELECT 1 FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.issue_id = NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue lines and event must match header'; END IF;
   IF EXISTS (SELECT 1 FROM inventory_issue_lines l JOIN inventory_reservation_allocations a ON a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.id = l.allocation_id
     WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.issue_id = NEW.id AND (a.issued_quantity <> (SELECT SUM(x.quantity) FROM inventory_issue_lines x WHERE x.tenant_id = a.tenant_id AND x.legal_entity_id = a.legal_entity_id AND x.allocation_id = a.id)
       OR NOT EXISTS (SELECT 1 FROM inventory_physical_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.warehouse_id = l.warehouse_id AND p.sku_id = l.sku_id AND p.layer_id = l.layer_id AND e.issue_id = NEW.id)
       OR NOT EXISTS (SELECT 1 FROM inventory_pool_ledger p JOIN inventory_events e ON e.tenant_id = p.tenant_id AND e.legal_entity_id = p.legal_entity_id AND e.id = p.event_id WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.warehouse_id = l.warehouse_id AND p.sku_id = l.sku_id AND p.layer_id = l.layer_id AND p.pool_id = l.pool_id AND e.issue_id = NEW.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue must consume both physical and reserved pool stock'; END IF;
   IF EXISTS (SELECT 1 FROM inventory_issue_lines l JOIN inventory_balances b ON b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id AND b.layer_id = l.layer_id WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.issue_id = NEW.id AND (b.quantity <> (SELECT SUM(p.quantity) FROM inventory_physical_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.warehouse_id = b.warehouse_id AND p.sku_id = b.sku_id AND p.layer_id = b.layer_id) OR b.value <> (SELECT SUM(p.value) FROM inventory_physical_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.warehouse_id = b.warehouse_id AND p.sku_id = b.sku_id AND p.layer_id = b.layer_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue projections must reconcile to their ledgers'; END IF;
IF EXISTS (SELECT 1 FROM inventory_issue_lines l JOIN inventory_pool_balances b ON b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id AND b.layer_id = l.layer_id AND b.pool_id = l.pool_id WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.issue_id = NEW.id AND (b.quantity <> (SELECT SUM(p.quantity) FROM inventory_pool_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.warehouse_id = b.warehouse_id AND p.sku_id = b.sku_id AND p.layer_id = b.layer_id AND p.pool_id = b.pool_id) OR b.value <> (SELECT SUM(p.value) FROM inventory_pool_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.warehouse_id = b.warehouse_id AND p.sku_id = b.sku_id AND p.layer_id = b.layer_id AND p.pool_id = b.pool_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue projections must reconcile to their ledgers'; END IF;
 END$$
CREATE TRIGGER inventory_balances_reserved_guard BEFORE UPDATE ON inventory_balances FOR EACH ROW BEGIN IF NEW.quantity < (SELECT COALESCE(SUM(a.quantity - a.released_quantity - a.issued_quantity),0) FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id WHERE a.tenant_id = NEW.tenant_id AND a.legal_entity_id = NEW.legal_entity_id AND a.warehouse_id = NEW.warehouse_id AND a.sku_id = NEW.sku_id AND a.layer_id = NEW.layer_id AND r.status IN ('ASSEMBLING','ACTIVE')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock cannot fall below outstanding reservations'; END IF; END$$
CREATE TRIGGER inventory_pool_balances_reserved_guard BEFORE UPDATE ON inventory_pool_balances FOR EACH ROW BEGIN IF NEW.quantity < (SELECT COALESCE(SUM(a.quantity - a.released_quantity - a.issued_quantity),0) FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id WHERE a.tenant_id = NEW.tenant_id AND a.legal_entity_id = NEW.legal_entity_id AND a.warehouse_id = NEW.warehouse_id AND a.sku_id = NEW.sku_id AND a.layer_id = NEW.layer_id AND a.pool_id = NEW.pool_id AND r.status IN ('ASSEMBLING','ACTIVE')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock cannot fall below outstanding reservations'; END IF; END$$
CREATE TRIGGER correction_insert BEFORE INSERT ON inventory_corrections FOR EACH ROW BEGIN
  IF NEW.status <> 'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL OR NEW.cancel_reason IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction must begin as an unreviewed draft'; END IF;
  IF NEW.kind = 'REVERSAL' AND NOT EXISTS (SELECT 1 FROM inventory_events e
   LEFT JOIN stock_receipts r ON r.id = e.receipt_id LEFT JOIN inventory_reallocations a ON a.id = e.reallocation_id LEFT JOIN inventory_issues i ON i.id = e.issue_id LEFT JOIN inventory_corrections c ON c.id = e.correction_id
   WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.id = NEW.original_event_id AND e.reverses_event_id IS NULL AND e.posting_date <= NEW.posting_date AND COALESCE(c.status,r.status,a.status,i.status) IN ('POSTED','EXECUTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reversal needs a completed original event'; END IF;
 END$$
CREATE TRIGGER correction_transition BEFORE UPDATE ON inventory_corrections FOR EACH ROW BEGIN
  DECLARE correctionEvent CHAR(36);
  IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.reference <=> OLD.reference) OR NOT (NEW.kind <=> OLD.kind) OR NOT (NEW.original_event_id <=> OLD.original_event_id) OR NOT (NEW.posting_date <=> OLD.posting_date) OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.evidence <=> OLD.evidence) OR NOT (NEW.requested_by <=> OLD.requested_by) OR NOT (NEW.requested_at <=> OLD.requested_at)
   OR NOT ((OLD.status = 'ASSEMBLING' AND NEW.status = 'REQUESTED') OR (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status = 'APPROVED' AND NEW.status IN ('POSTING','CANCELLED')) OR (OLD.status = 'POSTING' AND NEW.status = 'POSTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction identity and terminal history are immutable'; END IF;
  IF OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN
   IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR COALESCE(CHAR_LENGTH(TRIM(NEW.review_reason)),0) = 0 OR (NEW.status = 'APPROVED' AND NEW.reviewed_by = NEW.requested_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction approval requires a different reviewer'; END IF;
  ELSEIF NOT (NEW.reviewed_by <=> OLD.reviewed_by) OR NOT (NEW.reviewed_at <=> OLD.reviewed_at) OR NOT (NEW.review_reason <=> OLD.review_reason) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction review is immutable'; END IF;
  IF NEW.status = 'CANCELLED' THEN IF COALESCE(CHAR_LENGTH(TRIM(NEW.cancel_reason)),0) = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation needs a reason'; END IF;
  ELSEIF NOT (NEW.cancel_reason <=> OLD.cancel_reason) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation is immutable'; END IF;
  IF NEW.status = 'POSTED' THEN IF NEW.posted_by IS NULL OR NEW.posted_at IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction posting needs an actor'; END IF;
  ELSEIF NOT (NEW.posted_by <=> OLD.posted_by) OR NOT (NEW.posted_at <=> OLD.posted_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Posting actor is immutable'; END IF;
  IF NEW.status IN ('REQUESTED','APPROVED','POSTING','POSTED') THEN
   IF NOT (EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id WHERE i.tenant_id = NEW.tenant_id AND i.legal_entity_id = NEW.legal_entity_id AND i.id = NEW.period_id AND i.status = 'OPEN' AND a.status = 'OPEN' AND NEW.posting_date BETWEEN a.start_date AND a.end_date)) OR NOT EXISTS (SELECT 1 FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction needs lines and both open calendars'; END IF;
   IF NEW.kind = 'REVERSAL' AND ((SELECT COUNT(*) FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id) <> (SELECT COUNT(*) FROM inventory_pool_ledger p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.event_id = NEW.original_event_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reversal must include every original pool entry'; END IF;
  END IF;
  IF NEW.status = 'POSTING' AND EXISTS (SELECT 1 FROM inventory_correction_lines l LEFT JOIN inventory_pool_balances b ON b.tenant_id = l.tenant_id AND b.legal_entity_id = l.legal_entity_id AND b.layer_id = l.layer_id AND b.pool_id = l.pool_id
   WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id AND (b.layer_id IS NULL OR b.quantity <> l.before_quantity OR b.value <> l.before_value)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approved correction stock has changed'; END IF;
  IF NEW.status = 'POSTED' THEN
   SET correctionEvent = (SELECT e.id FROM inventory_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.correction_id = NEW.id);
   IF correctionEvent IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction needs its immutable event'; END IF;
   IF EXISTS (SELECT 1 FROM inventory_correction_lines l LEFT JOIN inventory_pool_ledger p ON p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.layer_id = l.layer_id AND p.pool_id = l.pool_id AND p.event_id = correctionEvent
    WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id AND (p.id IS NULL OR p.quantity <> l.quantity OR p.value <> l.value)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Every correction line needs its exact pool entry'; END IF;
   IF EXISTS (SELECT 1 FROM (SELECT l.layer_id,SUM(l.quantity) AS quantity,SUM(l.value) AS value FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id GROUP BY l.layer_id) planned
    LEFT JOIN inventory_physical_ledger p ON p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.event_id = correctionEvent AND p.layer_id = planned.layer_id
    WHERE (planned.quantity <> 0 OR planned.value <> 0) AND (p.id IS NULL OR p.quantity <> planned.quantity OR p.value <> planned.value)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Physical correction entry is missing or differs'; END IF;
   IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT l.layer_id FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id) affected
    JOIN inventory_balances b ON b.tenant_id = NEW.tenant_id AND b.legal_entity_id = NEW.legal_entity_id AND b.layer_id = affected.layer_id
    LEFT JOIN (SELECT p.layer_id,SUM(p.quantity) AS quantity,SUM(p.value) AS value FROM inventory_physical_ledger p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id GROUP BY p.layer_id) totals
      ON totals.layer_id = b.layer_id
    WHERE b.quantity <> COALESCE(totals.quantity,0) OR b.value <> COALESCE(totals.value,0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction projections must match immutable ledgers'; END IF;
IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT l.layer_id,l.pool_id FROM inventory_correction_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.correction_id = NEW.id) affected
    JOIN inventory_pool_balances b ON b.tenant_id = NEW.tenant_id AND b.legal_entity_id = NEW.legal_entity_id AND b.layer_id = affected.layer_id AND b.pool_id = affected.pool_id
    LEFT JOIN (SELECT p.layer_id,p.pool_id,SUM(p.quantity) AS quantity,SUM(p.value) AS value FROM inventory_pool_ledger p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id GROUP BY p.layer_id,p.pool_id) totals
      ON totals.layer_id = b.layer_id AND totals.pool_id = b.pool_id
    WHERE b.quantity <> COALESCE(totals.quantity,0) OR b.value <> COALESCE(totals.value,0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction projections must match immutable ledgers'; END IF;
  END IF;
 END$$
CREATE TRIGGER correction_no_delete BEFORE DELETE ON inventory_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction history is immutable'; END$$
CREATE TRIGGER correction_line_insert BEFORE INSERT ON inventory_correction_lines FOR EACH ROW BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventory_pool_balances b WHERE b.tenant_id = NEW.tenant_id AND b.legal_entity_id = NEW.legal_entity_id AND b.layer_id = NEW.layer_id AND b.pool_id = NEW.pool_id AND b.quantity = NEW.before_quantity AND b.value = NEW.before_value) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction must retain the actual source balance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_corrections c WHERE c.tenant_id = NEW.tenant_id AND c.legal_entity_id = NEW.legal_entity_id AND c.id = NEW.correction_id AND c.status = 'ASSEMBLING'
   AND ((c.kind = 'REVERSAL' AND NEW.observed_quantity IS NULL AND NEW.target_value IS NULL AND EXISTS (SELECT 1 FROM inventory_pool_ledger p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.layer_id = NEW.layer_id AND p.pool_id = NEW.pool_id AND p.id = NEW.source_entry_id AND p.event_id = c.original_event_id AND NEW.quantity = -p.quantity AND NEW.value = -p.value))
    OR (c.kind = 'COUNT' AND NEW.source_entry_id IS NULL AND NEW.target_value IS NULL AND NEW.quantity <> 0 AND NEW.observed_quantity >= 0 AND NEW.quantity = NEW.observed_quantity - NEW.before_quantity)
    OR (c.kind = 'REVALUATION' AND NEW.source_entry_id IS NULL AND NEW.observed_quantity IS NULL AND NEW.quantity = 0 AND NEW.before_quantity > 0 AND NEW.target_value >= 0 AND NEW.value = NEW.target_value - NEW.before_value))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction line must match source or observed evidence'; END IF;
 END$$
CREATE TRIGGER inventory_correction_lines_no_update BEFORE UPDATE ON inventory_correction_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction evidence and source lines are immutable'; END$$
CREATE TRIGGER inventory_correction_lines_no_delete BEFORE DELETE ON inventory_correction_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Correction evidence and source lines are immutable'; END$$
CREATE TRIGGER inventory_reconciliation_insert BEFORE INSERT ON inventory_reconciliation_accounts FOR EACH ROW BEGIN
    IF EXISTS (SELECT 1 FROM inventory_period_controls c WHERE c.tenant_id = NEW.tenant_id AND c.legal_entity_id = NEW.legal_entity_id AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reopen all dependent stock closes before changing account mapping'; END IF;
    IF NOT EXISTS (SELECT 1 FROM accounts a WHERE a.tenant_id = NEW.tenant_id AND a.legal_entity_id = NEW.legal_entity_id AND a.id = NEW.account_id AND a.active = 1 AND a.account_type = 'ASSET') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory reconciliation requires active asset accounts'; END IF;
  END$$
CREATE TRIGGER inventory_reconciliation_delete BEFORE DELETE ON inventory_reconciliation_accounts FOR EACH ROW BEGIN
    IF EXISTS (SELECT 1 FROM inventory_period_controls c WHERE c.tenant_id = OLD.tenant_id AND c.legal_entity_id = OLD.legal_entity_id AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reopen all dependent stock closes before changing account mapping'; END IF;

  END$$
CREATE TRIGGER inventory_reconciliation_accounts_no_update BEFORE UPDATE ON inventory_reconciliation_accounts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER stock_snapshot_insert BEFORE INSERT ON inventory_period_snapshots FOR EACH ROW BEGIN
    IF NEW.status <> 'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM inventory_periods p WHERE p.tenant_id = NEW.tenant_id AND p.legal_entity_id = NEW.legal_entity_id AND p.id = NEW.period_id AND p.status = 'OPEN') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot requires an open inventory period'; END IF;
  END$$
CREATE TRIGGER stock_snapshot_transition BEFORE UPDATE ON inventory_period_snapshots FOR EACH ROW BEGIN
    IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.version <=> OLD.version) OR NOT (NEW.base_snapshot_id <=> OLD.base_snapshot_id) OR NOT (NEW.content_hash <=> OLD.content_hash) OR NOT (NEW.line_count <=> OLD.line_count) OR NOT (NEW.summary <=> OLD.summary) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.prepared_by <=> OLD.prepared_by) OR NOT (NEW.prepared_at <=> OLD.prepared_at)
      OR NOT ((OLD.status = 'ASSEMBLING' AND NEW.status = 'IN_REVIEW') OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('APPROVED','REJECTED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot content and terminal history are immutable'; END IF;
    IF OLD.status = 'ASSEMBLING' THEN
      IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
        OR NEW.line_count <> (SELECT COUNT(*) FROM inventory_snapshot_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.snapshot_id = NEW.id)
        OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.summary,'$.financial.status')),'') <> 'MATCHED'
        OR COALESCE(JSON_LENGTH(JSON_EXTRACT(NEW.summary,'$.blockers')),-1) <> 0
        OR COALESCE(JSON_EXTRACT(NEW.summary,'$.eventCount'),-1) <> (SELECT COUNT(*) FROM inventory_snapshot_events e WHERE e.tenant_id = NEW.tenant_id AND e.legal_entity_id = NEW.legal_entity_id AND e.snapshot_id = NEW.id)
        OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.summary,'$.financial.difference')) AS DECIMAL(30,6)),1) <> 0
        OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.summary,'$.stockValue')) AS DECIMAL(30,6)),-1) <> (SELECT COALESCE(SUM(l.closing_value),0) FROM inventory_snapshot_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.snapshot_id = NEW.id AND l.grain = 'PHYSICAL')
        THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot must contain a reconciled report'; END IF;
      IF EXISTS (SELECT 1 FROM inventory_snapshot_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.snapshot_id = NEW.id AND l.grain = 'PHYSICAL'
        AND (l.closing_quantity <> COALESCE((SELECT SUM(p.closing_quantity) FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'POOL'),0)
          OR l.closing_value <> COALESCE((SELECT SUM(p.closing_value) FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'POOL'),0)
          OR l.reserved_quantity <> COALESCE((SELECT SUM(p.reserved_quantity) FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'POOL'),0)))
        OR EXISTS (SELECT 1 FROM inventory_snapshot_lines l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.snapshot_id = NEW.id AND l.grain = 'POOL' AND NOT EXISTS (SELECT 1 FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'PHYSICAL'))
        THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot pool totals must equal physical stock'; END IF;
    ELSEIF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
      OR (NEW.status = 'APPROVED' AND NEW.reviewed_by = NEW.prepared_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Close approval requires a different authorized reviewer'; END IF;
  END$$
CREATE TRIGGER inventory_period_snapshots_no_delete BEFORE DELETE ON inventory_period_snapshots FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER stock_snapshot_line_insert BEFORE INSERT ON inventory_snapshot_lines FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE s.tenant_id = NEW.tenant_id AND s.legal_entity_id = NEW.legal_entity_id AND s.id = NEW.snapshot_id AND s.status = 'ASSEMBLING')
      OR NEW.grain_key <> CONCAT(NEW.layer_id,':',COALESCE(NEW.pool_id,'PHYSICAL')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot lines require an assembling header and exact grain'; END IF;
  END$$
CREATE TRIGGER inventory_snapshot_lines_no_update BEFORE UPDATE ON inventory_snapshot_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER inventory_snapshot_lines_no_delete BEFORE DELETE ON inventory_snapshot_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER stock_snapshot_event_insert BEFORE INSERT ON inventory_snapshot_events FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE s.tenant_id = NEW.tenant_id AND s.legal_entity_id = NEW.legal_entity_id AND s.id = NEW.snapshot_id AND s.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot events require an assembling header'; END IF;
  END$$
CREATE TRIGGER inventory_snapshot_events_no_update BEFORE UPDATE ON inventory_snapshot_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER inventory_snapshot_events_no_delete BEFORE DELETE ON inventory_snapshot_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER inventory_control_insert BEFORE INSERT ON inventory_period_controls FOR EACH ROW BEGIN
    IF NEW.current_snapshot_id IS NOT NULL OR NEW.pending_snapshot_id IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE s.tenant_id = NEW.tenant_id AND s.legal_entity_id = NEW.legal_entity_id AND s.id = NEW.pending_snapshot_id AND s.period_id = NEW.period_id AND s.status = 'IN_REVIEW') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Period control requires its review snapshot'; END IF;
  END$$
CREATE TRIGGER inventory_control_update BEFORE UPDATE ON inventory_period_controls FOR EACH ROW BEGIN
    IF NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.period_id <=> OLD.period_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Period control identity is fixed'; END IF;
    IF OLD.current_snapshot_id IS NOT NULL THEN
      IF NEW.current_snapshot_id IS NOT NULL OR NEW.pending_snapshot_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM inventory_reopen_periods l JOIN inventory_period_reopens r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.reopen_id WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.period_id = NEW.period_id AND l.snapshot_id = OLD.current_snapshot_id AND r.status = 'APPROVED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approved reopen required to invalidate a snapshot'; END IF;
    ELSEIF OLD.pending_snapshot_id IS NOT NULL THEN
      IF NEW.pending_snapshot_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE s.tenant_id = NEW.tenant_id AND s.legal_entity_id = NEW.legal_entity_id AND s.id = OLD.pending_snapshot_id AND ((s.status = 'APPROVED' AND NEW.current_snapshot_id = s.id) OR (s.status = 'REJECTED' AND NEW.current_snapshot_id IS NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Review decision required before changing control'; END IF;
    ELSEIF NEW.current_snapshot_id IS NOT NULL OR NEW.pending_snapshot_id IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE s.tenant_id = NEW.tenant_id AND s.legal_entity_id = NEW.legal_entity_id AND s.id = NEW.pending_snapshot_id AND s.period_id = NEW.period_id AND s.status = 'IN_REVIEW') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New review snapshot required'; END IF;
  END$$
CREATE TRIGGER inventory_period_controls_no_delete BEFORE DELETE ON inventory_period_controls FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER inventory_controlled_period_update BEFORE UPDATE ON inventory_periods FOR EACH ROW BEGIN
    IF EXISTS (SELECT 1 FROM inventory_period_controls c WHERE c.tenant_id = NEW.tenant_id AND c.legal_entity_id = NEW.legal_entity_id AND c.period_id = NEW.id) THEN
      IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.accounting_period_id <=> OLD.accounting_period_id) OR NOT EXISTS (SELECT 1 FROM inventory_period_controls c WHERE c.tenant_id = NEW.tenant_id AND c.legal_entity_id = NEW.legal_entity_id AND c.period_id = NEW.id
        AND ((NEW.status = 'OPEN' AND c.current_snapshot_id IS NULL AND c.pending_snapshot_id IS NULL)
          OR (NEW.status = 'IN_REVIEW' AND c.pending_snapshot_id IS NOT NULL)
          OR (NEW.status = 'CLOSED' AND c.current_snapshot_id IS NOT NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory status must match its approved workflow'; END IF;
    END IF;
  END$$
CREATE TRIGGER inventory_period_chronology BEFORE INSERT ON inventory_periods FOR EACH ROW BEGIN
    IF EXISTS (SELECT 1 FROM accounting_periods n JOIN accounting_periods a ON a.tenant_id = n.tenant_id AND a.legal_entity_id = n.legal_entity_id AND a.start_date > n.start_date
      JOIN inventory_periods p ON p.tenant_id = a.tenant_id AND p.legal_entity_id = a.legal_entity_id AND p.accounting_period_id = a.id
      JOIN inventory_period_controls c ON c.tenant_id = p.tenant_id AND c.legal_entity_id = p.legal_entity_id AND c.period_id = p.id
      WHERE n.tenant_id = NEW.tenant_id AND n.legal_entity_id = NEW.legal_entity_id AND n.id = NEW.accounting_period_id AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reopen later stock periods before inserting an earlier period'; END IF;
  END$$
CREATE TRIGGER inventory_reopen_insert BEFORE INSERT ON inventory_period_reopens FOR EACH ROW BEGIN
    IF NEW.status <> 'REQUESTED' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reopen must begin as a request'; END IF;
  END$$
CREATE TRIGGER inventory_reopen_transition BEFORE UPDATE ON inventory_period_reopens FOR EACH ROW BEGIN
    IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.tenant_id <=> OLD.tenant_id) OR NOT (NEW.legal_entity_id <=> OLD.legal_entity_id) OR NOT (NEW.period_id <=> OLD.period_id) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.requested_by <=> OLD.requested_by) OR NOT (NEW.requested_at <=> OLD.requested_at) OR OLD.status <> 'REQUESTED' OR NEW.status NOT IN ('APPROVED','REJECTED')
      OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL OR (NEW.status = 'APPROVED' AND NEW.reviewed_by = NEW.requested_by)
      OR NOT EXISTS (SELECT 1 FROM inventory_reopen_periods l WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.reopen_id = NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reopen requires retained dependents and independent approval'; END IF;
  END$$
CREATE TRIGGER inventory_period_reopens_no_delete BEFORE DELETE ON inventory_period_reopens FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER inventory_reopen_period_insert BEFORE INSERT ON inventory_reopen_periods FOR EACH ROW BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_period_reopens r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.reopen_id AND r.status = 'REQUESTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Dependent periods require a pending reopen request'; END IF;
  END$$
CREATE TRIGGER inventory_reopen_periods_no_update BEFORE UPDATE ON inventory_reopen_periods FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER inventory_reopen_periods_no_delete BEFORE DELETE ON inventory_reopen_periods FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock close history is immutable'; END$$
CREATE TRIGGER journal_inventory_close_guard BEFORE UPDATE ON journals FOR EACH ROW BEGIN
    IF NEW.status = 'POSTED' AND EXISTS (SELECT 1 FROM journal_lines l JOIN inventory_reconciliation_accounts m ON m.tenant_id = l.tenant_id AND m.legal_entity_id = l.legal_entity_id AND m.account_id = l.account_id WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.journal_id = NEW.id)
      AND EXISTS (SELECT 1 FROM inventory_period_controls c JOIN inventory_periods p ON p.tenant_id = c.tenant_id AND p.legal_entity_id = c.legal_entity_id AND p.id = c.period_id
        JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id WHERE c.tenant_id = NEW.tenant_id AND c.legal_entity_id = NEW.legal_entity_id AND a.end_date >= NEW.posting_date AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Mapped inventory journals are locked by stock review or close'; END IF;
  END$$
DELIMITER ;

-- PR-01/PR-02 complete. Extend for PR-03 purchasing in new forward migrations.
