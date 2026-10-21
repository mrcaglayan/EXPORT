-- NEW design baseline v2, revised 21 October 2026 for completed PR-01B.
-- Original referenced inputs were not supplied. User-authorized replacement.
-- REFERENCE ONLY: m004_product_foundation.js and m005_product_classification.js
-- are the executable migrations. Requires existing m001/m002/m003.
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

-- PR-01C: product UI polish and combined release gate; no assumed new tables.
-- PR-02 contracts remain planned, NOT executable DDL here:
-- 02A warehouses, virtual pools, periods and movement metadata.
-- 02B receipts/items/layers, immutable physical/pool ledgers, projections.
-- 02C approved equal/opposite pool reallocations, no physical/GL change.
-- 02D reservations/dispatch, exact SKU and source-layer consumption.
-- 02E versioned close snapshots and GL reconciliation checkpoints.
-- 02F reversals/adjustments with original-event lineage.
-- All carry tenant/entity scope. Physical movements reference SKUs, not families.
-- Refine future DDL in each stage; see companion specification for invariants.
