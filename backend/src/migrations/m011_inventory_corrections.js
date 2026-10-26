// Forward extension of the frozen m009 inventory contract. m010 remains unchanged.
import { tables as oldTables, triggers as oldTriggers } from './m009_inventory_reservations_issues.js';
const scope = 'tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk = (cols,table,refs='id') => `FOREIGN KEY (tenant_id, legal_entity_id, ${cols}) REFERENCES ${table}(tenant_id, legal_entity_id, ${refs})`;
const own = a => `${a}.tenant_id = NEW.tenant_id AND ${a}.legal_entity_id = NEW.legal_entity_id`;
const same = (a,b,pool=true) => `${a}.tenant_id = ${b}.tenant_id AND ${a}.legal_entity_id = ${b}.legal_entity_id AND ${a}.layer_id = ${b}.layer_id${pool?` AND ${a}.pool_id = ${b}.pool_id`:''}`;
const reject = s => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${s}';`;
const fixed = fields => fields.map(f=>`NOT (NEW.${f} <=> OLD.${f})`).join(' OR ');
export const additions = [
 ['inventory_corrections',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope},
  reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('REVERSAL','COUNT','REVALUATION') NOT NULL, original_event_id CHAR(36) NULL,
  posting_date DATE NOT NULL, period_id CHAR(36) NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
  status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','POSTING','POSTED') NOT NULL DEFAULT 'ASSEMBLING',
  requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
  posted_by CHAR(36) NULL, posted_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
  UNIQUE KEY correction_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY correction_reference (tenant_id, legal_entity_id, reference),
  KEY correction_status (tenant_id, legal_entity_id, status, requested_at, id),
  CONSTRAINT correction_source CHECK ((kind = 'REVERSAL' AND original_event_id IS NOT NULL) OR (kind <> 'REVERSAL' AND original_event_id IS NULL)),
  ${fk('original_event_id','inventory_events')}, ${fk('period_id','inventory_periods')},
  FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, posted_by) REFERENCES users(tenant_id, id)`],
 ['inventory_correction_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, correction_id CHAR(36) NOT NULL,
  line_number INT UNSIGNED NOT NULL, warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL,
  layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NOT NULL, source_entry_id CHAR(36) NULL,
  before_quantity DECIMAL(20,6) NOT NULL, before_value DECIMAL(20,6) NOT NULL,
  quantity DECIMAL(20,6) NOT NULL, value DECIMAL(20,6) NOT NULL,
  observed_quantity DECIMAL(20,6) NULL, target_value DECIMAL(20,6) NULL,
  movement_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  UNIQUE KEY correction_line_scope (tenant_id, legal_entity_id, id),
  UNIQUE KEY correction_line_number (tenant_id, legal_entity_id, correction_id, line_number),
  UNIQUE KEY correction_line_grain (tenant_id, legal_entity_id, correction_id, layer_id, pool_id),
  CONSTRAINT correction_line_amount CHECK (before_quantity >= 0 AND before_value >= 0 AND (quantity <> 0 OR value <> 0)
    AND before_quantity + quantity >= 0 AND before_value + value >= 0
    AND (before_quantity + quantity > 0 OR before_value + value = 0)
    AND (quantity = 0 OR (quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0))),
  ${fk('correction_id','inventory_corrections')}, ${fk('source_entry_id','inventory_pool_ledger')},
  ${fk('layer_id, warehouse_id, sku_id','inventory_layers','id, warehouse_id, sku_id')},
  ${fk('warehouse_id, sku_id, layer_id, pool_id','inventory_pool_balances','warehouse_id, sku_id, layer_id, pool_id')}`],
];
const eventDefinition = oldTables.find(([n])=>n==='inventory_events')[1]
 .replace("ENUM('RECEIPT','REALLOCATION','ISSUE')","ENUM('RECEIPT','REALLOCATION','ISSUE','CORRECTION')")
 .replace(/,\s*CONSTRAINT event_source CHECK[\s\S]*$/,'') + `,
 correction_id CHAR(36) NULL, reverses_event_id CHAR(36) NULL, posting_date DATE NOT NULL DEFAULT '1000-01-01',
 UNIQUE KEY event_correction (tenant_id, legal_entity_id, correction_id),
 UNIQUE KEY event_reversal (tenant_id, legal_entity_id, reverses_event_id),
 KEY event_posting (tenant_id, legal_entity_id, posting_date, id),
 KEY event_cursor (tenant_id, legal_entity_id, created_at, id),
 ${fk('correction_id','inventory_corrections')}, ${fk('reverses_event_id','inventory_events')},
 CONSTRAINT event_source CHECK (
 (kind = 'RECEIPT' AND receipt_id IS NOT NULL AND reallocation_id IS NULL AND issue_id IS NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'REALLOCATION' AND receipt_id IS NULL AND reallocation_id IS NOT NULL AND issue_id IS NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'ISSUE' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NOT NULL AND correction_id IS NULL AND reverses_event_id IS NULL)
 OR (kind = 'CORRECTION' AND receipt_id IS NULL AND reallocation_id IS NULL AND issue_id IS NULL AND correction_id IS NOT NULL))`;
export const tables = [...oldTables.map(([name,d])=>[name,name==='inventory_events'?eventDefinition:
 name.endsWith('_ledger')?d.replace(/(physical|pool)_signed_amount CHECK \(\(quantity > 0 AND value >= 0\) OR \(quantity < 0 AND value <= 0\)\)/,'$1_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value <> 0))')+`, KEY movement_cursor (tenant_id, legal_entity_id, event_id, id)`:
 name.endsWith('_balances')?d+`, CONSTRAINT ${name}_no_orphan CHECK (quantity > 0 OR value = 0)`:d]),...additions];
const periodOpen = `EXISTS (SELECT 1 FROM inventory_periods i JOIN accounting_periods a ON a.tenant_id = i.tenant_id AND a.legal_entity_id = i.legal_entity_id AND a.id = i.accounting_period_id WHERE ${own('i')} AND i.id = NEW.period_id AND i.status = 'OPEN' AND a.status = 'OPEN' AND NEW.posting_date BETWEEN a.start_date AND a.end_date)`;
const oldBody = name => oldTriggers.find(t=>t[0]===name)[3];
const replacements = [
 ['inventory_events_insert_guard','INSERT','inventory_events',`BEGIN
  IF NEW.kind = 'CORRECTION' THEN
   IF NOT EXISTS (SELECT 1 FROM inventory_corrections c WHERE ${own('c')} AND c.id = NEW.correction_id AND c.status = 'POSTING' AND (c.original_event_id <=> NEW.reverses_event_id)) THEN ${reject('Correction event requires its approved posting request')} END IF;
   SET NEW.posting_date = (SELECT posting_date FROM inventory_corrections WHERE id = NEW.correction_id);
  ELSE
   ${oldBody('inventory_events_insert_guard')};
   SET NEW.posting_date = COALESCE((SELECT posting_date FROM stock_receipts WHERE id = NEW.receipt_id),(SELECT posting_date FROM inventory_reallocations WHERE id = NEW.reallocation_id),(SELECT posting_date FROM inventory_issues WHERE id = NEW.issue_id));
  END IF;
 END`],
 ...['inventory_physical_ledger','inventory_pool_ledger'].map(table=>{
  const pool=table==='inventory_pool_ledger';
  return [`${table}_insert_guard`,'INSERT',table,`BEGIN
   IF EXISTS (SELECT 1 FROM inventory_events e WHERE ${own('e')} AND e.id = NEW.event_id AND e.kind = 'CORRECTION') THEN
    IF NOT EXISTS (SELECT 1 FROM inventory_events e JOIN inventory_corrections c ON c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id AND c.id = e.correction_id
      WHERE ${own('e')} AND e.id = NEW.event_id AND c.status = 'POSTING'
      AND NEW.quantity = (SELECT SUM(l.quantity) FROM inventory_correction_lines l WHERE ${same('l','NEW',pool)} AND l.correction_id = c.id)
      AND NEW.value = (SELECT SUM(l.value) FROM inventory_correction_lines l WHERE ${same('l','NEW',pool)} AND l.correction_id = c.id)) THEN ${reject('Correction ledger must match its retained plan')} END IF;
   ELSE ${oldBody(`${table}_insert_guard`)}; END IF;
  END`];
 }),
];
const immutable = table => ['UPDATE','DELETE'].map(event=>[`${table}_no_${event.toLowerCase()}`,event,table,`BEGIN ${reject('Correction evidence and source lines are immutable')} END`]);
export const triggers = [
 ...oldTriggers.map(t=>replacements.find(r=>r[0]===t[0])??t),
 ['correction_insert','INSERT','inventory_corrections',`BEGIN
  IF NEW.status <> 'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL OR NEW.cancel_reason IS NOT NULL THEN ${reject('Correction must begin as an unreviewed draft')} END IF;
  IF NEW.kind = 'REVERSAL' AND NOT EXISTS (SELECT 1 FROM inventory_events e
   LEFT JOIN stock_receipts r ON r.id = e.receipt_id LEFT JOIN inventory_reallocations a ON a.id = e.reallocation_id LEFT JOIN inventory_issues i ON i.id = e.issue_id LEFT JOIN inventory_corrections c ON c.id = e.correction_id
   WHERE ${own('e')} AND e.id = NEW.original_event_id AND e.reverses_event_id IS NULL AND e.posting_date <= NEW.posting_date AND COALESCE(c.status,r.status,a.status,i.status) IN ('POSTED','EXECUTED')) THEN ${reject('Reversal needs a completed original event')} END IF;
 END`],
 ['correction_transition','UPDATE','inventory_corrections',`BEGIN
  DECLARE correctionEvent CHAR(36);
  IF ${fixed(['id','tenant_id','legal_entity_id','reference','kind','original_event_id','posting_date','period_id','reason','evidence','requested_by','requested_at'])}
   OR NOT ((OLD.status = 'ASSEMBLING' AND NEW.status = 'REQUESTED') OR (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status = 'APPROVED' AND NEW.status IN ('POSTING','CANCELLED')) OR (OLD.status = 'POSTING' AND NEW.status = 'POSTED')) THEN ${reject('Correction identity and terminal history are immutable')} END IF;
  IF OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN
   IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR COALESCE(CHAR_LENGTH(TRIM(NEW.review_reason)),0) = 0 OR (NEW.status = 'APPROVED' AND NEW.reviewed_by = NEW.requested_by) THEN ${reject('Correction approval requires a different reviewer')} END IF;
  ELSEIF ${fixed(['reviewed_by','reviewed_at','review_reason'])} THEN ${reject('Correction review is immutable')} END IF;
  IF NEW.status = 'CANCELLED' THEN IF COALESCE(CHAR_LENGTH(TRIM(NEW.cancel_reason)),0) = 0 THEN ${reject('Cancellation needs a reason')} END IF;
  ELSEIF ${fixed(['cancel_reason'])} THEN ${reject('Cancellation is immutable')} END IF;
  IF NEW.status = 'POSTED' THEN IF NEW.posted_by IS NULL OR NEW.posted_at IS NULL THEN ${reject('Correction posting needs an actor')} END IF;
  ELSEIF ${fixed(['posted_by','posted_at'])} THEN ${reject('Posting actor is immutable')} END IF;
  IF NEW.status IN ('REQUESTED','APPROVED','POSTING','POSTED') THEN
   IF NOT (${periodOpen}) OR NOT EXISTS (SELECT 1 FROM inventory_correction_lines l WHERE ${own('l')} AND l.correction_id = NEW.id) THEN ${reject('Correction needs lines and both open calendars')} END IF;
   IF NEW.kind = 'REVERSAL' AND ((SELECT COUNT(*) FROM inventory_correction_lines l WHERE ${own('l')} AND l.correction_id = NEW.id) <> (SELECT COUNT(*) FROM inventory_pool_ledger p WHERE ${own('p')} AND p.event_id = NEW.original_event_id)) THEN ${reject('Reversal must include every original pool entry')} END IF;
  END IF;
  IF NEW.status = 'POSTING' AND EXISTS (SELECT 1 FROM inventory_correction_lines l LEFT JOIN inventory_pool_balances b ON ${same('b','l')}
   WHERE ${own('l')} AND l.correction_id = NEW.id AND (b.layer_id IS NULL OR b.quantity <> l.before_quantity OR b.value <> l.before_value)) THEN ${reject('Approved correction stock has changed')} END IF;
  IF NEW.status = 'POSTED' THEN
   SET correctionEvent = (SELECT e.id FROM inventory_events e WHERE ${own('e')} AND e.correction_id = NEW.id);
   IF correctionEvent IS NULL THEN ${reject('Correction needs its immutable event')} END IF;
   IF EXISTS (SELECT 1 FROM inventory_correction_lines l LEFT JOIN inventory_pool_ledger p ON ${same('p','l')} AND p.event_id = correctionEvent
    WHERE ${own('l')} AND l.correction_id = NEW.id AND (p.id IS NULL OR p.quantity <> l.quantity OR p.value <> l.value)) THEN ${reject('Every correction line needs its exact pool entry')} END IF;
   IF EXISTS (SELECT 1 FROM (SELECT l.layer_id,SUM(l.quantity) AS quantity,SUM(l.value) AS value FROM inventory_correction_lines l WHERE ${own('l')} AND l.correction_id = NEW.id GROUP BY l.layer_id) planned
    LEFT JOIN inventory_physical_ledger p ON ${own('p')} AND p.event_id = correctionEvent AND p.layer_id = planned.layer_id
    WHERE (planned.quantity <> 0 OR planned.value <> 0) AND (p.id IS NULL OR p.quantity <> planned.quantity OR p.value <> planned.value)) THEN ${reject('Physical correction entry is missing or differs')} END IF;
   ${[['inventory_balances','inventory_physical_ledger',false],['inventory_pool_balances','inventory_pool_ledger',true]].map(([b,p,pool])=>`IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT l.layer_id${pool?',l.pool_id':''} FROM inventory_correction_lines l WHERE ${own('l')} AND l.correction_id = NEW.id) affected
    JOIN ${b} b ON ${own('b')} AND b.layer_id = affected.layer_id${pool?' AND b.pool_id = affected.pool_id':''}
    LEFT JOIN (SELECT p.layer_id${pool?',p.pool_id':''},SUM(p.quantity) AS quantity,SUM(p.value) AS value FROM ${p} p WHERE ${own('p')} GROUP BY p.layer_id${pool?',p.pool_id':''}) totals
      ON totals.layer_id = b.layer_id${pool?' AND totals.pool_id = b.pool_id':''}
    WHERE b.quantity <> COALESCE(totals.quantity,0) OR b.value <> COALESCE(totals.value,0)) THEN ${reject('Correction projections must match immutable ledgers')} END IF;`).join('\n')}
  END IF;
 END`],
 ['correction_no_delete','DELETE','inventory_corrections',`BEGIN ${reject('Correction history is immutable')} END`],
 ['correction_line_insert','INSERT','inventory_correction_lines',`BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventory_pool_balances b WHERE ${same('b','NEW')} AND b.quantity = NEW.before_quantity AND b.value = NEW.before_value) THEN ${reject('Correction must retain the actual source balance')} END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_corrections c WHERE ${own('c')} AND c.id = NEW.correction_id AND c.status = 'ASSEMBLING'
   AND ((c.kind = 'REVERSAL' AND NEW.observed_quantity IS NULL AND NEW.target_value IS NULL AND EXISTS (SELECT 1 FROM inventory_pool_ledger p WHERE ${same('p','NEW')} AND p.id = NEW.source_entry_id AND p.event_id = c.original_event_id AND NEW.quantity = -p.quantity AND NEW.value = -p.value))
    OR (c.kind = 'COUNT' AND NEW.source_entry_id IS NULL AND NEW.target_value IS NULL AND NEW.quantity <> 0 AND NEW.observed_quantity >= 0 AND NEW.quantity = NEW.observed_quantity - NEW.before_quantity)
    OR (c.kind = 'REVALUATION' AND NEW.source_entry_id IS NULL AND NEW.observed_quantity IS NULL AND NEW.quantity = 0 AND NEW.before_quantity > 0 AND NEW.target_value >= 0 AND NEW.value = NEW.target_value - NEW.before_value))) THEN ${reject('Correction line must match source or observed evidence')} END IF;
 END`],
 ...immutable('inventory_correction_lines'),
];
const permissions=[['inventory.receipt.post','Post receipts from authorized inventory sources'],['inventory.reallocation.request','Request and cancel pool reallocations'],['inventory.reallocation.review','Review pool reallocations; independent for country borrowing'],['inventory.reallocation.execute','Execute approved pool reallocations'],['inventory.reservation.manage','Reserve stock and release or cancel outstanding allocations'],['inventory.issue.post','Post physical dispatch against reserved source layers'],['inventory.correction.request','Request, cancel and inspect stock corrections'],['inventory.correction.review','Independently approve or reject stock corrections'],['inventory.correction.post','Post approved stock corrections']];
const normalize = s=>s.replace(/\s+/g,' ').trim().toLowerCase();
async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? (type.startsWith('DECIMAL') ? '0.000000' : '0')
          : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : options.match(/DEFAULT '([^']+)'/)?.[1] ?? null,
        collation: /CHAR/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : 'utf8mb4_0900_ai_ci'
          : type.startsWith('ENUM') ? 'utf8mb4_0900_ai_ci' : null,
      }));
    const actual = columns.map(c => ({ name: c.Field, type: c.Type.toLowerCase(), nullable: c.Null, default: c.Default, collation: c.Collation }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Inventory receipt columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Inventory receipt table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Inventory receipt foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Inventory receipt indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Inventory receipt check missing: ${constraint}`);
    }
  }
  for (const [name, event, table, body] of triggers) {
    const [[trigger]] = await connection.execute(`SELECT ACTION_STATEMENT AS body, EVENT_MANIPULATION AS event,
      EVENT_OBJECT_TABLE AS tableName, ACTION_TIMING AS timing FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() AND trigger_name = ?`, [name]);
    if (!trigger || trigger.event !== event || trigger.tableName !== table || trigger.timing !== 'BEFORE'
      || normalize(trigger.body) !== normalize(body)) throw new Error(`Inventory receipt trigger differs: ${name}`);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing inventory receipt permissions');
}
export default {
 key:'m011_inventory_corrections',description:'Reviewed source-preserving stock corrections, exact reversal lineage and indexed movement dates.',
 replacesVerificationFor:['m007_inventory_receipts','m008_inventory_reallocations','m009_inventory_reservations_issues'],
 async up(c){
  for(const [name,d]of additions)await c.query(`CREATE TABLE IF NOT EXISTS ${name} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  const [columns]=await c.query('SHOW COLUMNS FROM inventory_events');
  if(!columns.some(x=>x.Field==='correction_id'))await c.query(`ALTER TABLE inventory_events MODIFY kind ENUM('RECEIPT','REALLOCATION','ISSUE','CORRECTION') NOT NULL,
   ADD correction_id CHAR(36) NULL, ADD reverses_event_id CHAR(36) NULL, ADD posting_date DATE NOT NULL DEFAULT '1000-01-01',
   ADD UNIQUE KEY event_correction (tenant_id,legal_entity_id,correction_id), ADD UNIQUE KEY event_reversal (tenant_id,legal_entity_id,reverses_event_id),
   ADD KEY event_posting (tenant_id,legal_entity_id,posting_date,id), ADD KEY event_cursor (tenant_id,legal_entity_id,created_at,id),
   ADD ${fk('correction_id','inventory_corrections')}, ADD ${fk('reverses_event_id','inventory_events')}, DROP CHECK event_source,
   ADD ${eventDefinition.slice(eventDefinition.indexOf('CONSTRAINT event_source'))}`);
  // Only the new derived date is backfilled. Existing source/ledger fields stay intact.
  const [[oldImmutable]]=await c.query("SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = 'inventory_events_no_update'");
  if(oldImmutable&&normalize(oldImmutable.body)!==normalize(oldBody('inventory_events_no_update')))throw new Error('Unexpected event immutability guard');
  await c.query('DROP TRIGGER IF EXISTS inventory_events_no_update');
  await c.query(`UPDATE inventory_events e LEFT JOIN stock_receipts r ON r.id = e.receipt_id LEFT JOIN inventory_reallocations a ON a.id = e.reallocation_id LEFT JOIN inventory_issues i ON i.id = e.issue_id SET e.posting_date = COALESCE(r.posting_date,a.posting_date,i.posting_date) WHERE e.posting_date = '1000-01-01'`);
  for(const table of ['inventory_physical_ledger','inventory_pool_ledger']){
   const prefix=table==='inventory_physical_ledger'?'physical':'pool';
   const [[check]]=await c.execute('SELECT CHECK_CLAUSE AS clause FROM information_schema.check_constraints WHERE constraint_schema = DATABASE() AND constraint_name = ?',[`${prefix}_signed_amount`]);
   if(!normalize(check.clause).includes('quantity` = 0'))await c.query(`ALTER TABLE ${table} DROP CHECK ${prefix}_signed_amount, ADD CONSTRAINT ${prefix}_signed_amount CHECK ((quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value <> 0))`);
   const [idx]=await c.query(`SHOW INDEX FROM ${table}`);if(!idx.some(i=>i.Key_name==='movement_cursor'))await c.query(`ALTER TABLE ${table} ADD KEY movement_cursor (tenant_id,legal_entity_id,event_id,id)`);
  }
  for(const table of ['inventory_balances','inventory_pool_balances']){const [[check]]=await c.execute('SELECT CONSTRAINT_NAME FROM information_schema.check_constraints WHERE constraint_schema = DATABASE() AND constraint_name = ?',[`${table}_no_orphan`]);if(!check)await c.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_no_orphan CHECK (quantity > 0 OR value = 0)`);}
  for(const [name,event,table,body]of triggers){
   const [[existing]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ?',[name]);
   if(existing&&normalize(existing.body)===normalize(body))continue;
   if(existing&&!oldTriggers.some(t=>t[0]===name&&normalize(t[3])===normalize(existing.body)))throw new Error(`Unexpected trigger before correction extension: ${name}`);
   if(existing)await c.query(`DROP TRIGGER ${name}`);await c.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
  }
  for(const [code,description]of permissions){await c.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code = code',[code,description]);await c.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code = 'ADMIN' ON DUPLICATE KEY UPDATE permission_code = permission_code",[code]);}
 },verify,
};
