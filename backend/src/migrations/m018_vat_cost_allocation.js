// PR-05B forward-only extension. Earlier migration sources remain frozen.
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
export const tables=[
 ['vat_cost_sources',`${common}, invoice_line_id CHAR(36) NOT NULL, vat_journal_line_id CHAR(36) NOT NULL, category ENUM('DIRECT_CHARGE','OVERHEAD','ATIK') NOT NULL,
 native_vat DECIMAL(20,6) NOT NULL, converted_vat DECIMAL(20,6) NOT NULL, deductible_vat DECIMAL(20,6) NOT NULL, available_vat DECIMAL(20,6) NOT NULL, asset_reference VARCHAR(64) NULL, first_use_date DATE NULL,
 ${keys('vat_cost_source')}, KEY vat_cost_invoice (tenant_id,legal_entity_id,invoice_line_id,status), KEY vat_cost_debit (tenant_id,legal_entity_id,vat_journal_line_id,status),
 CONSTRAINT vat_cost_source_amount CHECK (native_vat>0 AND converted_vat>=deductible_vat AND deductible_vat>=available_vat AND available_vat>0),
 CONSTRAINT vat_cost_asset CHECK ((category='ATIK' AND asset_reference IS NOT NULL AND first_use_date IS NOT NULL) OR (category<>'ATIK' AND asset_reference IS NULL AND first_use_date IS NULL AND available_vat=deductible_vat)),
 ${fk('invoice_line_id','purchase_invoice_lines')},${fk('vat_journal_line_id','journal_lines')}`],
 ['vat_allocation_bases',`${common}, period CHAR(7) NOT NULL, eligible_value DECIMAL(20,6) NOT NULL, total_value DECIMAL(20,6) NOT NULL, vat_free_value DECIMAL(20,6) NOT NULL, general_rate DECIMAL(20,6) NOT NULL, ordinary_ceiling DECIMAL(20,6) NOT NULL, goods_vat DECIMAL(20,6) NOT NULL,
 ${keys('vat_cost_basis')}, KEY vat_cost_period (tenant_id,legal_entity_id,period,status),
 CONSTRAINT vat_cost_basis_amount CHECK (eligible_value>0 AND total_value>=eligible_value AND vat_free_value>=0 AND vat_free_value<=eligible_value AND general_rate>0 AND general_rate<=100 AND ordinary_ceiling=ROUND((eligible_value-vat_free_value)*general_rate/100,6) AND goods_vat>=0)`],
 ['vat_allocation_basis_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, basis_id CHAR(36) NOT NULL, attribution_line_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_basis_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_basis_line_number (tenant_id,legal_entity_id,basis_id,line_number), UNIQUE KEY vat_basis_goods_line (tenant_id,legal_entity_id,basis_id,attribution_line_id),
 CONSTRAINT vat_basis_line_amount CHECK (candidate_vat>=0),${fk('basis_id','vat_allocation_bases')},${fk('attribution_line_id','vat_attribution_lines')}`],
 ['vat_cost_allocations',`${common}, source_id CHAR(36) NOT NULL, basis_id CHAR(36) NOT NULL, period CHAR(7) NOT NULL, category ENUM('DIRECT_CHARGE','OVERHEAD','ATIK') NOT NULL, treatment ENUM('CANDIDATE','HOLD','EXCLUDED') NOT NULL,
 basis_vat DECIMAL(20,6) NOT NULL, calculated_vat DECIMAL(20,6) NOT NULL, allocated_vat DECIMAL(20,6) NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, non_export_vat DECIMAL(20,6) NOT NULL, limited_vat DECIMAL(20,6) NOT NULL, asset_eligible_value DECIMAL(20,6) NOT NULL, asset_total_value DECIMAL(20,6) NOT NULL,
 ${keys('vat_cost_allocation')}, KEY vat_cost_allocation_source (tenant_id,legal_entity_id,source_id,period,status), KEY vat_cost_allocation_basis (tenant_id,legal_entity_id,basis_id,status),
 CONSTRAINT vat_cost_allocation_amount CHECK (basis_vat>=0 AND calculated_vat>=allocated_vat AND allocated_vat>=0 AND allocated_vat<=basis_vat AND candidate_vat=IF(treatment='CANDIDATE',allocated_vat,0) AND non_export_vat>=0 AND limited_vat=calculated_vat-allocated_vat AND asset_eligible_value>=0 AND asset_total_value>=asset_eligible_value AND ((category='ATIK' AND basis_vat=allocated_vat AND non_export_vat=0 AND asset_total_value>0) OR (category<>'ATIK' AND basis_vat=calculated_vat+non_export_vat AND asset_total_value=0 AND asset_eligible_value=0))),
 ${fk('source_id','vat_cost_sources')},${fk('basis_id','vat_allocation_bases')}`],
 ['vat_cost_allocation_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, allocation_id CHAR(36) NOT NULL, basis_line_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, weight DECIMAL(20,6) NOT NULL, allocated_vat DECIMAL(20,6) NOT NULL, candidate_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 UNIQUE KEY vat_cost_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_line_number (tenant_id,legal_entity_id,allocation_id,line_number), UNIQUE KEY vat_cost_line_basis (tenant_id,legal_entity_id,allocation_id,basis_line_id),
 CONSTRAINT vat_cost_line_amount CHECK (weight>0 AND allocated_vat>=0 AND candidate_vat>=0 AND candidate_vat<=allocated_vat),${fk('allocation_id','vat_cost_allocations')},${fk('basis_line_id','vat_allocation_basis_lines')}`],
 ['vat_cost_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, source_id CHAR(36) NULL, basis_id CHAR(36) NULL, allocation_id CHAR(36) NULL, sequence_number INT UNSIGNED NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY vat_cost_decision_scope (tenant_id,legal_entity_id,id), UNIQUE KEY vat_cost_source_decision (source_id,sequence_number), UNIQUE KEY vat_cost_basis_decision (basis_id,sequence_number), UNIQUE KEY vat_cost_allocation_decision (allocation_id,sequence_number),
 CONSTRAINT vat_cost_decision_parent CHECK ((source_id IS NOT NULL)+(basis_id IS NOT NULL)+(allocation_id IS NOT NULL)=1 AND sequence_number>0),${fk('source_id','vat_cost_sources')},${fk('basis_id','vat_allocation_bases')},${fk('allocation_id','vat_cost_allocations')},${user('actor_id')}`],
];
const sourceGuard=`IF NEW.status IN ${active} THEN
 IF NOT EXISTS (SELECT 1 FROM purchase_invoice_lines l JOIN purchase_invoices i ON i.id=l.invoice_id JOIN journal_lines jl ON jl.id=NEW.vat_journal_line_id JOIN journals j ON j.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id WHERE l.id=NEW.invoice_line_id AND i.status<>'CANCELLED' AND l.vat_amount=NEW.native_vat AND j.status='POSTED' AND j.source_module='VAT_COST_INVOICE' AND j.source_id=i.uuid AND j.currency=NEW.base_currency AND jl.credit=0 AND a.account_type='ASSET' AND jl.debit>=NEW.deductible_vat+COALESCE((SELECT SUM(s.deductible_vat) FROM vat_cost_sources s WHERE s.id<>NEW.id AND s.vat_journal_line_id=NEW.vat_journal_line_id AND s.status IN ${active}),0)) THEN ${fail('VAT cost source needs its original posted invoice debit')} END IF;
 IF EXISTS (SELECT 1 FROM vat_cost_sources s WHERE s.id<>NEW.id AND s.tenant_id=NEW.tenant_id AND s.legal_entity_id=NEW.legal_entity_id AND s.status IN ${active} AND (s.invoice_line_id=NEW.invoice_line_id OR (NEW.category='ATIK' AND s.category='ATIK' AND s.asset_reference=NEW.asset_reference))) THEN ${fail('VAT cost source already committed')} END IF;
 IF EXISTS (SELECT 1 FROM purchase_invoice_lines l JOIN purchase_receipts r ON r.active_invoice_id=l.invoice_id WHERE l.id=NEW.invoice_line_id) OR EXISTS (SELECT 1 FROM vat_input_sources WHERE invoice_line_id=NEW.invoice_line_id) THEN ${fail('VAT cost source collides with purchased goods')} END IF;
 END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED') AND EXISTS (SELECT 1 FROM vat_cost_allocations WHERE source_id=NEW.id AND status IN ${active}) THEN ${fail('Release dependent VAT cost allocations first')} END IF;`;
const basisGuard=`IF NEW.status IN ${active} THEN
 IF EXISTS (SELECT 1 FROM vat_allocation_bases b WHERE b.id<>NEW.id AND b.tenant_id=NEW.tenant_id AND b.legal_entity_id=NEW.legal_entity_id AND b.period=NEW.period AND b.status IN ${active}) THEN ${fail('VAT month already has a committed basis')} END IF;
 IF NOT EXISTS (SELECT 1 FROM vat_allocation_basis_lines WHERE basis_id=NEW.id) OR NEW.goods_vat<>(SELECT COALESCE(SUM(candidate_vat),0) FROM vat_allocation_basis_lines WHERE basis_id=NEW.id) THEN ${fail('VAT basis goods total differs')} END IF;
 IF EXISTS (SELECT 1 FROM vat_attributions a JOIN export_customs_documents d ON d.id=a.clearance_id WHERE a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.treatment='CANDIDATE' AND DATE_FORMAT(d.event_date,'%Y-%m')=NEW.period AND a.status IN ('REQUESTED','VOID_REQUESTED')) THEN ${fail('Finish pending goods VAT reviews first')} END IF;
 IF EXISTS (SELECT 1 FROM vat_attribution_lines l JOIN vat_attributions a ON a.id=l.attribution_id JOIN export_customs_documents d ON d.id=a.clearance_id WHERE a.tenant_id=NEW.tenant_id AND a.legal_entity_id=NEW.legal_entity_id AND a.treatment='CANDIDATE' AND a.status='APPROVED' AND DATE_FORMAT(d.event_date,'%Y-%m')=NEW.period AND NOT EXISTS (SELECT 1 FROM vat_allocation_basis_lines bl WHERE bl.basis_id=NEW.id AND bl.attribution_line_id=l.id)) THEN ${fail('VAT basis must include all approved candidate goods')} END IF;
 END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED') AND EXISTS (SELECT 1 FROM vat_cost_allocations WHERE basis_id=NEW.id AND status IN ${active}) THEN ${fail('Release dependent VAT cost allocations first')} END IF;`;
const allocationGuard=`IF NEW.status IN ${active} THEN
 IF NOT EXISTS (SELECT 1 FROM vat_cost_sources s JOIN vat_allocation_bases b ON b.id=NEW.basis_id WHERE s.id=NEW.source_id AND s.status='APPROVED' AND b.status='APPROVED' AND s.category=NEW.category AND s.base_currency=NEW.base_currency AND b.base_currency=NEW.base_currency AND b.period=NEW.period AND s.available_vat>=NEW.basis_vat+COALESCE((SELECT SUM(a.basis_vat) FROM vat_cost_allocations a WHERE a.source_id=NEW.source_id AND a.id<>NEW.id AND a.status IN ${active}),0)) THEN ${fail('VAT allocation source or basis unavailable')} END IF;
 IF EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.source_id=NEW.source_id AND a.basis_id=NEW.basis_id AND a.id<>NEW.id AND a.status IN ${active}) THEN ${fail('VAT source already allocated in this basis')} END IF;
 IF NOT EXISTS (SELECT 1 FROM vat_cost_allocation_lines WHERE allocation_id=NEW.id) OR NEW.allocated_vat<>(SELECT COALESCE(SUM(allocated_vat),0) FROM vat_cost_allocation_lines WHERE allocation_id=NEW.id) OR NEW.candidate_vat<>(SELECT COALESCE(SUM(candidate_vat),0) FROM vat_cost_allocation_lines WHERE allocation_id=NEW.id) THEN ${fail('VAT allocation line totals differ')} END IF;
 IF NEW.category<>'DIRECT_CHARGE' AND NEW.treatment='CANDIDATE' AND NEW.allocated_vat>GREATEST(0,(SELECT ordinary_ceiling-goods_vat FROM vat_allocation_bases WHERE id=NEW.basis_id)-COALESCE((SELECT SUM(a.candidate_vat) FROM vat_cost_allocations a WHERE a.basis_id=NEW.basis_id AND a.id<>NEW.id AND a.status IN ${active}),0)) THEN ${fail('VAT allocation exceeds remaining ordinary ceiling')} END IF;
 END IF;
 IF (OLD.status='ASSEMBLING' OR NEW.status IN ('REJECTED','CANCELLED','VOID_REQUESTED','VOIDED')) AND NEW.treatment='CANDIDATE' AND EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.id<>NEW.id AND a.basis_id=NEW.basis_id AND a.treatment='CANDIDATE' AND a.status IN ${active} AND FIELD(a.category,'DIRECT_CHARGE','OVERHEAD','ATIK')>FIELD(NEW.category,'DIRECT_CHARGE','OVERHEAD','ATIK')) THEN ${fail('Release later priority VAT allocations first')} END IF;
 IF NEW.category='ATIK' AND (OLD.status='ASSEMBLING' OR NEW.status IN ('REJECTED','CANCELLED','VOID_REQUESTED','VOIDED')) AND EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.id<>NEW.id AND a.source_id=NEW.source_id AND a.status IN ${active} AND a.period>NEW.period) THEN ${fail('Release later asset periods first')} END IF;`;
const headers=[['vat_cost_sources','invoice_line_id,vat_journal_line_id,category,native_vat,converted_vat,deductible_vat,available_vat,asset_reference,first_use_date',sourceGuard],['vat_allocation_bases','period,eligible_value,total_value,vat_free_value,general_rate,ordinary_ceiling,goods_vat',basisGuard],['vat_cost_allocations','source_id,basis_id,period,category,treatment,basis_vat,calculated_vat,allocated_vat,candidate_vat,non_export_vat,limited_vat,asset_eligible_value,asset_total_value',allocationGuard]];
export const triggers=[
 ...headers.flatMap(([table,columns,guard])=>[
 [table+'_insert','INSERT',table,`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN ${fail('New VAT cost request must assemble before review')} END IF; END`],
 [table+'_update','UPDATE',table,`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,reference,base_currency,input,plan,context_hash,reason,evidence,requested_by,requested_at,'+columns)}) THEN ${fail('VAT cost plan and original facts are immutable')} END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN ${fail('Invalid VAT cost transition')} END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent VAT cost review required')} END IF; ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Retain original VAT cost review')} END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('VAT cost cancellation reason required')} END IF; ELSEIF NOT (${same('cancel_reason')}) THEN ${fail('Retain VAT cost cancellation evidence')} END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN ${fail('Evidenced VAT cost void request required')} END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence')}) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN ${fail('Independent VAT cost void review required')} END IF;
 ELSEIF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence,void_reviewed_by,void_reviewed_at,void_review_reason')}) THEN ${fail('Retain VAT cost void evidence')} END IF;
 ${guard} END`]]),
 ['vat_cost_basis_line_insert','INSERT','vat_allocation_basis_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_allocation_bases b JOIN vat_attribution_lines l ON l.id=NEW.attribution_line_id JOIN vat_attributions a ON a.id=l.attribution_id JOIN export_customs_documents d ON d.id=a.clearance_id WHERE b.id=NEW.basis_id AND b.status='ASSEMBLING' AND a.status='APPROVED' AND a.treatment='CANDIDATE' AND a.base_currency=b.base_currency AND DATE_FORMAT(d.event_date,'%Y-%m')=b.period AND l.candidate_vat=NEW.candidate_vat) THEN ${fail('VAT basis line needs approved monthly candidate goods')} END IF; END`],
 ['vat_cost_line_insert','INSERT','vat_cost_allocation_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_cost_allocations a JOIN vat_allocation_basis_lines b ON b.basis_id=a.basis_id WHERE a.id=NEW.allocation_id AND a.status='ASSEMBLING' AND b.id=NEW.basis_line_id AND NEW.candidate_vat=IF(a.treatment='CANDIDATE',NEW.allocated_vat,0)) THEN ${fail('VAT allocation line needs its retained basis')} END IF; END`],
 ['vat_cost_goods_freeze','UPDATE','vat_attributions',`BEGIN ${lock} IF NEW.treatment='CANDIDATE' AND EXISTS (SELECT 1 FROM vat_allocation_bases b JOIN export_customs_documents d ON d.id=NEW.clearance_id WHERE b.tenant_id=NEW.tenant_id AND b.legal_entity_id=NEW.legal_entity_id AND b.period=DATE_FORMAT(d.event_date,'%Y-%m') AND b.status IN ${active}) THEN ${fail('Void the dependent VAT month basis before changing goods attribution')} END IF; END`],
 ['vat_cost_receipt_collision','INSERT','purchase_receipts',`BEGIN ${lock} IF EXISTS (SELECT 1 FROM journals j JOIN purchase_invoices i ON i.uuid=j.source_id AND i.tenant_id=j.tenant_id AND i.legal_entity_id=j.legal_entity_id WHERE i.id=NEW.invoice_id AND j.source_module='VAT_COST_INVOICE' AND j.status='POSTED') OR EXISTS (SELECT 1 FROM vat_cost_sources s JOIN purchase_invoice_lines l ON l.id=s.invoice_line_id WHERE l.invoice_id=NEW.invoice_id AND s.status IN ('REQUESTED','APPROVED','VOID_REQUESTED','VOIDED')) THEN ${fail('Invoice belongs to retained non-stock VAT cost sources')} END IF; END`],
 ['vat_cost_invoice_retain','UPDATE','purchase_invoices',`BEGIN IF NEW.status='CANCELLED' AND (EXISTS (SELECT 1 FROM journals j WHERE j.tenant_id=NEW.tenant_id AND j.legal_entity_id=NEW.legal_entity_id AND j.source_module='VAT_COST_INVOICE' AND j.source_id=NEW.uuid AND j.status='POSTED') OR EXISTS (SELECT 1 FROM vat_cost_sources s JOIN purchase_invoice_lines l ON l.id=s.invoice_line_id WHERE l.invoice_id=NEW.id AND s.status IN ('REQUESTED','APPROVED','VOID_REQUESTED','VOIDED'))) THEN ${fail('Retain invoice supporting non-stock VAT cost sources')} END IF; END`],
 ...['vat_allocation_basis_lines','vat_cost_allocation_lines','vat_cost_decisions'].map(t=>[t+'_no_update','UPDATE',t,`BEGIN ${fail('VAT cost lines and decisions are immutable')} END`]),
 ...tables.map(([t])=>[t+'_no_delete','DELETE',t,`BEGIN ${fail('Retain VAT cost history')} END`]),
];
const permissions=['source','basis','allocation'].flatMap(kind=>[['vat.cost.'+kind+'.request','Request VAT cost '+kind+' and evidenced void'],['vat.cost.'+kind+'.review','Independently review VAT cost '+kind+' and void']]);
const normalize=s=>s.replace(/\s+/g,' ').trim();
export default {key:'m018_vat_cost_allocation',description:'Reviewed non-stock VAT sources, frozen monthly goods bases and priority/cumulative asset cost allocations.',async up(c){
 for(const [n,d]of tables)await c.query(`CREATE TABLE IF NOT EXISTS ${n} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 for(const [n,e,t,b]of triggers){const [[old]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[n]);if(old){if(normalize(old.body)!==normalize(b))throw Error('Unexpected VAT cost guard: '+n);continue;}await c.query(`CREATE TRIGGER ${n} BEFORE ${e} ON ${t} FOR EACH ROW ${b}`);}
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`VAT cost columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`VAT cost table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`VAT cost foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`VAT cost indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`VAT cost check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('VAT cost trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing VAT cost permissions');
}
