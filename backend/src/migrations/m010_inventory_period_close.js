// PR-02E, 26 October 2026. Self-contained; freeze once applied.
const scope = 'tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk = (columns, table, target = 'id') => `FOREIGN KEY (tenant_id, legal_entity_id, ${columns}) REFERENCES ${table}(tenant_id, legal_entity_id, ${target})`;
const id = name => `id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, UNIQUE KEY ${name}_scope (tenant_id, legal_entity_id, id)`;
const actor = column => `FOREIGN KEY (tenant_id, ${column}) REFERENCES users(tenant_id, id)`;
export const tables = [
  ['inventory_reconciliation_accounts', `${scope}, account_id CHAR(36) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, account_id), ${fk('account_id', 'accounts')}`],
  ['inventory_period_snapshots', `${id('stock_snapshot')}, period_id CHAR(36) NOT NULL, version INT UNSIGNED NOT NULL,
    base_snapshot_id CHAR(36) NULL, status ENUM('ASSEMBLING','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'ASSEMBLING',
    content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    line_count INT UNSIGNED NOT NULL, summary JSON NOT NULL, reason VARCHAR(255) NOT NULL,
    prepared_by CHAR(36) NOT NULL, prepared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME NULL, review_reason VARCHAR(255) NULL,
    UNIQUE KEY stock_snapshot_version (tenant_id, legal_entity_id, period_id, version),
    UNIQUE KEY stock_snapshot_period (tenant_id, legal_entity_id, id, period_id),
    CONSTRAINT stock_snapshot_version_positive CHECK (version > 0),
    ${fk('period_id', 'inventory_periods')}, ${fk('base_snapshot_id', 'inventory_period_snapshots')}, ${actor('prepared_by')}, ${actor('reviewed_by')}`],
  ['inventory_snapshot_lines', `${id('stock_snapshot_line')}, snapshot_id CHAR(36) NOT NULL,
    grain ENUM('PHYSICAL','POOL') NOT NULL, grain_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    warehouse_id CHAR(36) NOT NULL, sku_id CHAR(36) NOT NULL, family_id CHAR(36) NOT NULL, unit_id CHAR(36) NOT NULL,
    layer_id CHAR(36) NOT NULL, pool_id CHAR(36) NULL, identity_data JSON NOT NULL,
    opening_quantity DECIMAL(30,6) NOT NULL, opening_value DECIMAL(30,6) NOT NULL,
    incoming_quantity DECIMAL(30,6) NOT NULL, incoming_value DECIMAL(30,6) NOT NULL,
    outgoing_quantity DECIMAL(30,6) NOT NULL, outgoing_value DECIMAL(30,6) NOT NULL,
    closing_quantity DECIMAL(30,6) NOT NULL, closing_value DECIMAL(30,6) NOT NULL,
    reserved_quantity DECIMAL(30,6) NOT NULL,
    UNIQUE KEY stock_snapshot_grain (tenant_id, legal_entity_id, snapshot_id, grain, grain_key),
    KEY stock_snapshot_report (tenant_id, legal_entity_id, snapshot_id, grain, sku_id, layer_id),
    CONSTRAINT stock_snapshot_pool CHECK ((grain = 'PHYSICAL' AND pool_id IS NULL) OR (grain = 'POOL' AND pool_id IS NOT NULL)),
    CONSTRAINT stock_snapshot_equation CHECK (closing_quantity = opening_quantity + incoming_quantity - outgoing_quantity AND closing_value = opening_value + incoming_value - outgoing_value),
    CONSTRAINT stock_snapshot_amounts CHECK (opening_quantity >= 0 AND opening_value >= 0 AND incoming_quantity >= 0 AND incoming_value >= 0 AND outgoing_quantity >= 0 AND outgoing_value >= 0 AND closing_quantity >= reserved_quantity AND reserved_quantity >= 0 AND closing_value >= 0),
    ${fk('snapshot_id', 'inventory_period_snapshots')}, ${fk('warehouse_id', 'warehouses')}, ${fk('sku_id', 'product_skus')},
    ${fk('family_id', 'product_families')}, ${fk('unit_id', 'unit_of_measure')}, ${fk('layer_id, warehouse_id, sku_id', 'inventory_layers', 'id, warehouse_id, sku_id')}, ${fk('pool_id', 'inventory_pools')}`],
  ['inventory_snapshot_events', `${scope}, snapshot_id CHAR(36) NOT NULL, event_id CHAR(36) NOT NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, snapshot_id, event_id),
    ${fk('snapshot_id', 'inventory_period_snapshots')}, ${fk('event_id', 'inventory_events')}`],
  ['inventory_period_controls', `${scope}, period_id CHAR(36) NOT NULL,
    current_snapshot_id CHAR(36) NULL, pending_snapshot_id CHAR(36) NULL,
    PRIMARY KEY (tenant_id, legal_entity_id, period_id),
    CONSTRAINT inventory_control_pointer CHECK (current_snapshot_id IS NULL OR pending_snapshot_id IS NULL),
    ${fk('period_id', 'inventory_periods')},
    ${fk('current_snapshot_id, period_id', 'inventory_period_snapshots', 'id, period_id')},
    ${fk('pending_snapshot_id, period_id', 'inventory_period_snapshots', 'id, period_id')}`],
  ['inventory_period_reopens', `${id('inventory_reopen')}, period_id CHAR(36) NOT NULL,
    status ENUM('REQUESTED','APPROVED','REJECTED') NOT NULL DEFAULT 'REQUESTED', reason VARCHAR(255) NOT NULL,
    requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME NULL, review_reason VARCHAR(255) NULL,
    KEY inventory_reopen_status (tenant_id, legal_entity_id, status, period_id),
    ${fk('period_id', 'inventory_periods')}, ${actor('requested_by')}, ${actor('reviewed_by')}`],
  ['inventory_reopen_periods', `${id('inventory_reopen_period')}, reopen_id CHAR(36) NOT NULL, period_id CHAR(36) NOT NULL,
    snapshot_id CHAR(36) NOT NULL, accounting_closed BOOLEAN NOT NULL,
    UNIQUE KEY inventory_reopen_affected (tenant_id, legal_entity_id, reopen_id, period_id),
    CONSTRAINT inventory_reopen_accounting_status CHECK (accounting_closed IN (0,1)),
    ${fk('reopen_id', 'inventory_period_reopens')}, ${fk('period_id', 'inventory_periods')},
    ${fk('snapshot_id, period_id', 'inventory_period_snapshots', 'id, period_id')}`],
];
const own = a => `${a}.tenant_id = NEW.tenant_id AND ${a}.legal_entity_id = NEW.legal_entity_id`;
const fixed = fields => fields.map(f => `NOT (NEW.${f} <=> OLD.${f})`).join(' OR ');
const reject = message => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${message}';`;
const immutable = (table, events = ['UPDATE', 'DELETE']) => events.map(event => [`${table}_no_${event.toLowerCase()}`, event, table, `BEGIN ${reject('Stock close history is immutable')} END`]);
const mappingLocked = `EXISTS (SELECT 1 FROM inventory_period_controls c WHERE ${own('c')} AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL))`;
export const triggers = [
  ...['INSERT','DELETE'].map(event => [`inventory_reconciliation_${event.toLowerCase()}`,event,'inventory_reconciliation_accounts',`BEGIN
    IF ${mappingLocked.replaceAll('NEW.',event==='DELETE'?'OLD.':'NEW.')} THEN ${reject('Reopen all dependent stock closes before changing account mapping')} END IF;
    ${event==='INSERT'?`IF NOT EXISTS (SELECT 1 FROM accounts a WHERE ${own('a')} AND a.id = NEW.account_id AND a.active = 1 AND a.account_type = 'ASSET') THEN ${reject('Inventory reconciliation requires active asset accounts')} END IF;`:''}
  END`]),
  ...immutable('inventory_reconciliation_accounts',['UPDATE']),
  ['stock_snapshot_insert','INSERT','inventory_period_snapshots',`BEGIN
    IF NEW.status <> 'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM inventory_periods p WHERE ${own('p')} AND p.id = NEW.period_id AND p.status = 'OPEN') THEN ${reject('Snapshot requires an open inventory period')} END IF;
  END`],
  ['stock_snapshot_transition','UPDATE','inventory_period_snapshots',`BEGIN
    IF ${fixed(['id','tenant_id','legal_entity_id','period_id','version','base_snapshot_id','content_hash','line_count','summary','reason','prepared_by','prepared_at'])}
      OR NOT ((OLD.status = 'ASSEMBLING' AND NEW.status = 'IN_REVIEW') OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('APPROVED','REJECTED'))) THEN ${reject('Snapshot content and terminal history are immutable')} END IF;
    IF OLD.status = 'ASSEMBLING' THEN
      IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
        OR NEW.line_count <> (SELECT COUNT(*) FROM inventory_snapshot_lines l WHERE ${own('l')} AND l.snapshot_id = NEW.id)
        OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.summary,'$.financial.status')),'') <> 'MATCHED'
        OR COALESCE(JSON_LENGTH(JSON_EXTRACT(NEW.summary,'$.blockers')),-1) <> 0
        OR COALESCE(JSON_EXTRACT(NEW.summary,'$.eventCount'),-1) <> (SELECT COUNT(*) FROM inventory_snapshot_events e WHERE ${own('e')} AND e.snapshot_id = NEW.id)
        OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.summary,'$.financial.difference')) AS DECIMAL(30,6)),1) <> 0
        OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.summary,'$.stockValue')) AS DECIMAL(30,6)),-1) <> (SELECT COALESCE(SUM(l.closing_value),0) FROM inventory_snapshot_lines l WHERE ${own('l')} AND l.snapshot_id = NEW.id AND l.grain = 'PHYSICAL')
        THEN ${reject('Snapshot must contain a reconciled report')} END IF;
      IF EXISTS (SELECT 1 FROM inventory_snapshot_lines l WHERE ${own('l')} AND l.snapshot_id = NEW.id AND l.grain = 'PHYSICAL'
        AND (l.closing_quantity <> COALESCE((SELECT SUM(p.closing_quantity) FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'POOL'),0)
          OR l.closing_value <> COALESCE((SELECT SUM(p.closing_value) FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'POOL'),0)
          OR l.reserved_quantity <> COALESCE((SELECT SUM(p.reserved_quantity) FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'POOL'),0)))
        OR EXISTS (SELECT 1 FROM inventory_snapshot_lines l WHERE ${own('l')} AND l.snapshot_id = NEW.id AND l.grain = 'POOL' AND NOT EXISTS (SELECT 1 FROM inventory_snapshot_lines p WHERE p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.snapshot_id = l.snapshot_id AND p.layer_id = l.layer_id AND p.grain = 'PHYSICAL'))
        THEN ${reject('Snapshot pool totals must equal physical stock')} END IF;
    ELSEIF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
      OR (NEW.status = 'APPROVED' AND NEW.reviewed_by = NEW.prepared_by) THEN ${reject('Close approval requires a different authorized reviewer')} END IF;
  END`],
  ...immutable('inventory_period_snapshots',['DELETE']),
  ['stock_snapshot_line_insert','INSERT','inventory_snapshot_lines',`BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE ${own('s')} AND s.id = NEW.snapshot_id AND s.status = 'ASSEMBLING')
      OR NEW.grain_key <> CONCAT(NEW.layer_id,':',COALESCE(NEW.pool_id,'PHYSICAL')) THEN ${reject('Snapshot lines require an assembling header and exact grain')} END IF;
  END`],
  ...immutable('inventory_snapshot_lines'),
  ['stock_snapshot_event_insert','INSERT','inventory_snapshot_events',`BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE ${own('s')} AND s.id = NEW.snapshot_id AND s.status = 'ASSEMBLING') THEN ${reject('Snapshot events require an assembling header')} END IF;
  END`],
  ...immutable('inventory_snapshot_events'),
  ['inventory_control_insert','INSERT','inventory_period_controls',`BEGIN
    IF NEW.current_snapshot_id IS NOT NULL OR NEW.pending_snapshot_id IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE ${own('s')} AND s.id = NEW.pending_snapshot_id AND s.period_id = NEW.period_id AND s.status = 'IN_REVIEW') THEN ${reject('Period control requires its review snapshot')} END IF;
  END`],
  ['inventory_control_update','UPDATE','inventory_period_controls',`BEGIN
    IF ${fixed(['tenant_id','legal_entity_id','period_id'])} THEN ${reject('Period control identity is fixed')} END IF;
    IF OLD.current_snapshot_id IS NOT NULL THEN
      IF NEW.current_snapshot_id IS NOT NULL OR NEW.pending_snapshot_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM inventory_reopen_periods l JOIN inventory_period_reopens r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.reopen_id WHERE ${own('l')} AND l.period_id = NEW.period_id AND l.snapshot_id = OLD.current_snapshot_id AND r.status = 'APPROVED') THEN ${reject('Approved reopen required to invalidate a snapshot')} END IF;
    ELSEIF OLD.pending_snapshot_id IS NOT NULL THEN
      IF NEW.pending_snapshot_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE ${own('s')} AND s.id = OLD.pending_snapshot_id AND ((s.status = 'APPROVED' AND NEW.current_snapshot_id = s.id) OR (s.status = 'REJECTED' AND NEW.current_snapshot_id IS NULL))) THEN ${reject('Review decision required before changing control')} END IF;
    ELSEIF NEW.current_snapshot_id IS NOT NULL OR NEW.pending_snapshot_id IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_period_snapshots s WHERE ${own('s')} AND s.id = NEW.pending_snapshot_id AND s.period_id = NEW.period_id AND s.status = 'IN_REVIEW') THEN ${reject('New review snapshot required')} END IF;
  END`],
  ...immutable('inventory_period_controls',['DELETE']),
  ['inventory_controlled_period_update','UPDATE','inventory_periods',`BEGIN
    IF EXISTS (SELECT 1 FROM inventory_period_controls c WHERE ${own('c')} AND c.period_id = NEW.id) THEN
      IF ${fixed(['id','tenant_id','legal_entity_id','accounting_period_id'])} OR NOT EXISTS (SELECT 1 FROM inventory_period_controls c WHERE ${own('c')} AND c.period_id = NEW.id
        AND ((NEW.status = 'OPEN' AND c.current_snapshot_id IS NULL AND c.pending_snapshot_id IS NULL)
          OR (NEW.status = 'IN_REVIEW' AND c.pending_snapshot_id IS NOT NULL)
          OR (NEW.status = 'CLOSED' AND c.current_snapshot_id IS NOT NULL))) THEN ${reject('Inventory status must match its approved workflow')} END IF;
    END IF;
  END`],
  ['inventory_period_chronology','INSERT','inventory_periods',`BEGIN
    IF EXISTS (SELECT 1 FROM accounting_periods n JOIN accounting_periods a ON a.tenant_id = n.tenant_id AND a.legal_entity_id = n.legal_entity_id AND a.start_date > n.start_date
      JOIN inventory_periods p ON p.tenant_id = a.tenant_id AND p.legal_entity_id = a.legal_entity_id AND p.accounting_period_id = a.id
      JOIN inventory_period_controls c ON c.tenant_id = p.tenant_id AND c.legal_entity_id = p.legal_entity_id AND c.period_id = p.id
      WHERE ${own('n')} AND n.id = NEW.accounting_period_id AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL)) THEN ${reject('Reopen later stock periods before inserting an earlier period')} END IF;
  END`],
  ['inventory_reopen_insert','INSERT','inventory_period_reopens',`BEGIN
    IF NEW.status <> 'REQUESTED' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL THEN ${reject('Reopen must begin as a request')} END IF;
  END`],
  ['inventory_reopen_transition','UPDATE','inventory_period_reopens',`BEGIN
    IF ${fixed(['id','tenant_id','legal_entity_id','period_id','reason','requested_by','requested_at'])} OR OLD.status <> 'REQUESTED' OR NEW.status NOT IN ('APPROVED','REJECTED')
      OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL OR (NEW.status = 'APPROVED' AND NEW.reviewed_by = NEW.requested_by)
      OR NOT EXISTS (SELECT 1 FROM inventory_reopen_periods l WHERE ${own('l')} AND l.reopen_id = NEW.id) THEN ${reject('Reopen requires retained dependents and independent approval')} END IF;
  END`],
  ...immutable('inventory_period_reopens',['DELETE']),
  ['inventory_reopen_period_insert','INSERT','inventory_reopen_periods',`BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory_period_reopens r WHERE ${own('r')} AND r.id = NEW.reopen_id AND r.status = 'REQUESTED') THEN ${reject('Dependent periods require a pending reopen request')} END IF;
  END`],
  ...immutable('inventory_reopen_periods'),
  ['journal_inventory_close_guard','UPDATE','journals',`BEGIN
    IF NEW.status = 'POSTED' AND EXISTS (SELECT 1 FROM journal_lines l JOIN inventory_reconciliation_accounts m ON m.tenant_id = l.tenant_id AND m.legal_entity_id = l.legal_entity_id AND m.account_id = l.account_id WHERE ${own('l')} AND l.journal_id = NEW.id)
      AND EXISTS (SELECT 1 FROM inventory_period_controls c JOIN inventory_periods p ON p.tenant_id = c.tenant_id AND p.legal_entity_id = c.legal_entity_id AND p.id = c.period_id
        JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id WHERE ${own('c')} AND a.end_date >= NEW.posting_date AND (c.current_snapshot_id IS NOT NULL OR c.pending_snapshot_id IS NOT NULL)) THEN ${reject('Mapped inventory journals are locked by stock review or close')} END IF;
  END`],
];
const permissions = [
  ['inventory.reconciliation.read','Read stock-to-GL reconciliation'],
  ['inventory.reconciliation.configure','Select inventory asset accounts for reconciliation'],
  ['inventory.period.prepare','Prepare stock close snapshots'],
  ['inventory.period.approve','Independently approve stock closes and reopen requests'],
  ['inventory.period.reopen','Request reopening stock and dependent accounting periods'],
];
const normalize = sql => sql.replace(/\s+/g,' ').trim().toLowerCase();

// Verifies the new objects; earlier migrations retain all their own verification.
async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON)\s+([^,\n]*)/g)].map(([,field,type,options])=>({
      name:field,type:type==='BOOLEAN'?'tinyint(1)':type.toLowerCase(),nullable:options.includes('NOT NULL')?'NO':'YES',
      default:options.includes('DEFAULT CURRENT_TIMESTAMP')?'CURRENT_TIMESTAMP':options.match(/DEFAULT '(\w+)'/)?.[1]??null,
      collation:/CHAR/.test(type)?options.includes('ascii_bin')?'ascii_bin':'utf8mb4_0900_ai_ci':type.startsWith('ENUM')?'utf8mb4_0900_ai_ci':null,
    }));
    const actual=columns.map(c=>({name:c.Field,type:c.Type.toLowerCase(),nullable:c.Null,default:c.Default,collation:c.Collation}));
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`Stock close columns differ: ${name}`);
    const [[table]]=await connection.execute('SELECT ENGINE AS engine,TABLE_COLLATION AS collation FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',[name]);
    if(table.engine!=='InnoDB'||table.collation!=='utf8mb4_0900_ai_ci')throw new Error(`Stock close table differs: ${name}`);
    const [keys]=await connection.execute('SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL',[name]);
    const expectedKeys=[...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)].flatMap(([,cols,target,refs])=>cols.split(',').map((col,i)=>`${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if(JSON.stringify(keys.map(k=>`${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort())!==JSON.stringify(expectedKeys))throw new Error(`Stock close foreign keys differ: ${name}`);
    const [indexes]=await connection.query(`SHOW INDEX FROM ${name}`),wanted=[];
    if(/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition))wanted.push('PRIMARY:0:1:id');
    definition.match(/PRIMARY KEY \(([^)]+)\)/)?.[1].split(',').forEach((col,i)=>wanted.push(`PRIMARY:0:${i+1}:${col.trim()}`));
    for(const [,unique,key,cols]of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g))cols.split(',').forEach((col,i)=>wanted.push(`${key}:${unique?0:1}:${i+1}:${col.trim()}`));
    const actualIndexes=indexes.map(i=>`${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if(!wanted.every(k=>actualIndexes.includes(k)))throw new Error(`Stock close indexes differ: ${name}`);
    const [checks]=await connection.execute("SELECT CONSTRAINT_NAME FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'",[name]);
    for(const [,constraint]of definition.matchAll(/CONSTRAINT (\w+) CHECK/g))if(!checks.some(c=>c.CONSTRAINT_NAME===constraint))throw new Error(`Stock close check missing: ${constraint}`);
  }
  for(const [name,event,table,body]of triggers){
    const [[t]]=await connection.execute('SELECT ACTION_STATEMENT AS body,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS tableName,ACTION_TIMING AS timing FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ?',[name]);
    if(!t||t.event!==event||t.tableName!==table||t.timing!=='BEFORE'||normalize(t.body)!==normalize(body))throw new Error(`Stock close trigger differs: ${name}`);
  }
  const [rows]=await connection.query('SELECT code FROM permissions');if(!permissions.every(([code])=>rows.some(r=>r.code===code)))throw new Error('Missing stock close permissions');
}
export default {
  key:'m010_inventory_period_close',description:'Versioned stock trial balance snapshots, independent close/reopen and explicit GL reconciliation.',
  async up(connection){
    for(const [name,definition]of tables)await connection.query(`CREATE TABLE IF NOT EXISTS ${name} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    for(const [name,event,table,body]of triggers){
      const [[existing]]=await connection.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ?',[name]);
      if(existing){if(normalize(existing.body)!==normalize(body))throw new Error(`Unexpected stock close trigger: ${name}`);}
      else await connection.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW ${body}`);
    }
    for(const [code,description]of permissions){
      await connection.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code = code',[code,description]);
      await connection.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code = 'ADMIN' ON DUPLICATE KEY UPDATE permission_code = permission_code",[code]);
    }
  },verify,
};
