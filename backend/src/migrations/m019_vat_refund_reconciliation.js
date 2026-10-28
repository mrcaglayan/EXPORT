// PR-06A additive migration. Applied m001–m018 sources remain frozen.
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

const deductionColumns='goods_source_id,cost_source_id,period,tax_event_date,book_date,deducted_vat,prior_refunded_vat';
const reconciliationColumns='accounting_period_id,period,previous_id,basis_id,registered_vat,opening_carry,other_deductions,total_deductions,output_vat,other_refund_vat,export_refund_vat,payable_vat,closing_carry,external_claimed_vat,external_cash_vat';
const refundColumns='reconciliation_id,period,method,assurance,requested_vat,proposed_filing_date';
const lineKeys=n=>`UNIQUE KEY ${n}_scope (tenant_id,legal_entity_id,id)`;
export const tables=[
 ['vat_deductions',`${common}, goods_source_id CHAR(36) NULL, cost_source_id CHAR(36) NULL, period CHAR(7) NOT NULL, tax_event_date DATE NOT NULL, book_date DATE NOT NULL, deducted_vat DECIMAL(20,6) NOT NULL, prior_refunded_vat DECIMAL(20,6) NOT NULL,
 ${keys('vat_deduction')}, KEY vat_deduction_goods (goods_source_id,status), KEY vat_deduction_cost (cost_source_id,status), KEY vat_deduction_period (tenant_id,legal_entity_id,period,status),
 CONSTRAINT vat_deduction_amount CHECK ((goods_source_id IS NOT NULL)+(cost_source_id IS NOT NULL)=1 AND deducted_vat>0 AND prior_refunded_vat>=0 AND prior_refunded_vat<=deducted_vat AND tax_event_date<=book_date),${fk('goods_source_id','vat_input_sources')},${fk('cost_source_id','vat_cost_sources')}`],
 ['vat_reconciliations',`${common}, accounting_period_id CHAR(36) NOT NULL, period CHAR(7) NOT NULL, previous_id CHAR(36) NULL, basis_id CHAR(36) NULL,
 registered_vat DECIMAL(20,6) NOT NULL, opening_carry DECIMAL(20,6) NOT NULL, other_deductions DECIMAL(20,6) NOT NULL, total_deductions DECIMAL(20,6) NOT NULL, output_vat DECIMAL(20,6) NOT NULL, other_refund_vat DECIMAL(20,6) NOT NULL, export_refund_vat DECIMAL(20,6) NOT NULL, payable_vat DECIMAL(20,6) NOT NULL, closing_carry DECIMAL(20,6) NOT NULL, external_claimed_vat DECIMAL(20,6) NOT NULL, external_cash_vat DECIMAL(20,6) NOT NULL,
 ${keys('vat_reconciliation')}, KEY vat_reconciliation_period (tenant_id,legal_entity_id,period,status),
 CONSTRAINT vat_reconciliation_amount CHECK (registered_vat>=0 AND opening_carry>=0 AND other_deductions>=0 AND total_deductions=opening_carry+ROUND(registered_vat,2)+other_deductions AND output_vat>=0 AND other_refund_vat>=0 AND export_refund_vat>=0 AND payable_vat=GREATEST(0,output_vat-total_deductions) AND closing_carry=GREATEST(0,total_deductions-output_vat)-other_refund_vat-export_refund_vat AND closing_carry>=0 AND external_claimed_vat>=0 AND external_claimed_vat<=export_refund_vat AND external_cash_vat>=0 AND external_cash_vat<=external_claimed_vat),
 ${fk('accounting_period_id','accounting_periods')},${fk('previous_id','vat_reconciliations')},${fk('basis_id','vat_allocation_bases')}`],
 ['vat_reconciliation_deductions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, reconciliation_id CHAR(36) NOT NULL, deduction_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, deducted_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 ${lineKeys('vat_reconciliation_line')}, UNIQUE KEY vat_reconciliation_line_number (reconciliation_id,line_number), UNIQUE KEY vat_reconciliation_source (reconciliation_id,deduction_id), CONSTRAINT vat_reconciliation_line_amount CHECK (deducted_vat>0),${fk('reconciliation_id','vat_reconciliations')},${fk('deduction_id','vat_deductions')}`],
 ['vat_refund_requests',`${common}, reconciliation_id CHAR(36) NOT NULL, period CHAR(7) NOT NULL, method ENUM('CASH','OFFSET') NOT NULL, assurance ENUM('NONE','YMM','GUARANTEE','TAX_REVIEW') NOT NULL, requested_vat DECIMAL(20,6) NOT NULL, proposed_filing_date DATE NOT NULL,
 ${keys('vat_refund')}, KEY vat_refund_period (reconciliation_id,status), CONSTRAINT vat_refund_amount CHECK (requested_vat>0 AND requested_vat=ROUND(requested_vat,2)),${fk('reconciliation_id','vat_reconciliations')}`],
 ['vat_refund_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, refund_id CHAR(36) NOT NULL, deduction_id CHAR(36) NOT NULL, goods_line_id CHAR(36) NULL, cost_line_id CHAR(36) NULL, line_number INT UNSIGNED NOT NULL, claimed_vat DECIMAL(20,6) NOT NULL, snapshot JSON NOT NULL,
 ${lineKeys('vat_refund_line')}, UNIQUE KEY vat_refund_line_number (refund_id,line_number), UNIQUE KEY vat_refund_goods (refund_id,goods_line_id), UNIQUE KEY vat_refund_cost (refund_id,cost_line_id), KEY vat_refund_deduction (deduction_id),
 CONSTRAINT vat_refund_line_amount CHECK (claimed_vat>0 AND (goods_line_id IS NOT NULL)+(cost_line_id IS NOT NULL)=1),${fk('refund_id','vat_refund_requests')},${fk('deduction_id','vat_deductions')},${fk('goods_line_id','vat_attribution_lines')},${fk('cost_line_id','vat_cost_allocation_lines')}`],
 ['vat_refund_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, deduction_id CHAR(36) NULL, reconciliation_id CHAR(36) NULL, refund_id CHAR(36) NULL, sequence_number INT UNSIGNED NOT NULL, action VARCHAR(32) NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL, actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ${lineKeys('vat_refund_decision')}, UNIQUE KEY vat_deduction_decision (deduction_id,sequence_number), UNIQUE KEY vat_reconciliation_decision (reconciliation_id,sequence_number), UNIQUE KEY vat_refund_decision (refund_id,sequence_number),
 CONSTRAINT vat_refund_decision_parent CHECK ((deduction_id IS NOT NULL)+(reconciliation_id IS NOT NULL)+(refund_id IS NOT NULL)=1 AND sequence_number>0),${fk('deduction_id','vat_deductions')},${fk('reconciliation_id','vat_reconciliations')},${fk('refund_id','vat_refund_requests')},${user('actor_id')}`],
];
const deductionGuard=`IF NEW.base_currency<>'TRY' OR DATE_FORMAT(NEW.book_date,'%Y-%m')<>NEW.period OR YEAR(NEW.book_date)>YEAR(NEW.tax_event_date)+1 THEN ${fail('VAT deduction period or currency invalid')} END IF;
 IF NEW.status IN ${active} THEN
 IF EXISTS (SELECT 1 FROM vat_deductions d WHERE d.id<>NEW.id AND d.status IN ${active} AND (d.goods_source_id=NEW.goods_source_id OR d.cost_source_id=NEW.cost_source_id)) THEN ${fail('Original VAT source already has a deduction')} END IF;
 IF NEW.goods_source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_input_sources s JOIN journal_lines l ON l.id=s.vat_journal_line_id JOIN journals j ON j.id=l.journal_id WHERE s.id=NEW.goods_source_id AND s.base_currency='TRY' AND s.deductible_vat>=NEW.deducted_vat AND j.status='POSTED' AND j.posting_date=NEW.book_date) THEN ${fail('VAT deduction needs original posted goods debit')} END IF;
 IF NEW.cost_source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_cost_sources s JOIN journal_lines l ON l.id=s.vat_journal_line_id JOIN journals j ON j.id=l.journal_id WHERE s.id=NEW.cost_source_id AND s.status='APPROVED' AND s.base_currency='TRY' AND s.deductible_vat>=NEW.deducted_vat AND j.status='POSTED' AND j.posting_date=NEW.book_date) THEN ${fail('VAT deduction needs approved cost debit')} END IF; END IF;
 IF EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.period=NEW.period AND r.status IN ${active}) THEN ${fail('Void dependent VAT reconciliation before changing deductions')} END IF;`;
const reconciliationGuard=`IF NEW.base_currency<>'TRY' THEN ${fail('KDV1 reconciliation requires TRY')} END IF;
 IF NEW.status IN ${active} THEN
 IF EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.id<>NEW.id AND r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.period=NEW.period AND r.status IN ${active}) THEN ${fail('VAT month already reconciled')} END IF;
 IF OLD.status='ASSEMBLING' AND EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.id<>NEW.id AND r.tenant_id=NEW.tenant_id AND r.legal_entity_id=NEW.legal_entity_id AND r.status IN ${active} AND (r.period>NEW.period OR (NEW.previous_id IS NULL AND r.period<NEW.period))) THEN ${fail('VAT reconciliation must extend the approved monthly carry chain')} END IF;
 IF NOT EXISTS (SELECT 1 FROM accounting_periods p WHERE p.id=NEW.accounting_period_id AND p.status='CLOSED' AND p.start_date=CONCAT(NEW.period,'-01') AND p.end_date=LAST_DAY(p.start_date)) THEN ${fail('KDV1 needs a closed full calendar month')} END IF;
 IF NEW.previous_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_reconciliations p WHERE p.id=NEW.previous_id AND p.status='APPROVED' AND p.closing_carry=NEW.opening_carry AND p.period=DATE_FORMAT(DATE_SUB(CONCAT(NEW.period,'-01'),INTERVAL 1 MONTH),'%Y-%m')) THEN ${fail('VAT previous month carry differs')} END IF;
 IF NEW.export_refund_vat>0 AND NEW.basis_id IS NULL THEN ${fail('Export refund needs approved monthly basis')} END IF;
 IF NEW.basis_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vat_allocation_bases b WHERE b.id=NEW.basis_id AND b.period=NEW.period AND b.status='APPROVED' AND b.base_currency='TRY') THEN ${fail('VAT monthly basis unavailable')} END IF;
 IF NEW.registered_vat<>(SELECT COALESCE(SUM(deducted_vat),0) FROM vat_reconciliation_deductions WHERE reconciliation_id=NEW.id) OR EXISTS (SELECT 1 FROM vat_deductions d WHERE d.tenant_id=NEW.tenant_id AND d.legal_entity_id=NEW.legal_entity_id AND d.period=NEW.period AND d.status IN ${active} AND (d.status<>'APPROVED' OR NOT EXISTS (SELECT 1 FROM vat_reconciliation_deductions l WHERE l.reconciliation_id=NEW.id AND l.deduction_id=d.id))) THEN ${fail('Reconcile all reviewed period deductions')} END IF;
 IF EXISTS (SELECT 1 FROM vat_cost_allocations a WHERE a.basis_id=NEW.basis_id AND a.treatment='CANDIDATE' AND a.status IN ('REQUESTED','VOID_REQUESTED')) THEN ${fail('Finish period VAT cost reviews first')} END IF; END IF;
 IF NEW.status IN ('VOID_REQUESTED','VOIDED','CANCELLED','REJECTED') AND (EXISTS (SELECT 1 FROM vat_refund_requests q WHERE q.reconciliation_id=NEW.id AND q.status IN ${active}) OR EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.previous_id=NEW.id AND r.status IN ${active}) OR EXISTS (SELECT 1 FROM vat_refund_lines l JOIN vat_refund_requests q ON q.id=l.refund_id JOIN vat_reconciliation_deductions d ON d.deduction_id=l.deduction_id WHERE d.reconciliation_id=NEW.id AND q.status IN ${active})) THEN ${fail('Release dependent refund requests and later months first')} END IF;`;
const refundGuard=`IF NEW.base_currency<>'TRY' OR NEW.proposed_filing_date<=LAST_DAY(CONCAT(NEW.period,'-01')) OR YEAR(NEW.proposed_filing_date)>CAST(LEFT(NEW.period,4) AS UNSIGNED)+2 THEN ${fail('VAT refund currency or filing date invalid')} END IF;
 IF NEW.status IN ${active} THEN
 IF NOT EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.id=NEW.reconciliation_id AND r.status='APPROVED' AND r.period=NEW.period AND r.export_refund_vat-r.external_claimed_vat>=NEW.requested_vat+COALESCE((SELECT SUM(q.requested_vat) FROM vat_refund_requests q WHERE q.reconciliation_id=r.id AND q.id<>NEW.id AND q.status IN ${active}),0)) THEN ${fail('VAT refund exceeds approved return budget')} END IF;
 IF NEW.requested_vat<>(SELECT COALESCE(SUM(claimed_vat),0) FROM vat_refund_lines WHERE refund_id=NEW.id) THEN ${fail('VAT refund line total differs')} END IF;
 IF (OLD.status='ASSEMBLING' OR (OLD.status='REQUESTED' AND NEW.status='APPROVED')) AND NEW.method='CASH' AND NEW.assurance='NONE' AND NEW.requested_vat+(SELECT external_cash_vat FROM vat_reconciliations WHERE id=NEW.reconciliation_id)+COALESCE((SELECT SUM(q.requested_vat) FROM vat_refund_requests q WHERE q.reconciliation_id=NEW.reconciliation_id AND q.id<>NEW.id AND q.method='CASH' AND q.status IN ${active}),0)>50000 THEN ${fail('Aggregate VAT cash requests require reviewed assurance')} END IF;
 IF (OLD.status='ASSEMBLING' OR (OLD.status='REQUESTED' AND NEW.status='APPROVED')) AND NEW.assurance<>'TAX_REVIEW' AND NEW.requested_vat+(SELECT external_claimed_vat FROM vat_reconciliations WHERE id=NEW.reconciliation_id)+COALESCE((SELECT SUM(q.requested_vat) FROM vat_refund_requests q WHERE q.reconciliation_id=NEW.reconciliation_id AND q.id<>NEW.id AND q.status IN ${active}),0)>(SELECT b.ordinary_ceiling FROM vat_reconciliations r JOIN vat_allocation_bases b ON b.id=r.basis_id WHERE r.id=NEW.reconciliation_id) THEN ${fail('Above ceiling VAT refund requires tax inspection')} END IF;
 IF EXISTS (SELECT 1 FROM vat_refund_lines l JOIN vat_deductions d ON d.id=l.deduction_id WHERE l.refund_id=NEW.id AND (d.status<>'APPROVED' OR d.deducted_vat-d.prior_refunded_vat<(SELECT COALESCE(SUM(x.claimed_vat),0) FROM vat_refund_lines x JOIN vat_refund_requests q ON q.id=x.refund_id WHERE x.deduction_id=d.id AND (q.id=NEW.id OR q.status IN ${active})))) THEN ${fail('Original deducted VAT already reserved')} END IF;
 IF EXISTS (SELECT 1 FROM vat_refund_lines l LEFT JOIN vat_attribution_lines g ON g.id=l.goods_line_id LEFT JOIN vat_cost_allocation_lines a ON a.id=l.cost_line_id WHERE l.refund_id=NEW.id AND COALESCE(g.candidate_vat,a.candidate_vat)<(SELECT COALESCE(SUM(x.claimed_vat),0) FROM vat_refund_lines x JOIN vat_refund_requests q ON q.id=x.refund_id WHERE (x.goods_line_id=l.goods_line_id OR x.cost_line_id=l.cost_line_id) AND (q.id=NEW.id OR q.status IN ${active}))) THEN ${fail('Original VAT candidate already reserved')} END IF; END IF;`;
const headers=[['vat_deductions',deductionColumns,deductionGuard],['vat_reconciliations',reconciliationColumns,reconciliationGuard],['vat_refund_requests',refundColumns,refundGuard]];
export const triggers=[
 ...headers.flatMap(([table,columns,guard])=>[
 [table+'_insert','INSERT',table,`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.reviewed_by IS NOT NULL OR NEW.void_requested_by IS NOT NULL THEN ${fail('New VAT refund request must assemble before review')} END IF; END`],
 [table+'_update','UPDATE',table,`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,reference,base_currency,input,plan,context_hash,reason,evidence,requested_by,requested_at,'+columns)}) THEN ${fail('VAT refund plan and original facts are immutable')} END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='VOID_REQUESTED') OR (OLD.status='VOID_REQUESTED' AND NEW.status IN ('APPROVED','VOIDED'))) THEN ${fail('Invalid VAT refund transition')} END IF;
 IF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') THEN IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent VAT refund review required')} END IF; ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Retain original VAT refund review')} END IF;
 IF NEW.status='CANCELLED' THEN IF CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 THEN ${fail('VAT refund cancellation reason required')} END IF; ELSEIF NOT (${same('cancel_reason')}) THEN ${fail('Retain VAT refund cancellation evidence')} END IF;
 IF NEW.status='VOID_REQUESTED' THEN IF NEW.void_requested_by IS NULL OR NEW.void_requested_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_reason,'')))=0 OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_evidence,'')))=0 THEN ${fail('Evidenced VAT refund void request required')} END IF;
 ELSEIF OLD.status='VOID_REQUESTED' THEN IF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence')}) OR NEW.void_reviewed_by IS NULL OR NEW.void_reviewed_by=NEW.void_requested_by OR NEW.void_reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.void_review_reason,'')))=0 THEN ${fail('Independent VAT refund void review required')} END IF;
 ELSEIF NOT (${same('void_requested_by,void_requested_at,void_reason,void_evidence,void_reviewed_by,void_reviewed_at,void_review_reason')}) THEN ${fail('Retain VAT refund void evidence')} END IF;
 ${guard} END`]]),
 ['vat_reconciliation_line_insert','INSERT','vat_reconciliation_deductions',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_reconciliations r JOIN vat_deductions d ON d.id=NEW.deduction_id WHERE r.id=NEW.reconciliation_id AND r.status='ASSEMBLING' AND d.status='APPROVED' AND d.period=r.period AND d.deducted_vat=NEW.deducted_vat) THEN ${fail('VAT reconciliation line needs reviewed deduction')} END IF; END`],
 ['vat_refund_line_insert','INSERT','vat_refund_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM vat_refund_requests q JOIN vat_reconciliations r ON r.id=q.reconciliation_id JOIN vat_deductions d ON d.id=NEW.deduction_id WHERE q.id=NEW.refund_id AND q.status='ASSEMBLING' AND r.status='APPROVED' AND d.status='APPROVED' AND d.period<=q.period AND EXISTS (SELECT 1 FROM vat_reconciliation_deductions x JOIN vat_reconciliations p ON p.id=x.reconciliation_id WHERE x.deduction_id=d.id AND p.status='APPROVED') AND ((NEW.goods_line_id IS NOT NULL AND EXISTS (SELECT 1 FROM vat_allocation_basis_lines b JOIN vat_attribution_lines l ON l.id=b.attribution_line_id JOIN vat_attributions a ON a.id=l.attribution_id WHERE b.basis_id=r.basis_id AND l.id=NEW.goods_line_id AND l.source_id=d.goods_source_id AND a.status='APPROVED' AND a.treatment='CANDIDATE')) OR (NEW.cost_line_id IS NOT NULL AND EXISTS (SELECT 1 FROM vat_cost_allocation_lines l JOIN vat_cost_allocations a ON a.id=l.allocation_id WHERE l.id=NEW.cost_line_id AND a.basis_id=r.basis_id AND a.source_id=d.cost_source_id AND a.status='APPROVED' AND a.treatment='CANDIDATE')))) THEN ${fail('VAT refund line needs reconciled original candidate')} END IF; END`],
 ['vat_refund_cost_freeze','UPDATE','vat_cost_allocations',`BEGIN ${lock} IF NEW.treatment='CANDIDATE' AND EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.basis_id=NEW.basis_id AND r.status IN ${active}) THEN ${fail('Void dependent KDV1 reconciliation before changing cost allocation')} END IF; END`],
 ['vat_refund_basis_freeze','UPDATE','vat_allocation_bases',`BEGIN ${lock} IF EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.basis_id=NEW.id AND r.status IN ${active}) THEN ${fail('Void dependent KDV1 reconciliation before changing basis')} END IF; END`],
 ['vat_refund_source_freeze','UPDATE','vat_cost_sources',`BEGIN ${lock} IF EXISTS (SELECT 1 FROM vat_deductions d WHERE d.cost_source_id=NEW.id AND d.status IN ${active}) THEN ${fail('Void dependent VAT deduction before changing cost source')} END IF; END`],
 ['vat_refund_period_freeze','UPDATE','accounting_periods',`BEGIN ${lock} IF (NEW.status<>'CLOSED' OR NOT (NEW.start_date<=>OLD.start_date) OR NOT (NEW.end_date<=>OLD.end_date)) AND EXISTS (SELECT 1 FROM vat_reconciliations r WHERE r.accounting_period_id=NEW.id AND r.status IN ${active}) THEN ${fail('Void dependent KDV1 reconciliation before reopening month')} END IF; END`],
 ...['vat_reconciliation_deductions','vat_refund_lines','vat_refund_decisions'].map(t=>[t+'_no_update','UPDATE',t,`BEGIN ${fail('VAT refund lines and decisions are immutable')} END`]),
 ...tables.map(([t])=>[t+'_no_delete','DELETE',t,`BEGIN ${fail('Retain VAT reconciliation and refund history')} END`]),
];
const permissions=['deduction','reconciliation','refund'].flatMap(kind=>[['vat.'+kind+'.request','Request VAT '+kind+' and evidenced void'],['vat.'+kind+'.review','Independently review VAT '+kind+' and void']]);
const normalize=s=>s.replace(/\s+/g,' ').trim();
export default {key:'m019_vat_refund_reconciliation',description:'Reviewed deductions, KDV1 reconciliation and duplicate-safe export refund requests.',async up(c){
 for(const [n,d]of tables)await c.query(`CREATE TABLE IF NOT EXISTS ${n} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 for(const [n,e,t,b]of triggers){const [[old]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[n]);if(old){if(normalize(old.body)!==normalize(b))throw Error('Unexpected VAT refund guard: '+n);continue;}await c.query(`CREATE TRIGGER ${n} BEFORE ${e} ON ${t} FOR EACH ROW ${b}`);}
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`VAT refund columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`VAT refund table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`VAT refund foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`VAT refund indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`VAT refund check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('VAT refund trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing VAT refund permissions');
}

