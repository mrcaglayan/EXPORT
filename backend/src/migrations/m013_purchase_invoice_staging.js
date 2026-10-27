// PR-03B. Self-contained forward migration; freeze after application.
const scope='tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const entityFk='FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id, id)';
const actor=column=>`FOREIGN KEY (tenant_id, ${column}) REFERENCES users(tenant_id, id)`;
export const tables=[
  ['purchase_invoice_settings',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
    receiver_scheme ENUM('VKN','TCKN') NOT NULL, receiver_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY invoice_settings_scope (tenant_id,legal_entity_id,id), UNIQUE KEY invoice_settings_entity (tenant_id,legal_entity_id),
    CONSTRAINT invoice_receiver_format CHECK ((receiver_scheme='VKN' AND receiver_tax_id REGEXP '^[0-9]{10}$') OR (receiver_scheme='TCKN' AND receiver_tax_id REGEXP '^[0-9]{11}$')),
    ${entityFk}, ${actor('updated_by')}`],
  ['purchase_invoices',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
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
    ${entityFk},${actor('imported_by')},${actor('submitted_by')},${actor('reviewed_by')},${actor('cancelled_by')}`],
  ['purchase_invoice_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL,
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
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_id) REFERENCES purchase_invoices(tenant_id,legal_entity_id,id)`],
  ['purchase_invoice_plans',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
    partner_id CHAR(36) NOT NULL, order_id CHAR(36) NULL, line_count INT UNSIGNED NOT NULL,
    reason VARCHAR(1000) NOT NULL, created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY invoice_plan_scope (tenant_id,legal_entity_id,id), UNIQUE KEY invoice_plan_revision (tenant_id,legal_entity_id,invoice_id,revision),
    KEY invoice_plan_order (tenant_id,legal_entity_id,order_id,invoice_id),
    CONSTRAINT invoice_plan_positive CHECK (revision>0),
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_id) REFERENCES purchase_invoices(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,partner_id) REFERENCES trading_partners(tenant_id,legal_entity_id,id),
    FOREIGN KEY (tenant_id,legal_entity_id,order_id) REFERENCES purchasing_documents(tenant_id,legal_entity_id,id),${actor('created_by')}`],
  ['purchase_invoice_mappings',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, plan_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL,
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
    FOREIGN KEY (tenant_id,legal_entity_id,alias_id) REFERENCES product_aliases(tenant_id,legal_entity_id,id)`],
  ['purchase_invoice_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL,
    action ENUM('SUBMIT','APPROVE','REJECT','CANCEL','REOPEN') NOT NULL, revision INT UNSIGNED NOT NULL, sequence_number INT UNSIGNED NOT NULL,
    actor_id CHAR(36) NOT NULL, reason VARCHAR(1000) NOT NULL, context JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY invoice_decision_scope (tenant_id,legal_entity_id,id),
    UNIQUE KEY invoice_decision_sequence (tenant_id,legal_entity_id,invoice_id,sequence_number),
    KEY invoice_decision_history (tenant_id,legal_entity_id,invoice_id,created_at,id),
    FOREIGN KEY (tenant_id,legal_entity_id,invoice_id) REFERENCES purchase_invoices(tenant_id,legal_entity_id,id),${actor('actor_id')}`],
];
const fail=message=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';`;
const same=fields=>fields.split(',').map(f=>`(NEW.${f} <=> OLD.${f})`).join(' AND ');
const lock=`DECLARE locked_entity CHAR(36); SELECT id INTO locked_entity FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id FOR UPDATE;`;
export const triggers=[
  ['purchase_invoice_insert','INSERT','purchase_invoices',`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.revision<>0 OR NEW.submitted_by IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.review_context IS NOT NULL THEN ${fail('Invoice starts unreviewed and assembling')} END IF; END`],
  ['purchase_invoice_update','UPDATE','purchase_invoices',`BEGIN ${lock}
    IF NOT (${same('id,tenant_id,legal_entity_id,uuid,invoice_number,issue_date,currency,profile,invoice_type,supplier_scheme,supplier_tax_id,supplier_name,receiver_scheme,receiver_tax_id,receiver_name,file_name,evidence,raw_xml,xml_hash,parsed_header,line_count,net_total,vat_total,gross_total,payable_total,imported_by,imported_at')}) THEN ${fail('Imported invoice source is immutable')} END IF;
    IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='STAGED' AND NEW.revision=0) OR (OLD.status='STAGED' AND NEW.status='STAGED' AND NEW.revision=OLD.revision+1) OR (OLD.status='STAGED' AND NEW.status='REQUESTED' AND NEW.revision=OLD.revision) OR (OLD.status='REQUESTED' AND NEW.status IN ('READY','REJECTED') AND NEW.revision=OLD.revision) OR (OLD.status IN ('STAGED','REQUESTED','READY') AND NEW.status='CANCELLED' AND NEW.revision=OLD.revision) OR (OLD.status IN ('REQUESTED','READY','REJECTED') AND NEW.status='STAGED' AND NEW.revision=OLD.revision)) THEN ${fail('Invalid invoice workflow transition')} END IF;
    IF OLD.status IN ('REQUESTED','READY','REJECTED') AND NEW.status='STAGED' THEN
      IF NEW.submitted_by IS NOT NULL OR NEW.submitted_at IS NOT NULL OR NEW.review_context IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL OR NOT EXISTS (SELECT 1 FROM purchase_invoice_decisions e WHERE e.invoice_id=NEW.id AND e.revision=NEW.revision AND e.action='REOPEN' AND e.sequence_number=(SELECT MAX(sequence_number) FROM purchase_invoice_decisions WHERE invoice_id=NEW.id)) THEN ${fail('Reopen requires retained decision and cleared current review')} END IF;
    ELSE
    IF OLD.status='ASSEMBLING' AND NEW.line_count<>(SELECT COUNT(*) FROM purchase_invoice_lines WHERE invoice_id=NEW.id) THEN ${fail('Invoice source lines incomplete')} END IF;
    IF NEW.revision<>OLD.revision AND NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.line_count=(SELECT COUNT(*) FROM purchase_invoice_mappings m WHERE m.plan_id=p.id)) THEN ${fail('Invoice mapping plan incomplete')} END IF;
    IF NEW.status='REQUESTED' AND OLD.status='STAGED' THEN
      IF NEW.revision=0 OR NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL OR NEW.review_context IS NULL THEN ${fail('Complete matching review context required')} END IF;
      IF NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchasing_documents d ON d.id=p.order_id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.line_count=NEW.line_count AND d.kind='ORDER' AND d.status='APPROVED' AND d.partner_id=p.partner_id AND d.currency=NEW.currency) OR EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_invoice_mappings m ON m.plan_id=p.id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND m.order_line_id IS NULL) THEN ${fail('Complete approved-order matching required')} END IF;
      IF EXISTS (SELECT m.order_line_id FROM purchase_invoices i JOIN purchase_invoice_plans p ON p.invoice_id=i.id AND p.revision=i.revision JOIN purchase_invoice_mappings m ON m.plan_id=p.id JOIN purchase_invoice_lines l ON l.id=m.invoice_line_id JOIN purchase_order_lines ol ON ol.id=m.order_line_id WHERE i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND (i.status IN ('REQUESTED','READY') OR i.id=NEW.id) GROUP BY m.order_line_id HAVING SUM(l.quantity)>MAX(ol.quantity)) THEN ${fail('Invoice matching exceeds ordered quantity')} END IF;
    ELSEIF NOT (${same('submitted_by,submitted_at,review_context')}) THEN ${fail('Invoice submission evidence is immutable')} END IF;
    IF NEW.status IN ('READY','REJECTED') AND OLD.status='REQUESTED' THEN
      IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Invoice review evidence required')} END IF;
      IF NEW.status='READY' AND (NEW.reviewed_by IN (OLD.imported_by,OLD.submitted_by) OR EXISTS (SELECT 1 FROM purchase_invoice_plans p WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.created_by=NEW.reviewed_by)) THEN ${fail('Independent invoice reviewer required')} END IF;
    ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Invoice review history is immutable')} END IF;
    IF NEW.status='CANCELLED' THEN
      IF NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('Invoice cancellation evidence required')} END IF;
    ELSEIF NOT (${same('cancelled_by,cancelled_at,cancel_reason')}) THEN ${fail('Invoice cancellation history is immutable')} END IF;
    END IF;
    END`],
  ['purchase_invoice_line_insert','INSERT','purchase_invoice_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM purchase_invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id AND legal_entity_id=NEW.legal_entity_id AND status='ASSEMBLING') THEN ${fail('Source lines require an assembling invoice')} END IF; END`],
  ['purchase_invoice_plan_insert','INSERT','purchase_invoice_plans',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM purchase_invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id AND legal_entity_id=NEW.legal_entity_id AND status='STAGED' AND revision+1=NEW.revision) THEN ${fail('Only staged invoice accepts next mapping revision')} END IF; END`],
  ['purchase_invoice_mapping_insert','INSERT','purchase_invoice_mappings',`BEGIN ${lock}
    IF NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_invoices i ON i.id=p.invoice_id JOIN purchase_invoice_lines l ON l.invoice_id=i.id WHERE p.id=NEW.plan_id AND p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND i.status='STAGED' AND i.revision+1=p.revision AND l.id=NEW.invoice_line_id) THEN ${fail('Mapping source must belong to its next invoice plan')} END IF;
    IF NEW.order_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_order_lines ol ON ol.order_id=p.order_id JOIN purchase_request_lines r ON r.id=ol.request_line_id WHERE p.id=NEW.plan_id AND ol.id=NEW.order_line_id AND ol.tenant_id=NEW.tenant_id AND ol.legal_entity_id=NEW.legal_entity_id AND r.sku_id=NEW.sku_id) THEN ${fail('Mapped order line and SKU must match selected order')} END IF;
    END`],
  ['purchase_order_invoice_dependency','UPDATE','purchasing_documents',`BEGIN IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM purchase_invoice_plans p JOIN purchase_invoices i ON i.id=p.invoice_id AND i.revision=p.revision WHERE p.order_id=OLD.id AND i.status IN ('REQUESTED','READY')) THEN ${fail('Cancel linked invoice matching before cancelling order')} END IF; END`],
  ['purchase_invoice_decision_insert','INSERT','purchase_invoice_decisions',`BEGIN ${lock} IF CHAR_LENGTH(TRIM(NEW.reason))=0 OR NOT EXISTS (SELECT 1 FROM purchase_invoices i WHERE i.id=NEW.invoice_id AND i.tenant_id=NEW.tenant_id AND i.legal_entity_id=NEW.legal_entity_id AND i.revision=NEW.revision AND ((NEW.action='SUBMIT' AND i.status='STAGED') OR (NEW.action IN ('APPROVE','REJECT') AND i.status='REQUESTED') OR (NEW.action='CANCEL' AND i.status IN ('STAGED','REQUESTED','READY')) OR (NEW.action='REOPEN' AND i.status IN ('REQUESTED','READY','REJECTED')))) THEN ${fail('Invoice decision must match current workflow')} END IF; END`],
  ...['purchase_invoices','purchase_invoice_lines','purchase_invoice_plans','purchase_invoice_mappings','purchase_invoice_decisions'].map(table=>[`${table}_no_delete`,'DELETE',table,`BEGIN ${fail('Retain invoice source and matching history')} END`]),
  ...['purchase_invoice_lines','purchase_invoice_plans','purchase_invoice_mappings','purchase_invoice_decisions'].map(table=>[`${table}_no_update`,'UPDATE',table,`BEGIN ${fail('Invoice source and mapping revisions are immutable')} END`]),
];
const permissions=[['purchasing.invoice.import','Stage source purchase invoice XML'],['purchasing.invoice.map','Map invoice source lines and submit matching review'],['purchasing.invoice.review','Independently review and cancel invoice matching'],['purchasing.invoice.configure','Configure legal entity invoice recipient identity']];
const normalize=value=>value.replace(/\s+/g,' ').trim();
async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON|MEDIUMTEXT)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? '0'
          : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : options.match(/DEFAULT '(\w+)'/)?.[1] ?? null,
        collation: /CHAR|TEXT/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : options.includes('utf8mb4_bin') ? 'utf8mb4_bin' : 'utf8mb4_0900_ai_ci'
          : type.startsWith('ENUM') ? 'utf8mb4_0900_ai_ci' : null,
      }));
    const actual = columns.map(c => ({ name: c.Field, type: c.Type.toLowerCase(), nullable: c.Null, default: c.Default, collation: c.Collation }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Invoice staging columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Invoice staging table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Invoice staging foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Invoice staging indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Invoice staging check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('Invoice staging trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing invoice permissions');
}

export default {
  key: 'm013_purchase_invoice_staging',
  description: 'Immutable UBL-TR invoice sources, exact line mapping revisions, recipient identity and independent matching review.',
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
