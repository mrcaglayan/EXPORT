// PR-03C: forward extension; m001–m013 remain frozen.
import {tables as inventoryTables,triggers as inventoryTriggers} from './m011_inventory_corrections.js';
const scope='tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk=(cols,table,refs='id')=>`FOREIGN KEY (tenant_id, legal_entity_id, ${cols}) REFERENCES ${table}(tenant_id, legal_entity_id, ${refs})`;
const own=a=>`${a}.tenant_id=NEW.tenant_id AND ${a}.legal_entity_id=NEW.legal_entity_id`;
const fail=s=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${s}';`;
const same=fields=>fields.split(',').map(f=>`NEW.${f}<=>OLD.${f}`).join(' AND ');
export const additions=[
 ['purchase_posting_settings',`${scope}, policy JSON NOT NULL, updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, legal_entity_id), FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities(tenant_id,id), FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id)`],
 ['purchase_invoice_resolutions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
  context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, proposal JSON NOT NULL,
  reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL, status ENUM('REQUESTED','APPROVED','REJECTED') NOT NULL DEFAULT 'REQUESTED',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
  UNIQUE KEY resolution_scope (tenant_id,legal_entity_id,id), KEY resolution_invoice (tenant_id,legal_entity_id,invoice_id,requested_at,id),
  ${fk('invoice_id','purchase_invoices')}, FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id)`],
 ['purchase_receipts',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, invoice_id CHAR(36) NOT NULL, active_invoice_id CHAR(36) NULL,
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
  ${fk('invoice_id','purchase_invoices')}, ${fk('active_invoice_id','purchase_invoices')}, ${fk('stock_receipt_id','stock_receipts')}, ${fk('journal_id','journals')},
  FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,posted_by) REFERENCES users(tenant_id,id)`],
 ['purchase_receipt_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, receipt_id CHAR(36) NOT NULL, invoice_line_id CHAR(36) NOT NULL,
  line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL, details JSON NOT NULL,
  UNIQUE KEY purchase_receipt_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY purchase_receipt_line_number (tenant_id,legal_entity_id,receipt_id,line_number),
  UNIQUE KEY purchase_receipt_line_source (tenant_id,legal_entity_id,receipt_id,invoice_line_id),
  CONSTRAINT purchase_receipt_line_amount CHECK (quantity>0 AND value>=0),
  ${fk('receipt_id','purchase_receipts')}, ${fk('invoice_line_id','purchase_invoice_lines')}, ${fk('sku_id','product_skus')}`],
];
export const tables=[...inventoryTables.map(([name,d])=>[name,name==='stock_receipts'?d.replace("ENUM('TEST_FIXTURE')","ENUM('TEST_FIXTURE','PURCHASE_INVOICE')"):
 ['stock_receipt_lines','inventory_layers'].includes(name)?d.replace('value = ROUND(quantity * unit_cost, 6)','value >= 0'):d]),...additions];
const oldBody=name=>inventoryTriggers.find(t=>t[0]===name)[3];
const replacements=[
 ['receipt_post_guard','UPDATE','stock_receipts',`BEGIN ${oldBody('receipt_post_guard')};
  IF NEW.source_kind='PURCHASE_INVOICE' AND ((SELECT COUNT(*) FROM stock_receipt_lines l WHERE l.receipt_id=NEW.id)<>(SELECT COUNT(*) FROM purchase_receipt_lines l WHERE l.receipt_id=NEW.source_id)
   OR NEW.total_value<>(SELECT SUM(l.value) FROM purchase_receipt_lines l WHERE l.receipt_id=NEW.source_id)) THEN ${fail('Complete exact purchase source must reconcile')} END IF; END`],
 ['receipt_insert_guard','INSERT','stock_receipts',`BEGIN ${oldBody('receipt_insert_guard')};
  IF NEW.source_kind='PURCHASE_INVOICE' AND NOT EXISTS (SELECT 1 FROM purchase_receipts p WHERE ${own('p')} AND p.id=NEW.source_id AND p.status='POSTING') THEN ${fail('Purchase receipt requires approved posting source')} END IF; END`],
 ['stock_receipt_lines_insert_guard','INSERT','stock_receipt_lines',`BEGIN ${oldBody('stock_receipt_lines_insert_guard')};
  IF EXISTS (SELECT 1 FROM stock_receipts r WHERE r.id=NEW.receipt_id AND r.source_kind='TEST_FIXTURE') THEN
   IF NEW.value<>ROUND(NEW.quantity*NEW.unit_cost,6) THEN ${fail('Fixture receipt cost must multiply exactly')} END IF;
  ELSEIF NOT EXISTS (SELECT 1 FROM stock_receipts r JOIN purchase_receipts p ON p.id=r.source_id AND p.tenant_id=r.tenant_id AND p.legal_entity_id=r.legal_entity_id
   JOIN purchase_receipt_lines l ON l.receipt_id=p.id AND l.tenant_id=p.tenant_id AND l.legal_entity_id=p.legal_entity_id
   WHERE ${own('r')} AND r.id=NEW.receipt_id AND p.status='POSTING' AND l.invoice_line_id=NEW.source_line_key AND l.sku_id=NEW.sku_id AND l.quantity=NEW.quantity AND l.value=NEW.value)
   THEN ${fail('Purchase stock line must match approved invoice cost')} END IF; END`],
 ['layer_insert_guard','INSERT','inventory_layers',`BEGIN ${oldBody('layer_insert_guard')};
  IF NOT EXISTS (SELECT 1 FROM stock_receipt_lines l WHERE ${own('l')} AND l.id=NEW.receipt_line_id AND l.quantity=NEW.quantity AND l.unit_cost=NEW.unit_cost AND l.value=NEW.value) THEN ${fail('Layer cost must equal exact receipt source')} END IF; END`],
];
export const triggers=[...inventoryTriggers.filter(t=>!replacements.some(r=>r[0]===t[0])),...replacements,
 ['purchase_journal_source_guard','INSERT','journals',`BEGIN IF NEW.source_module='PURCHASE_INVOICE' AND NOT EXISTS (SELECT 1 FROM purchase_receipts p WHERE ${own('p')} AND p.invoice_id=NEW.source_id AND p.status='POSTING' AND NEW.payload_hash=JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.journalHash'))) THEN ${fail('Purchase journal requires approved posting source')} END IF; END`],
 ['purchase_resolution_insert','INSERT','purchase_invoice_resolutions',`BEGIN IF NEW.status<>'REQUESTED' OR NEW.reviewed_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM purchase_invoices i WHERE ${own('i')} AND i.id=NEW.invoice_id AND i.status='STAGED' AND i.revision=NEW.revision) THEN ${fail('Resolution requires current staged invoice')} END IF; END`],
 ['purchase_resolution_update','UPDATE','purchase_invoice_resolutions',`BEGIN
  IF OLD.status<>'REQUESTED' OR NEW.status NOT IN ('APPROVED','REJECTED') OR NOT (${same('id,tenant_id,legal_entity_id,invoice_id,revision,context_hash,proposal,reason,evidence,requested_by,requested_at')}) OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Resolution needs independent immutable review')} END IF; END`],
 ['purchase_receipt_insert','INSERT','purchase_receipts',`BEGIN IF NEW.status<>'ASSEMBLING' OR NEW.stock_receipt_id IS NOT NULL OR NEW.journal_id IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.posted_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM purchase_invoices i WHERE ${own('i')} AND i.id=NEW.invoice_id AND i.status='READY') THEN ${fail('Receipt requires ready invoice')} END IF; END`],
 ['purchase_receipt_update','UPDATE','purchase_receipts',`BEGIN
  IF NOT (${same('id,tenant_id,legal_entity_id,invoice_id,reference,context_hash,plan,reason,evidence,requested_by,requested_at')}) THEN ${fail('Receipt plan is immutable')} END IF;
  IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status IN ('POSTING','CANCELLED')) OR (OLD.status='POSTING' AND NEW.status='POSTED')) THEN ${fail('Invalid purchase receipt transition')} END IF;
  IF NEW.status IN ('APPROVED','REJECTED') THEN
   IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent receipt review required')} END IF;
  ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Receipt review is immutable')} END IF;
  IF NEW.status='CANCELLED' AND CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('Cancellation reason required')} END IF;
  IF NEW.status<>'POSTED' AND NOT (${same('stock_receipt_id,journal_id,posted_by,posted_at')}) THEN ${fail('Posting lineage is immutable')} END IF;
  IF NEW.status='REQUESTED' AND NOT EXISTS (SELECT 1 FROM purchase_receipt_lines l WHERE ${own('l')} AND l.receipt_id=NEW.id) THEN ${fail('Receipt lines required')} END IF;
  IF NEW.status='POSTED' THEN
   IF NEW.posted_by IS NULL OR NEW.posted_at IS NULL OR NOT EXISTS (SELECT 1 FROM stock_receipts r WHERE ${own('r')} AND r.id=NEW.stock_receipt_id AND r.source_kind='PURCHASE_INVOICE' AND r.source_id=NEW.id AND r.status='POSTED') THEN ${fail('Posted stock source required')} END IF;
   IF JSON_UNQUOTE(JSON_EXTRACT(NEW.plan,'$.payable'))<>'0.000000' AND NOT EXISTS (SELECT 1 FROM journals j JOIN journal_lines l ON l.journal_id=j.id WHERE ${own('j')} AND j.id=NEW.journal_id AND j.source_module='PURCHASE_INVOICE' AND j.source_id=NEW.invoice_id AND j.status='POSTED' AND j.total_credit=j.total_debit AND l.account_id=JSON_UNQUOTE(JSON_EXTRACT(NEW.plan,'$.payableAccountId')) AND l.credit=JSON_UNQUOTE(JSON_EXTRACT(NEW.plan,'$.payable')) AND l.debit=0) THEN ${fail('Balanced purchase journal required')} END IF;
  END IF; END`],
 ['purchase_receipt_line_insert','INSERT','purchase_receipt_lines',`BEGIN IF NOT EXISTS (SELECT 1 FROM purchase_receipts p JOIN purchase_invoice_lines l ON l.invoice_id=p.invoice_id WHERE ${own('p')} AND p.id=NEW.receipt_id AND p.status='ASSEMBLING' AND l.id=NEW.invoice_line_id AND l.quantity=NEW.quantity) THEN ${fail('Receipt line requires its complete invoice source')} END IF; END`],
 ['purchase_invoice_receipt_dependency','UPDATE','purchase_invoices',`BEGIN IF NEW.status IN ('STAGED','CANCELLED') AND OLD.status<>NEW.status AND EXISTS (SELECT 1 FROM purchase_receipts p WHERE ${own('p')} AND p.active_invoice_id=OLD.id) THEN ${fail('Cancel unposted receipt before changing invoice matching')} END IF; END`],
 ['purchase_receipt_reversal_dependency','INSERT','inventory_corrections',`BEGIN IF NEW.kind='REVERSAL' AND EXISTS (SELECT 1 FROM inventory_events e JOIN stock_receipts r ON r.id=e.receipt_id WHERE ${own('e')} AND e.id=NEW.original_event_id AND r.source_kind='PURCHASE_INVOICE') THEN ${fail('Purchase receipt requires coordinated financial reversal')} END IF; END`],
 ...['purchase_invoice_resolutions','purchase_receipts','purchase_receipt_lines'].map(table=>[`${table}_no_delete`,'DELETE',table,`BEGIN ${fail('Retain purchase posting history')} END`]),
 ['purchase_receipt_lines_no_update','UPDATE','purchase_receipt_lines',`BEGIN ${fail('Receipt source lines are immutable')} END`],
];
const permissions=[['purchasing.receipt.configure','Configure purchase posting accounts'],['purchasing.exception.request','Request evidenced invoice commercial resolution'],['purchasing.exception.review','Independently review invoice commercial resolution'],['purchasing.receipt.request','Request and cancel goods receipt'],['purchasing.receipt.review','Independently review goods receipt'],['purchasing.receipt.post','Atomically post stock and purchase journal']];
const normalize=s=>s.replace(/\s+/g,' ').trim().toLowerCase();

export default {
 key:'m014_purchase_receipts',description:'Reviewed purchase exceptions and atomic invoice goods receipts with exact stock, VAT and payable journals.',
 replacesVerificationFor:['m007_inventory_receipts','m008_inventory_reallocations','m009_inventory_reservations_issues','m011_inventory_corrections'],
 async up(c){
  for(const [name,d]of additions)await c.query(`CREATE TABLE IF NOT EXISTS ${name} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  const [cols]=await c.query('SHOW COLUMNS FROM stock_receipts');
  if(!cols.find(x=>x.Field==='source_kind').Type.includes('PURCHASE_INVOICE'))await c.query("ALTER TABLE stock_receipts MODIFY source_kind ENUM('TEST_FIXTURE','PURCHASE_INVOICE') NOT NULL");
  for(const [table,key]of [['stock_receipt_lines','receipt_line_amount'],['inventory_layers','layer_amount']]){
   const [[check]]=await c.execute('SELECT CHECK_CLAUSE AS clause FROM information_schema.check_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?',[key]);
   if(check.clause.toLowerCase().includes('round'))await c.query(`ALTER TABLE ${table} DROP CHECK ${key}, ADD CONSTRAINT ${key} CHECK (quantity>0 AND unit_cost>=0 AND value>=0)`);
  }
  for(const [name,event,table,body]of triggers){
   const [[existing]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
   if(existing&&normalize(existing.body)===normalize(body))continue;
   if(existing&&!inventoryTriggers.some(t=>t[0]===name&&normalize(t[3])===normalize(existing.body)))throw new Error('Unexpected purchase posting predecessor trigger: '+name);
   if(existing)await c.query(`DROP TRIGGER ${name}`);await c.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
  }
  for(const [code,description]of permissions){await c.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code=code',[code,description]);await c.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code='ADMIN' ON DUPLICATE KEY UPDATE permission_code=permission_code",[code]);}
 },verify,
};

async function verify(connection) {
  for(const constraint of ['receipt_line_amount','layer_amount']){
    const [[check]]=await connection.execute('SELECT CHECK_CLAUSE AS clause FROM information_schema.check_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?',[constraint]);
    const canonical=s=>s.toLowerCase().replace(/[\s`()]/g,'');
    if(!check||canonical(check.clause)!==canonical('quantity>0 AND unit_cost>=0 AND value>=0'))throw new Error('Purchase posting check differs: '+constraint);
  }
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON|MEDIUMTEXT)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? (type.startsWith('DECIMAL')?'0.000000':'0')
          : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : options.match(/DEFAULT '([^']+)'/)?.[1] ?? null,
        collation: /CHAR|TEXT/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : options.includes('utf8mb4_bin') ? 'utf8mb4_bin' : 'utf8mb4_0900_ai_ci'
          : type.startsWith('ENUM') ? 'utf8mb4_0900_ai_ci' : null,
      }));
    const actual = columns.map(c => ({ name: c.Field, type: c.Type.toLowerCase(), nullable: c.Null, default: c.Default, collation: c.Collation }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Purchase posting columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Purchase posting table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Purchase posting foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Purchase posting indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Purchase posting check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('Purchase posting trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  const required = ['inventory.receipt.post','inventory.reallocation.request','inventory.reallocation.review','inventory.reallocation.execute','inventory.reservation.manage','inventory.issue.post','inventory.correction.request','inventory.correction.review','inventory.correction.post'];
  if(!required.every(code=>rows.some(r=>r.code===code)))throw new Error('Missing retained inventory permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing purchase posting permissions');
}
