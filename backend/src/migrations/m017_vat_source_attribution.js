// PR-05A: forward-only VAT facts and analytical attribution; freeze m001–m016.
const scope='tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk=(c,t)=>`FOREIGN KEY (tenant_id,legal_entity_id,${c}) REFERENCES ${t}(tenant_id,legal_entity_id,id)`;
const user=c=>`FOREIGN KEY (tenant_id,${c}) REFERENCES users(tenant_id,id)`;
const same=s=>s.split(',').map(f=>`(NEW.${f}<=>OLD.${f})`).join(' AND ');
const fail=s=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${s}';`;
const lock=`DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN ${fail('Active VAT entity required')} END IF;`;
const committed="('REQUESTED','APPROVED','VOID_REQUESTED')";
export const tables=[
 ['vat_input_sources',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, purchase_receipt_line_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL, layer_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, vat_journal_line_id CHAR(36) NULL,
  quantity DECIMAL(20,6) NOT NULL, native_vat DECIMAL(20,6) NOT NULL, converted_vat DECIMAL(20,6) NOT NULL, deductible_vat DECIMAL(20,6) NOT NULL, capitalized_vat DECIMAL(20,6) NOT NULL,
  currency CHAR(3) NOT NULL, base_currency CHAR(3) NOT NULL, vat_treatment ENUM('DEDUCTIBLE','CAPITALIZE','NONE') NOT NULL, snapshot JSON NOT NULL, source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, registered_by CHAR(36) NOT NULL, registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY vat_source_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_source_purchase_line (tenant_id,legal_entity_id,purchase_receipt_line_id), UNIQUE KEY vat_source_layer (tenant_id,legal_entity_id,layer_id),
  CONSTRAINT vat_source_amount CHECK (quantity>0 AND native_vat>=0 AND converted_vat>=0 AND deductible_vat>=0 AND capitalized_vat>=0 AND converted_vat=deductible_vat+capitalized_vat),
  CONSTRAINT vat_source_treatment CHECK ((vat_treatment='DEDUCTIBLE' AND capitalized_vat=0 AND (deductible_vat=0 OR vat_journal_line_id IS NOT NULL)) OR (vat_treatment='CAPITALIZE' AND deductible_vat=0 AND vat_journal_line_id IS NULL) OR (vat_treatment='NONE' AND native_vat=0 AND converted_vat=0 AND vat_journal_line_id IS NULL)),
  ${fk('purchase_receipt_line_id','purchase_receipt_lines')},${fk('invoice_line_id','purchase_invoice_lines')},${fk('layer_id','inventory_layers')},${fk('sku_id','product_skus')},${fk('vat_journal_line_id','journal_lines')},${user('registered_by')}`],
 ['vat_attributions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, clearance_id CHAR(36) NOT NULL,
  treatment ENUM('CANDIDATE','HOLD','EXCLUDED') NOT NULL, base_currency CHAR(3) NOT NULL, eligibility_evidence VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, input JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
  void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL,
  UNIQUE KEY vat_attribution_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_attribution_reference (tenant_id,legal_entity_id,reference), KEY vat_attribution_state (tenant_id,legal_entity_id,status,requested_at,id), KEY vat_attribution_exit (tenant_id,legal_entity_id,clearance_id,status),
  ${fk('clearance_id','export_customs_documents')},${user('requested_by')},${user('reviewed_by')},${user('void_requested_by')},${user('void_reviewed_by')}`],
 ['vat_attribution_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, attribution_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, source_id CHAR(36) NOT NULL, clearance_line_id CHAR(36) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, native_vat DECIMAL(20,6) NOT NULL, converted_vat DECIMAL(20,6) NOT NULL, deductible_vat DECIMAL(20,6) NOT NULL, capitalized_vat DECIMAL(20,6) NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
  UNIQUE KEY vat_attribution_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_attribution_line_number (tenant_id,legal_entity_id,attribution_id,line_number), UNIQUE KEY vat_attribution_line_exit (tenant_id,legal_entity_id,attribution_id,clearance_line_id),
  KEY vat_attribution_source (tenant_id,legal_entity_id,source_id,attribution_id), KEY vat_attribution_clearance (tenant_id,legal_entity_id,clearance_line_id,attribution_id),
  CONSTRAINT vat_attribution_amount CHECK (quantity>0 AND native_vat>=0 AND converted_vat>=0 AND deductible_vat>=0 AND capitalized_vat>=0 AND candidate_vat>=0 AND candidate_vat<=deductible_vat AND converted_vat=deductible_vat+capitalized_vat),
  ${fk('attribution_id','vat_attributions')},${fk('source_id','vat_input_sources')},${fk('clearance_line_id','export_customs_lines')}`],
 ['vat_attribution_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, attribution_id CHAR(36) NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY vat_decision_scope (tenant_id,legal_entity_id,id), KEY vat_decision_history (tenant_id,legal_entity_id,attribution_id,created_at,id),${fk('attribution_id','vat_attributions')},${user('actor_id')}`],
];
export const triggers=[
 ['vat_source_insert','INSERT','vat_input_sources',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM purchase_receipt_lines l JOIN purchase_receipts p ON p.id=l.receipt_id JOIN inventory_layers x ON x.id=NEW.layer_id JOIN stock_receipt_lines s ON s.id=x.receipt_line_id WHERE l.tenant_id=NEW.tenant_id AND l.legal_entity_id=NEW.legal_entity_id AND l.id=NEW.purchase_receipt_line_id AND p.status='POSTED' AND p.stock_receipt_id=s.receipt_id AND s.source_line_key=l.invoice_line_id AND l.invoice_line_id=NEW.invoice_line_id AND l.sku_id=NEW.sku_id AND l.quantity=NEW.quantity AND x.quantity=NEW.quantity AND NEW.native_vat=CAST(JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.nativeVat')) AS DECIMAL(20,6)) AND NEW.deductible_vat=CAST(JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.deductibleVat')) AS DECIMAL(20,6)) AND NEW.vat_treatment=JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.vatTreatment')) AND NEW.base_currency=JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.baseCurrency'))) THEN ${fail('VAT source requires original posted purchase layer')} END IF; END`],
 ['vat_attribution_insert','INSERT','vat_attributions',`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM export_customs_documents d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.id=NEW.clearance_id AND d.kind='CLEARANCE' AND d.status='APPROVED') THEN ${fail('VAT attribution requires accepted exit evidence')} END IF; END`],
 ['vat_attribution_line_insert','INSERT','vat_attribution_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_attributions a JOIN export_customs_lines c ON c.document_id=a.clearance_id JOIN vat_input_sources s ON s.id=NEW.source_id WHERE a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.id=NEW.attribution_id AND a.status='ASSEMBLING' AND s.base_currency=a.base_currency AND c.id=NEW.clearance_line_id AND JSON_UNQUOTE(JSON_EXTRACT(c.snapshot,'$.issue.layerId'))=s.layer_id AND NEW.candidate_vat=IF(a.treatment='CANDIDATE',NEW.deductible_vat,0)) THEN ${fail('VAT line requires exact accepted source layer')} END IF; END`],
 ['vat_attribution_update','UPDATE','vat_attributions',`BEGIN ${lock}
  IF NOT (${same('id,tenant_id,legal_entity_id,reference,clearance_id,treatment,base_currency,eligibility_evidence,reason,evidence,input,context_hash,requested_by,requested_at')}) THEN ${fail('VAT attribution source plan is immutable')} END IF;
  IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN ${fail('Invalid VAT attribution transition')} END IF;
  IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent VAT attribution review required')} END IF;
  ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Retain original VAT review')} END IF;
  IF NEW.status<>'CANCELLED' AND NOT (${same('cancel_reason')}) THEN ${fail('Retain VAT cancellation evidence')} END IF;
   IF NEW.status='CANCELLED' AND CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('VAT cancellation reason required')} END IF;
  IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN ${fail('Evidenced VAT void request required')} END IF;
  ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence')}) THEN ${fail('Retain VAT void request')} END IF; IF NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN ${fail('Independent VAT void review required')} END IF;
  ELSEIF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence,void_reviewed_by,void_reviewed_at,void_review_reason')}) THEN ${fail('Retain VAT void evidence')} END IF;
  IF NEW.status IN ${committed} THEN
   IF NOT EXISTS (SELECT 1 FROM vat_attribution_lines WHERE attribution_id=NEW.id) THEN ${fail('VAT attribution lines required')} END IF;
   IF EXISTS (SELECT 1 FROM vat_attribution_lines l JOIN vat_input_sources s ON s.id=l.source_id WHERE l.attribution_id=NEW.id AND (s.quantity<(SELECT SUM(x.quantity) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ${committed})) OR s.native_vat<(SELECT SUM(x.native_vat) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ${committed})) OR s.converted_vat<(SELECT SUM(x.converted_vat) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ${committed})) OR s.deductible_vat<(SELECT SUM(x.deductible_vat) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.source_id=s.id AND (a.id=NEW.id OR a.status IN ${committed})))) THEN ${fail('VAT attribution exceeds original source quantity or tax')} END IF;
   IF EXISTS (SELECT 1 FROM vat_attribution_lines l JOIN export_customs_lines c ON c.id=l.clearance_line_id WHERE l.attribution_id=NEW.id AND c.quantity<(SELECT SUM(x.quantity) FROM vat_attribution_lines x JOIN vat_attributions a ON a.id=x.attribution_id WHERE x.clearance_line_id=c.id AND (a.id=NEW.id OR a.status IN ${committed}))) THEN ${fail('VAT attribution exceeds accepted exit quantity')} END IF;
  END IF; END`],
 ...['vat_input_sources','vat_attribution_lines','vat_attribution_decisions'].map(t=>[t+'_no_update','UPDATE',t,`BEGIN ${fail('VAT source and decision history are immutable')} END`]),
 ...tables.map(([t])=>[t+'_no_delete','DELETE',t,`BEGIN ${fail('Retain VAT source and attribution history')} END`]),
];
const permissions=[['vat.source.register','Register immutable posted purchase VAT sources'],['vat.attribution.request','Request export VAT attribution and evidenced void'],['vat.attribution.review','Independently review VAT attribution and void'],['vat.audit.read','Read VAT audit history']];
const normalize=s=>s.replace(/\s+/g,' ').trim();
export default {key:'m017_vat_source_attribution',description:'Immutable purchase-line input VAT sources and independently reviewed source-layer export attribution candidates.',async up(c){
 const [journalIndexes]=await c.query('SHOW INDEX FROM journal_lines');
 if(!journalIndexes.some(i=>i.Key_name==='vat_journal_line_scope'))await c.query('ALTER TABLE journal_lines ADD UNIQUE KEY vat_journal_line_scope (tenant_id,legal_entity_id,id)');
 for(const [n,d]of tables)await c.query(`CREATE TABLE IF NOT EXISTS ${n} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 for(const [n,e,t,b]of triggers){const [[old]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[n]);if(old){if(normalize(old.body)!==normalize(b))throw Error('Unexpected VAT guard: '+n);continue;}await c.query(`CREATE TRIGGER ${n} BEFORE ${e} ON ${t} FOR EACH ROW ${b}`);}
 for(const [code,description]of permissions){await c.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code=code',[code,description]);await c.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code='ADMIN' ON DUPLICATE KEY UPDATE permission_code=permission_code",[code]);}
},verify};

async function verify(connection) {
  const [journalIndexes]=await connection.query('SHOW INDEX FROM journal_lines');
  const journalScope=journalIndexes.filter(i=>i.Key_name==='vat_journal_line_scope').sort((a,b)=>a.Seq_in_index-b.Seq_in_index);
  if(journalScope.length!==3||journalScope.some(i=>i.Non_unique!==0)||journalScope.map(i=>i.Column_name).join(',')!=='tenant_id,legal_entity_id,id')throw Error('VAT journal source index differs');
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`VAT attribution columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`VAT attribution table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`VAT attribution foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`VAT attribution indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`VAT attribution check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('VAT attribution trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing VAT attribution permissions');
}
