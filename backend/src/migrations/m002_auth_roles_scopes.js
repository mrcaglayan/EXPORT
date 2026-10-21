// Immutable after application. Composite foreign keys prevent cross-tenant links.
const tables = [
  ['tenants', `
    id CHAR(36) NOT NULL PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  `],
  ['legal_entities', `
    id CHAR(36) NOT NULL PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY entity_scope (tenant_id, id),
    UNIQUE KEY entity_code (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  `],
  ['users', `
    id CHAR(36) NOT NULL PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    email VARCHAR(254) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY user_scope (tenant_id, id),
    UNIQUE KEY user_email (tenant_id, email),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  `],
  ['roles', `
    id CHAR(36) NOT NULL PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    UNIQUE KEY role_scope (tenant_id, id),
    UNIQUE KEY role_code (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  `],
  ['permissions', `
    code VARCHAR(80) NOT NULL PRIMARY KEY,
    description VARCHAR(180) NOT NULL
  `],
  ['role_permissions', `
    tenant_id CHAR(36) NOT NULL,
    role_id CHAR(36) NOT NULL,
    permission_code VARCHAR(80) NOT NULL,
    PRIMARY KEY (tenant_id, role_id, permission_code),
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id),
    FOREIGN KEY (permission_code) REFERENCES permissions(code)
  `],
  ['user_role_assignments', `
    tenant_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    role_id CHAR(36) NOT NULL,
    legal_entity_id CHAR(36) NOT NULL,
    PRIMARY KEY (tenant_id, user_id, legal_entity_id, role_id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)
  `],
  ['auth_sessions', `
    id CHAR(36) NOT NULL PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    active_entity_id CHAR(36) NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY session_expiry (expires_at),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, active_entity_id) REFERENCES legal_entities(tenant_id, id)
  `],
  ['auth_rate_limits', `
    bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    hits INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    KEY rate_expiry (expires_at)
  `],
];

const permissions = [
  ['workspace.read', 'Open the workspace and select this legal entity'],
  ['organizations.read', 'Read assigned legal entities'],
  ['organizations.update', 'Update an assigned legal entity name'],
  ['products.read', 'View the product module'],
  ['inventory.read', 'View the inventory module'],
  ['exports.read', 'View the export module'],
  ['vat.read', 'View the VAT module'],
  ['accounting.read', 'View the accounting module'],
  ['settings.read', 'View workspace settings'],
];

async function verify(connection) {
  for (const [table, definition] of tables) {
      // Read-only verification, including a reviewed retry after partial DDL.
      const [actual] = await connection.query(`SHOW FULL COLUMNS FROM ${table}`);
      const declaredColumns = [...definition.matchAll(/^\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME)\s+(.+)$/gm)];
      const expected = declaredColumns.map(([, name, type, options]) => ({
        name, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : null,
        collation: /CHAR/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : 'utf8mb4_0900_ai_ci' : null,
      }));
      const columns = actual.map(c => ({ name: c.Field, type: c.Type, nullable: c.Null, default: c.Default, collation: c.Collation }));
      if (JSON.stringify(columns) !== JSON.stringify(expected)
        || actual.some(c => !['', 'DEFAULT_GENERATED'].includes(c.Extra))) {
        throw new Error(`Unexpected identity table structure: ${table}`);
      }
      const [[metadata]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
        FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [table]);
      if (metadata?.engine !== 'InnoDB' || metadata?.collation !== 'utf8mb4_0900_ai_ci') {
        throw new Error(`Unexpected identity table engine or collation: ${table}`);
      }
      // SHOW COLUMNS alone cannot detect missing composite foreign keys.
      const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY ORDINAL_POSITION, COLUMN_NAME, REFERENCED_TABLE_NAME`, [table]);
      const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
        .flatMap(([, columns, target, referenced]) => columns.split(',').map((column, i) =>
          `${column.trim()}:${target}:${referenced.split(',')[i].trim()}`)).sort();
      if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) {
        throw new Error(`Unexpected identity foreign keys: ${table}`);
      }
      const [indexes] = await connection.query(`SHOW INDEX FROM ${table}`);
      const signature = rows => rows.map(r => `${r.Key_name}:${r.Non_unique}:${r.Seq_in_index}:${r.Column_name}`).sort();
      const expectedIndexes = [];
      for (const [, name, , options] of declaredColumns) {
        if (options.includes('PRIMARY KEY')) expectedIndexes.push(`PRIMARY:0:1:${name}`);
        if (options.includes('UNIQUE')) expectedIndexes.push(`${name}:0:1:${name}`);
      }
      for (const [, unique, name, columns] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
        columns.split(',').forEach((column, i) => expectedIndexes.push(`${name}:${unique ? 0 : 1}:${i + 1}:${column.trim()}`));
      }
      const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
      primary?.[1].split(',').forEach((column, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${column.trim()}`));
      if (!expectedIndexes.every(key => signature(indexes).includes(key))
        || indexes.filter(i => i.Non_unique === 0).some(i => !expectedIndexes.includes(`${i.Key_name}:0:${i.Seq_in_index}:${i.Column_name}`))) {
        throw new Error(`Unexpected identity indexes: ${table}`);
      }
  }
  const [rows] = await connection.query('SELECT code FROM permissions ORDER BY code');
  if (!permissions.every(([code]) => rows.some(row => row.code === code))) throw new Error('Missing foundation permissions');
}

export default {
  key: 'm002_auth_roles_scopes',
  description: 'Tenant-scoped identity, entity roles, revocable sessions and login limits.',
  async up(connection) {
    for (const [table, definition] of tables) {
      await connection.query(`CREATE TABLE IF NOT EXISTS ${table} (${definition})
        ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    }
    for (const [code, description] of permissions) {
      await connection.execute(`INSERT INTO permissions (code, description) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE code = code`, [code, description]);
    }
  },
  verify,
};
