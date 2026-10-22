// PR-02A, 22 October 2026. Self-contained; freeze once applied.
const scope = 'tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const entityFk = 'FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)';
// Frozen snapshot independent of runtime reference updates.
const countries = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');
export const tables = [
  ['warehouses', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    location VARCHAR(500) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY warehouse_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY warehouse_code (tenant_id, legal_entity_id, code),
    CONSTRAINT warehouse_active CHECK (active IN (0,1)),
    ${entityFk}`],
  ['inventory_pools', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
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
      (kind = 'COUNTRY' AND country_code IS NOT NULL AND code = country_code AND country_code IN (${countries.map(c => `'${c}'`).join(',')}))),
    ${entityFk}`],
  ['inventory_periods', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    accounting_period_id CHAR(36) NOT NULL,
    status ENUM('OPEN','IN_REVIEW','CLOSED') NOT NULL DEFAULT 'OPEN',
    UNIQUE KEY inventory_period_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY inventory_period_calendar (tenant_id, legal_entity_id, accounting_period_id),
    ${entityFk},
    FOREIGN KEY (tenant_id, legal_entity_id, accounting_period_id) REFERENCES accounting_periods(tenant_id, legal_entity_id, id)`],
  ['inventory_movement_types', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    effect ENUM('RECEIPT','ISSUE','REALLOCATION','ADJUSTMENT_IN','ADJUSTMENT_OUT','REVALUATION') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY movement_type_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY movement_type_code (tenant_id, legal_entity_id, code),
    CONSTRAINT movement_type_active CHECK (active IN (0,1)),
    ${entityFk}`],
];
const permissions = [
  ['inventory.configure', 'Maintain warehouse, pool, period and movement metadata'],
  ['inventory.audit.read', 'Read inventory audit events'],
];

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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Inventory columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Inventory table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Inventory foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Inventory indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Inventory check missing: ${constraint}`);
    }
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing inventory permissions');
}

export default {
  key: 'm006_inventory_foundation',
  description: 'Scoped warehouses, virtual destination pools, calendar-linked inventory periods and movement metadata.',
  async up(connection) {
    for (const [name, definition] of tables) await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    for (const [code, description] of permissions) {
      await connection.execute('INSERT INTO permissions (code, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE code = code', [code, description]);
      await connection.execute(`INSERT INTO role_permissions (tenant_id, role_id, permission_code)
        SELECT tenant_id, id, ? FROM roles WHERE code = 'ADMIN' ON DUPLICATE KEY UPDATE permission_code = permission_code`, [code]);
    }
  },
  verify,
};
