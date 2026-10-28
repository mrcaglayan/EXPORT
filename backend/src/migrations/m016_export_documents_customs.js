// PR-04B. Forward-only extension; preserve applied m001–m015.
const scope='tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk=(c,t,r='id')=>`FOREIGN KEY (tenant_id, legal_entity_id, ${c}) REFERENCES ${t}(tenant_id, legal_entity_id, ${r})`;
const user=c=>`FOREIGN KEY (tenant_id,${c}) REFERENCES users(tenant_id,id)`;
const own=a=>`${a}.tenant_id=NEW.tenant_id AND ${a}.legal_entity_id=NEW.legal_entity_id`;
const fail=s=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${s}';`;
const same=s=>s.split(',').map(f=>`(NEW.${f}<=>OLD.${f})`).join(' AND ');
const lock=`DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN ${fail('Active export entity required')} END IF;`;
const workflow=`status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING', requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL`;
export const tables=[
 ['export_document_settings',`${scope}, exporter_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id,legal_entity_id), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id), ${user('updated_by')}`],
 ['export_sales_invoices',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, invoice_number VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 issue_date DATE NOT NULL, currency CHAR(3) NOT NULL, profile VARCHAR(40) NOT NULL, invoice_type VARCHAR(40) NOT NULL, exporter_tax_id VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 raw_xml MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, xml_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, parsed_header JSON NOT NULL, file_name VARCHAR(160) NOT NULL, evidence VARCHAR(255) NOT NULL, line_count INT UNSIGNED NOT NULL,
 status ENUM('ASSEMBLING','STAGED','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING', revision INT UNSIGNED NOT NULL DEFAULT 0,
 imported_by CHAR(36) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_by CHAR(36) NULL, submitted_at TIMESTAMP NULL, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, review_context JSON NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_invoice_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_invoice_uuid (tenant_id,legal_entity_id,uuid), UNIQUE KEY export_invoice_number (tenant_id,legal_entity_id,exporter_tax_id,invoice_number), KEY export_invoice_status (tenant_id,legal_entity_id,status,imported_at,id),
 CONSTRAINT export_invoice_count CHECK (line_count>0), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id),${user('imported_by')},${user('submitted_by')},${user('reviewed_by')}`],
 ['export_sales_invoice_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, line_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, description VARCHAR(1000) NOT NULL,
 quantity DECIMAL(20,6) NOT NULL, unit_code VARCHAR(16) NOT NULL, net_amount DECIMAL(20,6) NOT NULL, vat_amount DECIMAL(20,6) NOT NULL, details JSON NOT NULL,
 UNIQUE KEY export_invoice_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_invoice_line_number (tenant_id,legal_entity_id,invoice_id,line_number), UNIQUE KEY export_invoice_line_key (tenant_id,legal_entity_id,invoice_id,line_key), CONSTRAINT export_invoice_line_amount CHECK (quantity>0 AND net_amount>=0 AND vat_amount>=0),${fk('invoice_id','export_sales_invoices')}`],
 ['export_sales_plans',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL, card_id CHAR(36) NOT NULL,
 transaction_type ENUM('STANDARD_EXPORT','FREE_OF_CHARGE','TEMPORARY_EXPORT','RETURN_EXPORT') NOT NULL, identity_evidence VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL, created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_sales_plan_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_sales_revision (tenant_id,legal_entity_id,invoice_id,revision),${fk('invoice_id','export_sales_invoices')},${fk('card_id','export_cards')},${user('created_by')}`],
 ['export_sales_allocations',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, plan_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL, shipment_line_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, unit_confirmed BOOLEAN NOT NULL DEFAULT 0,
 UNIQUE KEY export_sales_allocation_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_sales_allocation_source (tenant_id,legal_entity_id,plan_id,invoice_line_id,shipment_line_id), CONSTRAINT export_sales_allocated_quantity CHECK (quantity>0),
 ${fk('plan_id','export_sales_plans')},${fk('invoice_line_id','export_sales_invoice_lines')},${fk('shipment_line_id','export_shipment_lines')}`],
 ['export_customs_documents',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, kind ENUM('DECLARATION','CLEARANCE') NOT NULL, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, declaration_id CHAR(36) NULL,
 event_date DATE NOT NULL, closing_date DATE NULL, is_final BOOLEAN NOT NULL DEFAULT 0, transaction_type ENUM('STANDARD_EXPORT','FREE_OF_CHARGE','TEMPORARY_EXPORT','RETURN_EXPORT') NOT NULL,
 plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, ${workflow},
 UNIQUE KEY export_customs_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_customs_reference (tenant_id,legal_entity_id,kind,reference), KEY export_customs_state (tenant_id,legal_entity_id,kind,status,event_date,id), KEY export_customs_parent (tenant_id,legal_entity_id,declaration_id,status),
 CONSTRAINT export_customs_source CHECK ((kind='DECLARATION' AND declaration_id IS NULL AND is_final=0 AND closing_date IS NULL) OR (kind='CLEARANCE' AND declaration_id IS NOT NULL AND ((is_final=0 AND closing_date IS NULL) OR (is_final=1 AND closing_date IS NOT NULL AND closing_date>=event_date)))),
 FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id),${fk('declaration_id','export_customs_documents')},${user('requested_by')},${user('reviewed_by')}`],
 ['export_customs_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, document_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, line_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 sales_allocation_id CHAR(36) NULL, issue_line_id CHAR(36) NULL, declaration_line_id CHAR(36) NULL, gtip_history_id CHAR(36) NULL, declared_gtip CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL, quantity DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY export_customs_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_customs_line_number (tenant_id,legal_entity_id,document_id,line_number), UNIQUE KEY export_customs_line_key (tenant_id,legal_entity_id,document_id,line_key),
 UNIQUE KEY export_customs_line_source (tenant_id,legal_entity_id,document_id,sales_allocation_id,issue_line_id), UNIQUE KEY export_clearance_line_source (tenant_id,legal_entity_id,document_id,declaration_line_id),
 CONSTRAINT export_customs_line_source CHECK (quantity>0 AND ((sales_allocation_id IS NOT NULL AND issue_line_id IS NOT NULL AND declaration_line_id IS NULL AND gtip_history_id IS NOT NULL AND declared_gtip IS NOT NULL) OR (sales_allocation_id IS NULL AND issue_line_id IS NULL AND declaration_line_id IS NOT NULL AND gtip_history_id IS NULL AND declared_gtip IS NULL))),
 ${fk('document_id','export_customs_documents')},${fk('sales_allocation_id','export_sales_allocations')},${fk('issue_line_id','inventory_issue_lines')},${fk('declaration_line_id','export_customs_lines')},${fk('gtip_history_id','product_gtip_history')}`],
 ['export_compliance_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NULL, customs_document_id CHAR(36) NULL, action VARCHAR(24) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_compliance_decision_scope (tenant_id,legal_entity_id,id), KEY export_compliance_invoice (tenant_id,legal_entity_id,invoice_id,created_at,id), KEY export_compliance_customs (tenant_id,legal_entity_id,customs_document_id,created_at,id), CONSTRAINT export_compliance_decision_source CHECK ((invoice_id IS NULL)<>(customs_document_id IS NULL)),${fk('invoice_id','export_sales_invoices')},${fk('customs_document_id','export_customs_documents')},${user('actor_id')}`],
];
export const triggers=[
 ['export_sales_invoice_insert','INSERT','export_sales_invoices',`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.revision<>0 THEN ${fail('Outgoing source must assemble first')} END IF; END`],
 ['export_sales_invoice_update','UPDATE','export_sales_invoices',`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,uuid,invoice_number,issue_date,currency,profile,invoice_type,exporter_tax_id,raw_xml,xml_hash,parsed_header,file_name,evidence,line_count,imported_by,imported_at')}) THEN ${fail('Outgoing invoice source is immutable')} END IF;
 IF OLD.status='ASSEMBLING' AND NEW.status='STAGED' THEN IF NEW.line_count<>(SELECT COUNT(*) FROM export_sales_invoice_lines WHERE invoice_id=NEW.id) THEN ${fail('Complete outgoing source required')} END IF;
 ELSEIF OLD.status='STAGED' AND NEW.status='STAGED' THEN IF NEW.revision<>OLD.revision+1 OR NOT EXISTS (SELECT 1 FROM export_sales_plans WHERE invoice_id=NEW.id AND revision=NEW.revision) THEN ${fail('Next sales mapping revision required')} END IF;
 ELSE
 IF NEW.revision<>OLD.revision OR NOT ((OLD.status='STAGED' AND NEW.status='REQUESTED') OR (OLD.status='APPROVED' AND NEW.status='APPROVED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status IN ('REQUESTED','APPROVED','REJECTED') AND NEW.status='STAGED') OR (OLD.status IN ('STAGED','REQUESTED','APPROVED') AND NEW.status='CANCELLED')) THEN ${fail('Invalid outgoing invoice transition')} END IF;
 IF NEW.status IN ('STAGED','CANCELLED') AND EXISTS (SELECT 1 FROM export_customs_lines l JOIN export_customs_documents d ON d.id=l.document_id JOIN export_sales_allocations a ON a.id=l.sales_allocation_id JOIN export_sales_plans p ON p.id=a.plan_id WHERE p.invoice_id=NEW.id AND d.status IN ('REQUESTED','APPROVED')) THEN ${fail('Retain invoice approval referenced by customs')} END IF;
 IF NEW.status='REQUESTED' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL OR NEW.review_context IS NULL) THEN ${fail('Sales submission context required')} END IF;
 IF NEW.status IN ('REQUESTED','APPROVED') THEN
  IF EXISTS (SELECT 1 FROM export_sales_invoice_lines l WHERE l.invoice_id=NEW.id AND l.quantity<>COALESCE((SELECT SUM(a.quantity) FROM export_sales_allocations a JOIN export_sales_plans p ON p.id=a.plan_id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND a.invoice_line_id=l.id),0)) THEN ${fail('Outgoing quantities must cover every source line exactly')} END IF;
  IF EXISTS (SELECT 1 FROM export_sales_allocations a JOIN export_sales_plans p ON p.id=a.plan_id JOIN export_shipment_lines s ON s.id=a.shipment_line_id WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND s.quantity<(SELECT SUM(x.quantity) FROM export_sales_allocations x JOIN export_sales_plans q ON q.id=x.plan_id JOIN export_sales_invoices i ON i.id=q.invoice_id AND i.revision=q.revision WHERE x.shipment_line_id=s.id AND ((i.id=NEW.id AND q.revision=NEW.revision) OR (i.id<>NEW.id AND i.status IN ('REQUESTED','APPROVED'))))) THEN ${fail('Outgoing approvals exceed shipment quantities')} END IF;
 END IF;
 IF NEW.status IN ('APPROVED','REJECTED') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.reviewed_by=NEW.imported_by OR NEW.reviewed_by=NEW.submitted_by OR EXISTS (SELECT 1 FROM export_sales_plans p WHERE p.invoice_id=NEW.id AND p.revision=NEW.revision AND p.created_by=NEW.reviewed_by) OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0) THEN ${fail('Independent sales review required')} END IF;
 END IF; END`],
 ['export_sales_line_insert','INSERT','export_sales_invoice_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_sales_invoices i WHERE ${own('i')} AND i.id=NEW.invoice_id AND i.status='ASSEMBLING') THEN ${fail('Sales lines require assembling source')} END IF; END`],
 ['export_sales_plan_insert','INSERT','export_sales_plans',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_sales_invoices i WHERE ${own('i')} AND i.id=NEW.invoice_id AND i.status='STAGED' AND i.revision+1=NEW.revision) THEN ${fail('Next staged sales plan required')} END IF; END`],
 ['export_sales_allocation_insert','INSERT','export_sales_allocations',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_sales_plans p JOIN export_sales_invoices i ON i.id=p.invoice_id JOIN export_sales_invoice_lines l ON l.invoice_id=i.id JOIN export_shipment_lines s ON s.id=NEW.shipment_line_id JOIN export_shipments h ON h.id=s.shipment_id AND h.card_id=p.card_id WHERE ${own('p')} AND p.id=NEW.plan_id AND i.status='STAGED' AND i.revision+1=p.revision AND l.id=NEW.invoice_line_id AND h.status IN ('APPROVED','RESERVED','DISPATCHED')) THEN ${fail('Sales allocation requires matching active shipment source')} END IF; END`],
 ['export_customs_insert','INSERT','export_customs_documents',`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL THEN ${fail('Customs evidence must assemble first')} END IF; END`],
 ['export_customs_update','UPDATE','export_customs_documents',`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,kind,reference,declaration_id,event_date,closing_date,is_final,transaction_type,plan,context_hash,reason,evidence,requested_by,requested_at')}) OR NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.kind='DECLARATION' AND OLD.status='APPROVED' AND NEW.status='CANCELLED')) THEN ${fail('Customs source and accepted evidence are immutable')} END IF;
 IF NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent customs review required')} END IF;
 ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Retain customs review history')} END IF;
 IF NEW.status='REQUESTED' AND NEW.is_final=0 AND NOT EXISTS (SELECT 1 FROM export_customs_lines WHERE document_id=NEW.id) THEN ${fail('Customs source lines required')} END IF;
 IF NEW.status IN ('REQUESTED','APPROVED') THEN
  IF NEW.kind='DECLARATION' THEN
   IF EXISTS (SELECT 1 FROM export_customs_lines l JOIN export_sales_allocations a ON a.id=l.sales_allocation_id JOIN inventory_issue_lines i ON i.id=l.issue_line_id WHERE l.document_id=NEW.id AND (a.quantity<(SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.sales_allocation_id=a.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED')))) OR i.quantity<(SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.issue_line_id=i.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED')))))) THEN ${fail('Customs declarations exceed invoiced or dispatched quantities')} END IF;
  ELSE
   IF NOT EXISTS (SELECT 1 FROM export_customs_documents d WHERE ${own('d')} AND d.id=NEW.declaration_id AND d.kind='DECLARATION' AND d.status='APPROVED' AND d.event_date<=NEW.event_date) OR EXISTS (SELECT 1 FROM export_customs_documents d WHERE ${own('d')} AND d.declaration_id=NEW.declaration_id AND d.id<>NEW.id AND d.is_final=1 AND d.status IN ('REQUESTED','APPROVED')) THEN ${fail('Approved open declaration required for exit evidence')} END IF;
   IF EXISTS (SELECT 1 FROM export_customs_lines l JOIN export_customs_lines p ON p.id=l.declaration_line_id WHERE l.document_id=NEW.id AND p.quantity<(SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.declaration_line_id=p.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status IN ('REQUESTED','APPROVED'))))) THEN ${fail('Confirmed exits exceed declaration quantities')} END IF;
   IF NEW.is_final=1 AND EXISTS (SELECT 1 FROM export_customs_lines p WHERE p.document_id=NEW.declaration_id AND p.quantity<>COALESCE((SELECT SUM(x.quantity) FROM export_customs_lines x JOIN export_customs_documents d ON d.id=x.document_id WHERE x.declaration_line_id=p.id AND (d.id=NEW.id OR (d.id<>NEW.id AND d.status='APPROVED'))),0)) THEN ${fail('Final customs closure requires complete accepted quantities')} END IF;
  END IF;
 END IF;
 IF NEW.status='CANCELLED' AND (CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 OR EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.declaration_id=NEW.id AND d.status IN ('REQUESTED','APPROVED'))) THEN ${fail('Cancel pending customs dependencies first')} END IF;
 END`],
 ['export_customs_line_insert','INSERT','export_customs_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_customs_documents d WHERE ${own('d')} AND d.id=NEW.document_id AND d.status='ASSEMBLING' AND ((d.kind='DECLARATION' AND NEW.sales_allocation_id IS NOT NULL AND NEW.declaration_line_id IS NULL) OR (d.kind='CLEARANCE' AND NEW.declaration_line_id IS NOT NULL AND EXISTS (SELECT 1 FROM export_customs_lines x WHERE x.id=NEW.declaration_line_id AND x.document_id=d.declaration_id)))) THEN ${fail('Customs line must match its source document')} END IF; END`],
 ['export_card_document_dependency','UPDATE','export_cards',`BEGIN IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM export_sales_plans p JOIN export_sales_invoices i ON i.id=p.invoice_id AND i.revision=p.revision WHERE p.card_id=OLD.id AND i.status IN ('REQUESTED','APPROVED')) THEN ${fail('Cancel dependent outgoing matching first')} END IF; END`],
 ['export_shipment_document_dependency','UPDATE','export_shipments',`BEGIN IF NEW.status IN ('CANCELLING','CANCELLED') AND EXISTS (SELECT 1 FROM export_sales_allocations a JOIN export_shipment_lines l ON l.id=a.shipment_line_id JOIN export_sales_plans p ON p.id=a.plan_id JOIN export_sales_invoices i ON i.id=p.invoice_id AND i.revision=p.revision WHERE l.shipment_id=OLD.id AND i.status IN ('REQUESTED','APPROVED')) THEN ${fail('Cancel dependent outgoing matching first')} END IF; END`],
 ...['export_sales_invoice_lines','export_sales_plans','export_sales_allocations','export_customs_lines','export_compliance_decisions'].map(t=>[t+'_no_update','UPDATE',t,`BEGIN ${fail('Export source and compliance evidence are immutable')} END`]),
 ...tables.filter(([n])=>n!=='export_document_settings').map(([t])=>[t+'_no_delete','DELETE',t,`BEGIN ${fail('Retain export invoice and customs history')} END`]),
];
const permissions=[['exports.document.configure','Configure exporter invoice identity'],['exports.document.import','Retain externally issued outgoing XML'],['exports.document.map','Match outgoing source to shipment quantities'],['exports.document.review','Independently approve outgoing matching'],['exports.customs.request','Record declaration and clearance evidence'],['exports.customs.review','Independently review broker/customs evidence']];
const normalize=s=>s.replace(/\s+/g,' ').trim();
export default {key:'m016_export_documents_customs',description:'Outgoing invoice source matching, broker GTIP declaration evidence and independently verified partial clearance/closure facts.',async up(c){
 for(const [n,d]of tables)await c.query(`CREATE TABLE IF NOT EXISTS ${n} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 for(const [n,e,t,b]of triggers){const [[old]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[n]);if(old){if(normalize(old.body)!==normalize(b))throw Error('Unexpected export compliance guard: '+n);continue;}await c.query(`CREATE TRIGGER ${n} BEFORE ${e} ON ${t} FOR EACH ROW ${b}`);}
 for(const [code,description]of permissions){await c.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code=code',[code,description]);await c.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code='ADMIN' ON DUPLICATE KEY UPDATE permission_code=permission_code",[code]);}
},verify};

async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON|MEDIUMTEXT)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? '0'
          : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : options.match(/DEFAULT '([^']+)'/)?.[1] ?? null,
        collation: /CHAR|TEXT/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : options.includes('utf8mb4_bin') ? 'utf8mb4_bin' : 'utf8mb4_0900_ai_ci'
          : type.startsWith('ENUM') ? 'utf8mb4_0900_ai_ci' : null,
      }));
    const actual = columns.map(c => ({ name: c.Field, type: c.Type.toLowerCase(), nullable: c.Null, default: c.Default, collation: c.Collation }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Export compliance columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Export compliance table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Export compliance foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Export compliance indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Export compliance check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('Export compliance trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing export compliance permissions');
}
