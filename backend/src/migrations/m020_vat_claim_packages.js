// PR-06B additive migration. Preserve applied m001–m019 byte-for-byte.
const scope='tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk=(c,t)=>`FOREIGN KEY (tenant_id,legal_entity_id,${c}) REFERENCES ${t}(tenant_id,legal_entity_id,id)`;
const user=c=>`FOREIGN KEY (tenant_id,${c}) REFERENCES users(tenant_id,id)`;
const same=s=>s.split(',').map(f=>`(NEW.${f}<=>OLD.${f})`).join(' AND ');
const fail=s=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${s}';`;
const lock=`DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN ${fail('Active VAT entity required')} END IF;`;
const active="('REQUESTED','APPROVED','VOID_REQUESTED')";
const common=`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, reference VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 base_currency CHAR(3) NOT NULL, input JSON NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','REJECTED','CANCELLED','VOID_REQUESTED','VOIDED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, cancel_reason VARCHAR(255) NULL,
 void_requested_by CHAR(36) NULL, void_requested_at TIMESTAMP NULL, void_reason VARCHAR(255) NULL, void_evidence VARCHAR(255) NULL, void_reviewed_by CHAR(36) NULL, void_reviewed_at TIMESTAMP NULL, void_review_reason VARCHAR(255) NULL`;
const keys=n=>`UNIQUE KEY ${n}_scope (tenant_id,legal_entity_id,id), UNIQUE KEY ${n}_reference (tenant_id,legal_entity_id,reference), KEY ${n}_state (tenant_id,legal_entity_id,status,requested_at,id),${user('requested_by')},${user('reviewed_by')},${user('void_requested_by')},${user('void_reviewed_by')}`;


const packageColumns='period_from,period_to,requested_vat';
const actionColumns='package_id,kind,refund_id,reverses_id,event_date,external_reference,amount';
export const tables=[
 ['vat_claim_packages',`${common}, period_from CHAR(7) NOT NULL, period_to CHAR(7) NOT NULL, requested_vat DECIMAL(20,6) NOT NULL,
 ${keys('vat_claim_package')}, CONSTRAINT vat_claim_package_amount CHECK (base_currency='TRY' AND period_from<=period_to AND requested_vat>0 AND requested_vat=ROUND(requested_vat,2))`],
 ['vat_claim_package_requests',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, package_id CHAR(36) NOT NULL, refund_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, requested_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_claim_request_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_claim_request_member (package_id,refund_id), UNIQUE KEY vat_claim_request_line (package_id,line_number), KEY vat_claim_request_lookup (refund_id,package_id),
 CONSTRAINT vat_claim_request_amount CHECK (requested_vat>0),${fk('package_id','vat_claim_packages')},${fk('refund_id','vat_refund_requests')}`],
 ['vat_claim_package_rows',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, package_id CHAR(36) NOT NULL, list_kind ENUM('INPUT','LOADED','SALES','CUSTOMS') NOT NULL, period CHAR(7) NOT NULL, line_number INT UNSIGNED NOT NULL, source_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, data JSON NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_claim_row_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_claim_row_number (package_id,list_kind,period,line_number), UNIQUE KEY vat_claim_row_source (package_id,list_kind,period,source_key),${fk('package_id','vat_claim_packages')}`],
 ['vat_claim_actions',`${common}, package_id CHAR(36) NOT NULL, kind ENUM('SUBMISSION','WITHDRAWAL','CASH','OFFSET','REVERSAL') NOT NULL, refund_id CHAR(36) NULL, reverses_id CHAR(36) NULL, event_date DATE NOT NULL, external_reference VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, amount DECIMAL(20,6) NOT NULL,
 ${keys('vat_claim_action')}, KEY vat_claim_action_package (package_id,kind,status), KEY vat_claim_action_refund (refund_id,status), KEY vat_claim_action_reverse (reverses_id,status), KEY vat_claim_action_external (tenant_id,legal_entity_id,external_reference,status),
 CONSTRAINT vat_claim_action_amount CHECK (base_currency='TRY' AND amount>=0 AND amount=ROUND(amount,2) AND ((kind IN ('SUBMISSION','WITHDRAWAL') AND refund_id IS NULL AND reverses_id IS NULL AND amount=0) OR (kind IN ('CASH','OFFSET') AND refund_id IS NOT NULL AND reverses_id IS NULL AND amount>0) OR (kind='REVERSAL' AND refund_id IS NOT NULL AND reverses_id IS NOT NULL AND amount>0))),
 ${fk('package_id','vat_claim_packages')},${fk('refund_id','vat_refund_requests')},${fk('reverses_id','vat_claim_actions')}`],
 ['vat_claim_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, package_id CHAR(36) NULL, action_id CHAR(36) NULL, sequence_number INT UNSIGNED NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY vat_claim_decision_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_claim_package_decision (package_id,sequence_number), UNIQUE KEY vat_claim_action_decision (action_id,sequence_number),
 CONSTRAINT vat_claim_decision_parent CHECK ((package_id IS NOT NULL)+(action_id IS NOT NULL)=1 AND sequence_number>0),${fk('package_id','vat_claim_packages')},${fk('action_id','vat_claim_actions')},${user('actor_id')}`],
];
const packageGuard=`IF NEW.status IN ${active} THEN
 IF NEW.requested_vat<>(SELECT COALESCE(SUM(requested_vat),0) FROM vat_claim_package_requests WHERE package_id=NEW.id) THEN ${fail('VAT package request total differs')} END IF;
 IF EXISTS (SELECT 1 FROM vat_claim_package_requests l JOIN vat_refund_requests r ON r.id=l.refund_id WHERE l.package_id=NEW.id AND (r.status<>'APPROVED' OR r.requested_vat<>l.requested_vat OR EXISTS (SELECT 1 FROM vat_claim_package_requests x JOIN vat_claim_packages p ON p.id=x.package_id WHERE x.refund_id=r.id AND p.id<>NEW.id AND p.status IN ${active}))) THEN ${fail('VAT request unavailable or already packaged')} END IF; END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED','REJECTED','CANCELLED') AND (EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.id AND a.status='REQUESTED') OR (EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.id AND a.kind='SUBMISSION' AND a.status='APPROVED') AND NOT EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.id AND a.kind='WITHDRAWAL' AND a.status='APPROVED'))) THEN ${fail('Resolve package tracking and accepted withdrawal before release')} END IF;`;
const actionGuard=`IF NEW.status IN ('VOID_REQUESTED','VOIDED') OR OLD.status='APPROVED' THEN ${fail('Approved external events are retained; record a withdrawal or exact reversal')} END IF;
 IF NEW.status IN ('REQUESTED','APPROVED') THEN
 IF NOT EXISTS (SELECT 1 FROM vat_claim_packages p WHERE p.id=NEW.package_id AND p.status='APPROVED') THEN ${fail('VAT tracking requires approved package')} END IF;
 IF EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.id<>NEW.id AND a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.external_reference=NEW.external_reference AND a.status IN ('REQUESTED','APPROVED')) THEN ${fail('External event reference already recorded')} END IF;
 IF NEW.kind IN ('SUBMISSION','WITHDRAWAL') AND EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.package_id AND a.kind=NEW.kind AND a.id<>NEW.id AND a.status IN ('REQUESTED','APPROVED')) THEN ${fail('Package external event already committed')} END IF;
 IF NEW.kind<>'SUBMISSION' AND NOT EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.package_id AND a.kind='SUBMISSION' AND a.status='APPROVED' AND a.event_date<=NEW.event_date) THEN ${fail('Accepted filing must precede package tracking')} END IF;
 IF NEW.kind<>'WITHDRAWAL' AND EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.package_id AND a.kind='WITHDRAWAL' AND a.status IN ('REQUESTED','APPROVED')) THEN ${fail('Package withdrawal prevents further payments')} END IF;
 IF NEW.kind IN ('CASH','OFFSET','REVERSAL') AND NOT EXISTS (SELECT 1 FROM vat_claim_package_requests l JOIN vat_refund_requests r ON r.id=l.refund_id WHERE l.package_id=NEW.package_id AND r.id=NEW.refund_id AND r.status='APPROVED' AND (NEW.kind='REVERSAL' OR r.method=NEW.kind)) THEN ${fail('Settlement method must match packaged original request')} END IF;
 IF NEW.kind IN ('CASH','OFFSET') AND NEW.amount+COALESCE((SELECT SUM(a.amount) FROM vat_claim_actions a WHERE a.refund_id=NEW.refund_id AND a.kind IN ('CASH','OFFSET') AND a.id<>NEW.id AND a.status IN ('REQUESTED','APPROVED') AND NOT EXISTS (SELECT 1 FROM vat_claim_actions x WHERE x.reverses_id=a.id AND x.kind='REVERSAL' AND x.status='APPROVED')),0)>(SELECT requested_vat FROM vat_refund_requests WHERE id=NEW.refund_id) THEN ${fail('Refund settlement exceeds remaining request balance')} END IF;
 IF NEW.kind='REVERSAL' AND (NOT EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.id=NEW.reverses_id AND a.package_id=NEW.package_id AND a.refund_id=NEW.refund_id AND a.status='APPROVED' AND a.kind IN ('CASH','OFFSET') AND a.amount=NEW.amount AND a.event_date<=NEW.event_date) OR EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.reverses_id=NEW.reverses_id AND a.id<>NEW.id AND a.status IN ('REQUESTED','APPROVED'))) THEN ${fail('Exact approved settlement reversal required once')} END IF;
 IF NEW.kind='WITHDRAWAL' AND EXISTS (SELECT 1 FROM vat_claim_actions a WHERE a.package_id=NEW.package_id AND a.id<>NEW.id AND (a.status='REQUESTED' OR (a.kind IN ('CASH','OFFSET') AND a.status='APPROVED' AND NOT EXISTS (SELECT 1 FROM vat_claim_actions x WHERE x.reverses_id=a.id AND x.status='APPROVED' AND x.kind='REVERSAL')))) THEN ${fail('Resolve pending tracking and reverse settlements before withdrawal')} END IF;
 END IF;`;
const headers=[['vat_claim_packages',packageColumns,packageGuard],['vat_claim_actions',actionColumns,actionGuard]];
export const triggers=[
 ...headers.flatMap(([table,columns,guard])=>[
 [table+'_insert','INSERT',table,`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN ${fail('New VAT claim request must assemble before review')} END IF; END`],
 [table+'_update','UPDATE',table,`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,reference,base_currency,input,plan,context_hash,reason,evidence,requested_by,requested_at,'+columns)}) THEN ${fail('VAT claim plan and original facts are immutable')} END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN ${fail('Invalid VAT claim transition')} END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent VAT claim review required')} END IF; ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Retain original VAT claim review')} END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('VAT claim cancellation reason required')} END IF; ELSEIF NOT (${same('cancel_reason')}) THEN ${fail('Retain VAT claim cancellation evidence')} END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN ${fail('Evidenced VAT claim void request required')} END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence')}) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN ${fail('Independent VAT claim void review required')} END IF;
 ELSEIF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence,void_reviewed_by,void_reviewed_at,void_review_reason')}) THEN ${fail('Retain VAT claim void evidence')} END IF;
 ${guard} END`]]),
 ['vat_claim_member_insert','INSERT','vat_claim_package_requests',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_claim_packages p JOIN vat_refund_requests r ON r.id=NEW.refund_id WHERE p.id=NEW.package_id AND p.status='ASSEMBLING' AND r.status='APPROVED' AND r.requested_vat=NEW.requested_vat) THEN ${fail('Package membership needs approved original refund')} END IF; END`],
 ['vat_claim_row_insert','INSERT','vat_claim_package_rows',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_claim_packages p WHERE p.id=NEW.package_id AND p.status='ASSEMBLING' AND NEW.period BETWEEN p.period_from AND p.period_to) THEN ${fail('List row needs its assembling package period')} END IF; END`],
 ['vat_claim_refund_freeze','UPDATE','vat_refund_requests',`BEGIN ${lock} IF EXISTS (SELECT 1 FROM vat_claim_package_requests l JOIN vat_claim_packages p ON p.id=l.package_id WHERE l.refund_id=NEW.id AND p.status IN ${active}) THEN ${fail('Release dependent claim package before changing refund request')} END IF; END`],
 ['vat_claim_exit_freeze','UPDATE','export_customs_documents',`BEGIN ${lock} IF NEW.kind='CLEARANCE' AND NEW.status='APPROVED' AND EXISTS (SELECT 1 FROM vat_claim_package_requests l JOIN vat_claim_packages p ON p.id=l.package_id JOIN vat_refund_requests r ON r.id=l.refund_id WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.status IN ${active} AND r.period=DATE_FORMAT(NEW.event_date,'%Y-%m')) THEN ${fail('Release dependent claim package before accepting another period exit')} END IF; END`],
 ...['vat_claim_package_requests','vat_claim_package_rows','vat_claim_decisions'].map(t=>[t+'_no_update','UPDATE',t,`BEGIN ${fail('VAT package rows and decisions are immutable')} END`]),
 ...tables.map(([t])=>[t+'_no_delete','DELETE',t,`BEGIN ${fail('Retain VAT package and external event history')} END`]),
];
const permissions=['package','tracking'].flatMap(kind=>[['vat.'+kind+'.request','Request VAT '+kind+' review'],['vat.'+kind+'.review','Independently review VAT '+kind]]);
const normalize=s=>s.replace(/\s+/g,' ').trim();
export default {key:'m020_vat_claim_packages',description:'Immutable refund lists/packages and reviewed external filing, payment, offset and reversal tracking.',async up(c){
 for(const [n,d]of tables)await c.query(`CREATE TABLE IF NOT EXISTS ${n} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 for(const [n,e,t,b]of triggers){const [[old]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[n]);if(old){if(normalize(old.body)!==normalize(b))throw Error('Unexpected VAT claim guard: '+n);continue;}await c.query(`CREATE TRIGGER ${n} BEFORE ${e} ON ${t} FOR EACH ROW ${b}`);}
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`VAT claim columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`VAT claim table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`VAT claim foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`VAT claim indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`VAT claim check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('VAT claim trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing VAT claim permissions');
}


