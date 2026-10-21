// Self-contained and immutable once applied.
const scope = `
    tenant_id CHAR(36) NOT NULL,
    legal_entity_id CHAR(36) NOT NULL`;
const entityFk = 'FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)';
const tables = [
  ['accounting_settings', `${scope},
    base_currency CHAR(3) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id),
    ${entityFk}`],
  ['accounts', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    account_type ENUM('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY account_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY account_code (tenant_id, legal_entity_id, code),
    ${entityFk}`],
  ['fiscal_years', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    code VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    UNIQUE KEY year_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY year_code (tenant_id, legal_entity_id, code),
    CONSTRAINT year_dates CHECK (start_date <= end_date),
    ${entityFk}`],
  ['accounting_periods', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    fiscal_year_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
    closed_at DATETIME NULL,
    UNIQUE KEY period_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY period_code (tenant_id, legal_entity_id, code),
    KEY period_dates (tenant_id, legal_entity_id, start_date, end_date),
    CONSTRAINT period_date_order CHECK (start_date <= end_date),
    FOREIGN KEY (tenant_id, legal_entity_id, fiscal_year_id) REFERENCES fiscal_years(tenant_id, legal_entity_id, id)`],
  ['journals', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    period_id CHAR(36) NOT NULL,
    document_date DATE NOT NULL,
    posting_date DATE NOT NULL,
    currency CHAR(3) NOT NULL,
    description VARCHAR(255) NOT NULL,
    source_module VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status ENUM('DRAFT','POSTED') NOT NULL DEFAULT 'DRAFT',
    total_debit DECIMAL(20,6) NOT NULL,
    total_credit DECIMAL(20,6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY journal_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY journal_source (tenant_id, legal_entity_id, source_module, source_id),
    KEY journal_dates (tenant_id, legal_entity_id, posting_date, id),
    CONSTRAINT journal_balanced CHECK (total_debit > 0 AND total_debit = total_credit),
    FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES accounting_periods(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)`],
  ['journal_lines', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    journal_id CHAR(36) NOT NULL,
    line_number INT UNSIGNED NOT NULL,
    account_id CHAR(36) NOT NULL,
    description VARCHAR(255) NOT NULL,
    debit DECIMAL(20,6) NOT NULL,
    credit DECIMAL(20,6) NOT NULL,
    UNIQUE KEY journal_line_number (tenant_id, legal_entity_id, journal_id, line_number),
    CONSTRAINT journal_line_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
    FOREIGN KEY (tenant_id, legal_entity_id, journal_id) REFERENCES journals(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, account_id) REFERENCES accounts(tenant_id, legal_entity_id, id)`],
  ['posting_requests', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    period_id CHAR(36) NOT NULL,
    source_module VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payload JSON NOT NULL,
    payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status ENUM('PENDING','FAILED','POSTED') NOT NULL DEFAULT 'PENDING',
    journal_id CHAR(36) NULL,
    error_code VARCHAR(80) NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY request_scope (tenant_id, legal_entity_id, id),
    UNIQUE KEY request_source (tenant_id, legal_entity_id, source_module, source_id),
    KEY request_status (tenant_id, legal_entity_id, status, created_at),
    CONSTRAINT request_journal_state CHECK (
      (status = 'POSTED' AND journal_id IS NOT NULL AND error_code IS NULL)
      OR (status IN ('PENDING','FAILED') AND journal_id IS NULL)),
    FOREIGN KEY (tenant_id, legal_entity_id, period_id) REFERENCES accounting_periods(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, journal_id) REFERENCES journals(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)`],
  ['audit_events', `
    id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    actor_id CHAR(36) NOT NULL,
    action VARCHAR(80) NOT NULL,
    resource_id CHAR(36) NOT NULL,
    request_id VARCHAR(100) NOT NULL,
    details JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY audit_scope (tenant_id, legal_entity_id, created_at, id),
    ${entityFk},
    FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, id)`],
  ['idempotency_records', `${scope},
    idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor_id CHAR(36) NOT NULL,
    operation VARCHAR(80) NOT NULL,
    payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    response JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, legal_entity_id, idempotency_key),
    ${entityFk},
    FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, id)`],
];
const reject = message => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${message}';`;
const triggers = [
  ['journal_insert_draft', 'INSERT', 'journals', `BEGIN
    IF NEW.status <> 'DRAFT' THEN ${reject('Journal must be assembled before posting')} END IF;
  END`],
  ['journal_post_guard', 'UPDATE', 'journals', `BEGIN
    DECLARE line_count INT;
    DECLARE debits DECIMAL(30,6);
    DECLARE credits DECIMAL(30,6);
    IF OLD.status <> 'DRAFT' OR NEW.status <> 'POSTED'
      OR NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.legal_entity_id <> OLD.legal_entity_id
      OR NEW.period_id <> OLD.period_id OR NEW.document_date <> OLD.document_date OR NEW.posting_date <> OLD.posting_date
      OR NEW.currency <> OLD.currency OR NEW.description <> OLD.description
      OR NEW.source_module <> OLD.source_module OR NEW.source_id <> OLD.source_id
      OR NEW.payload_hash <> OLD.payload_hash OR NEW.total_debit <> OLD.total_debit OR NEW.total_credit <> OLD.total_credit
      OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
    THEN ${reject('Posted journals are immutable')} END IF;
    SELECT COUNT(*), COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO line_count, debits, credits FROM journal_lines
      WHERE tenant_id = NEW.tenant_id AND legal_entity_id = NEW.legal_entity_id AND journal_id = NEW.id;
    IF line_count < 2 OR debits <> credits OR debits <> NEW.total_debit OR credits <> NEW.total_credit
    THEN ${reject('Journal lines must balance to header totals')} END IF;
    IF NOT EXISTS (SELECT 1 FROM accounting_periods
      WHERE tenant_id = NEW.tenant_id AND legal_entity_id = NEW.legal_entity_id AND id = NEW.period_id
      AND status = 'OPEN' AND NEW.posting_date BETWEEN start_date AND end_date)
    THEN ${reject('Posting period must be open')} END IF;
  END`],
  ['journal_no_delete', 'DELETE', 'journals', `BEGIN ${reject('Journals cannot be deleted')} END`],
  ['journal_line_insert_guard', 'INSERT', 'journal_lines', `BEGIN
    IF NOT EXISTS (SELECT 1 FROM journals WHERE id = NEW.journal_id AND tenant_id = NEW.tenant_id
      AND legal_entity_id = NEW.legal_entity_id AND status = 'DRAFT')
    THEN ${reject('Lines can only be added to assembling journals')} END IF;
  END`],
  ...['UPDATE', 'DELETE'].flatMap(event => [
    [`journal_lines_no_${event.toLowerCase()}`, event, 'journal_lines', `BEGIN ${reject('Journal lines are immutable')} END`],
    [`audit_no_${event.toLowerCase()}`, event, 'audit_events', `BEGIN ${reject('Audit events are immutable')} END`],
  ]),
  ...['INSERT', 'UPDATE'].map(event => [`request_posted_${event.toLowerCase()}`, event, 'posting_requests', `BEGIN
    IF NEW.status = 'POSTED' AND NOT EXISTS (SELECT 1 FROM journals
      WHERE id = NEW.journal_id AND tenant_id = NEW.tenant_id AND legal_entity_id = NEW.legal_entity_id
      AND status = 'POSTED' AND source_module = NEW.source_module AND source_id = NEW.source_id
      AND payload_hash = NEW.payload_hash)
    THEN ${reject('Posted requests require a matching posted journal')} END IF;
  END`]),
];
const permissions = [
  ['accounting.configure', 'Configure entity currency, accounts and fiscal periods'],
  ['accounting.post', 'Post balanced journals and process posting requests'],
  ['accounting.request', 'Enqueue balanced posting requests'],
  ['accounting.period.close', 'Close accounting periods after pending posting checks'],
  ['accounting.audit.read', 'Read accounting audit events'],
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Accounting columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Accounting table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Accounting foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Accounting indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Accounting check missing: ${constraint}`);
    }
  }
  for (const [name, event, table, body] of triggers) {
    const [[trigger]] = await connection.execute(`SELECT ACTION_STATEMENT AS body, EVENT_MANIPULATION AS event,
      EVENT_OBJECT_TABLE AS tableName, ACTION_TIMING AS timing FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() AND trigger_name = ?`, [name]);
    if (!trigger || trigger.event !== event || trigger.tableName !== table || trigger.timing !== 'BEFORE'
      || normalize(trigger.body) !== normalize(body)) throw new Error(`Accounting trigger differs: ${name}`);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing accounting permissions');
}
export default {
  key: 'm003_accounting_foundation',
  description: 'Scoped accounting, balanced immutable journals, posting requests, audit and idempotency.',
  async up(connection) {
    for (const [name, definition] of tables) await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition})
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    for (const [name, event, table, body] of triggers) {
      const [existing] = await connection.execute('SELECT TRIGGER_NAME FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ?', [name]);
      if (!existing.length) await connection.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
    }
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
