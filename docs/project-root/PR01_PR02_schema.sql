-- NEW design baseline v17, revised 28 October 2026 for PR-06A KDV1/refund review.
-- Original referenced inputs were not supplied. User-authorized replacement.
-- REFERENCE ONLY: m004_product_foundation.js, m005_product_classification.js and
-- m006_inventory_foundation.js, m007_inventory_receipts.js and m008_inventory_reallocations.js and m009_inventory_reservations_issues.js and m010_inventory_period_close.js and m011_inventory_corrections.js and m012_purchasing_foundation.js and m013_purchase_invoice_staging.js and m014_purchase_receipts.js and m015_export_operations.js and m016_export_documents_customs.js and m017_vat_source_attribution.js and m018_vat_cost_allocation.js and m019_vat_refund_reconciliation.js are executable migrations. Requires m001/m002/m003.
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
    source_kind ENUM('TEST_FIXTURE','PURCHASE_INVOICE') NOT NULL,
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
    CONSTRAINT receipt_line_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value >= 0),
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
    CONSTRAINT layer_amount CHECK (quantity > 0 AND unit_cost >= 0 AND value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, receipt_line_id, sku_id) REFERENCES stock_receipt_lines(tenant_id, legal_entity_id, id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
 FOREIGN KEY (tenant_id, legal_entity_id, correction_id) REFERENCES inventory_corrections(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, reverses_event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id),
 CONSTRAINT event_source CHECK (
 (kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL AND issue_id IS NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL AND issue_id IS NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'ISSUE' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NOT NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'CORRECTION' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NULL AND correction_id IS NOT NULL)))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_physical_ledger (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY physical_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY physical_event_layer (tenant_id, legal_entity_id, event_id, layer_id),
    KEY physical_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value <> 0)),
    FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id), KEY movement_cursor (tenant_id, legal_entity_id, event_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pool_ledger (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    UNIQUE KEY pool_entry_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY pool_event_layer (tenant_id, legal_entity_id, event_id, layer_id, pool_id),
    KEY pool_layer (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value <> 0)),
    FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), FOREIGN KEY (tenant_id, legal_entity_id, event_id) REFERENCES inventory_events(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), KEY movement_cursor (tenant_id, legal_entity_id, event_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_balances (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id),
    CONSTRAINT physical_balance_nonnegative CHECK (quantity >= 0 AND value >= 0), FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id), CONSTRAINT inventory_balances_no_orphan CHECK (quantity > 0 OR value = 0))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_pool_balances (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id),
    CONSTRAINT pool_balance_nonnegative CHECK (quantity >= 0 AND value >= 0),
    FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id) REFERENCES inventory_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id), FOREIGN KEY (tenant_id, legal_entity_id, pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), CONSTRAINT inventory_pool_balances_no_orphan CHECK (quantity > 0 OR value = 0))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  FOREIGN KEY (tenant_id, executed_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reallocation_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NULL,
  UNIQUE KEY reallocation_line_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY reallocation_line_number (tenant_id, legal_entity_id, request_id, line_number),
  UNIQUE KEY reallocation_line_layer (tenant_id, legal_entity_id, request_id, layer_id),
  CONSTRAINT reallocation_line_amount CHECK (quantity > 0 AND (value IS NULL OR value >= 0)),
  FOREIGN KEY (tenant_id, legal_entity_id, request_id) REFERENCES inventory_reallocations(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, layer_id, warehouse_id, sku_id) REFERENCES inventory_layers(tenant_id, legal_entity_id, id, warehouse_id, sku_id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  warehouse_id CHAR(36) NOT NULL, destination_pool_id CHAR(36) NOT NULL,
  reservation_date DATE NOT NULL, period_id CHAR(36) NOT NULL, reason VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','ACTIVE','CLOSED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY reservation_scope (tenant_id, legal_entity_id, id), UNIQUE KEY reservation_reference (tenant_id, legal_entity_id, reference),
  KEY reservation_status (tenant_id, legal_entity_id, status, created_at, id),
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, destination_pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES inventory_periods(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
  reservation_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL,
  UNIQUE KEY reservation_line_scope (tenant_id, legal_entity_id, id), UNIQUE KEY reservation_line_number (tenant_id, legal_entity_id, reservation_id, line_number),
  UNIQUE KEY reservation_line_grain (tenant_id, legal_entity_id, id, reservation_id, sku_id),
  CONSTRAINT reservation_line_amount CHECK (quantity > 0),
  FOREIGN KEY (tenant_id, legal_entity_id, reservation_id) REFERENCES inventory_reservations(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id) REFERENCES inventory_pool_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_releases (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reservation_id CHAR(36) NOT NULL,
  kind ENUM('RELEASE','CANCEL') NOT NULL, reason VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY reservation_release_scope (tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, reservation_id) REFERENCES inventory_reservations(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation_release_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, release_id CHAR(36) NOT NULL,
  allocation_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL,
  UNIQUE KEY reservation_release_line_scope (tenant_id, legal_entity_id, id), UNIQUE KEY release_allocation (tenant_id, legal_entity_id, release_id, allocation_id),
  CONSTRAINT release_line_amount CHECK (quantity > 0), FOREIGN KEY (tenant_id, legal_entity_id, release_id) REFERENCES inventory_reservation_releases(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, allocation_id) REFERENCES inventory_reservation_allocations(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_issue_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, issue_id CHAR(36) NOT NULL,
  allocation_id CHAR(36) NOT NULL, reservation_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
  warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
  UNIQUE KEY issue_line_scope (tenant_id, legal_entity_id, id), UNIQUE KEY issue_line_number (tenant_id, legal_entity_id, issue_id, line_number),
  UNIQUE KEY issue_allocation (tenant_id, legal_entity_id, issue_id, allocation_id),
  CONSTRAINT issue_line_amount CHECK (quantity > 0 AND value >= 0), FOREIGN KEY (tenant_id, legal_entity_id, issue_id) REFERENCES inventory_issues(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, allocation_id, reservation_id, warehouse_id, sku_id, layer_id, pool_id) REFERENCES inventory_reservation_allocations(tenant_id, legal_entity_id, id, reservation_id, warehouse_id, sku_id, layer_id, pool_id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  FOREIGN KEY (tenant_id, posted_by) REFERENCES users(tenant_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id) REFERENCES inventory_pool_balances(tenant_id, legal_entity_id, warehouse_id, sku_id, layer_id, pool_id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

-- PR-03A purchasing extension, m012. Reference only; no business seeds.

CREATE TABLE trading_partners (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL, name VARCHAR(160) NOT NULL,
    kind ENUM('SUPPLIER','CUSTOMER','BOTH') NOT NULL,
    supplier_id CHAR(36) NULL,
    country_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tax_identifier VARCHAR(40) NULL, tax_office VARCHAR(160) NOT NULL,
    address VARCHAR(1000) NOT NULL, email VARCHAR(254) NOT NULL, phone VARCHAR(80) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY partner_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY partner_code (tenant_id, legal_entity_id, code),
    UNIQUE KEY partner_supplier (tenant_id, legal_entity_id, supplier_id),
    UNIQUE KEY partner_tax (tenant_id, legal_entity_id, country_code, tax_identifier),
    CONSTRAINT partner_active CHECK (active IN (0,1)),
    CONSTRAINT partner_supplier_kind CHECK ((kind = 'CUSTOMER' AND supplier_id IS NULL) OR (kind IN ('SUPPLIER','BOTH') AND supplier_id IS NOT NULL)),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, supplier_id) REFERENCES product_suppliers(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchasing_documents (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    kind ENUM('CONTRACT','REQUEST','ORDER') NOT NULL,
    reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_date DATE NOT NULL, required_by DATE NULL, valid_from DATE NULL, valid_to DATE NULL,
    partner_id CHAR(36) NULL, request_id CHAR(36) NULL, contract_id CHAR(36) NULL,
    partner_snapshot JSON NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
    purpose VARCHAR(1000) NOT NULL, terms VARCHAR(2000) NOT NULL, ebys_reference VARCHAR(160) NOT NULL,
    line_count INT UNSIGNED NOT NULL, net_total DECIMAL(20,6) NOT NULL,
    status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING',
    created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME NULL, review_reason VARCHAR(1000) NULL,
    cancelled_by CHAR(36) NULL, cancelled_at DATETIME NULL, cancel_reason VARCHAR(1000) NULL,
    UNIQUE KEY purchasing_document_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY purchasing_document_reference (tenant_id, legal_entity_id, kind, reference),
    KEY purchasing_document_list (tenant_id, legal_entity_id, kind, status, document_date, id),
    KEY purchasing_request_orders (tenant_id, legal_entity_id, request_id, status),
    KEY purchasing_contract_orders (tenant_id, legal_entity_id, contract_id, status),
    CONSTRAINT purchasing_amount CHECK (net_total >= 0),
    CONSTRAINT purchasing_shape CHECK (
      (kind = 'CONTRACT' AND partner_id IS NOT NULL AND partner_snapshot IS NOT NULL AND currency IS NOT NULL AND valid_from IS NOT NULL AND valid_to IS NOT NULL AND valid_from <= valid_to AND required_by IS NULL AND request_id IS NULL AND contract_id IS NULL AND line_count = 0 AND net_total = 0) OR
      (kind = 'REQUEST' AND partner_id IS NULL AND partner_snapshot IS NULL AND currency IS NULL AND valid_from IS NULL AND valid_to IS NULL AND required_by IS NOT NULL AND required_by >= document_date AND request_id IS NULL AND contract_id IS NULL AND line_count > 0 AND net_total = 0) OR
      (kind = 'ORDER' AND partner_id IS NOT NULL AND partner_snapshot IS NOT NULL AND currency IS NOT NULL AND valid_from IS NULL AND valid_to IS NULL AND required_by IS NOT NULL AND required_by >= document_date AND request_id IS NOT NULL AND line_count > 0)),
    CONSTRAINT purchasing_review CHECK ((reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL)),
    CONSTRAINT purchasing_cancel CHECK ((cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL) OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)),
    CONSTRAINT purchasing_independent CHECK (status <> 'APPROVED' OR (reviewed_by IS NOT NULL AND reviewed_by <> created_by)),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, partner_id) REFERENCES trading_partners(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, request_id) REFERENCES purchasing_documents(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, contract_id) REFERENCES purchasing_documents(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, cancelled_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_request_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    request_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
    line_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sku_id CHAR(36) NOT NULL, unit_id CHAR(36) NOT NULL, sku_snapshot JSON NOT NULL,
    description VARCHAR(255) NOT NULL, quantity DECIMAL(20,6) NOT NULL,
    UNIQUE KEY purchase_request_line_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY purchase_request_line_number (tenant_id, legal_entity_id, request_id, line_number),
    UNIQUE KEY purchase_request_line_key (tenant_id, legal_entity_id, request_id, line_key),
    CONSTRAINT purchase_request_quantity CHECK (quantity > 0 AND line_number > 0),
    FOREIGN KEY (tenant_id, legal_entity_id, request_id) REFERENCES purchasing_documents(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, unit_id) REFERENCES unit_of_measure(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_order_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    order_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, request_line_id CHAR(36) NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, unit_price DECIMAL(20,6) NOT NULL, net_amount DECIMAL(20,6) NOT NULL,
    free_reason VARCHAR(255) NULL,
    UNIQUE KEY purchase_order_line_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY purchase_order_line_number (tenant_id, legal_entity_id, order_id, line_number),
    UNIQUE KEY purchase_order_source (tenant_id, legal_entity_id, order_id, request_line_id),
    KEY purchase_order_commitment (tenant_id, legal_entity_id, request_line_id, order_id),
    CONSTRAINT purchase_order_amount CHECK (quantity > 0 AND unit_price >= 0 AND net_amount >= 0 AND line_number > 0 AND net_amount = ROUND(quantity * unit_price,6)),
    CONSTRAINT purchase_order_free CHECK ((unit_price = 0 AND free_reason IS NOT NULL AND CHAR_LENGTH(TRIM(free_reason)) > 0) OR (unit_price > 0 AND free_reason IS NULL)),
    FOREIGN KEY (tenant_id, legal_entity_id, order_id) REFERENCES purchasing_documents(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, request_line_id) REFERENCES purchase_request_lines(tenant_id, legal_entity_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER trading_partner_identity BEFORE UPDATE ON trading_partners FOR EACH ROW BEGIN IF NOT ((NEW.id <=> OLD.id) AND (NEW.tenant_id <=> OLD.tenant_id) AND (NEW.legal_entity_id <=> OLD.legal_entity_id) AND (NEW.code <=> OLD.code) AND (NEW.kind <=> OLD.kind) AND (NEW.supplier_id <=> OLD.supplier_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Partner identity is immutable'; END IF; END$$

CREATE TRIGGER purchasing_document_insert BEFORE INSERT ON purchasing_documents FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id FOR UPDATE;
    IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.cancelled_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Documents start unreviewed and assembling'; END IF;

  IF NEW.kind IN ('CONTRACT','ORDER') AND NOT EXISTS (SELECT 1 FROM trading_partners p JOIN product_suppliers s ON s.tenant_id=p.tenant_id AND s.legal_entity_id=p.legal_entity_id AND s.id=p.supplier_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.partner_id AND p.active=1 AND s.active=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchasing requires an active supplier partner'; END IF;
  IF NEW.kind='ORDER' AND NOT EXISTS (SELECT 1 FROM purchasing_documents r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.request_id AND r.kind='REQUEST' AND r.status='APPROVED' AND r.document_date<=NEW.document_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order requires an approved prior purchase request'; END IF;
  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchasing_documents c WHERE c.tenant_id=NEW.tenant_id AND c.legal_entity_id=NEW.legal_entity_id AND c.id=NEW.contract_id AND c.kind='CONTRACT' AND c.status='APPROVED' AND c.partner_id=NEW.partner_id AND c.currency=NEW.currency AND NEW.document_date BETWEEN c.valid_from AND c.valid_to AND c.document_date<=NEW.document_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order contract must match supplier currency and dates'; END IF; END$$

CREATE TRIGGER purchasing_document_update BEFORE UPDATE ON purchasing_documents FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id FOR UPDATE;
    IF NOT ((NEW.id <=> OLD.id) AND (NEW.tenant_id <=> OLD.tenant_id) AND (NEW.legal_entity_id <=> OLD.legal_entity_id) AND (NEW.kind <=> OLD.kind) AND (NEW.reference <=> OLD.reference) AND (NEW.document_date <=> OLD.document_date) AND (NEW.required_by <=> OLD.required_by) AND (NEW.valid_from <=> OLD.valid_from) AND (NEW.valid_to <=> OLD.valid_to) AND (NEW.partner_id <=> OLD.partner_id) AND (NEW.request_id <=> OLD.request_id) AND (NEW.contract_id <=> OLD.contract_id) AND (NEW.partner_snapshot <=> OLD.partner_snapshot) AND (NEW.currency <=> OLD.currency) AND (NEW.purpose <=> OLD.purpose) AND (NEW.terms <=> OLD.terms) AND (NEW.ebys_reference <=> OLD.ebys_reference) AND (NEW.line_count <=> OLD.line_count) AND (NEW.net_total <=> OLD.net_total) AND (NEW.created_by <=> OLD.created_by) AND (NEW.created_at <=> OLD.created_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submitted purchasing content is immutable'; END IF;
    IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status IN ('REQUESTED','APPROVED') AND NEW.status='CANCELLED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid purchasing transition'; END IF;
    IF NEW.status IN ('APPROVED','REJECTED') THEN
      IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 OR (NEW.status='APPROVED' AND NEW.reviewed_by=OLD.created_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Independent approval and review evidence required'; END IF;
    ELSEIF NOT ((NEW.reviewed_by <=> OLD.reviewed_by) AND (NEW.reviewed_at <=> OLD.reviewed_at) AND (NEW.review_reason <=> OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Review history is immutable'; END IF;
    IF NEW.status='CANCELLED' THEN
      IF NEW.cancelled_by<>OLD.created_by OR NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only requester may cancel with a reason'; END IF;
      IF EXISTS (SELECT 1 FROM purchasing_documents o WHERE o.tenant_id=OLD.tenant_id AND o.legal_entity_id=OLD.legal_entity_id AND (o.request_id=OLD.id OR o.contract_id=OLD.id) AND o.status IN ('ASSEMBLING','REQUESTED','APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancel dependent orders first'; END IF;
    ELSEIF NOT ((NEW.cancelled_by <=> OLD.cancelled_by) AND (NEW.cancelled_at <=> OLD.cancelled_at) AND (NEW.cancel_reason <=> OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation history is immutable'; END IF;
    IF NEW.status IN ('REQUESTED','APPROVED') THEN

  IF NEW.kind IN ('CONTRACT','ORDER') AND NOT EXISTS (SELECT 1 FROM trading_partners p JOIN product_suppliers s ON s.tenant_id=p.tenant_id AND s.legal_entity_id=p.legal_entity_id AND s.id=p.supplier_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.partner_id AND p.active=1 AND s.active=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchasing requires an active supplier partner'; END IF;
  IF NEW.kind='ORDER' AND NOT EXISTS (SELECT 1 FROM purchasing_documents r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.request_id AND r.kind='REQUEST' AND r.status='APPROVED' AND r.document_date<=NEW.document_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order requires an approved prior purchase request'; END IF;
  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchasing_documents c WHERE c.tenant_id=NEW.tenant_id AND c.legal_entity_id=NEW.legal_entity_id AND c.id=NEW.contract_id AND c.kind='CONTRACT' AND c.status='APPROVED' AND c.partner_id=NEW.partner_id AND c.currency=NEW.currency AND NEW.document_date BETWEEN c.valid_from AND c.valid_to AND c.document_date<=NEW.document_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order contract must match supplier currency and dates'; END IF;
      IF NEW.kind='REQUEST' AND NEW.line_count<>(SELECT COUNT(*) FROM purchase_request_lines l WHERE l.request_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request lines are incomplete'; END IF;
      IF NEW.kind='ORDER' AND (NEW.line_count<>(SELECT COUNT(*) FROM purchase_order_lines l WHERE l.order_id=NEW.id) OR NEW.net_total<>(SELECT COALESCE(SUM(net_amount),0) FROM purchase_order_lines l WHERE l.order_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order lines and totals must match'; END IF;
      IF EXISTS (SELECT 1 FROM purchase_request_lines l JOIN product_skus s ON s.id=l.sku_id JOIN product_families f ON f.id=s.family_id JOIN unit_of_measure u ON u.id=l.unit_id WHERE l.request_id=COALESCE(NEW.request_id,NEW.id) AND (NEW.kind='REQUEST' OR EXISTS (SELECT 1 FROM purchase_order_lines ol WHERE ol.order_id=NEW.id AND ol.request_line_id=l.id)) AND (s.active=0 OR f.active=0 OR u.active=0 OR s.base_unit_id<>l.unit_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchasing references must stay active and in base units'; END IF;
    END IF; END$$

CREATE TRIGGER purchase_request_line_insert BEFORE INSERT ON purchase_request_lines FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM purchasing_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.request_id AND d.kind='REQUEST' AND d.status='ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request lines require an assembling request'; END IF;
    IF NOT EXISTS (SELECT 1 FROM product_skus s JOIN unit_of_measure u ON u.id=s.base_unit_id JOIN product_families f ON f.id=s.family_id WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.id=NEW.sku_id AND s.base_unit_id=NEW.unit_id AND s.active=1 AND u.active=1 AND f.active=1 AND NEW.quantity=ROUND(NEW.quantity,u.quantity_precision)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request quantity must use active SKU base-unit precision'; END IF; END$$

CREATE TRIGGER purchase_order_line_insert BEFORE INSERT ON purchase_order_lines FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM purchasing_documents d JOIN purchase_request_lines l ON l.tenant_id=d.tenant_id AND l.legal_entity_id=d.legal_entity_id AND l.request_id=d.request_id JOIN purchasing_documents r ON r.id=l.request_id JOIN unit_of_measure u ON u.id=l.unit_id WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.order_id AND d.kind='ORDER' AND d.status='ASSEMBLING' AND l.id=NEW.request_line_id AND r.status='APPROVED' AND NEW.quantity=ROUND(NEW.quantity,u.quantity_precision)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order source must belong to its approved request'; END IF;
    IF NEW.quantity+(SELECT COALESCE(SUM(l.quantity),0) FROM purchase_order_lines l JOIN purchasing_documents d ON d.id=l.order_id WHERE l.tenant_id=NEW.tenant_id AND l.legal_entity_id=NEW.legal_entity_id AND l.request_line_id=NEW.request_line_id AND d.status IN ('ASSEMBLING','REQUESTED','APPROVED'))>(SELECT quantity FROM purchase_request_lines WHERE id=NEW.request_line_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order exceeds uncommitted request quantity'; END IF; END$$

CREATE TRIGGER trading_partners_no_delete BEFORE DELETE ON trading_partners FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Retain purchasing history; cancel instead'; END$$

CREATE TRIGGER purchasing_documents_no_delete BEFORE DELETE ON purchasing_documents FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Retain purchasing history; cancel instead'; END$$

CREATE TRIGGER purchase_request_lines_no_delete BEFORE DELETE ON purchase_request_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Retain purchasing history; cancel instead'; END$$

CREATE TRIGGER purchase_order_lines_no_delete BEFORE DELETE ON purchase_order_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Retain purchasing history; cancel instead'; END$$

CREATE TRIGGER purchase_request_lines_no_update BEFORE UPDATE ON purchase_request_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchasing source lines are immutable'; END$$

CREATE TRIGGER purchase_order_lines_no_update BEFORE UPDATE ON purchase_order_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchasing source lines are immutable'; END$$
DELIMITER ;

-- PR-03B incoming invoice staging, m013. Reference only; no real imports/seeds.

CREATE TABLE purchase_invoice_settings (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    receiver_scheme ENUM('VKN','TCKN') NOT NULL, receiver_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY invoice_settings_scope (tenant_id,legal_entity_id,id), UNIQUE KEY invoice_settings_entity (tenant_id,legal_entity_id),
    CONSTRAINT invoice_receiver_format CHECK ((receiver_scheme='VKN' AND receiver_tax_id REGEXP '^[0-9]{10}$') OR (receiver_scheme='TCKN' AND receiver_tax_id REGEXP '^[0-9]{11}$')),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id), FOREIGN KEY (tenant_id, updated_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_invoices (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL,
    uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    invoice_number VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    issue_date DATE NOT NULL, currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    profile VARCHAR(40) NOT NULL, invoice_type VARCHAR(40) NOT NULL,
    supplier_scheme ENUM('VKN','TCKN') NOT NULL, supplier_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    supplier_name VARCHAR(160) NOT NULL, receiver_scheme ENUM('VKN','TCKN') NOT NULL, receiver_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    receiver_name VARCHAR(160) NOT NULL, file_name VARCHAR(160) NOT NULL, evidence VARCHAR(1000) NOT NULL,
    raw_xml MEDIUMTEXT NOT NULL, xml_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, parsed_header JSON NOT NULL,
    line_count INT UNSIGNED NOT NULL, net_total DECIMAL(20,6) NOT NULL, vat_total DECIMAL(20,6) NOT NULL,
    gross_total DECIMAL(20,6) NOT NULL, payable_total DECIMAL(20,6) NOT NULL,
    status ENUM('ASSEMBLING','STAGED','REQUESTED','READY','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING',
    revision INT UNSIGNED NOT NULL DEFAULT 0,
    imported_by CHAR(36) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_by CHAR(36) NULL, submitted_at DATETIME NULL, review_context JSON NULL,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME NULL, review_reason VARCHAR(1000) NULL,
    cancelled_by CHAR(36) NULL, cancelled_at DATETIME NULL, cancel_reason VARCHAR(1000) NULL,
    UNIQUE KEY purchase_invoice_scope (tenant_id,legal_entity_id,id),
    UNIQUE KEY purchase_invoice_uuid (tenant_id,legal_entity_id,uuid),
    UNIQUE KEY purchase_invoice_number (tenant_id,legal_entity_id,supplier_scheme,supplier_tax_id,invoice_number),
    KEY purchase_invoice_list (tenant_id,legal_entity_id,status,issue_date,id),
    CONSTRAINT invoice_source_amounts CHECK (line_count>0 AND net_total>=0 AND vat_total>=0 AND gross_total>=0 AND payable_total>=0),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id),FOREIGN KEY (tenant_id, imported_by) REFERENCES users(tenant_id, id),FOREIGN KEY (tenant_id, submitted_by) REFERENCES users(tenant_id, id),FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),FOREIGN KEY (tenant_id, cancelled_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_invoice_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL,
    line_number INT UNSIGNED NOT NULL, line_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    supplier_code VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    description VARCHAR(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    quantity DECIMAL(20,6) NOT NULL, unit_code VARCHAR(16) NOT NULL, unit_price VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount_scale INT UNSIGNED NOT NULL,
    price_base_quantity DECIMAL(20,6) NOT NULL, net_amount DECIMAL(20,6) NOT NULL, vat_amount DECIMAL(20,6) NOT NULL,
    taxes JSON NOT NULL, source_json JSON NOT NULL,
    UNIQUE KEY invoice_line_scope (tenant_id,legal_entity_id,id),
    UNIQUE KEY invoice_line_number (tenant_id,legal_entity_id,invoice_id,line_number),
    UNIQUE KEY invoice_line_source (tenant_id,legal_entity_id,invoice_id,line_key),
    CONSTRAINT invoice_line_amount CHECK (line_number>0 AND quantity>0 AND price_base_quantity>0 AND unit_price REGEXP '^(0|[1-9][0-9]{0,13})([.][0-9]{1,18})?$' AND amount_scale<=6 AND net_amount>=0 AND vat_amount>=0),
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_id) REFERENCES purchase_invoices(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_invoice_plans (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
    partner_id CHAR(36) NOT NULL, order_id CHAR(36) NULL, line_count INT UNSIGNED NOT NULL,
    reason VARCHAR(1000) NOT NULL, created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY invoice_plan_scope (tenant_id,legal_entity_id,id), UNIQUE KEY invoice_plan_revision (tenant_id,legal_entity_id,invoice_id,revision),
    KEY invoice_plan_order (tenant_id,legal_entity_id,order_id,invoice_id),
    CONSTRAINT invoice_plan_positive CHECK (revision>0),
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_id) REFERENCES purchase_invoices(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,partner_id) REFERENCES trading_partners(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,order_id) REFERENCES purchasing_documents(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_invoice_mappings (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, plan_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL,
    sku_id CHAR(36) NOT NULL, order_line_id CHAR(36) NULL, unit_confirmed BOOLEAN NOT NULL,
    free_reason VARCHAR(255) NULL, basis ENUM('MANUAL','VERIFIED_ALIAS') NOT NULL, alias_id CHAR(36) NULL,
    UNIQUE KEY invoice_mapping_scope (tenant_id,legal_entity_id,id), UNIQUE KEY invoice_mapping_source (tenant_id,legal_entity_id,plan_id,invoice_line_id),
    KEY invoice_mapping_order (tenant_id,legal_entity_id,order_line_id,plan_id),
    CONSTRAINT invoice_mapping_basis CHECK ((basis='MANUAL' AND alias_id IS NULL) OR (basis='VERIFIED_ALIAS' AND alias_id IS NOT NULL)),
    CONSTRAINT invoice_mapping_unit CHECK (unit_confirmed IN (0,1)),
    FOREIGN KEY (tenant_id,legal_entity_id,plan_id) REFERENCES purchase_invoice_plans(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_line_id) REFERENCES purchase_invoice_lines(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,sku_id) REFERENCES product_skus(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,order_line_id) REFERENCES purchase_order_lines(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,alias_id) REFERENCES product_aliases(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_invoice_decisions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL,
    action ENUM('SUBMIT','APPROVE','REJECT','CANCEL','REOPEN') NOT NULL, revision INT UNSIGNED NOT NULL, sequence_number INT UNSIGNED NOT NULL,
    actor_id CHAR(36) NOT NULL, reason VARCHAR(1000) NOT NULL, context JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY invoice_decision_scope (tenant_id,legal_entity_id,id),
    UNIQUE KEY invoice_decision_sequence (tenant_id,legal_entity_id,invoice_id,sequence_number),
    KEY invoice_decision_history (tenant_id,legal_entity_id,invoice_id,created_at,id),
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_id) REFERENCES purchase_invoices(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER purchase_invoice_insert BEFORE INSERT ON purchase_invoices FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE; IF NEW.status<>'ASSEMBLING' OR NEW.revision<>0 OR NEW.submitted_by IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.review_context IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice starts unreviewed and assembling'; END IF; END$$

CREATE TRIGGER purchase_invoice_update BEFORE UPDATE ON purchase_invoices FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE;
    IF NOT ((NEW.id <=> OLD.id) AND (NEW.tenant_id <=> OLD.tenant_id) AND (NEW.legal_entity_id <=> OLD.legal_entity_id) AND (NEW.uuid <=> OLD.uuid) AND (NEW.invoice_number <=> OLD.invoice_number) AND (NEW.issue_date <=> OLD.issue_date) AND (NEW.currency <=> OLD.currency) AND (NEW.profile <=> OLD.profile) AND (NEW.invoice_type <=> OLD.invoice_type) AND (NEW.supplier_scheme <=> OLD.supplier_scheme) AND (NEW.supplier_tax_id <=> OLD.supplier_tax_id) AND (NEW.supplier_name <=> OLD.supplier_name) AND (NEW.receiver_scheme <=> OLD.receiver_scheme) AND (NEW.receiver_tax_id <=> OLD.receiver_tax_id) AND (NEW.receiver_name <=> OLD.receiver_name) AND (NEW.file_name <=> OLD.file_name) AND (NEW.evidence <=> OLD.evidence) AND (NEW.raw_xml <=> OLD.raw_xml) AND (NEW.xml_hash <=> OLD.xml_hash) AND (NEW.parsed_header <=> OLD.parsed_header) AND (NEW.line_count <=> OLD.line_count) AND (NEW.net_total <=> OLD.net_total) AND (NEW.vat_total <=> OLD.vat_total) AND (NEW.gross_total <=> OLD.gross_total) AND (NEW.payable_total <=> OLD.payable_total) AND (NEW.imported_by <=> OLD.imported_by) AND (NEW.imported_at <=> OLD.imported_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Imported invoice source is immutable'; END IF;
    IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='STAGED' AND NEW.revision=0) OR (OLD.status='STAGED' AND NEW.status='STAGED' AND NEW.revision=OLD.revision+1) OR (OLD.status='STAGED' AND NEW.status='REQUESTED' AND NEW.revision=OLD.revision) OR (OLD.status='REQUESTED' AND NEW.status IN ('READY','REJECTED') AND NEW.revision=OLD.revision) OR (OLD.status IN ('STAGED','REQUESTED','READY') AND NEW.status='CANCELLED' AND NEW.revision=OLD.revision) OR (OLD.status IN ('REQUESTED','READY','REJECTED') AND NEW.status='STAGED' AND NEW.revision=OLD.revision)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid invoice workflow transition'; END IF;
    IF OLD.status IN ('REQUESTED','READY','REJECTED') AND NEW.status='STAGED' THEN
      IF NEW.submitted_by IS NOT NULL OR NEW.submitted_at IS NOT NULL OR NEW.review_context IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL OR NOT EXISTS (SELECT 1 FROM purchase_invoice_decisions e WHERE e.invoice_id=NEW.id AND e.revision=NEW.revision AND e.action='REOPEN' AND e.sequence_number=(SELECT MAX(sequence_number) FROM purchase_invoice_decisions WHERE invoice_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reopen requires retained decision and cleared current review'; END IF;
    ELSE
    IF OLD.status='ASSEMBLING' AND NEW.line_count<>(SELECT COUNT(*) FROM purchase_invoice_lines WHERE invoice_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice source lines incomplete'; END IF;
    IF NEW.revision<>OLD.revision AND NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.line_count=(SELECT COUNT(*) FROM purchase_invoice_mappings m WHERE m.plan_id=p.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice mapping plan incomplete'; END IF;
    IF NEW.status='REQUESTED' AND OLD.status='STAGED' THEN
      IF NEW.revision=0 OR NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL OR NEW.review_context IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Complete matching review context required'; END IF;
      IF NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchasing_documents d ON d.id=p.order_id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.line_count=NEW.line_count AND d.kind='ORDER' AND d.status='APPROVED' AND d.partner_id=p.partner_id AND d.currency=NEW.currency) OR EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_invoice_mappings m ON m.plan_id=p.id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND m.order_line_id IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Complete approved-order matching required'; END IF;
      IF EXISTS (SELECT m.order_line_id FROM purchase_invoices i JOIN purchase_invoice_plans p ON p.invoice_id=i.id AND p.revision=i.revision JOIN purchase_invoice_mappings m ON m.plan_id=p.id JOIN purchase_invoice_lines l ON l.id=m.invoice_line_id JOIN purchase_order_lines ol ON ol.id=m.order_line_id WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND (i.status IN ('REQUESTED','READY') OR i.id=NEW.id) GROUP BY m.order_line_id HAVING SUM(l.quantity)>MAX(ol.quantity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice matching exceeds ordered quantity'; END IF;
    ELSEIF NOT ((NEW.submitted_by <=> OLD.submitted_by) AND (NEW.submitted_at <=> OLD.submitted_at) AND (NEW.review_context <=> OLD.review_context)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice submission evidence is immutable'; END IF;
    IF NEW.status IN ('READY','REJECTED') AND OLD.status='REQUESTED' THEN
      IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice review evidence required'; END IF;
      IF NEW.status='READY' AND (NEW.reviewed_by IN (OLD.imported_by,OLD.submitted_by) OR EXISTS (SELECT 1 FROM purchase_invoice_plans p WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.created_by=NEW.reviewed_by)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent invoice reviewer required'; END IF;
    ELSEIF NOT ((NEW.reviewed_by <=> OLD.reviewed_by) AND (NEW.reviewed_at <=> OLD.reviewed_at) AND (NEW.review_reason <=> OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice review history is immutable'; END IF;
    IF NEW.status='CANCELLED' THEN
      IF NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice cancellation evidence required'; END IF;
    ELSEIF NOT ((NEW.cancelled_by <=> OLD.cancelled_by) AND (NEW.cancelled_at <=> OLD.cancelled_at) AND (NEW.cancel_reason <=> OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice cancellation history is immutable'; END IF;
    END IF;
    END$$

CREATE TRIGGER purchase_invoice_line_insert BEFORE INSERT ON purchase_invoice_lines FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE; IF NOT EXISTS (SELECT 1 FROM purchase_invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id AND legal_entity_id=NEW.legal_entity_id AND status='ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Source lines require an assembling invoice'; END IF; END$$

CREATE TRIGGER purchase_invoice_plan_insert BEFORE INSERT ON purchase_invoice_plans FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE; IF NOT EXISTS (SELECT 1 FROM purchase_invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id AND legal_entity_id=NEW.legal_entity_id AND status='STAGED' AND revision+1=NEW.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only staged invoice accepts next mapping revision'; END IF; END$$

CREATE TRIGGER purchase_invoice_mapping_insert BEFORE INSERT ON purchase_invoice_mappings FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_invoices i ON i.id=p.invoice_id JOIN purchase_invoice_lines l ON l.invoice_id=i.id WHERE p.id=NEW.plan_id AND p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND i.status='STAGED' AND i.revision+1=p.revision AND l.id=NEW.invoice_line_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Mapping source must belong to its next invoice plan'; END IF;
    IF NEW.order_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_order_lines ol ON ol.order_id=p.order_id JOIN purchase_request_lines r ON r.id=ol.request_line_id WHERE p.id=NEW.plan_id AND ol.id=NEW.order_line_id AND ol.tenant_id=NEW.tenant_id AND ol.legal_entity_id=NEW.legal_entity_id AND r.sku_id=NEW.sku_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Mapped order line and SKU must match selected order'; END IF;
    END$$

CREATE TRIGGER purchase_order_invoice_dependency BEFORE UPDATE ON purchasing_documents FOR EACH ROW BEGIN IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_invoices i ON i.id=p.invoice_id AND i.revision=p.revision WHERE p.order_id=OLD.id AND i.status IN ('REQUESTED','READY')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel linked invoice matching before cancelling order'; END IF; END$$

CREATE TRIGGER purchase_invoice_decision_insert BEFORE INSERT ON purchase_invoice_decisions FOR EACH ROW BEGIN DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE; IF CHAR_LENGTH(TRIM(NEW.reason))=0 OR NOT EXISTS (SELECT 1 FROM purchase_invoices i WHERE i.id=NEW.invoice_id AND i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.revision=NEW.revision AND ((NEW.action='SUBMIT' AND i.status='STAGED') OR (NEW.action IN ('APPROVE','REJECT') AND i.status='REQUESTED') OR (NEW.action='CANCEL' AND i.status IN ('STAGED','REQUESTED','READY')) OR (NEW.action='REOPEN' AND i.status IN ('REQUESTED','READY','REJECTED')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice decision must match current workflow'; END IF; END$$

CREATE TRIGGER purchase_invoices_no_delete BEFORE DELETE ON purchase_invoices FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice source and matching history'; END$$

CREATE TRIGGER purchase_invoice_lines_no_delete BEFORE DELETE ON purchase_invoice_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice source and matching history'; END$$

CREATE TRIGGER purchase_invoice_plans_no_delete BEFORE DELETE ON purchase_invoice_plans FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice source and matching history'; END$$

CREATE TRIGGER purchase_invoice_mappings_no_delete BEFORE DELETE ON purchase_invoice_mappings FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice source and matching history'; END$$

CREATE TRIGGER purchase_invoice_decisions_no_delete BEFORE DELETE ON purchase_invoice_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice source and matching history'; END$$

CREATE TRIGGER purchase_invoice_lines_no_update BEFORE UPDATE ON purchase_invoice_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice source and mapping revisions are immutable'; END$$

CREATE TRIGGER purchase_invoice_plans_no_update BEFORE UPDATE ON purchase_invoice_plans FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice source and mapping revisions are immutable'; END$$

CREATE TRIGGER purchase_invoice_mappings_no_update BEFORE UPDATE ON purchase_invoice_mappings FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice source and mapping revisions are immutable'; END$$

CREATE TRIGGER purchase_invoice_decisions_no_update BEFORE UPDATE ON purchase_invoice_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice source and mapping revisions are immutable'; END$$
DELIMITER ;

-- PR-03C final-state additions and evolved inventory/posting guards.
CREATE TABLE purchase_posting_settings (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, policy JSON NOT NULL, updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, legal_entity_id), FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id,id), FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_invoice_resolutions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
  context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, proposal JSON NOT NULL,
  reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, status ENUM('REQUESTED','APPROVED','REJECTED') NOT NULL DEFAULT 'REQUESTED',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
  UNIQUE KEY resolution_scope (tenant_id,legal_entity_id,id), KEY resolution_invoice (tenant_id,legal_entity_id,invoice_id,requested_at,id),
  FOREIGN KEY (tenant_id, legal_entity_id, invoice_id) REFERENCES purchase_invoices(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_receipts (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL, active_invoice_id CHAR(36) NULL,
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan JSON NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','REQUESTED','APPROVED','POSTING','POSTED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING',
  stock_receipt_id CHAR(36) NULL, journal_id CHAR(36) NULL,
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, posted_by CHAR(36) NULL, posted_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
  UNIQUE KEY purchase_receipt_scope (tenant_id,legal_entity_id,id), UNIQUE KEY purchase_receipt_reference (tenant_id,legal_entity_id,reference),
  UNIQUE KEY purchase_receipt_invoice (tenant_id,legal_entity_id,active_invoice_id), UNIQUE KEY purchase_receipt_stock (tenant_id,legal_entity_id,stock_receipt_id),
  UNIQUE KEY purchase_receipt_journal (tenant_id,legal_entity_id,journal_id), KEY purchase_receipt_status (tenant_id,legal_entity_id,status,requested_at,id),
  CONSTRAINT purchase_receipt_active CHECK ((status IN ('REJECTED','CANCELLED') AND active_invoice_id IS NULL) OR (status NOT IN ('REJECTED','CANCELLED') AND active_invoice_id IS NOT NULL AND active_invoice_id=invoice_id)),
  FOREIGN KEY (tenant_id, legal_entity_id, invoice_id) REFERENCES purchase_invoices(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, active_invoice_id) REFERENCES purchase_invoices(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, stock_receipt_id) REFERENCES stock_receipts(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, journal_id) REFERENCES journals(tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,posted_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_receipt_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, receipt_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL,
  line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL, details JSON NOT NULL,
  UNIQUE KEY purchase_receipt_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY purchase_receipt_line_number (tenant_id,legal_entity_id,receipt_id,line_number),
  UNIQUE KEY purchase_receipt_line_source (tenant_id,legal_entity_id,receipt_id,invoice_line_id),
  CONSTRAINT purchase_receipt_line_amount CHECK (quantity>0 AND value>=0),
  FOREIGN KEY (tenant_id, legal_entity_id, receipt_id) REFERENCES purchase_receipts(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, invoice_line_id) REFERENCES purchase_invoice_lines(tenant_id, legal_entity_id, id), FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER receipt_no_delete BEFORE DELETE ON stock_receipts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipts cannot be deleted'; END$$

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

CREATE TRIGGER receipt_post_guard BEFORE UPDATE ON stock_receipts FOR EACH ROW BEGIN BEGIN
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
  END;
  IF NEW.source_kind='PURCHASE_INVOICE' AND ((SELECT COUNT(*) FROM stock_receipt_lines l WHERE l.receipt_id=NEW.id)<>(SELECT COUNT(*) FROM purchase_receipt_lines l WHERE l.receipt_id=NEW.source_id)
   OR NEW.total_value<>(SELECT SUM(l.value) FROM purchase_receipt_lines l WHERE l.receipt_id=NEW.source_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Complete exact purchase source must reconcile'; END IF; END$$

CREATE TRIGGER receipt_insert_guard BEFORE INSERT ON stock_receipts FOR EACH ROW BEGIN BEGIN IF NEW.status <> 'ASSEMBLING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipt must be assembled before posting'; END IF; END;
  IF NEW.source_kind='PURCHASE_INVOICE' AND NOT EXISTS (SELECT 1 FROM purchase_receipts p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.source_id AND p.status='POSTING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase receipt requires approved posting source'; END IF; END$$

CREATE TRIGGER stock_receipt_lines_insert_guard BEFORE INSERT ON stock_receipt_lines FOR EACH ROW BEGIN BEGIN IF NOT EXISTS (SELECT 1 FROM stock_receipts r WHERE r.tenant_id = NEW.tenant_id AND r.legal_entity_id = NEW.legal_entity_id AND r.id = NEW.receipt_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipt is not assembling'; END IF; END;
  IF EXISTS (SELECT 1 FROM stock_receipts r WHERE r.id=NEW.receipt_id AND r.source_kind='TEST_FIXTURE') THEN
   IF NEW.value<>ROUND(NEW.quantity*NEW.unit_cost,6) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fixture receipt cost must multiply exactly'; END IF;
  ELSEIF NOT EXISTS (SELECT 1 FROM stock_receipts r JOIN purchase_receipts p ON p.id=r.source_id AND p.tenant_id=r.tenant_id AND p.legal_entity_id=r.legal_entity_id
   JOIN purchase_receipt_lines l ON l.receipt_id=p.id AND l.tenant_id=p.tenant_id AND l.legal_entity_id=p.legal_entity_id
   WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.receipt_id AND p.status='POSTING' AND l.invoice_line_id=NEW.source_line_key AND l.sku_id=NEW.sku_id AND l.quantity=NEW.quantity AND l.value=NEW.value)
   THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase stock line must match approved invoice cost'; END IF; END$$

CREATE TRIGGER layer_insert_guard BEFORE INSERT ON inventory_layers FOR EACH ROW BEGIN BEGIN
    IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l JOIN stock_receipts r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.receipt_id
      WHERE l.tenant_id = NEW.tenant_id AND l.legal_entity_id = NEW.legal_entity_id AND l.id = NEW.receipt_line_id AND r.status = 'ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Layer source is not assembling'; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l WHERE l.tenant_id=NEW.tenant_id AND l.legal_entity_id=NEW.legal_entity_id AND l.id=NEW.receipt_line_id AND l.quantity=NEW.quantity AND l.unit_cost=NEW.unit_cost AND l.value=NEW.value) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Layer cost must equal exact receipt source'; END IF; END$$

CREATE TRIGGER purchase_journal_source_guard BEFORE INSERT ON journals FOR EACH ROW BEGIN IF NEW.source_module='PURCHASE_INVOICE' AND NOT EXISTS (SELECT 1 FROM purchase_receipts p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.invoice_id=NEW.source_id AND p.status='POSTING' AND NEW.payload_hash=JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.journalHash'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase journal requires approved posting source'; END IF; END$$

CREATE TRIGGER purchase_resolution_insert BEFORE INSERT ON purchase_invoice_resolutions FOR EACH ROW BEGIN IF NEW.status<>'REQUESTED' OR NEW.reviewed_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM purchase_invoices i WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.id=NEW.invoice_id AND i.status='STAGED' AND i.revision=NEW.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resolution requires current staged invoice'; END IF; END$$

CREATE TRIGGER purchase_resolution_update BEFORE UPDATE ON purchase_invoice_resolutions FOR EACH ROW BEGIN
  IF OLD.status<>'REQUESTED' OR NEW.status NOT IN ('APPROVED','REJECTED') OR NOT (NEW.id<=>OLD.id AND NEW.tenant_id<=>OLD.tenant_id AND NEW.legal_entity_id<=>OLD.legal_entity_id AND NEW.invoice_id<=>OLD.invoice_id AND NEW.revision<=>OLD.revision AND NEW.context_hash<=>OLD.context_hash AND NEW.proposal<=>OLD.proposal AND NEW.reason<=>OLD.reason AND NEW.evidence<=>OLD.evidence AND NEW.requested_by<=>OLD.requested_by AND NEW.requested_at<=>OLD.requested_at) OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resolution needs independent immutable review'; END IF; END$$

CREATE TRIGGER purchase_receipt_insert BEFORE INSERT ON purchase_receipts FOR EACH ROW BEGIN IF NEW.status<>'ASSEMBLING' OR NEW.stock_receipt_id IS NOT NULL OR NEW.journal_id IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.posted_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM purchase_invoices i WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.id=NEW.invoice_id AND i.status='READY') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt requires ready invoice'; END IF; END$$

CREATE TRIGGER purchase_receipt_update BEFORE UPDATE ON purchase_receipts FOR EACH ROW BEGIN
  IF NOT (NEW.id<=>OLD.id AND NEW.tenant_id<=>OLD.tenant_id AND NEW.legal_entity_id<=>OLD.legal_entity_id AND NEW.invoice_id<=>OLD.invoice_id AND NEW.reference<=>OLD.reference AND NEW.context_hash<=>OLD.context_hash AND NEW.plan<=>OLD.plan AND NEW.reason<=>OLD.reason AND NEW.evidence<=>OLD.evidence AND NEW.requested_by<=>OLD.requested_by AND NEW.requested_at<=>OLD.requested_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt plan is immutable'; END IF;
  IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status IN ('POSTING','CANCELLED')) OR (OLD.status='POSTING' AND NEW.status='POSTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid purchase receipt transition'; END IF;
  IF NEW.status IN ('APPROVED','REJECTED') THEN
   IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent receipt review required'; END IF;
  ELSEIF NOT (NEW.reviewed_by<=>OLD.reviewed_by AND NEW.reviewed_at<=>OLD.reviewed_at AND NEW.review_reason<=>OLD.review_reason) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt review is immutable'; END IF;
  IF NEW.status='CANCELLED' AND CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation reason required'; END IF;
  IF NEW.status<>'POSTED' AND NOT (NEW.stock_receipt_id<=>OLD.stock_receipt_id AND NEW.journal_id<=>OLD.journal_id AND NEW.posted_by<=>OLD.posted_by AND NEW.posted_at<=>OLD.posted_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posting lineage is immutable'; END IF;
  IF NEW.status='REQUESTED' AND NOT EXISTS (SELECT 1 FROM purchase_receipt_lines l WHERE l.tenant_id=NEW.tenant_id AND l.legal_entity_id=NEW.legal_entity_id AND l.receipt_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt lines required'; END IF;
  IF NEW.status='POSTED' THEN
   IF NEW.posted_by IS NULL OR NEW.posted_at IS NULL OR NOT EXISTS (SELECT 1 FROM stock_receipts r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.stock_receipt_id AND r.source_kind='PURCHASE_INVOICE' AND r.source_id=NEW.id AND r.status='POSTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posted stock source required'; END IF;
   IF JSON_UNQUOTE(JSON_EXTRACT(NEW.plan,'$.payable'))<>'0.000000' AND NOT EXISTS (SELECT 1 FROM journals j JOIN journal_lines l ON l.journal_id=j.id WHERE j.tenant_id=NEW.tenant_id AND j.legal_entity_id=NEW.legal_entity_id AND j.id=NEW.journal_id AND j.source_module='PURCHASE_INVOICE' AND j.source_id=NEW.invoice_id AND j.status='POSTED' AND j.total_credit=j.total_debit AND l.account_id=JSON_UNQUOTE(JSON_EXTRACT(NEW.plan,'$.payableAccountId')) AND l.credit=JSON_UNQUOTE(JSON_EXTRACT(NEW.plan,'$.payable')) AND l.debit=0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Balanced purchase journal required'; END IF;
  END IF; END$$

CREATE TRIGGER purchase_receipt_line_insert BEFORE INSERT ON purchase_receipt_lines FOR EACH ROW BEGIN IF NOT EXISTS (SELECT 1 FROM purchase_receipts p JOIN purchase_invoice_lines l ON l.invoice_id=p.invoice_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.receipt_id AND p.status='ASSEMBLING' AND l.id=NEW.invoice_line_id AND l.quantity=NEW.quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt line requires its complete invoice source'; END IF; END$$

CREATE TRIGGER purchase_invoice_receipt_dependency BEFORE UPDATE ON purchase_invoices FOR EACH ROW BEGIN IF NEW.status IN ('STAGED','CANCELLED') AND OLD.status<>NEW.status AND EXISTS (SELECT 1 FROM purchase_receipts p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.active_invoice_id=OLD.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel unposted receipt before changing invoice matching'; END IF; END$$

CREATE TRIGGER purchase_receipt_reversal_dependency BEFORE INSERT ON inventory_corrections FOR EACH ROW BEGIN IF NEW.kind='REVERSAL' AND EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.id=e.receipt_id WHERE e.tenant_id=NEW.tenant_id AND e.legal_entity_id=NEW.legal_entity_id AND e.id=NEW.original_event_id AND r.source_kind='PURCHASE_INVOICE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase receipt requires coordinated financial reversal'; END IF; END$$

CREATE TRIGGER purchase_invoice_resolutions_no_delete BEFORE DELETE ON purchase_invoice_resolutions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain purchase posting history'; END$$

CREATE TRIGGER purchase_receipts_no_delete BEFORE DELETE ON purchase_receipts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain purchase posting history'; END$$

CREATE TRIGGER purchase_receipt_lines_no_delete BEFORE DELETE ON purchase_receipt_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain purchase posting history'; END$$

CREATE TRIGGER purchase_receipt_lines_no_update BEFORE UPDATE ON purchase_receipt_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt source lines are immutable'; END$$
DELIMITER ;

-- PR-04A additions. Reference only; apply registered m015 through migration runner.
CREATE TABLE export_packing_lists (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 document_date DATE NOT NULL, source_kind ENUM('MANUAL','CSV') NOT NULL, file_name VARCHAR(160) NOT NULL,
 source_content MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, line_count INT UNSIGNED NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','STAGED','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING', revision INT UNSIGNED NOT NULL DEFAULT 0,
 imported_by CHAR(36) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 submitted_by CHAR(36) NULL, submitted_at TIMESTAMP NULL, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, review_context JSON NULL,
 cancelled_by CHAR(36) NULL, cancelled_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY packing_scope (tenant_id,legal_entity_id,id), UNIQUE KEY packing_reference (tenant_id,legal_entity_id,reference), KEY packing_status (tenant_id,legal_entity_id,status,imported_at,id),
 CONSTRAINT packing_line_count CHECK (line_count>0), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id), FOREIGN KEY (tenant_id,imported_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,submitted_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,cancelled_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_packing_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, packing_list_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
 line_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, item_code VARCHAR(120) NOT NULL, description VARCHAR(1000) NOT NULL,
 quantity DECIMAL(20,6) NOT NULL, unit_code VARCHAR(16) NOT NULL, package_reference VARCHAR(120) NOT NULL, package_count INT UNSIGNED NULL,
 net_weight_kg DECIMAL(20,6) NULL, gross_weight_kg DECIMAL(20,6) NULL, source JSON NOT NULL,
 UNIQUE KEY packing_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY packing_line_number (tenant_id,legal_entity_id,packing_list_id,line_number), UNIQUE KEY packing_line_key (tenant_id,legal_entity_id,packing_list_id,line_key),
 CONSTRAINT packing_amount CHECK (quantity>0 AND (package_count IS NULL OR package_count>0) AND (net_weight_kg IS NULL OR net_weight_kg>=0) AND (gross_weight_kg IS NULL OR gross_weight_kg>=0) AND (net_weight_kg IS NULL OR gross_weight_kg IS NULL OR net_weight_kg<=gross_weight_kg)), FOREIGN KEY (tenant_id, legal_entity_id, packing_list_id) REFERENCES export_packing_lists(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_packing_plans (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, packing_list_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
 customer_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, destination_pool_id CHAR(36) NOT NULL, planned_date DATE NOT NULL,
 reason VARCHAR(255) NOT NULL, created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_plan_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_plan_revision (tenant_id,legal_entity_id,packing_list_id,revision),
 FOREIGN KEY (tenant_id, legal_entity_id, packing_list_id) REFERENCES export_packing_lists(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, customer_id) REFERENCES trading_partners(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, warehouse_id) REFERENCES warehouses(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, destination_pool_id) REFERENCES inventory_pools(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_packing_mappings (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, plan_id CHAR(36) NOT NULL, packing_line_id CHAR(36) NOT NULL,
 sku_id CHAR(36) NULL, unit_id CHAR(36) NULL, unit_confirmed BOOLEAN NOT NULL DEFAULT 0, basis ENUM('MANUAL','EXACT_CODE') NOT NULL,
 UNIQUE KEY export_mapping_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_mapping_line (tenant_id,legal_entity_id,plan_id,packing_line_id),
 CONSTRAINT export_mapping_unit CHECK ((sku_id IS NULL AND unit_id IS NULL) OR (sku_id IS NOT NULL AND unit_id IS NOT NULL)),
 FOREIGN KEY (tenant_id, legal_entity_id, plan_id) REFERENCES export_packing_plans(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, packing_line_id) REFERENCES export_packing_lines(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, unit_id) REFERENCES unit_of_measure(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_packing_decisions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, packing_list_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL, sequence_number INT UNSIGNED NOT NULL,
 action ENUM('SUBMIT','APPROVE','REJECT','REOPEN','CANCEL','RENEW') NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL,
 actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_decision_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_decision_sequence (tenant_id,legal_entity_id,packing_list_id,sequence_number),
 FOREIGN KEY (tenant_id, legal_entity_id, packing_list_id) REFERENCES export_packing_lists(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,actor_id) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_card_sequences (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, sequence_year INT UNSIGNED NOT NULL, last_number INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY (tenant_id,legal_entity_id,sequence_year), CONSTRAINT export_sequence_year CHECK (sequence_year BETWEEN 1000 AND 9999), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_cards (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, packing_list_id CHAR(36) NOT NULL, active_packing_list_id CHAR(36) NULL, plan_id CHAR(36) NOT NULL,
 code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, sequence_year INT UNSIGNED NOT NULL, sequence_number INT UNSIGNED NOT NULL,
 snapshot JSON NOT NULL, status ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE', created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_card_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_card_code (tenant_id,legal_entity_id,code), UNIQUE KEY export_card_number (tenant_id,legal_entity_id,sequence_year,sequence_number),
 UNIQUE KEY export_card_plan (tenant_id,legal_entity_id,plan_id), UNIQUE KEY export_card_active (tenant_id,legal_entity_id,active_packing_list_id),
 CONSTRAINT export_card_active_source CHECK ((status='ACTIVE' AND active_packing_list_id IS NOT NULL AND active_packing_list_id=packing_list_id) OR (status='CANCELLED' AND active_packing_list_id IS NULL)),
 FOREIGN KEY (tenant_id, legal_entity_id, packing_list_id) REFERENCES export_packing_lists(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, active_packing_list_id) REFERENCES export_packing_lists(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, plan_id) REFERENCES export_packing_plans(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_shipments (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, card_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reservation_date DATE NOT NULL, expected_dispatch_date DATE NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','RESERVING','RESERVED','DISPATCHING','DISPATCHED','CANCELLING','CANCELLED','REJECTED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
 reservation_id CHAR(36) NULL, issue_id CHAR(36) NULL, dispatch_context JSON NULL, dispatched_by CHAR(36) NULL, dispatched_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_shipment_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_shipment_reference (tenant_id,legal_entity_id,reference),
 UNIQUE KEY export_shipment_reservation (tenant_id,legal_entity_id,reservation_id), UNIQUE KEY export_shipment_issue (tenant_id,legal_entity_id,issue_id), KEY export_shipment_card (tenant_id,legal_entity_id,card_id,status,requested_at,id),
 CONSTRAINT export_shipment_dates CHECK (expected_dispatch_date>=reservation_date),
 FOREIGN KEY (tenant_id, legal_entity_id, card_id) REFERENCES export_cards(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, reservation_id) REFERENCES inventory_reservations(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, issue_id) REFERENCES inventory_issues(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,dispatched_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_shipment_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, shipment_id CHAR(36) NOT NULL, packing_line_id CHAR(36) NOT NULL,
 line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, reservation_line_id CHAR(36) NULL,
 UNIQUE KEY export_shipment_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_shipment_line_number (tenant_id,legal_entity_id,shipment_id,line_number), UNIQUE KEY export_shipment_line_source (tenant_id,legal_entity_id,shipment_id,packing_line_id),
 UNIQUE KEY export_shipment_stock_line (tenant_id,legal_entity_id,reservation_line_id), CONSTRAINT export_shipment_quantity CHECK (quantity>0),
 FOREIGN KEY (tenant_id, legal_entity_id, shipment_id) REFERENCES export_shipments(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, packing_line_id) REFERENCES export_packing_lines(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, reservation_line_id) REFERENCES inventory_reservation_lines(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER export_packing_insert BEFORE INSERT ON export_packing_lists FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.revision<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Packing list must assemble original source first'; END IF; END$$

CREATE TRIGGER export_packing_update BEFORE UPDATE ON export_packing_lists FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.document_date<=>OLD.document_date) AND (NEW.source_kind<=>OLD.source_kind) AND (NEW.file_name<=>OLD.file_name) AND (NEW.source_content<=>OLD.source_content) AND (NEW.source_hash<=>OLD.source_hash) AND (NEW.payload_hash<=>OLD.payload_hash) AND (NEW.line_count<=>OLD.line_count) AND (NEW.evidence<=>OLD.evidence) AND (NEW.imported_by<=>OLD.imported_by) AND (NEW.imported_at<=>OLD.imported_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Packing source is immutable'; END IF;
 IF OLD.status='ASSEMBLING' AND NEW.status='STAGED' THEN
  IF NEW.revision<>0 OR NEW.line_count<>(SELECT COUNT(*) FROM export_packing_lines WHERE packing_list_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Complete packing source required'; END IF;
 ELSEIF OLD.status='STAGED' AND NEW.status='STAGED' THEN
  IF NEW.revision<>OLD.revision+1 OR NOT EXISTS (SELECT 1 FROM export_packing_plans WHERE packing_list_id=NEW.id AND revision=NEW.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Next packing mapping revision required'; END IF;
 ELSE
  IF NEW.revision<>OLD.revision OR NOT ((OLD.status='STAGED' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status IN ('REQUESTED','APPROVED','REJECTED') AND NEW.status='STAGED') OR (OLD.status IN ('STAGED','REQUESTED','APPROVED') AND NEW.status='CANCELLED') OR (OLD.status='APPROVED' AND NEW.status='APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid packing workflow transition'; END IF;
  IF NEW.status IN ('STAGED','CANCELLED') AND EXISTS (SELECT 1 FROM export_cards WHERE active_packing_list_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel dependent export card first'; END IF;
  IF NEW.status='REQUESTED' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL OR NEW.review_context IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Packing submission context required'; END IF;
  IF NEW.status IN ('APPROVED','REJECTED') THEN
   IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 OR NEW.reviewed_by=NEW.imported_by OR NEW.reviewed_by=NEW.submitted_by OR EXISTS (SELECT 1 FROM export_packing_plans p WHERE p.packing_list_id=NEW.id AND p.revision=NEW.revision AND p.created_by=NEW.reviewed_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent packing reviewer required'; END IF;
  END IF;
  IF NEW.status='CANCELLED' AND (NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Packing cancellation evidence required'; END IF;
 END IF; END$$

CREATE TRIGGER export_packing_line_insert BEFORE INSERT ON export_packing_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_packing_lists p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.packing_list_id AND p.status='ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Packing lines require assembling source'; END IF; END$$

CREATE TRIGGER export_plan_insert BEFORE INSERT ON export_packing_plans FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_packing_lists p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.packing_list_id AND p.status='STAGED' AND p.revision+1=NEW.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only next staged mapping plan allowed'; END IF; END$$

CREATE TRIGGER export_mapping_insert BEFORE INSERT ON export_packing_mappings FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_packing_plans p JOIN export_packing_lists h ON h.id=p.packing_list_id JOIN export_packing_lines l ON l.packing_list_id=h.id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.plan_id AND l.id=NEW.packing_line_id AND h.status='STAGED' AND h.revision+1=p.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Mapping must belong to next packing source plan'; END IF; IF NEW.sku_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_skus s WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.id=NEW.sku_id AND s.base_unit_id=NEW.unit_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Mapped SKU base unit must be retained'; END IF; END$$

CREATE TRIGGER export_decision_insert BEFORE INSERT ON export_packing_decisions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF CHAR_LENGTH(TRIM(NEW.reason))=0 OR NOT EXISTS (SELECT 1 FROM export_packing_lists p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.packing_list_id AND p.revision=NEW.revision AND ((NEW.action='SUBMIT' AND p.status='STAGED') OR (NEW.action IN ('APPROVE','REJECT') AND p.status='REQUESTED') OR (NEW.action='REOPEN' AND p.status IN ('REQUESTED','APPROVED','REJECTED')) OR (NEW.action='CANCEL' AND p.status IN ('STAGED','REQUESTED','APPROVED')) OR (NEW.action='RENEW' AND p.status='APPROVED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export decision must match current source workflow'; END IF; END$$

CREATE TRIGGER export_sequence_insert BEFORE INSERT ON export_card_sequences FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.last_number<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export sequence starts empty'; END IF; END$$

CREATE TRIGGER export_sequence_update BEFORE UPDATE ON export_card_sequences FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT ((NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.sequence_year<=>OLD.sequence_year)) OR NEW.last_number<>OLD.last_number+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export numbers increase once and are never reused'; END IF; END$$

CREATE TRIGGER export_card_insert BEFORE INSERT ON export_cards FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.status<>'ACTIVE' OR NOT EXISTS (SELECT 1 FROM export_packing_plans p JOIN export_packing_lists h ON h.id=p.packing_list_id JOIN export_card_sequences q ON q.tenant_id=p.tenant_id AND q.legal_entity_id=p.legal_entity_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.plan_id AND p.packing_list_id=NEW.packing_list_id AND h.status='REQUESTED' AND h.revision=p.revision AND q.sequence_year=NEW.sequence_year AND q.last_number=NEW.sequence_number AND NEW.sequence_year=YEAR(h.document_date) AND NEW.created_by<>h.imported_by AND NEW.created_by<>h.submitted_by AND NEW.created_by<>p.created_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export card requires independently approved current source and sequence'; END IF; END$$

CREATE TRIGGER export_card_update BEFORE UPDATE ON export_cards FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.packing_list_id<=>OLD.packing_list_id) AND (NEW.plan_id<=>OLD.plan_id) AND (NEW.code<=>OLD.code) AND (NEW.sequence_year<=>OLD.sequence_year) AND (NEW.sequence_number<=>OLD.sequence_number) AND (NEW.snapshot<=>OLD.snapshot) AND (NEW.created_by<=>OLD.created_by) AND (NEW.created_at<=>OLD.created_at)) OR OLD.status<>'ACTIVE' OR NEW.status<>'CANCELLED' OR NEW.active_packing_list_id IS NOT NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 OR EXISTS (SELECT 1 FROM export_shipments s WHERE s.card_id=NEW.id AND s.status NOT IN ('CANCELLED','REJECTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel unshipped dependencies before voiding immutable export card'; END IF; END$$

CREATE TRIGGER export_shipment_insert BEFORE INSERT ON export_shipments FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reservation_id IS NOT NULL OR NEW.issue_id IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM export_cards c JOIN export_packing_lists p ON p.id=c.packing_list_id WHERE c.tenant_id=NEW.tenant_id AND c.legal_entity_id=NEW.legal_entity_id AND c.id=NEW.card_id AND c.status='ACTIVE' AND p.status='APPROVED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment requires approved active export card'; END IF; END$$

CREATE TRIGGER export_shipment_update BEFORE UPDATE ON export_shipments FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.card_id<=>OLD.card_id) AND (NEW.reference<=>OLD.reference) AND (NEW.reservation_date<=>OLD.reservation_date) AND (NEW.expected_dispatch_date<=>OLD.expected_dispatch_date) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment plan is immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLING')) OR (OLD.status='APPROVED' AND NEW.status IN ('RESERVING','CANCELLING')) OR (OLD.status='RESERVING' AND NEW.status IN ('RESERVING','RESERVED')) OR (OLD.status='RESERVED' AND NEW.status IN ('DISPATCHING','CANCELLING')) OR (OLD.status='DISPATCHING' AND NEW.status='DISPATCHED') OR (OLD.status='CANCELLING' AND NEW.status='CANCELLED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid export shipment transition'; END IF;
 IF NEW.status IN ('APPROVED','REJECTED') THEN
  IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent shipment review required'; END IF;
 ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment review is immutable'; END IF;
 IF NEW.status='REQUESTED' THEN
  IF NOT EXISTS (SELECT 1 FROM export_shipment_lines WHERE shipment_id=NEW.id) OR EXISTS (SELECT 1 FROM export_shipment_lines x JOIN export_packing_lines l ON l.id=x.packing_line_id WHERE x.shipment_id=NEW.id AND l.quantity<(SELECT SUM(t.quantity) FROM export_shipment_lines t JOIN export_shipments s ON s.id=t.shipment_id WHERE s.card_id=NEW.card_id AND t.packing_line_id=x.packing_line_id AND s.status NOT IN ('CANCELLED','REJECTED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipments exceed uncommitted packing quantities'; END IF;
 END IF;
 IF NEW.status NOT IN ('RESERVING','RESERVED') AND NOT ((NEW.reservation_id<=>OLD.reservation_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reservation lineage is immutable'; END IF;
 IF NEW.status='RESERVED' AND (NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.reservation_id AND r.status='ACTIVE') OR EXISTS (SELECT 1 FROM export_shipment_lines l WHERE l.shipment_id=NEW.id AND l.reservation_line_id IS NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Complete reserved source lines required'; END IF;
 IF NEW.status<>'DISPATCHED' AND NOT ((NEW.issue_id<=>OLD.issue_id) AND (NEW.dispatch_context<=>OLD.dispatch_context) AND (NEW.dispatched_by<=>OLD.dispatched_by) AND (NEW.dispatched_at<=>OLD.dispatched_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch lineage is immutable'; END IF;
 IF NEW.status='DISPATCHED' AND (NEW.dispatched_by IS NULL OR NEW.dispatched_at IS NULL OR NEW.dispatch_context IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_issues i WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.id=NEW.issue_id AND i.reservation_id=NEW.reservation_id AND i.status='POSTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Posted reserved dispatch required'; END IF;
 IF NEW.status='CANCELLED' AND (CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 OR NEW.reservation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.reservation_id AND r.status='CANCELLED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Release reserved stock before shipment cancellation'; END IF;
 END$$

CREATE TRIGGER export_shipment_line_insert BEFORE INSERT ON export_shipment_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.reservation_line_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM export_shipments s JOIN export_cards c ON c.id=s.card_id JOIN export_packing_lines l ON l.packing_list_id=c.packing_list_id JOIN export_packing_mappings m ON m.plan_id=c.plan_id AND m.packing_line_id=l.id WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.id=NEW.shipment_id AND s.status='ASSEMBLING' AND l.id=NEW.packing_line_id AND m.sku_id=NEW.sku_id AND NEW.quantity<=l.quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment source must match approved packing map'; END IF; END$$

CREATE TRIGGER export_shipment_line_update BEFORE UPDATE ON export_shipment_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.shipment_id<=>OLD.shipment_id) AND (NEW.packing_line_id<=>OLD.packing_line_id) AND (NEW.line_number<=>OLD.line_number) AND (NEW.sku_id<=>OLD.sku_id) AND (NEW.quantity<=>OLD.quantity)) OR OLD.reservation_line_id IS NOT NULL OR NEW.reservation_line_id IS NULL OR NOT EXISTS (SELECT 1 FROM export_shipments s JOIN inventory_reservation_lines r ON r.reservation_id=s.reservation_id WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.id=NEW.shipment_id AND s.status='RESERVING' AND r.id=NEW.reservation_line_id AND r.sku_id=NEW.sku_id AND r.quantity=NEW.quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only exact shipment reservation lineage may be assigned'; END IF; END$$

CREATE TRIGGER export_stock_reservation_guard BEFORE INSERT ON inventory_reservations FOR EACH ROW BEGIN IF LEFT(NEW.reference,4)='XPR-' AND NOT EXISTS (SELECT 1 FROM export_shipments s WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND CONCAT('XPR-',s.id)=NEW.reference AND s.status='RESERVING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reserved export source requires approved shipment allocation'; END IF; END$$

CREATE TRIGGER export_stock_release_guard BEFORE INSERT ON inventory_reservation_releases FOR EACH ROW BEGIN IF EXISTS (SELECT 1 FROM export_shipments s WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.reservation_id=NEW.reservation_id AND s.status<>'CANCELLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel linked export shipment to release its reservation'; END IF; END$$

CREATE TRIGGER export_stock_issue_guard BEFORE INSERT ON inventory_issues FOR EACH ROW BEGIN IF EXISTS (SELECT 1 FROM export_shipments s WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.reservation_id=NEW.reservation_id AND s.status<>'DISPATCHING') OR LEFT(NEW.reference,4)='XPI-' AND NOT EXISTS (SELECT 1 FROM export_shipments s WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.reservation_id=NEW.reservation_id AND s.status='DISPATCHING' AND CONCAT('XPI-',s.id)=NEW.reference) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Dispatch linked export shipment through export workflow'; END IF; END$$

CREATE TRIGGER export_stock_reversal_guard BEFORE INSERT ON inventory_corrections FOR EACH ROW BEGIN IF NEW.kind='REVERSAL' AND EXISTS (SELECT 1 FROM inventory_events e JOIN export_shipments s ON s.issue_id=e.issue_id WHERE e.tenant_id=NEW.tenant_id AND e.legal_entity_id=NEW.legal_entity_id AND e.id=NEW.original_event_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export shipment requires coordinated source reversal'; END IF; END$$

CREATE TRIGGER export_sku_unit_guard BEFORE UPDATE ON product_skus FOR EACH ROW BEGIN IF NEW.base_unit_id<>OLD.base_unit_id AND EXISTS (SELECT 1 FROM export_packing_mappings m JOIN export_packing_plans p ON p.id=m.plan_id JOIN export_packing_lists h ON h.id=p.packing_list_id WHERE m.sku_id=OLD.id AND h.revision=p.revision AND h.status IN ('REQUESTED','APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reviewed export source retains SKU base unit'; END IF; END$$

CREATE TRIGGER export_packing_lines_no_update BEFORE UPDATE ON export_packing_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_lines_no_delete BEFORE DELETE ON export_packing_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_plans_no_update BEFORE UPDATE ON export_packing_plans FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_plans_no_delete BEFORE DELETE ON export_packing_plans FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_mappings_no_update BEFORE UPDATE ON export_packing_mappings FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_mappings_no_delete BEFORE DELETE ON export_packing_mappings FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_decisions_no_update BEFORE UPDATE ON export_packing_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_decisions_no_delete BEFORE DELETE ON export_packing_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and revision history is immutable'; END$$

CREATE TRIGGER export_packing_lists_no_delete BEFORE DELETE ON export_packing_lists FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export operations and numbering history'; END$$

CREATE TRIGGER export_card_sequences_no_delete BEFORE DELETE ON export_card_sequences FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export operations and numbering history'; END$$

CREATE TRIGGER export_cards_no_delete BEFORE DELETE ON export_cards FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export operations and numbering history'; END$$

CREATE TRIGGER export_shipments_no_delete BEFORE DELETE ON export_shipments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export operations and numbering history'; END$$

CREATE TRIGGER export_shipment_lines_no_delete BEFORE DELETE ON export_shipment_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export operations and numbering history'; END$$
DELIMITER ;

-- Implemented PR-04B: exact final-state m016 table/trigger definitions.
CREATE TABLE export_document_settings (tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, exporter_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id,legal_entity_id), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id), FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_sales_invoices (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, invoice_number VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 issue_date DATE NOT NULL, currency CHAR(3) NOT NULL, profile VARCHAR(40) NOT NULL, invoice_type VARCHAR(40) NOT NULL, exporter_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 raw_xml MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, xml_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, parsed_header JSON NOT NULL, file_name VARCHAR(160) NOT NULL, evidence VARCHAR(255) NOT NULL, line_count INT UNSIGNED NOT NULL,
 status ENUM('ASSEMBLING','STAGED','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING', revision INT UNSIGNED NOT NULL DEFAULT 0,
 imported_by CHAR(36) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_by CHAR(36) NULL, submitted_at TIMESTAMP NULL, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, review_context JSON NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_invoice_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_invoice_uuid (tenant_id,legal_entity_id,uuid), UNIQUE KEY export_invoice_number (tenant_id,legal_entity_id,exporter_tax_id,invoice_number), KEY export_invoice_status (tenant_id,legal_entity_id,status,imported_at,id),
 CONSTRAINT export_invoice_count CHECK (line_count>0), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id),FOREIGN KEY (tenant_id,imported_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,submitted_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_sales_invoice_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, line_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, description VARCHAR(1000) NOT NULL,
 quantity DECIMAL(20,6) NOT NULL, unit_code VARCHAR(16) NOT NULL, net_amount DECIMAL(20,6) NOT NULL, vat_amount DECIMAL(20,6) NOT NULL, details JSON NOT NULL,
 UNIQUE KEY export_invoice_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_invoice_line_number (tenant_id,legal_entity_id,invoice_id,line_number), UNIQUE KEY export_invoice_line_key (tenant_id,legal_entity_id,invoice_id,line_key), CONSTRAINT export_invoice_line_amount CHECK (quantity>0 AND net_amount>=0 AND vat_amount>=0),FOREIGN KEY (tenant_id, legal_entity_id, invoice_id) REFERENCES export_sales_invoices(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_sales_plans (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL, card_id CHAR(36) NOT NULL,
 transaction_type ENUM('STANDARD_EXPORT','FREE_OF_CHARGE','TEMPORARY_EXPORT','RETURN_EXPORT') NOT NULL, identity_evidence VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL, created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_sales_plan_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_sales_revision (tenant_id,legal_entity_id,invoice_id,revision),FOREIGN KEY (tenant_id, legal_entity_id, invoice_id) REFERENCES export_sales_invoices(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, card_id) REFERENCES export_cards(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_sales_allocations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, plan_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL, shipment_line_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, unit_confirmed BOOLEAN NOT NULL DEFAULT 0,
 UNIQUE KEY export_sales_allocation_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_sales_allocation_source (tenant_id,legal_entity_id,plan_id,invoice_line_id,shipment_line_id), CONSTRAINT export_sales_allocated_quantity CHECK (quantity>0),
 FOREIGN KEY (tenant_id, legal_entity_id, plan_id) REFERENCES export_sales_plans(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, invoice_line_id) REFERENCES export_sales_invoice_lines(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, shipment_line_id) REFERENCES export_shipment_lines(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_customs_documents (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, kind ENUM('DECLARATION','CLEARANCE') NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, declaration_id CHAR(36) NULL,
 event_date DATE NOT NULL, closing_date DATE NULL, is_final BOOLEAN NOT NULL DEFAULT 0, transaction_type ENUM('STANDARD_EXPORT','FREE_OF_CHARGE','TEMPORARY_EXPORT','RETURN_EXPORT') NOT NULL,
 plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING', requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_customs_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_customs_reference (tenant_id,legal_entity_id,kind,reference), KEY export_customs_state (tenant_id,legal_entity_id,kind,status,event_date,id), KEY export_customs_parent (tenant_id,legal_entity_id,declaration_id,status),
 CONSTRAINT export_customs_source CHECK ((kind='DECLARATION' AND declaration_id IS NULL AND is_final=0 AND closing_date IS NULL) OR (kind='CLEARANCE' AND declaration_id IS NOT NULL AND ((is_final=0 AND closing_date IS NULL) OR (is_final=1 AND closing_date IS NOT NULL AND closing_date>=event_date)))),
 FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id),FOREIGN KEY (tenant_id, legal_entity_id, declaration_id) REFERENCES export_customs_documents(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_customs_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, document_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, line_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 sales_allocation_id CHAR(36) NULL, issue_line_id CHAR(36) NULL, declaration_line_id CHAR(36) NULL, gtip_history_id CHAR(36) NULL, declared_gtip CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL, quantity DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY export_customs_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_customs_line_number (tenant_id,legal_entity_id,document_id,line_number), UNIQUE KEY export_customs_line_key (tenant_id,legal_entity_id,document_id,line_key),
 UNIQUE KEY export_customs_line_source (tenant_id,legal_entity_id,document_id,sales_allocation_id,issue_line_id), UNIQUE KEY export_clearance_line_source (tenant_id,legal_entity_id,document_id,declaration_line_id),
 CONSTRAINT export_customs_line_source CHECK (quantity>0 AND ((sales_allocation_id IS NOT NULL AND issue_line_id IS NOT NULL AND declaration_line_id IS NULL AND gtip_history_id IS NOT NULL AND declared_gtip IS NOT NULL) OR (sales_allocation_id IS NULL AND issue_line_id IS NULL AND declaration_line_id IS NOT NULL AND gtip_history_id IS NULL AND declared_gtip IS NULL))),
 FOREIGN KEY (tenant_id, legal_entity_id, document_id) REFERENCES export_customs_documents(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, sales_allocation_id) REFERENCES export_sales_allocations(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, issue_line_id) REFERENCES inventory_issue_lines(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, declaration_line_id) REFERENCES export_customs_lines(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, gtip_history_id) REFERENCES product_gtip_history(tenant_id, legal_entity_id, id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE export_compliance_decisions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, invoice_id CHAR(36) NULL, customs_document_id CHAR(36) NULL, action VARCHAR(24) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_compliance_decision_scope (tenant_id,legal_entity_id,id), KEY export_compliance_invoice (tenant_id,legal_entity_id,invoice_id,created_at,id), KEY export_compliance_customs (tenant_id,legal_entity_id,customs_document_id,created_at,id), CONSTRAINT export_compliance_decision_source CHECK ((invoice_id IS NULL)<>(customs_document_id IS NULL)),FOREIGN KEY (tenant_id, legal_entity_id, invoice_id) REFERENCES export_sales_invoices(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id, legal_entity_id, customs_document_id) REFERENCES export_customs_documents(tenant_id, legal_entity_id, id),FOREIGN KEY (tenant_id,actor_id) REFERENCES users(tenant_id,id))
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER export_sales_invoice_insert BEFORE INSERT ON export_sales_invoices FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.revision<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outgoing source must assemble first'; END IF; END$$
CREATE TRIGGER export_sales_invoice_update BEFORE UPDATE ON export_sales_invoices FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.uuid<=>OLD.uuid) AND (NEW.invoice_number<=>OLD.invoice_number) AND (NEW.issue_date<=>OLD.issue_date) AND (NEW.currency<=>OLD.currency) AND (NEW.profile<=>OLD.profile) AND (NEW.invoice_type<=>OLD.invoice_type) AND (NEW.exporter_tax_id<=>OLD.exporter_tax_id) AND (NEW.raw_xml<=>OLD.raw_xml) AND (NEW.xml_hash<=>OLD.xml_hash) AND (NEW.parsed_header<=>OLD.parsed_header) AND (NEW.file_name<=>OLD.file_name) AND (NEW.evidence<=>OLD.evidence) AND (NEW.line_count<=>OLD.line_count) AND (NEW.imported_by<=>OLD.imported_by) AND (NEW.imported_at<=>OLD.imported_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outgoing invoice source is immutable'; END IF;
 IF OLD.status='ASSEMBLING' AND NEW.status='STAGED' THEN IF NEW.line_count<>(SELECT COUNT(*) FROM export_sales_invoice_lines WHERE invoice_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Complete outgoing source required'; END IF;
 ELSEIF OLD.status='STAGED' AND NEW.status='STAGED' THEN IF NEW.revision<>OLD.revision+1 OR NOT EXISTS (SELECT 1 FROM export_sales_plans WHERE invoice_id=NEW.id AND revision=NEW.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Next sales mapping revision required'; END IF;
 ELSE
 IF NEW.revision<>OLD.revision OR NOT ((OLD.status='STAGED' AND NEW.status='REQUESTED') OR (OLD.status='APPROVED' AND NEW.status='APPROVED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status IN ('REQUESTED','APPROVED','REJECTED') AND NEW.status='STAGED') OR (OLD.status IN ('STAGED','REQUESTED','APPROVED') AND NEW.status='CANCELLED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid outgoing invoice transition'; END IF;
 IF NEW.status IN ('STAGED','CANCELLED') AND EXISTS (SELECT 1 FROM export_customs_lines l JOIN export_customs_documents d ON d.id=l.document_id JOIN export_sales_allocations a ON a.id=l.sales_allocation_id JOIN export_sales_plans p ON p.id=a.plan_id WHERE p.invoice_id=NEW.id AND d.status IN ('REQUESTED','APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice approval referenced by customs'; END IF;
 IF NEW.status='REQUESTED' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL OR NEW.review_context IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Sales submission context required'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED') THEN
  IF EXISTS (SELECT 1 FROM export_sales_invoice_lines l WHERE l.invoice_id=NEW.id AND l.quantity<>COALESCE((SELECT SUM(a.quantity) FROM export_sales_allocations a JOIN export_sales_plans p ON p.id=a.plan_id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND a.invoice_line_id=l.id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outgoing quantities must cover every source line exactly'; END IF;
  IF EXISTS (SELECT 1 FROM export_sales_allocations a JOIN export_sales_plans p ON p.id=a.plan_id JOIN export_shipment_lines s ON s.id=a.shipment_line_id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND s.quantity<(SELECT SUM(x.quantity) FROM export_sales_allocations x JOIN export_sales_plans q ON q.id=x.plan_id JOIN export_sales_invoices i ON i.id=q.invoice_id AND i.revision=q.revision WHERE x.shipment_line_id=s.id AND ((i.id=NEW.id AND q.revision=NEW.revision) OR (i.id<>NEW.id AND i.status IN ('REQUESTED','APPROVED'))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outgoing approvals exceed shipment quantities'; END IF;
 END IF;
 IF NEW.status IN ('APPROVED','REJECTED') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.reviewed_by=NEW.imported_by OR NEW.reviewed_by=NEW.submitted_by OR EXISTS (SELECT 1 FROM export_sales_plans p WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.created_by=NEW.reviewed_by) OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent sales review required'; END IF;
 END IF; END$$
CREATE TRIGGER export_sales_line_insert BEFORE INSERT ON export_sales_invoice_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_sales_invoices i WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.id=NEW.invoice_id AND i.status='ASSEMBLING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Sales lines require assembling source'; END IF; END$$
CREATE TRIGGER export_sales_plan_insert BEFORE INSERT ON export_sales_plans FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_sales_invoices i WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.id=NEW.invoice_id AND i.status='STAGED' AND i.revision+1=NEW.revision) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Next staged sales plan required'; END IF; END$$
CREATE TRIGGER export_sales_allocation_insert BEFORE INSERT ON export_sales_allocations FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_sales_plans p JOIN export_sales_invoices i ON i.id=p.invoice_id JOIN export_sales_invoice_lines l ON l.invoice_id=i.id JOIN export_shipment_lines s ON s.id=NEW.shipment_line_id JOIN export_shipments h ON h.id=s.shipment_id AND h.card_id=p.card_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.plan_id AND i.status='STAGED' AND i.revision+1=p.revision AND l.id=NEW.invoice_line_id AND h.status IN ('APPROVED','RESERVED','DISPATCHED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Sales allocation requires matching active shipment source'; END IF; END$$
CREATE TRIGGER export_customs_insert BEFORE INSERT ON export_customs_documents FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Customs evidence must assemble first'; END IF; END$$
CREATE TRIGGER export_customs_update BEFORE UPDATE ON export_customs_documents FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.kind<=>OLD.kind) AND (NEW.reference<=>OLD.reference) AND (NEW.declaration_id<=>OLD.declaration_id) AND (NEW.event_date<=>OLD.event_date) AND (NEW.closing_date<=>OLD.closing_date) AND (NEW.is_final<=>OLD.is_final) AND (NEW.transaction_type<=>OLD.transaction_type) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at)) OR NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.kind='DECLARATION' AND OLD.status='APPROVED' AND NEW.status='CANCELLED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Customs source and accepted evidence are immutable'; END IF;
 IF NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent customs review required'; END IF;
 ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain customs review history'; END IF;
 IF NEW.status='REQUESTED' AND NEW.is_final=0 AND NOT EXISTS (SELECT 1 FROM export_customs_lines WHERE document_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Customs source lines required'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED') THEN
  IF NEW.kind='DECLARATION' THEN
   IF EXISTS (SELECT 1 FROM export_customs_lines l JOIN export_sales_allocations a ON a.id=l.sales_allocation_id JOIN inventory_issue_lines i ON i.id=l.issue_line_id WHERE l.document_id=NEW.id AND (a.quantity<(SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.sales_allocation_id=a.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED')))) OR i.quantity<(SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.issue_line_id=i.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED')))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Customs declarations exceed invoiced or dispatched quantities'; END IF;
  ELSE
   IF NOT EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.declaration_id AND d.kind='DECLARATION' AND d.status='APPROVED' AND d.event_date<=NEW.event_date) OR EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.declaration_id=NEW.declaration_id AND d.id<>NEW.id AND d.is_final=1 AND d.status IN ('REQUESTED','APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Approved open declaration required for exit evidence'; END IF;
   IF EXISTS (SELECT 1 FROM export_customs_lines l JOIN export_customs_lines p ON p.id=l.declaration_line_id WHERE l.document_id=NEW.id AND p.quantity<(SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.declaration_line_id=p.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED'))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Confirmed exits exceed declaration quantities'; END IF;
   IF NEW.is_final=1 AND EXISTS (SELECT 1 FROM export_customs_lines p WHERE p.document_id=NEW.declaration_id AND p.quantity<>COALESCE((SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.declaration_line_id=p.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status='APPROVED'))),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Final customs closure requires complete accepted quantities'; END IF;
  END IF;
 END IF;
 IF NEW.status='CANCELLED' AND (CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 OR EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.declaration_id=NEW.id AND d.status IN ('REQUESTED','APPROVED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel pending customs dependencies first'; END IF;
 END$$
CREATE TRIGGER export_customs_line_insert BEFORE INSERT ON export_customs_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active export entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.document_id AND d.status='ASSEMBLING' AND ((d.kind='DECLARATION' AND NEW.sales_allocation_id IS NOT NULL AND NEW.declaration_line_id IS NULL) OR (d.kind='CLEARANCE' AND NEW.declaration_line_id IS NOT NULL AND EXISTS (SELECT 1 FROM export_customs_lines x WHERE x.id=NEW.declaration_line_id AND x.document_id=d.declaration_id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Customs line must match its source document'; END IF; END$$
CREATE TRIGGER export_card_document_dependency BEFORE UPDATE ON export_cards FOR EACH ROW BEGIN IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM export_sales_plans p JOIN export_sales_invoices i ON i.id=p.invoice_id AND i.revision=p.revision WHERE p.card_id=OLD.id AND i.status IN ('REQUESTED','APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel dependent outgoing matching first'; END IF; END$$
CREATE TRIGGER export_shipment_document_dependency BEFORE UPDATE ON export_shipments FOR EACH ROW BEGIN IF NEW.status IN ('CANCELLING','CANCELLED') AND EXISTS (SELECT 1 FROM export_sales_allocations a JOIN export_shipment_lines l ON l.id=a.shipment_line_id JOIN export_sales_plans p ON p.id=a.plan_id JOIN export_sales_invoices i ON i.id=p.invoice_id AND i.revision=p.revision WHERE l.shipment_id=OLD.id AND i.status IN ('REQUESTED','APPROVED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel dependent outgoing matching first'; END IF; END$$
CREATE TRIGGER export_sales_invoice_lines_no_update BEFORE UPDATE ON export_sales_invoice_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and compliance evidence are immutable'; END$$
CREATE TRIGGER export_sales_plans_no_update BEFORE UPDATE ON export_sales_plans FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and compliance evidence are immutable'; END$$
CREATE TRIGGER export_sales_allocations_no_update BEFORE UPDATE ON export_sales_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and compliance evidence are immutable'; END$$
CREATE TRIGGER export_customs_lines_no_update BEFORE UPDATE ON export_customs_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and compliance evidence are immutable'; END$$
CREATE TRIGGER export_compliance_decisions_no_update BEFORE UPDATE ON export_compliance_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export source and compliance evidence are immutable'; END$$
CREATE TRIGGER export_sales_invoices_no_delete BEFORE DELETE ON export_sales_invoices FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
CREATE TRIGGER export_sales_invoice_lines_no_delete BEFORE DELETE ON export_sales_invoice_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
CREATE TRIGGER export_sales_plans_no_delete BEFORE DELETE ON export_sales_plans FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
CREATE TRIGGER export_sales_allocations_no_delete BEFORE DELETE ON export_sales_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
CREATE TRIGGER export_customs_documents_no_delete BEFORE DELETE ON export_customs_documents FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
CREATE TRIGGER export_customs_lines_no_delete BEFORE DELETE ON export_customs_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
CREATE TRIGGER export_compliance_decisions_no_delete BEFORE DELETE ON export_compliance_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain export invoice and customs history'; END$$
DELIMITER ;


-- Implemented PR-05A: exact final-state m017 table/trigger definitions.
ALTER TABLE journal_lines ADD UNIQUE KEY vat_journal_line_scope (tenant_id,legal_entity_id,id);

CREATE TABLE vat_input_sources (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, purchase_receipt_line_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, vat_journal_line_id CHAR(36) NULL,
  quantity DECIMAL(20,6) NOT NULL, native_vat DECIMAL(20,6) NOT NULL, converted_vat DECIMAL(20,6) NOT NULL, deductible_vat DECIMAL(20,6) NOT NULL, capitalized_vat DECIMAL(20,6) NOT NULL,
  currency CHAR(3) NOT NULL, base_currency CHAR(3) NOT NULL, vat_treatment ENUM('DEDUCTIBLE','CAPITALIZE','NONE') NOT NULL, snapshot JSON NOT NULL, source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, registered_by CHAR(36) NOT NULL, registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY vat_source_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_source_purchase_line (tenant_id,legal_entity_id,purchase_receipt_line_id), UNIQUE KEY vat_source_layer (tenant_id,legal_entity_id,layer_id),
  CONSTRAINT vat_source_amount CHECK (quantity>0 AND native_vat>=0 AND converted_vat>=0 AND deductible_vat>=0 AND capitalized_vat>=0 AND converted_vat=deductible_vat+capitalized_vat),
  CONSTRAINT vat_source_treatment CHECK ((vat_treatment='DEDUCTIBLE' AND capitalized_vat=0 AND (deductible_vat=0 OR vat_journal_line_id IS NOT NULL)) OR (vat_treatment='CAPITALIZE' AND deductible_vat=0 AND vat_journal_line_id IS NULL) OR (vat_treatment='NONE' AND native_vat=0 AND converted_vat=0 AND vat_journal_line_id IS NULL)),
  FOREIGN KEY (tenant_id,legal_entity_id,purchase_receipt_line_id) REFERENCES purchase_receipt_lines(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,invoice_line_id) REFERENCES purchase_invoice_lines(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,layer_id) REFERENCES inventory_layers(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,sku_id) REFERENCES product_skus(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,vat_journal_line_id) REFERENCES journal_lines(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,registered_by) REFERENCES users(tenant_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_attributions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, clearance_id CHAR(36) NOT NULL,
  treatment ENUM('CANDIDATE','HOLD','EXCLUDED') NOT NULL, base_currency CHAR(3) NOT NULL, eligibility_evidence VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, input JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
  void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL,
  UNIQUE KEY vat_attribution_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_attribution_reference (tenant_id,legal_entity_id,reference), KEY vat_attribution_state (tenant_id,legal_entity_id,status,requested_at,id), KEY vat_attribution_exit (tenant_id,legal_entity_id,clearance_id,status),
  FOREIGN KEY (tenant_id,legal_entity_id,clearance_id) REFERENCES export_customs_documents(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_attribution_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, attribution_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, source_id CHAR(36) NOT NULL, clearance_line_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, native_vat DECIMAL(20,6) NOT NULL, converted_vat DECIMAL(20,6) NOT NULL, deductible_vat DECIMAL(20,6) NOT NULL, capitalized_vat DECIMAL(20,6) NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
  UNIQUE KEY vat_attribution_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_attribution_line_number (tenant_id,legal_entity_id,attribution_id,line_number), UNIQUE KEY vat_attribution_line_exit (tenant_id,legal_entity_id,attribution_id,clearance_line_id),
  KEY vat_attribution_source (tenant_id,legal_entity_id,source_id,attribution_id), KEY vat_attribution_clearance (tenant_id,legal_entity_id,clearance_line_id,attribution_id),
  CONSTRAINT vat_attribution_amount CHECK (quantity>0 AND native_vat>=0 AND converted_vat>=0 AND deductible_vat>=0 AND capitalized_vat>=0 AND candidate_vat>=0 AND candidate_vat<=deductible_vat AND converted_vat=deductible_vat+capitalized_vat),
  FOREIGN KEY (tenant_id,legal_entity_id,attribution_id) REFERENCES vat_attributions(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,source_id) REFERENCES vat_input_sources(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,clearance_line_id) REFERENCES export_customs_lines(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_attribution_decisions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, attribution_id CHAR(36) NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY vat_decision_scope (tenant_id,legal_entity_id,id), KEY vat_decision_history (tenant_id,legal_entity_id,attribution_id,created_at,id),FOREIGN KEY (tenant_id,legal_entity_id,attribution_id) REFERENCES vat_attributions(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,actor_id) REFERENCES users(tenant_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER vat_source_insert BEFORE INSERT ON vat_input_sources FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM purchase_receipt_lines l JOIN purchase_receipts p ON p.id=l.receipt_id JOIN inventory_layers x ON x.id=NEW.layer_id JOIN stock_receipt_lines s ON s.id=x.receipt_line_id WHERE l.tenant_id=NEW.tenant_id AND l.legal_entity_id=NEW.legal_entity_id AND l.id=NEW.purchase_receipt_line_id AND p.status='POSTED' AND p.stock_receipt_id=s.receipt_id AND s.source_line_key=l.invoice_line_id AND l.invoice_line_id=NEW.invoice_line_id AND l.sku_id=NEW.sku_id AND l.quantity=NEW.quantity AND x.quantity=NEW.quantity AND NEW.native_vat=CAST(JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.nativeVat')) AS DECIMAL(20,6)) AND NEW.deductible_vat=CAST(JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.deductibleVat')) AS DECIMAL(20,6)) AND NEW.vat_treatment=JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.vatTreatment')) AND NEW.base_currency=JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.baseCurrency'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT source requires original posted purchase layer'; END IF; END$$

CREATE TRIGGER vat_attribution_insert BEFORE INSERT ON vat_attributions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.clearance_id AND d.kind='CLEARANCE' AND d.status='APPROVED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT attribution requires accepted exit evidence'; END IF; END$$

CREATE TRIGGER vat_attribution_line_insert BEFORE INSERT ON vat_attribution_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM vat_attributions a JOIN export_customs_lines c ON c.document_id=a.clearance_id JOIN vat_input_sources s ON s.id=NEW.source_id WHERE a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.id=NEW.attribution_id AND a.status='ASSEMBLING' AND s.base_currency=a.base_currency AND c.id=NEW.clearance_line_id AND JSON_UNQUOTE(JSON_EXTRACT(c.snapshot,'$.issue.layerId'))=s.layer_id AND NEW.candidate_vat=IF(a.treatment='CANDIDATE',NEW.deductible_vat,0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT line requires exact accepted source layer'; END IF; END$$

CREATE TRIGGER vat_attribution_update BEFORE UPDATE ON vat_attributions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
  IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.clearance_id<=>OLD.clearance_id) AND (NEW.treatment<=>OLD.treatment) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.eligibility_evidence<=>OLD.eligibility_evidence) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.input<=>OLD.input) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT attribution source plan is immutable'; END IF;
  IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT attribution transition'; END IF;
  IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT attribution review required'; END IF;
  ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT review'; END IF;
  IF NEW.status<>'CANCELLED' AND NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cancellation evidence'; END IF;
   IF NEW.status='CANCELLED' AND CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cancellation reason required'; END IF;
  IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT void request required'; END IF;
  ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT void request'; END IF; IF NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT void review required'; END IF;
  ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT void evidence'; END IF;
  IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
   IF NOT EXISTS (SELECT 1 FROM vat_attribution_lines WHERE attribution_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT attribution lines required'; END IF;
   IF EXISTS (SELECT 1 FROM vat_attribution_lines l JOIN vat_input_sources s ON s.id=l.source_id WHERE l.attribution_id=NEW.id AND (s.quantity<(SELECT SUM(x.quantity) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED'))) OR s.native_vat<(SELECT SUM(x.native_vat) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED'))) OR s.converted_vat<(SELECT SUM(x.converted_vat) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED'))) OR s.deductible_vat<(SELECT SUM(x.deductible_vat) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED'))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT attribution exceeds original source quantity or tax'; END IF;
   IF EXISTS (SELECT 1 FROM vat_attribution_lines l JOIN export_customs_lines c ON c.id=l.clearance_line_id WHERE l.attribution_id=NEW.id AND c.quantity<(SELECT SUM(x.quantity) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.clearance_line_id=c.id AND (a.id=NEW.id OR a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT attribution exceeds accepted exit quantity'; END IF;
  END IF; END$$

CREATE TRIGGER vat_input_sources_no_update BEFORE UPDATE ON vat_input_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT source and decision history are immutable'; END$$

CREATE TRIGGER vat_attribution_lines_no_update BEFORE UPDATE ON vat_attribution_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT source and decision history are immutable'; END$$

CREATE TRIGGER vat_attribution_decisions_no_update BEFORE UPDATE ON vat_attribution_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT source and decision history are immutable'; END$$

CREATE TRIGGER vat_input_sources_no_delete BEFORE DELETE ON vat_input_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT source and attribution history'; END$$

CREATE TRIGGER vat_attributions_no_delete BEFORE DELETE ON vat_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT source and attribution history'; END$$

CREATE TRIGGER vat_attribution_lines_no_delete BEFORE DELETE ON vat_attribution_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT source and attribution history'; END$$

CREATE TRIGGER vat_attribution_decisions_no_delete BEFORE DELETE ON vat_attribution_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT source and attribution history'; END$$
DELIMITER ;

-- Implemented PR-05B: exact final-state m018 table/trigger definitions.
CREATE TABLE vat_cost_sources (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL, invoice_line_id CHAR(36) NOT NULL, vat_journal_line_id CHAR(36) NOT NULL, category ENUM('DIRECT_CHARGE','OVERHEAD','ATIK') NOT NULL,
 native_vat DECIMAL(20,6) NOT NULL, converted_vat DECIMAL(20,6) NOT NULL, deductible_vat DECIMAL(20,6) NOT NULL, available_vat DECIMAL(20,6) NOT NULL, asset_reference VARCHAR(64) NULL, first_use_date DATE NULL,
 UNIQUE KEY vat_cost_source_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_source_reference (tenant_id,legal_entity_id,reference), KEY vat_cost_source_state (tenant_id,legal_entity_id,status,requested_at,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id), KEY vat_cost_invoice (tenant_id,legal_entity_id,invoice_line_id,status), KEY vat_cost_debit (tenant_id,legal_entity_id,vat_journal_line_id,status),
 CONSTRAINT vat_cost_source_amount CHECK (native_vat>0 AND converted_vat>=deductible_vat AND deductible_vat>=available_vat AND available_vat>0),
 CONSTRAINT vat_cost_asset CHECK ((category='ATIK' AND asset_reference IS NOT NULL AND first_use_date IS NOT NULL) OR (category<>'ATIK' AND asset_reference IS NULL AND first_use_date IS NULL AND available_vat=deductible_vat)),
 FOREIGN KEY (tenant_id,legal_entity_id,invoice_line_id) REFERENCES purchase_invoice_lines(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,vat_journal_line_id) REFERENCES journal_lines(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_allocation_bases (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL, period CHAR(7) NOT NULL, eligible_value DECIMAL(20,6) NOT NULL, total_value DECIMAL(20,6) NOT NULL, vat_free_value DECIMAL(20,6) NOT NULL, general_rate DECIMAL(20,6) NOT NULL, ordinary_ceiling DECIMAL(20,6) NOT NULL, goods_vat DECIMAL(20,6) NOT NULL,
 UNIQUE KEY vat_cost_basis_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_basis_reference (tenant_id,legal_entity_id,reference), KEY vat_cost_basis_state (tenant_id,legal_entity_id,status,requested_at,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id), KEY vat_cost_period (tenant_id,legal_entity_id,period,status),
 CONSTRAINT vat_cost_basis_amount CHECK (eligible_value>0 AND total_value>=eligible_value AND vat_free_value>=0 AND vat_free_value<=eligible_value AND general_rate>0 AND general_rate<=100 AND ordinary_ceiling=ROUND((eligible_value-vat_free_value)*general_rate/100,6) AND goods_vat>=0)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_allocation_basis_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, basis_id CHAR(36) NOT NULL, attribution_line_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_basis_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_basis_line_number (tenant_id,legal_entity_id,basis_id,line_number), UNIQUE KEY vat_basis_goods_line (tenant_id,legal_entity_id,basis_id,attribution_line_id),
 CONSTRAINT vat_basis_line_amount CHECK (candidate_vat>=0),FOREIGN KEY (tenant_id,legal_entity_id,basis_id) REFERENCES vat_allocation_bases(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,attribution_line_id) REFERENCES vat_attribution_lines(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_cost_allocations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL, source_id CHAR(36) NOT NULL, basis_id CHAR(36) NOT NULL, period CHAR(7) NOT NULL, category ENUM('DIRECT_CHARGE','OVERHEAD','ATIK') NOT NULL, treatment ENUM('CANDIDATE','HOLD','EXCLUDED') NOT NULL,
 basis_vat DECIMAL(20,6) NOT NULL, calculated_vat DECIMAL(20,6) NOT NULL, allocated_vat DECIMAL(20,6) NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, non_export_vat DECIMAL(20,6) NOT NULL, limited_vat DECIMAL(20,6) NOT NULL, asset_eligible_value DECIMAL(20,6) NOT NULL, asset_total_value DECIMAL(20,6) NOT NULL,
 UNIQUE KEY vat_cost_allocation_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_allocation_reference (tenant_id,legal_entity_id,reference), KEY vat_cost_allocation_state (tenant_id,legal_entity_id,status,requested_at,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id), KEY vat_cost_allocation_source (tenant_id,legal_entity_id,source_id,period,status), KEY vat_cost_allocation_basis (tenant_id,legal_entity_id,basis_id,status),
 CONSTRAINT vat_cost_allocation_amount CHECK (basis_vat>=0 AND calculated_vat>=allocated_vat AND allocated_vat>=0 AND allocated_vat<=basis_vat AND candidate_vat=IF(treatment='CANDIDATE',allocated_vat,0) AND non_export_vat>=0 AND limited_vat=calculated_vat-allocated_vat AND asset_eligible_value>=0 AND asset_total_value>=asset_eligible_value AND ((category='ATIK' AND basis_vat=allocated_vat AND non_export_vat=0 AND asset_total_value>0) OR (category<>'ATIK' AND basis_vat=calculated_vat+non_export_vat AND asset_total_value=0 AND asset_eligible_value=0))),
 FOREIGN KEY (tenant_id,legal_entity_id,source_id) REFERENCES vat_cost_sources(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,basis_id) REFERENCES vat_allocation_bases(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_cost_allocation_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, allocation_id CHAR(36) NOT NULL, basis_line_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, weight DECIMAL(20,6) NOT NULL, allocated_vat DECIMAL(20,6) NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_cost_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_line_number (tenant_id,legal_entity_id,allocation_id,line_number), UNIQUE KEY vat_cost_line_basis (tenant_id,legal_entity_id,allocation_id,basis_line_id),
 CONSTRAINT vat_cost_line_amount CHECK (weight>0 AND allocated_vat>=0 AND candidate_vat>=0 AND candidate_vat<=allocated_vat),FOREIGN KEY (tenant_id,legal_entity_id,allocation_id) REFERENCES vat_cost_allocations(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,basis_line_id) REFERENCES vat_allocation_basis_lines(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_cost_decisions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, source_id CHAR(36) NULL, basis_id CHAR(36) NULL, allocation_id CHAR(36) NULL, sequence_number INT UNSIGNED NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY vat_cost_decision_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_source_decision (source_id,sequence_number), UNIQUE KEY vat_cost_basis_decision (basis_id,sequence_number), UNIQUE KEY vat_cost_allocation_decision (allocation_id,sequence_number),
 CONSTRAINT vat_cost_decision_parent CHECK ((source_id IS NOT NULL)+(basis_id IS NOT NULL)+(allocation_id IS NOT NULL)=1 AND sequence_number>0),FOREIGN KEY (tenant_id,legal_entity_id,source_id) REFERENCES vat_cost_sources(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,basis_id) REFERENCES vat_allocation_bases(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,allocation_id) REFERENCES vat_cost_allocations(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,actor_id) REFERENCES users(tenant_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER vat_cost_sources_insert BEFORE INSERT ON vat_cost_sources FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New VAT cost request must assemble before review'; END IF; END$$
CREATE TRIGGER vat_cost_sources_update BEFORE UPDATE ON vat_cost_sources FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.input<=>OLD.input) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at) AND (NEW.invoice_line_id<=>OLD.invoice_line_id) AND (NEW.vat_journal_line_id<=>OLD.vat_journal_line_id) AND (NEW.category<=>OLD.category) AND (NEW.native_vat<=>OLD.native_vat) AND (NEW.converted_vat<=>OLD.converted_vat) AND (NEW.deductible_vat<=>OLD.deductible_vat) AND (NEW.available_vat<=>OLD.available_vat) AND (NEW.asset_reference<=>OLD.asset_reference) AND (NEW.first_use_date<=>OLD.first_use_date)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost plan and original facts are immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT cost transition'; END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT cost review required'; END IF; ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT cost review'; END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost cancellation reason required'; END IF; ELSEIF NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost cancellation evidence'; END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT cost void request required'; END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT cost void review required'; END IF;
 ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost void evidence'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
 IF NOT EXISTS (SELECT 1 FROM purchase_invoice_lines l JOIN purchase_invoices i ON i.id=l.invoice_id JOIN journal_lines jl ON jl.id=NEW.vat_journal_line_id JOIN journals j ON j.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id WHERE l.id=NEW.invoice_line_id AND i.status<>'CANCELLED' AND l.vat_amount=NEW.native_vat AND j.status='POSTED' AND j.source_module='VAT_COST_INVOICE' AND j.source_id=i.uuid AND j.currency=NEW.base_currency AND jl.credit=0 AND a.account_type='ASSET' AND jl.debit>=NEW.deductible_vat+COALESCE((SELECT SUM(s.deductible_vat) FROM vat_cost_sources s WHERE s.id<>NEW.id AND s.vat_journal_line_id=NEW.vat_journal_line_id AND s.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost source needs its original posted invoice debit'; END IF;
 IF EXISTS (SELECT 1 FROM vat_cost_sources s WHERE s.id<>NEW.id AND s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') AND (s.invoice_line_id=NEW.invoice_line_id OR (NEW.category='ATIK' AND s.category='ATIK' AND s.asset_reference=NEW.asset_reference))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost source already committed'; END IF;
 IF EXISTS (SELECT 1 FROM purchase_invoice_lines l JOIN purchase_receipts r ON r.active_invoice_id=l.invoice_id WHERE l.id=NEW.invoice_line_id) OR EXISTS (SELECT 1 FROM vat_input_sources WHERE invoice_line_id=NEW.invoice_line_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost source collides with purchased goods'; END IF;
 END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED') AND EXISTS (SELECT 1 FROM vat_cost_allocations WHERE source_id=NEW.id AND status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Release dependent VAT cost allocations first'; END IF; END$$
CREATE TRIGGER vat_allocation_bases_insert BEFORE INSERT ON vat_allocation_bases FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New VAT cost request must assemble before review'; END IF; END$$
CREATE TRIGGER vat_allocation_bases_update BEFORE UPDATE ON vat_allocation_bases FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.input<=>OLD.input) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at) AND (NEW.period<=>OLD.period) AND (NEW.eligible_value<=>OLD.eligible_value) AND (NEW.total_value<=>OLD.total_value) AND (NEW.vat_free_value<=>OLD.vat_free_value) AND (NEW.general_rate<=>OLD.general_rate) AND (NEW.ordinary_ceiling<=>OLD.ordinary_ceiling) AND (NEW.goods_vat<=>OLD.goods_vat)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost plan and original facts are immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT cost transition'; END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT cost review required'; END IF; ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT cost review'; END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost cancellation reason required'; END IF; ELSEIF NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost cancellation evidence'; END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT cost void request required'; END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT cost void review required'; END IF;
 ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost void evidence'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
 IF EXISTS (SELECT 1 FROM vat_allocation_bases b WHERE b.id<>NEW.id AND b.tenant_id=NEW.tenant_id AND b.legal_entity_id=NEW.legal_entity_id AND b.period=NEW.period AND b.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT month already has a committed basis'; END IF;
 IF NOT EXISTS (SELECT 1 FROM vat_allocation_basis_lines WHERE basis_id=NEW.id) OR NEW.goods_vat<>(SELECT COALESCE(SUM(candidate_vat),0) FROM vat_allocation_basis_lines WHERE basis_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT basis goods total differs'; END IF;
 IF EXISTS (SELECT 1 FROM vat_attributions a JOIN export_customs_documents d ON d.id=a.clearance_id WHERE a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.treatment='CANDIDATE' AND DATE_FORMAT(d.event_date,'%Y-%m')=NEW.period AND a.status IN ('REQUESTED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finish pending goods VAT reviews first'; END IF;
 IF EXISTS (SELECT 1 FROM vat_attribution_lines l JOIN vat_attributions a ON a.id=l.attribution_id JOIN export_customs_documents d ON d.id=a.clearance_id WHERE a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.treatment='CANDIDATE' AND a.status='APPROVED' AND DATE_FORMAT(d.event_date,'%Y-%m')=NEW.period AND NOT EXISTS (SELECT 1 FROM vat_allocation_basis_lines bl WHERE bl.basis_id=NEW.id AND bl.attribution_line_id=l.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT basis must include all approved candidate goods'; END IF;
 END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED') AND EXISTS (SELECT 1 FROM vat_cost_allocations WHERE basis_id=NEW.id AND status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Release dependent VAT cost allocations first'; END IF; END$$
CREATE TRIGGER vat_cost_allocations_insert BEFORE INSERT ON vat_cost_allocations FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New VAT cost request must assemble before review'; END IF; END$$
CREATE TRIGGER vat_cost_allocations_update BEFORE UPDATE ON vat_cost_allocations FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.input<=>OLD.input) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at) AND (NEW.source_id<=>OLD.source_id) AND (NEW.basis_id<=>OLD.basis_id) AND (NEW.period<=>OLD.period) AND (NEW.category<=>OLD.category) AND (NEW.treatment<=>OLD.treatment) AND (NEW.basis_vat<=>OLD.basis_vat) AND (NEW.calculated_vat<=>OLD.calculated_vat) AND (NEW.allocated_vat<=>OLD.allocated_vat) AND (NEW.candidate_vat<=>OLD.candidate_vat) AND (NEW.non_export_vat<=>OLD.non_export_vat) AND (NEW.limited_vat<=>OLD.limited_vat) AND (NEW.asset_eligible_value<=>OLD.asset_eligible_value) AND (NEW.asset_total_value<=>OLD.asset_total_value)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost plan and original facts are immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT cost transition'; END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT cost review required'; END IF; ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT cost review'; END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost cancellation reason required'; END IF; ELSEIF NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost cancellation evidence'; END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT cost void request required'; END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT cost void review required'; END IF;
 ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost void evidence'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
 IF NOT EXISTS (SELECT 1 FROM vat_cost_sources s JOIN vat_allocation_bases b ON b.id=NEW.basis_id WHERE s.id=NEW.source_id AND s.status='APPROVED' AND b.status='APPROVED' AND s.category=NEW.category AND s.base_currency=NEW.base_currency AND b.base_currency=NEW.base_currency AND b.period=NEW.period AND s.available_vat>=NEW.basis_vat+COALESCE((SELECT SUM(a.basis_vat) FROM vat_cost_allocations a WHERE a.source_id=NEW.source_id AND a.id<>NEW.id AND a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT allocation source or basis unavailable'; END IF;
 IF EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.source_id=NEW.source_id AND a.basis_id=NEW.basis_id AND a.id<>NEW.id AND a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT source already allocated in this basis'; END IF;
 IF NOT EXISTS (SELECT 1 FROM vat_cost_allocation_lines WHERE allocation_id=NEW.id) OR NEW.allocated_vat<>(SELECT COALESCE(SUM(allocated_vat),0) FROM vat_cost_allocation_lines WHERE allocation_id=NEW.id) OR NEW.candidate_vat<>(SELECT COALESCE(SUM(candidate_vat),0) FROM vat_cost_allocation_lines WHERE allocation_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT allocation line totals differ'; END IF;
 IF NEW.category<>'DIRECT_CHARGE' AND NEW.treatment='CANDIDATE' AND NEW.allocated_vat>GREATEST(0,(SELECT ordinary_ceiling-goods_vat FROM vat_allocation_bases WHERE id=NEW.basis_id)-COALESCE((SELECT SUM(a.candidate_vat) FROM vat_cost_allocations a WHERE a.basis_id=NEW.basis_id AND a.id<>NEW.id AND a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT allocation exceeds remaining ordinary ceiling'; END IF;
 END IF;
 IF (OLD.status='ASSEMBLING' OR NEW.status IN ('REJECTED','CANCELLED','VOID_REQUESTED','VOIDED')) AND NEW.treatment='CANDIDATE' AND EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.id<>NEW.id AND a.basis_id=NEW.basis_id AND a.treatment='CANDIDATE' AND a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') AND FIELD(a.category,'DIRECT_CHARGE','OVERHEAD','ATIK')>FIELD(NEW.category,'DIRECT_CHARGE','OVERHEAD','ATIK')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Release later priority VAT allocations first'; END IF;
 IF NEW.category='ATIK' AND (OLD.status='ASSEMBLING' OR NEW.status IN ('REJECTED','CANCELLED','VOID_REQUESTED','VOIDED')) AND EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.id<>NEW.id AND a.source_id=NEW.source_id AND a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') AND a.period>NEW.period) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Release later asset periods first'; END IF; END$$
CREATE TRIGGER vat_cost_basis_line_insert BEFORE INSERT ON vat_allocation_basis_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM vat_allocation_bases b JOIN vat_attribution_lines l ON l.id=NEW.attribution_line_id JOIN vat_attributions a ON a.id=l.attribution_id JOIN export_customs_documents d ON d.id=a.clearance_id WHERE b.id=NEW.basis_id AND b.status='ASSEMBLING' AND a.status='APPROVED' AND a.treatment='CANDIDATE' AND a.base_currency=b.base_currency AND DATE_FORMAT(d.event_date,'%Y-%m')=b.period AND l.candidate_vat=NEW.candidate_vat) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT basis line needs approved monthly candidate goods'; END IF; END$$
CREATE TRIGGER vat_cost_line_insert BEFORE INSERT ON vat_cost_allocation_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM vat_cost_allocations a JOIN vat_allocation_basis_lines b ON b.basis_id=a.basis_id WHERE a.id=NEW.allocation_id AND a.status='ASSEMBLING' AND b.id=NEW.basis_line_id AND NEW.candidate_vat=IF(a.treatment='CANDIDATE',NEW.allocated_vat,0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT allocation line needs its retained basis'; END IF; END$$
CREATE TRIGGER vat_cost_goods_freeze BEFORE UPDATE ON vat_attributions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.treatment='CANDIDATE' AND EXISTS (SELECT 1 FROM vat_allocation_bases b JOIN export_customs_documents d ON d.id=NEW.clearance_id WHERE b.tenant_id=NEW.tenant_id AND b.legal_entity_id=NEW.legal_entity_id AND b.period=DATE_FORMAT(d.event_date,'%Y-%m') AND b.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Void the dependent VAT month basis before changing goods attribution'; END IF; END$$
CREATE TRIGGER vat_cost_receipt_collision BEFORE INSERT ON purchase_receipts FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF EXISTS (SELECT 1 FROM journals j JOIN purchase_invoices i ON i.uuid=j.source_id AND i.tenant_id=j.tenant_id AND i.legal_entity_id=j.legal_entity_id WHERE i.id=NEW.invoice_id AND j.source_module='VAT_COST_INVOICE' AND j.status='POSTED') OR EXISTS (SELECT 1 FROM vat_cost_sources s JOIN purchase_invoice_lines l ON l.id=s.invoice_line_id WHERE l.invoice_id=NEW.invoice_id AND s.status IN ('REQUESTED','APPROVED','VOID_REQUESTED','VOIDED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice belongs to retained non-stock VAT cost sources'; END IF; END$$
CREATE TRIGGER vat_cost_invoice_retain BEFORE UPDATE ON purchase_invoices FOR EACH ROW BEGIN IF NEW.status='CANCELLED' AND (EXISTS (SELECT 1 FROM journals j WHERE j.tenant_id=NEW.tenant_id AND j.legal_entity_id=NEW.legal_entity_id AND j.source_module='VAT_COST_INVOICE' AND j.source_id=NEW.uuid AND j.status='POSTED') OR EXISTS (SELECT 1 FROM vat_cost_sources s JOIN purchase_invoice_lines l ON l.id=s.invoice_line_id WHERE l.invoice_id=NEW.id AND s.status IN ('REQUESTED','APPROVED','VOID_REQUESTED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain invoice supporting non-stock VAT cost sources'; END IF; END$$
CREATE TRIGGER vat_allocation_basis_lines_no_update BEFORE UPDATE ON vat_allocation_basis_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost lines and decisions are immutable'; END$$
CREATE TRIGGER vat_cost_allocation_lines_no_update BEFORE UPDATE ON vat_cost_allocation_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost lines and decisions are immutable'; END$$
CREATE TRIGGER vat_cost_decisions_no_update BEFORE UPDATE ON vat_cost_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT cost lines and decisions are immutable'; END$$
CREATE TRIGGER vat_cost_sources_no_delete BEFORE DELETE ON vat_cost_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost history'; END$$
CREATE TRIGGER vat_allocation_bases_no_delete BEFORE DELETE ON vat_allocation_bases FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost history'; END$$
CREATE TRIGGER vat_allocation_basis_lines_no_delete BEFORE DELETE ON vat_allocation_basis_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost history'; END$$
CREATE TRIGGER vat_cost_allocations_no_delete BEFORE DELETE ON vat_cost_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost history'; END$$
CREATE TRIGGER vat_cost_allocation_lines_no_delete BEFORE DELETE ON vat_cost_allocation_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost history'; END$$
CREATE TRIGGER vat_cost_decisions_no_delete BEFORE DELETE ON vat_cost_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT cost history'; END$$
DELIMITER ;

-- Implemented PR-06A: exact final-state m019 table/trigger definitions.
CREATE TABLE vat_deductions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL, goods_source_id CHAR(36) NULL, cost_source_id CHAR(36) NULL, period CHAR(7) NOT NULL, tax_event_date DATE NOT NULL, book_date DATE NOT NULL, deducted_vat DECIMAL(20,6) NOT NULL, prior_refunded_vat DECIMAL(20,6) NOT NULL,
 UNIQUE KEY vat_deduction_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_deduction_reference (tenant_id,legal_entity_id,reference), KEY vat_deduction_state (tenant_id,legal_entity_id,status,requested_at,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id), KEY vat_deduction_goods (goods_source_id,status), KEY vat_deduction_cost (cost_source_id,status), KEY vat_deduction_period (tenant_id,legal_entity_id,period,status),
 CONSTRAINT vat_deduction_amount CHECK ((goods_source_id IS NOT NULL)+(cost_source_id IS NOT NULL)=1 AND deducted_vat>0 AND prior_refunded_vat>=0 AND prior_refunded_vat<=deducted_vat AND tax_event_date<=book_date),FOREIGN KEY (tenant_id,legal_entity_id,goods_source_id) REFERENCES vat_input_sources(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,cost_source_id) REFERENCES vat_cost_sources(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_reconciliations (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL, accounting_period_id CHAR(36) NOT NULL, period CHAR(7) NOT NULL, previous_id CHAR(36) NULL, basis_id CHAR(36) NULL,
 registered_vat DECIMAL(20,6) NOT NULL, opening_carry DECIMAL(20,6) NOT NULL, other_deductions DECIMAL(20,6) NOT NULL, total_deductions DECIMAL(20,6) NOT NULL, output_vat DECIMAL(20,6) NOT NULL, other_refund_vat DECIMAL(20,6) NOT NULL, export_refund_vat DECIMAL(20,6) NOT NULL, payable_vat DECIMAL(20,6) NOT NULL, closing_carry DECIMAL(20,6) NOT NULL, external_claimed_vat DECIMAL(20,6) NOT NULL, external_cash_vat DECIMAL(20,6) NOT NULL,
 UNIQUE KEY vat_reconciliation_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_reconciliation_reference (tenant_id,legal_entity_id,reference), KEY vat_reconciliation_state (tenant_id,legal_entity_id,status,requested_at,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id), KEY vat_reconciliation_period (tenant_id,legal_entity_id,period,status),
 CONSTRAINT vat_reconciliation_amount CHECK (registered_vat>=0 AND opening_carry>=0 AND other_deductions>=0 AND total_deductions=opening_carry+ROUND(registered_vat,2)+other_deductions AND output_vat>=0 AND other_refund_vat>=0 AND export_refund_vat>=0 AND payable_vat=GREATEST(0,output_vat-total_deductions) AND closing_carry=GREATEST(0,total_deductions-output_vat)-other_refund_vat-export_refund_vat AND closing_carry>=0 AND external_claimed_vat>=0 AND external_claimed_vat<=export_refund_vat AND external_cash_vat>=0 AND external_cash_vat<=external_claimed_vat),
 FOREIGN KEY (tenant_id,legal_entity_id,accounting_period_id) REFERENCES accounting_periods(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,previous_id) REFERENCES vat_reconciliations(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,basis_id) REFERENCES vat_allocation_bases(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_reconciliation_deductions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reconciliation_id CHAR(36) NOT NULL, deduction_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, deducted_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_reconciliation_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_reconciliation_line_number (reconciliation_id,line_number), UNIQUE KEY vat_reconciliation_source (reconciliation_id,deduction_id), CONSTRAINT vat_reconciliation_line_amount CHECK (deducted_vat>0),FOREIGN KEY (tenant_id,legal_entity_id,reconciliation_id) REFERENCES vat_reconciliations(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,deduction_id) REFERENCES vat_deductions(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_refund_requests (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL, reconciliation_id CHAR(36) NOT NULL, period CHAR(7) NOT NULL, method ENUM('CASH','OFFSET') NOT NULL, assurance ENUM('NONE','YMM','GUARANTEE','TAX_REVIEW') NOT NULL, requested_vat DECIMAL(20,6) NOT NULL, proposed_filing_date DATE NOT NULL,
 UNIQUE KEY vat_refund_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_refund_reference (tenant_id,legal_entity_id,reference), KEY vat_refund_state (tenant_id,legal_entity_id,status,requested_at,id),FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_requested_by) REFERENCES users(tenant_id,id),FOREIGN KEY (tenant_id,void_reviewed_by) REFERENCES users(tenant_id,id), KEY vat_refund_period (reconciliation_id,status), CONSTRAINT vat_refund_amount CHECK (requested_vat>0 AND requested_vat=ROUND(requested_vat,2)),FOREIGN KEY (tenant_id,legal_entity_id,reconciliation_id) REFERENCES vat_reconciliations(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_refund_lines (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, refund_id CHAR(36) NOT NULL, deduction_id CHAR(36) NOT NULL, goods_line_id CHAR(36) NULL, cost_line_id CHAR(36) NULL, line_number INT UNSIGNED NOT NULL, claimed_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_refund_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_refund_line_number (refund_id,line_number), UNIQUE KEY vat_refund_goods (refund_id,goods_line_id), UNIQUE KEY vat_refund_cost (refund_id,cost_line_id), KEY vat_refund_deduction (deduction_id),
 CONSTRAINT vat_refund_line_amount CHECK (claimed_vat>0 AND (goods_line_id IS NOT NULL)+(cost_line_id IS NOT NULL)=1),FOREIGN KEY (tenant_id,legal_entity_id,refund_id) REFERENCES vat_refund_requests(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,deduction_id) REFERENCES vat_deductions(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,goods_line_id) REFERENCES vat_attribution_lines(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,cost_line_id) REFERENCES vat_cost_allocation_lines(tenant_id,legal_entity_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vat_refund_decisions (id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL, deduction_id CHAR(36) NULL, reconciliation_id CHAR(36) NULL, refund_id CHAR(36) NULL, sequence_number INT UNSIGNED NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY vat_refund_decision_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_deduction_decision (deduction_id,sequence_number), UNIQUE KEY vat_reconciliation_decision (reconciliation_id,sequence_number), UNIQUE KEY vat_refund_decision (refund_id,sequence_number),
 CONSTRAINT vat_refund_decision_parent CHECK ((deduction_id IS NOT NULL)+(reconciliation_id IS NOT NULL)+(refund_id IS NOT NULL)=1 AND sequence_number>0),FOREIGN KEY (tenant_id,legal_entity_id,deduction_id) REFERENCES vat_deductions(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,reconciliation_id) REFERENCES vat_reconciliations(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,legal_entity_id,refund_id) REFERENCES vat_refund_requests(tenant_id,legal_entity_id,id),FOREIGN KEY (tenant_id,actor_id) REFERENCES users(tenant_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER vat_deductions_insert BEFORE INSERT ON vat_deductions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New VAT refund request must assemble before review'; END IF; END$$
CREATE TRIGGER vat_deductions_update BEFORE UPDATE ON vat_deductions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.input<=>OLD.input) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at) AND (NEW.goods_source_id<=>OLD.goods_source_id) AND (NEW.cost_source_id<=>OLD.cost_source_id) AND (NEW.period<=>OLD.period) AND (NEW.tax_event_date<=>OLD.tax_event_date) AND (NEW.book_date<=>OLD.book_date) AND (NEW.deducted_vat<=>OLD.deducted_vat) AND (NEW.prior_refunded_vat<=>OLD.prior_refunded_vat)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund plan and original facts are immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT refund transition'; END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT refund review required'; END IF; ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT refund review'; END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund cancellation reason required'; END IF; ELSEIF NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT refund cancellation evidence'; END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT refund void request required'; END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT refund void review required'; END IF;
 ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT refund void evidence'; END IF;
 IF NEW.base_currency<>'TRY' OR DATE_FORMAT(NEW.book_date,'%Y-%m')<>NEW.period OR YEAR(NEW.book_date)>YEAR(NEW.tax_event_date)+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT deduction period or currency invalid'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
 IF EXISTS (SELECT 1 FROM vat_deductions d WHERE d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') AND (d.goods_source_id=NEW.goods_source_id OR d.cost_source_id=NEW.cost_source_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original VAT source already has a deduction'; END IF;
 IF NEW.goods_source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_input_sources s JOIN journal_lines l ON l.id=s.vat_journal_line_id JOIN journals j ON j.id=l.journal_id WHERE s.id=NEW.goods_source_id AND s.base_currency='TRY' AND s.deductible_vat>=NEW.deducted_vat AND j.status='POSTED' AND j.posting_date=NEW.book_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT deduction needs original posted goods debit'; END IF;
 IF NEW.cost_source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_cost_sources s JOIN journal_lines l ON l.id=s.vat_journal_line_id JOIN journals j ON j.id=l.journal_id WHERE s.id=NEW.cost_source_id AND s.status='APPROVED' AND s.base_currency='TRY' AND s.deductible_vat>=NEW.deducted_vat AND j.status='POSTED' AND j.posting_date=NEW.book_date) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT deduction needs approved cost debit'; END IF; END IF;
 IF EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.period=NEW.period AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Void dependent VAT reconciliation before changing deductions'; END IF; END$$
CREATE TRIGGER vat_reconciliations_insert BEFORE INSERT ON vat_reconciliations FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New VAT refund request must assemble before review'; END IF; END$$
CREATE TRIGGER vat_reconciliations_update BEFORE UPDATE ON vat_reconciliations FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.input<=>OLD.input) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at) AND (NEW.accounting_period_id<=>OLD.accounting_period_id) AND (NEW.period<=>OLD.period) AND (NEW.previous_id<=>OLD.previous_id) AND (NEW.basis_id<=>OLD.basis_id) AND (NEW.registered_vat<=>OLD.registered_vat) AND (NEW.opening_carry<=>OLD.opening_carry) AND (NEW.other_deductions<=>OLD.other_deductions) AND (NEW.total_deductions<=>OLD.total_deductions) AND (NEW.output_vat<=>OLD.output_vat) AND (NEW.other_refund_vat<=>OLD.other_refund_vat) AND (NEW.export_refund_vat<=>OLD.export_refund_vat) AND (NEW.payable_vat<=>OLD.payable_vat) AND (NEW.closing_carry<=>OLD.closing_carry) AND (NEW.external_claimed_vat<=>OLD.external_claimed_vat) AND (NEW.external_cash_vat<=>OLD.external_cash_vat)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund plan and original facts are immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT refund transition'; END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT refund review required'; END IF; ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT refund review'; END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund cancellation reason required'; END IF; ELSEIF NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT refund cancellation evidence'; END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT refund void request required'; END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT refund void review required'; END IF;
 ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT refund void evidence'; END IF;
 IF NEW.base_currency<>'TRY' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='KDV1 reconciliation requires TRY'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
 IF EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.id<>NEW.id AND r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.period=NEW.period AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT month already reconciled'; END IF;
 IF OLD.status='ASSEMBLING' AND EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.id<>NEW.id AND r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') AND (r.period>NEW.period OR (NEW.previous_id IS NULL AND r.period<NEW.period))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT reconciliation must extend the approved monthly carry chain'; END IF;
 IF NOT EXISTS (SELECT 1 FROM accounting_periods p WHERE p.id=NEW.accounting_period_id AND p.status='CLOSED' AND p.start_date=CONCAT(NEW.period,'-01') AND p.end_date=LAST_DAY(p.start_date)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='KDV1 needs a closed full calendar month'; END IF;
 IF NEW.previous_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_reconciliations p WHERE p.id=NEW.previous_id AND p.status='APPROVED' AND p.closing_carry=NEW.opening_carry AND p.period=DATE_FORMAT(DATE_SUB(CONCAT(NEW.period,'-01'),INTERVAL 1 MONTH),'%Y-%m')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT previous month carry differs'; END IF;
 IF NEW.export_refund_vat>0 AND NEW.basis_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Export refund needs approved monthly basis'; END IF;
 IF NEW.basis_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_allocation_bases b WHERE b.id=NEW.basis_id AND b.period=NEW.period AND b.status='APPROVED' AND b.base_currency='TRY') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT monthly basis unavailable'; END IF;
 IF NEW.registered_vat<>(SELECT COALESCE(SUM(deducted_vat),0) FROM vat_reconciliation_deductions WHERE reconciliation_id=NEW.id) OR EXISTS (SELECT 1 FROM vat_deductions d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.period=NEW.period AND d.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') AND (d.status<>'APPROVED' OR NOT EXISTS (SELECT 1 FROM vat_reconciliation_deductions l WHERE l.reconciliation_id=NEW.id AND l.deduction_id=d.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reconcile all reviewed period deductions'; END IF;
 IF EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.basis_id=NEW.basis_id AND a.treatment='CANDIDATE' AND a.status IN ('REQUESTED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finish period VAT cost reviews first'; END IF; END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED','CANCELLED','REJECTED') AND (EXISTS (SELECT 1 FROM vat_refund_requests q WHERE q.reconciliation_id=NEW.id AND q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) OR EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.previous_id=NEW.id AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) OR EXISTS (SELECT 1 FROM vat_refund_lines l JOIN vat_refund_requests q ON q.id=l.refund_id JOIN vat_reconciliation_deductions d ON d.deduction_id=l.deduction_id WHERE d.reconciliation_id=NEW.id AND q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Release dependent refund requests and later months first'; END IF; END$$
CREATE TRIGGER vat_refund_requests_insert BEFORE INSERT ON vat_refund_requests FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New VAT refund request must assemble before review'; END IF; END$$
CREATE TRIGGER vat_refund_requests_update BEFORE UPDATE ON vat_refund_requests FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF;
 IF NOT ((NEW.id<=>OLD.id) AND (NEW.tenant_id<=>OLD.tenant_id) AND (NEW.legal_entity_id<=>OLD.legal_entity_id) AND (NEW.reference<=>OLD.reference) AND (NEW.base_currency<=>OLD.base_currency) AND (NEW.input<=>OLD.input) AND (NEW.plan<=>OLD.plan) AND (NEW.context_hash<=>OLD.context_hash) AND (NEW.reason<=>OLD.reason) AND (NEW.evidence<=>OLD.evidence) AND (NEW.requested_by<=>OLD.requested_by) AND (NEW.requested_at<=>OLD.requested_at) AND (NEW.reconciliation_id<=>OLD.reconciliation_id) AND (NEW.period<=>OLD.period) AND (NEW.method<=>OLD.method) AND (NEW.assurance<=>OLD.assurance) AND (NEW.requested_vat<=>OLD.requested_vat) AND (NEW.proposed_filing_date<=>OLD.proposed_filing_date)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund plan and original facts are immutable'; END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VAT refund transition'; END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT refund review required'; END IF; ELSEIF NOT ((NEW.reviewed_by<=>OLD.reviewed_by) AND (NEW.reviewed_at<=>OLD.reviewed_at) AND (NEW.review_reason<=>OLD.review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain original VAT refund review'; END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund cancellation reason required'; END IF; ELSEIF NOT ((NEW.cancel_reason<=>OLD.cancel_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT refund cancellation evidence'; END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidenced VAT refund void request required'; END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence)) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent VAT refund void review required'; END IF;
 ELSEIF NOT ((NEW.void_requested_by<=>OLD.void_requested_by) AND (NEW.void_requested_at<=>OLD.void_requested_at) AND (NEW.void_reason<=>OLD.void_reason) AND (NEW.void_evidence<=>OLD.void_evidence) AND (NEW.void_reviewed_by<=>OLD.void_reviewed_by) AND (NEW.void_reviewed_at<=>OLD.void_reviewed_at) AND (NEW.void_review_reason<=>OLD.void_review_reason)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT refund void evidence'; END IF;
 IF NEW.base_currency<>'TRY' OR NEW.proposed_filing_date<=LAST_DAY(CONCAT(NEW.period,'-01')) OR YEAR(NEW.proposed_filing_date)>CAST(LEFT(NEW.period,4) AS UNSIGNED)+2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund currency or filing date invalid'; END IF;
 IF NEW.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') THEN
 IF NOT EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.id=NEW.reconciliation_id AND r.status='APPROVED' AND r.period=NEW.period AND r.export_refund_vat-r.external_claimed_vat>=NEW.requested_vat+COALESCE((SELECT SUM(q.requested_vat) FROM vat_refund_requests q WHERE q.reconciliation_id=r.id AND q.id<>NEW.id AND q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund exceeds approved return budget'; END IF;
 IF NEW.requested_vat<>(SELECT COALESCE(SUM(claimed_vat),0) FROM vat_refund_lines WHERE refund_id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund line total differs'; END IF;
 IF (OLD.status='ASSEMBLING' OR (OLD.status='REQUESTED' AND NEW.status='APPROVED')) AND NEW.method='CASH' AND NEW.assurance='NONE' AND NEW.requested_vat+(SELECT external_cash_vat FROM vat_reconciliations WHERE id=NEW.reconciliation_id)+COALESCE((SELECT SUM(q.requested_vat) FROM vat_refund_requests q WHERE q.reconciliation_id=NEW.reconciliation_id AND q.id<>NEW.id AND q.method='CASH' AND q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')),0)>50000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Aggregate VAT cash requests require reviewed assurance'; END IF;
 IF (OLD.status='ASSEMBLING' OR (OLD.status='REQUESTED' AND NEW.status='APPROVED')) AND NEW.assurance<>'TAX_REVIEW' AND NEW.requested_vat+(SELECT external_claimed_vat FROM vat_reconciliations WHERE id=NEW.reconciliation_id)+COALESCE((SELECT SUM(q.requested_vat) FROM vat_refund_requests q WHERE q.reconciliation_id=NEW.reconciliation_id AND q.id<>NEW.id AND q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')),0)>(SELECT b.ordinary_ceiling FROM vat_reconciliations r JOIN vat_allocation_bases b ON b.id=r.basis_id WHERE r.id=NEW.reconciliation_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Above ceiling VAT refund requires tax inspection'; END IF;
 IF EXISTS (SELECT 1 FROM vat_refund_lines l JOIN vat_deductions d ON d.id=l.deduction_id WHERE l.refund_id=NEW.id AND (d.status<>'APPROVED' OR d.deducted_vat-d.prior_refunded_vat<(SELECT COALESCE(SUM(x.claimed_vat),0) FROM vat_refund_lines x JOIN vat_refund_requests q ON q.id=x.refund_id WHERE x.deduction_id=d.id AND (q.id=NEW.id OR q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED'))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original deducted VAT already reserved'; END IF;
 IF EXISTS (SELECT 1 FROM vat_refund_lines l LEFT JOIN vat_attribution_lines g ON g.id=l.goods_line_id LEFT JOIN vat_cost_allocation_lines a ON a.id=l.cost_line_id WHERE l.refund_id=NEW.id AND COALESCE(g.candidate_vat,a.candidate_vat)<(SELECT COALESCE(SUM(x.claimed_vat),0) FROM vat_refund_lines x JOIN vat_refund_requests q ON q.id=x.refund_id WHERE (x.goods_line_id=l.goods_line_id OR x.cost_line_id=l.cost_line_id) AND (q.id=NEW.id OR q.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original VAT candidate already reserved'; END IF; END IF; END$$
CREATE TRIGGER vat_reconciliation_line_insert BEFORE INSERT ON vat_reconciliation_deductions FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM vat_reconciliations r JOIN vat_deductions d ON d.id=NEW.deduction_id WHERE r.id=NEW.reconciliation_id AND r.status='ASSEMBLING' AND d.status='APPROVED' AND d.period=r.period AND d.deducted_vat=NEW.deducted_vat) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT reconciliation line needs reviewed deduction'; END IF; END$$
CREATE TRIGGER vat_refund_line_insert BEFORE INSERT ON vat_refund_lines FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NOT EXISTS (SELECT 1 FROM vat_refund_requests q JOIN vat_reconciliations r ON r.id=q.reconciliation_id JOIN vat_deductions d ON d.id=NEW.deduction_id WHERE q.id=NEW.refund_id AND q.status='ASSEMBLING' AND r.status='APPROVED' AND d.status='APPROVED' AND d.period<=q.period AND EXISTS (SELECT 1 FROM vat_reconciliation_deductions x JOIN vat_reconciliations p ON p.id=x.reconciliation_id WHERE x.deduction_id=d.id AND p.status='APPROVED') AND ((NEW.goods_line_id IS NOT NULL AND EXISTS (SELECT 1 FROM vat_allocation_basis_lines b JOIN vat_attribution_lines l ON l.id=b.attribution_line_id JOIN vat_attributions a ON a.id=l.attribution_id WHERE b.basis_id=r.basis_id AND l.id=NEW.goods_line_id AND l.source_id=d.goods_source_id AND a.status='APPROVED' AND a.treatment='CANDIDATE')) OR (NEW.cost_line_id IS NOT NULL AND EXISTS (SELECT 1 FROM vat_cost_allocation_lines l JOIN vat_cost_allocations a ON a.id=l.allocation_id WHERE l.id=NEW.cost_line_id AND a.basis_id=r.basis_id AND a.source_id=d.cost_source_id AND a.status='APPROVED' AND a.treatment='CANDIDATE')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund line needs reconciled original candidate'; END IF; END$$
CREATE TRIGGER vat_refund_cost_freeze BEFORE UPDATE ON vat_cost_allocations FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF NEW.treatment='CANDIDATE' AND EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.basis_id=NEW.basis_id AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Void dependent KDV1 reconciliation before changing cost allocation'; END IF; END$$
CREATE TRIGGER vat_refund_basis_freeze BEFORE UPDATE ON vat_allocation_bases FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.basis_id=NEW.id AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Void dependent KDV1 reconciliation before changing basis'; END IF; END$$
CREATE TRIGGER vat_refund_source_freeze BEFORE UPDATE ON vat_cost_sources FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF EXISTS (SELECT 1 FROM vat_deductions d WHERE d.cost_source_id=NEW.id AND d.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Void dependent VAT deduction before changing cost source'; END IF; END$$
CREATE TRIGGER vat_refund_period_freeze BEFORE UPDATE ON accounting_periods FOR EACH ROW BEGIN DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active VAT entity required'; END IF; IF (NEW.status<>'CLOSED' OR NOT (NEW.start_date<=>OLD.start_date) OR NOT (NEW.end_date<=>OLD.end_date)) AND EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.accounting_period_id=NEW.id AND r.status IN ('REQUESTED','APPROVED','VOID_REQUESTED')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Void dependent KDV1 reconciliation before reopening month'; END IF; END$$
CREATE TRIGGER vat_reconciliation_deductions_no_update BEFORE UPDATE ON vat_reconciliation_deductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund lines and decisions are immutable'; END$$
CREATE TRIGGER vat_refund_lines_no_update BEFORE UPDATE ON vat_refund_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund lines and decisions are immutable'; END$$
CREATE TRIGGER vat_refund_decisions_no_update BEFORE UPDATE ON vat_refund_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VAT refund lines and decisions are immutable'; END$$
CREATE TRIGGER vat_deductions_no_delete BEFORE DELETE ON vat_deductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT reconciliation and refund history'; END$$
CREATE TRIGGER vat_reconciliations_no_delete BEFORE DELETE ON vat_reconciliations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT reconciliation and refund history'; END$$
CREATE TRIGGER vat_reconciliation_deductions_no_delete BEFORE DELETE ON vat_reconciliation_deductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT reconciliation and refund history'; END$$
CREATE TRIGGER vat_refund_requests_no_delete BEFORE DELETE ON vat_refund_requests FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT reconciliation and refund history'; END$$
CREATE TRIGGER vat_refund_lines_no_delete BEFORE DELETE ON vat_refund_lines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT reconciliation and refund history'; END$$
CREATE TRIGGER vat_refund_decisions_no_delete BEFORE DELETE ON vat_refund_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retain VAT reconciliation and refund history'; END$$
DELIMITER ;
