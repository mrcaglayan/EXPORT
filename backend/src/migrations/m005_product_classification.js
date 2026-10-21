// PR-01B. Self-contained; immutable once applied.
const scope = 'tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const entityFk = 'FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)';
const skuFk = 'FOREIGN KEY (tenant_id, legal_entity_id, sku_id) REFERENCES product_skus(tenant_id, legal_entity_id, id)';
const review = `status ENUM('PENDING','REVIEWED','VERIFIED','REJECTED','RETIRED') NOT NULL DEFAULT 'PENDING',
    source_reference VARCHAR(1000) NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL,
    reviewed_at DATETIME NULL,
    verified_by CHAR(36) NULL,
    verified_at DATETIME NULL`;
const actorFks = `FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, verified_by) REFERENCES users(tenant_id, id)`;
export const tables = [
  ['product_suppliers', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY supplier_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY supplier_code (tenant_id, legal_entity_id, code),
    ${entityFk}`],
  ['product_attribute_definitions', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    data_type ENUM('TEXT','DECIMAL','BOOLEAN') NOT NULL,
    unit_label VARCHAR(16) NOT NULL,
    defines_stock BOOLEAN NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY attribute_definition_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY attribute_definition_code (tenant_id, legal_entity_id, code),
    ${entityFk}`],
  ['product_sku_attributes', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    sku_id CHAR(36) NOT NULL,
    definition_id CHAR(36) NOT NULL,
    value JSON NOT NULL,
    UNIQUE KEY sku_attribute_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY sku_attribute_definition (tenant_id, legal_entity_id, sku_id, definition_id),
    ${skuFk},
    FOREIGN KEY (tenant_id, legal_entity_id, definition_id) REFERENCES product_attribute_definitions(tenant_id, legal_entity_id, id)`],
  ['product_gtip_history', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    sku_id CHAR(36) NOT NULL,
    gtip_code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    broker_name VARCHAR(160) NULL,
    verification_reference VARCHAR(1000) NULL,
    verified_on DATE NULL,
    ${review},
    UNIQUE KEY gtip_scope (tenant_id, legal_entity_id, id),
    KEY gtip_windows (tenant_id, legal_entity_id, sku_id, status, effective_from, effective_to),
    CONSTRAINT gtip_digits CHECK (gtip_code REGEXP '^[0-9]{12}$'),
    CONSTRAINT gtip_dates CHECK (effective_to IS NULL OR effective_from <= effective_to),
    CONSTRAINT gtip_review_state CHECK (
      status NOT IN ('REVIEWED','VERIFIED','RETIRED') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT gtip_verified_state CHECK (
      status NOT IN ('VERIFIED','RETIRED') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL
        AND broker_name IS NOT NULL AND verification_reference IS NOT NULL AND verified_on IS NOT NULL)),
    ${skuFk}, ${actorFks}`],
  ['product_alias_sources', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    supplier_id CHAR(36) NOT NULL,
    supplier_code VARCHAR(120) NOT NULL,
    supplier_description VARCHAR(1000) NOT NULL,
    source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY alias_source_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY alias_source_identity (tenant_id, legal_entity_id, supplier_id, source_hash),
    FOREIGN KEY (tenant_id, legal_entity_id, supplier_id) REFERENCES product_suppliers(tenant_id, legal_entity_id, id)`],
  ['product_aliases', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    source_id CHAR(36) NOT NULL,
    current_source_id CHAR(36) NULL,
    revision INT UNSIGNED NOT NULL,
    sku_id CHAR(36) NOT NULL,
    ${review},
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
    ${skuFk}, ${actorFks}`],
];
const permissions = [['products.review', 'Review catalogue mappings and record broker-verified GTIP classifications']];
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Product columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Product table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Product foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Product indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Product check missing: ${constraint}`);
    }
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing product permissions');
}
export default {
  key: 'm005_product_classification',
  description: 'Typed SKU specifications, reviewed GTIP history and versioned supplier aliases.',
  async up(connection) {
    for (const [name, definition] of tables) await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition})
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    for (const [code, description] of permissions) {
      await connection.execute('INSERT INTO permissions (code, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE code = code', [code, description]);
      // Explicit upgrade of the foundation ADMIN role, only within its assigned entities.
      await connection.execute(`INSERT INTO role_permissions (tenant_id, role_id, permission_code)
        SELECT tenant_id, id, ? FROM roles WHERE code = 'ADMIN'
        ON DUPLICATE KEY UPDATE permission_code = permission_code`, [code]);
    }
  },
  verify,
};
