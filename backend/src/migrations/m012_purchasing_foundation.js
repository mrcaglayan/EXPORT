// PR-03A. Self-contained forward migration; freeze after local application.
const scope = 'tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const entityFk = 'FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)';
export const tables = [
  ['trading_partners', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
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
    ${entityFk},
    FOREIGN KEY (tenant_id, legal_entity_id, supplier_id) REFERENCES product_suppliers(tenant_id, legal_entity_id, id)`],
  ['purchasing_documents', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
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
    ${entityFk},
    FOREIGN KEY (tenant_id, legal_entity_id, partner_id) REFERENCES trading_partners(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, request_id) REFERENCES purchasing_documents(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, legal_entity_id, contract_id) REFERENCES purchasing_documents(tenant_id, legal_entity_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, cancelled_by) REFERENCES users(tenant_id, id)`],
  ['purchase_request_lines', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
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
    FOREIGN KEY (tenant_id, legal_entity_id, unit_id) REFERENCES unit_of_measure(tenant_id, legal_entity_id, id)`],
  ['purchase_order_lines', `id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
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
    FOREIGN KEY (tenant_id, legal_entity_id, request_line_id) REFERENCES purchase_request_lines(tenant_id, legal_entity_id, id)`],
];
const fail = message => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${message}';`;
const same = fields => fields.split(',').map(f=>`(NEW.${f} <=> OLD.${f})`).join(' AND ');
const entityLock = `DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id FOR UPDATE;`;
const references = `
  IF NEW.kind IN ('CONTRACT','ORDER') AND NOT EXISTS (SELECT 1 FROM trading_partners p JOIN product_suppliers s ON s.tenant_id=p.tenant_id AND s.legal_entity_id=p.legal_entity_id AND s.id=p.supplier_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id=NEW.partner_id AND p.active=1 AND s.active=1) THEN ${fail('Purchasing requires an active supplier partner')} END IF;
  IF NEW.kind='ORDER' AND NOT EXISTS (SELECT 1 FROM purchasing_documents r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.id=NEW.request_id AND r.kind='REQUEST' AND r.status='APPROVED' AND r.document_date<=NEW.document_date) THEN ${fail('Order requires an approved prior purchase request')} END IF;
  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchasing_documents c WHERE c.tenant_id=NEW.tenant_id AND c.legal_entity_id=NEW.legal_entity_id AND c.id=NEW.contract_id AND c.kind='CONTRACT' AND c.status='APPROVED' AND c.partner_id=NEW.partner_id AND c.currency=NEW.currency AND NEW.document_date BETWEEN c.valid_from AND c.valid_to AND c.document_date<=NEW.document_date) THEN ${fail('Order contract must match supplier currency and dates')} END IF;`;
export const triggers = [
  ['trading_partner_identity','UPDATE','trading_partners',`BEGIN IF NOT (${same('id,tenant_id,legal_entity_id,code,kind,supplier_id')}) THEN ${fail('Partner identity is immutable')} END IF; END`],
  ['purchasing_document_insert','INSERT','purchasing_documents',`BEGIN ${entityLock}
    IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.cancelled_by IS NOT NULL THEN ${fail('Documents start unreviewed and assembling')} END IF;
    ${references} END`],
  ['purchasing_document_update','UPDATE','purchasing_documents',`BEGIN ${entityLock}
    IF NOT (${same('id,tenant_id,legal_entity_id,kind,reference,document_date,required_by,valid_from,valid_to,partner_id,request_id,contract_id,partner_snapshot,currency,purpose,terms,ebys_reference,line_count,net_total,created_by,created_at')}) THEN ${fail('Submitted purchasing content is immutable')} END IF;
    IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status IN ('REQUESTED','APPROVED') AND NEW.status='CANCELLED')) THEN ${fail('Invalid purchasing transition')} END IF;
    IF NEW.status IN ('APPROVED','REJECTED') THEN
      IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 OR (NEW.status='APPROVED' AND NEW.reviewed_by=OLD.created_by) THEN ${fail('Independent approval and review evidence required')} END IF;
    ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Review history is immutable')} END IF;
    IF NEW.status='CANCELLED' THEN
      IF NEW.cancelled_by<>OLD.created_by OR NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('Only requester may cancel with a reason')} END IF;
      IF EXISTS (SELECT 1 FROM purchasing_documents o WHERE o.tenant_id=OLD.tenant_id AND o.legal_entity_id=OLD.legal_entity_id AND (o.request_id=OLD.id OR o.contract_id=OLD.id) AND o.status IN ('ASSEMBLING','REQUESTED','APPROVED')) THEN ${fail('Cancel dependent orders first')} END IF;
    ELSEIF NOT (${same('cancelled_by,cancelled_at,cancel_reason')}) THEN ${fail('Cancellation history is immutable')} END IF;
    IF NEW.status IN ('REQUESTED','APPROVED') THEN
      ${references}
      IF NEW.kind='REQUEST' AND NEW.line_count<>(SELECT COUNT(*) FROM purchase_request_lines l WHERE l.request_id=NEW.id) THEN ${fail('Request lines are incomplete')} END IF;
      IF NEW.kind='ORDER' AND (NEW.line_count<>(SELECT COUNT(*) FROM purchase_order_lines l WHERE l.order_id=NEW.id) OR NEW.net_total<>(SELECT COALESCE(SUM(net_amount),0) FROM purchase_order_lines l WHERE l.order_id=NEW.id)) THEN ${fail('Order lines and totals must match')} END IF;
      IF EXISTS (SELECT 1 FROM purchase_request_lines l JOIN product_skus s ON s.id=l.sku_id JOIN product_families f ON f.id=s.family_id JOIN unit_of_measure u ON u.id=l.unit_id WHERE l.request_id=COALESCE(NEW.request_id,NEW.id) AND (NEW.kind='REQUEST' OR EXISTS (SELECT 1 FROM purchase_order_lines ol WHERE ol.order_id=NEW.id AND ol.request_line_id=l.id)) AND (s.active=0 OR f.active=0 OR u.active=0 OR s.base_unit_id<>l.unit_id)) THEN ${fail('Purchasing references must stay active and in base units')} END IF;
    END IF; END`],
  ['purchase_request_line_insert','INSERT','purchase_request_lines',`BEGIN ${entityLock}
    IF NOT EXISTS (SELECT 1 FROM purchasing_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.request_id AND d.kind='REQUEST' AND d.status='ASSEMBLING') THEN ${fail('Request lines require an assembling request')} END IF;
    IF NOT EXISTS (SELECT 1 FROM product_skus s JOIN unit_of_measure u ON u.id=s.base_unit_id JOIN product_families f ON f.id=s.family_id WHERE s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.id=NEW.sku_id AND s.base_unit_id=NEW.unit_id AND s.active=1 AND u.active=1 AND f.active=1 AND NEW.quantity=ROUND(NEW.quantity,u.quantity_precision)) THEN ${fail('Request quantity must use active SKU base-unit precision')} END IF; END`],
  ['purchase_order_line_insert','INSERT','purchase_order_lines',`BEGIN ${entityLock}
    IF NOT EXISTS (SELECT 1 FROM purchasing_documents d JOIN purchase_request_lines l ON l.tenant_id=d.tenant_id AND l.legal_entity_id=d.legal_entity_id AND l.request_id=d.request_id JOIN purchasing_documents r ON r.id=l.request_id JOIN unit_of_measure u ON u.id=l.unit_id WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.order_id AND d.kind='ORDER' AND d.status='ASSEMBLING' AND l.id=NEW.request_line_id AND r.status='APPROVED' AND NEW.quantity=ROUND(NEW.quantity,u.quantity_precision)) THEN ${fail('Order source must belong to its approved request')} END IF;
    IF NEW.quantity+(SELECT COALESCE(SUM(l.quantity),0) FROM purchase_order_lines l JOIN purchasing_documents d ON d.id=l.order_id WHERE l.tenant_id=NEW.tenant_id AND l.legal_entity_id=NEW.legal_entity_id AND l.request_line_id=NEW.request_line_id AND d.status IN ('ASSEMBLING','REQUESTED','APPROVED'))>(SELECT quantity FROM purchase_request_lines WHERE id=NEW.request_line_id) THEN ${fail('Order exceeds uncommitted request quantity')} END IF; END`],
  ...['trading_partners','purchasing_documents','purchase_request_lines','purchase_order_lines'].map(table=>[`${table}_no_delete`,'DELETE',table,`BEGIN ${fail('Retain purchasing history; cancel instead')} END`]),
  ...['purchase_request_lines','purchase_order_lines'].map(table=>[`${table}_no_update`,'UPDATE',table,`BEGIN ${fail('Purchasing source lines are immutable')} END`]),
];
const permissions = [
  ['purchasing.read','Read trading partners and purchasing documents'],
  ['purchasing.manage','Maintain partners and submit or cancel purchasing documents'],
  ['purchasing.approve','Independently approve or reject purchasing documents'],
  ['purchasing.audit.read','Read purchasing audit events'],
];
const normalize = value => value.replace(/\s+/g,' ').trim();

// Verification is embedded below so later runtime changes cannot alter this migration.
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Purchasing columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Purchasing table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Purchasing foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Purchasing indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Purchasing check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('Purchasing trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing purchasing permissions');
}

export default {
  key: 'm012_purchasing_foundation',
  description: 'Linked trading partners, immutable contracts/requests/orders, exact source-line commitments and independent approvals.',
  async up(connection) {
    for (const [name,definition] of tables) await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    for (const [name,event,table,body] of triggers) {
      const [[existing]]=await connection.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
      if(existing){if(normalize(existing.body)!==normalize(body))throw new Error('Unexpected purchasing trigger: '+name);continue;}
      await connection.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
    }
    for (const [code,description] of permissions) {
      await connection.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code=code',[code,description]);
      await connection.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code='ADMIN' ON DUPLICATE KEY UPDATE permission_code=permission_code",[code]);
    }
  },verify,
};
