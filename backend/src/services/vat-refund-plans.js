import {refundPackageGuard} from './vat-claim-guards.js';
import {scopeArgs,notFound} from './entity-context.js';
import {own,fail,serialize} from './purchasing-context.js';
import {settings} from './accounting-context.js';
import {readSource} from './vat-sources.service.js';
import {read as readCost} from './vat-cost-records.js';
import {active,read} from './vat-refund-records.js';
import {reconcile,policy,previousMonth,sum,less,zero} from './vat-refund-math.js';

async function frozen(tx,c,period,exclude=''){
 if((await tx.query(`SELECT id FROM vat_reconciliations WHERE tenant_id=? AND legal_entity_id=? AND period=? AND id<>? AND status IN ${active}`,[...scopeArgs(c),period,exclude])).rows.length)throw fail('VAT_PERIOD_RECONCILED','Void the dependent KDV1 reconciliation before changing this month.');
}
export async function deductionPlan(tx,c,input,exclude=''){
 const goods=input.sourceKind==='GOODS',s=goods?await readSource(tx,c,input.sourceId):await readCost(tx,c,'source',input.sourceId);
 if(s.baseCurrency!=='TRY'||!goods&&s.status!=='APPROVED'||less(s.deductibleVat,input.deductedVat)||less(input.deductedVat,input.priorRefundedVat))throw fail('VAT_DEDUCTION_SOURCE','Select an approved TRY source and keep deducted and previously refunded VAT within its original deductible tax.');
 const snapshot=goods?s.snapshot:s.plan.snapshot;
 const j=serialize((await tx.query(`SELECT j.posting_date AS bookDate,j.status FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE ${own('l')} AND l.id=?`,[...scopeArgs(c),s.vatJournalLineId])).rows[0]??{});
 if(j.status!=='POSTED'||input.taxEventDate>snapshot.invoiceDate||j.bookDate<snapshot.invoiceDate||Number(j.bookDate.slice(0,4))>Number(input.taxEventDate.slice(0,4))+1)throw fail('VAT_DEDUCTION_DATE','Deduction needs the original posted book date, invoice and an evidenced tax-event date within the statutory deduction window.');
 const period=j.bookDate.slice(0,7);await frozen(tx,c,period);
 const column=goods?'goods_source_id':'cost_source_id';
 if((await tx.query(`SELECT id FROM vat_deductions WHERE ${column}=? AND id<>? AND status IN ${active}`,[s.id,exclude])).rows.length)throw fail('VAT_DEDUCTION_DUPLICATE','This original VAT source already has a pending or approved deduction.');
 return {baseCurrency:'TRY',goodsSourceId:goods?s.id:null,costSourceId:goods?null:s.id,period,taxEventDate:input.taxEventDate,bookDate:j.bookDate,deductedVat:input.deductedVat,priorRefundedVat:input.priorRefundedVat,sourceHash:goods?s.sourceHash:s.contextHash,snapshot};
}
export async function reconciliationPlan(tx,c,input,exclude=''){
 if((await settings(tx,c)).baseCurrency!=='TRY')throw fail('VAT_RETURN_CURRENCY','KDV1 reconciliation requires a TRY accounting base.');
 const p=serialize((await tx.query(`SELECT id,start_date AS startDate,end_date AS endDate,status FROM accounting_periods p WHERE ${own('p')} AND id=?`,[...scopeArgs(c),input.accountingPeriodId])).rows[0]??{});
 if(!p.id)throw notFound();const period=p.startDate.slice(0,7),last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
 if(p.status!=='CLOSED'||p.startDate!==period+'-01'||p.endDate!==last)throw fail('VAT_RETURN_MONTH','Close the exact full calendar accounting month before reconciling KDV1.');
 await frozen(tx,c,period,exclude);
 const others=(await tx.query(`SELECT id,period,status,closing_carry AS closingCarry FROM vat_reconciliations WHERE tenant_id=? AND legal_entity_id=? AND id<>? AND status IN ${active} ORDER BY period`,[...scopeArgs(c),exclude])).rows;
 if(others.some(r=>r.period>period))throw fail('VAT_LATER_PERIOD','Release later reconciliations before changing an earlier month.');
 const prior=others.at(-1);
 if(prior){if(prior.id!==input.previousId||prior.status!=='APPROVED'||prior.period!==previousMonth(period)||prior.closingCarry!==input.openingCarry)throw fail('VAT_PREVIOUS_CARRY','Use the approved immediately preceding month and its unchanged closing carry.');}
 else if(input.previousId)throw fail('VAT_PREVIOUS_CARRY','No active previous reconciliation matches this opening baseline.');
 const deductions=(await tx.query(`SELECT id,status,reference,period,deducted_vat AS deductedVat,context_hash AS contextHash,plan FROM vat_deductions WHERE tenant_id=? AND legal_entity_id=? AND period=? AND status IN ${active} ORDER BY id`,[...scopeArgs(c),period])).rows;
 if(deductions.some(d=>d.status!=='APPROVED'))throw fail('VAT_DEDUCTION_PENDING','Finish all pending deduction and deduction-void reviews for this month.');
 let basis=null,costs=[];
 if(input.basisId){basis=await readCost(tx,c,'basis',input.basisId);if(basis.status!=='APPROVED'||basis.period!==period||basis.baseCurrency!=='TRY')throw fail('VAT_RETURN_BASIS','Select the approved TRY allocation basis for this month.');
  costs=(await tx.query(`SELECT id,status,context_hash AS contextHash,candidate_vat AS candidateVat FROM vat_cost_allocations WHERE basis_id=? AND treatment='CANDIDATE' AND status IN ${active} ORDER BY id`,[basis.id])).rows;
  if(costs.some(a=>a.status!=='APPROVED'))throw fail('VAT_ALLOCATION_PENDING','Finish all candidate allocation reviews before reconciling this month.');
 }else if(less(zero,input.exportRefundVat))throw fail('VAT_RETURN_BASIS','A declared export refund requires the reviewed monthly allocation basis.');
 const result=reconcile(input,sum(deductions.map(d=>d.deductedVat)));
 return {baseCurrency:'TRY',accountingPeriodId:p.id,period,previousId:input.previousId,basisId:input.basisId,...result,...Object.fromEntries(['openingCarry','otherDeductions','outputVat','otherRefundVat','exportRefundVat','externalClaimedVat','externalCashVat'].map(k=>[k,input[k]])),basisHash:basis?.contextHash??null,costs,lines:deductions.map(d=>({deductionId:d.id,deductedVat:d.deductedVat,snapshot:{reference:d.reference,contextHash:d.contextHash,plan:d.plan}}))};
}
export function candidateQuery(c,basisId,exclude=''){
 const used=(condition)=>`COALESCE((SELECT SUM(fl.claimed_vat) FROM vat_refund_lines fl JOIN vat_refund_requests rq ON rq.id=fl.refund_id WHERE ${condition} AND rq.id<>? AND rq.status IN ${active}),0)`;
 const select=(kind)=>{
  const goods=kind==='GOODS';
  return `SELECT '${kind}' AS kind,l.id,${goods?"'GOODS'":'a.category'} AS category,${goods?'l.source_id':'a.source_id'} AS sourceId,d.id AS deductionId,d.period AS deductionPeriod,l.candidate_vat AS candidateVat,
   l.candidate_vat-${used(goods?'fl.goods_line_id=l.id':'fl.cost_line_id=l.id')} AS availableVat,
   d.deducted_vat-d.prior_refunded_vat-${used('fl.deduction_id=d.id')} AS sourceRemaining,
   EXISTS (SELECT 1 FROM vat_reconciliation_deductions rd JOIN vat_reconciliations rr ON rr.id=rd.reconciliation_id WHERE rd.deduction_id=d.id AND rr.status='APPROVED') AS reconciled,
   a.context_hash AS candidateHash,d.context_hash AS deductionHash,JSON_UNQUOTE(JSON_EXTRACT(${goods?'l':'g'}.snapshot,'$.transactionType')) AS transactionType,l.snapshot
   FROM ${goods?'vat_allocation_basis_lines bl JOIN vat_attribution_lines l ON l.id=bl.attribution_line_id JOIN vat_attributions a ON a.id=l.attribution_id':'vat_cost_allocation_lines l JOIN vat_cost_allocations a ON a.id=l.allocation_id JOIN vat_allocation_basis_lines bl ON bl.id=l.basis_line_id JOIN vat_attribution_lines g ON g.id=bl.attribution_line_id'}
   LEFT JOIN vat_deductions d ON d.${goods?'goods_source_id=l.source_id':'cost_source_id=a.source_id'} AND d.status='APPROVED'
   WHERE ${own('a')} AND ${goods?'bl':'a'}.basis_id=? AND a.status='APPROVED' AND a.treatment='CANDIDATE' AND l.candidate_vat>0`;
 };
 return {sql:select('GOODS')+' UNION ALL '+select('COST'),args:[exclude,exclude,...scopeArgs(c),basisId,exclude,exclude,...scopeArgs(c),basisId]};
}
export async function refundPlan(tx,c,input,exclude=''){
 const r=await read(tx,c,'reconciliation',input.reconciliationId);
 if(r.status!=='APPROVED'||!r.basisId)throw fail('VAT_REFUND_RETURN','Refund requests need an approved KDV1 reconciliation with an export basis.');
 const basis=await readCost(tx,c,'basis',r.basisId);
 if(basis.status!=='APPROVED'||basis.contextHash!==r.plan.basisHash)throw fail('VAT_REFUND_BASIS','The reviewed export basis changed.');
 const q=candidateQuery(c,r.basisId,exclude),rows=(await tx.query(q.sql,q.args)).rows,map=new Map(rows.map(x=>[x.kind+x.id,x])),sourceAmounts=new Map();
 const lines=input.lines.map(l=>{
  const candidate=map.get(l.kind+l.candidateLineId);
  if(!candidate)throw fail('VAT_REFUND_CANDIDATE','Select an approved candidate from this reconciled export month.');
  if(!candidate.deductionId||!candidate.reconciled||candidate.deductionPeriod>r.period)throw fail('VAT_REFUND_DEDUCTION','Each candidate needs an approved deduction reconciled in this or an earlier month.');
  if(less(candidate.availableVat,l.claimedVat))throw fail('VAT_REFUND_DUPLICATE','Requested VAT exceeds the unclaimed original candidate.');
  const sourceTotal=sum([sourceAmounts.get(candidate.deductionId)??zero,l.claimedVat]);sourceAmounts.set(candidate.deductionId,sourceTotal);
  if(less(candidate.sourceRemaining,sourceTotal))throw fail('VAT_REFUND_SOURCE_EXCEEDED','Requests exceed original deducted VAT after prior external refunds.');
  if(candidate.transactionType==='FREE_OF_CHARGE'&&!input.specialTransactionEvidence)throw fail('VAT_REFUND_SPECIAL_EVIDENCE','Free-of-charge export claims require explicit reviewed legal eligibility evidence.');
  if(!['STANDARD_EXPORT','FREE_OF_CHARGE'].includes(candidate.transactionType))throw fail('VAT_REFUND_TRANSACTION','This claim policy supports standard goods exports only.');
  return {deductionId:candidate.deductionId,goodsLineId:l.kind==='GOODS'?l.candidateLineId:null,costLineId:l.kind==='COST'?l.candidateLineId:null,claimedVat:l.claimedVat,snapshot:{kind:l.kind,category:candidate.category,sourceId:candidate.sourceId,candidateHash:candidate.candidateHash,deductionHash:candidate.deductionHash,transactionType:candidate.transactionType,original:candidate.snapshot}};
 });
 if(input.requestedVat===zero||sum(lines.map(l=>l.claimedVat))!==input.requestedVat)throw fail('VAT_REFUND_TOTAL','The request total must equal its original candidate line amounts, to the cent.');
 const other=(await tx.query(`SELECT requested_vat AS requestedVat,method FROM vat_refund_requests WHERE reconciliation_id=? AND id<>? AND status IN ${active}`,[r.id,exclude])).rows;
 const periodClaims=sum([r.externalClaimedVat,input.requestedVat,...other.map(x=>x.requestedVat)]),cashClaims=sum([r.externalCashVat,...other.filter(x=>x.method==='CASH').map(x=>x.requestedVat),input.method==='CASH'?input.requestedVat:zero]);
 if(less(r.exportRefundVat,periodClaims))throw fail('VAT_REFUND_BUDGET','Refund requests exceed the declared export refund after prior external claims.');
 const rules=policy(r.period,input,{periodClaims,cashClaims,ordinaryCeiling:basis.ordinaryCeiling});
 return {baseCurrency:'TRY',reconciliationId:r.id,reconciliationHash:r.contextHash,period:r.period,method:input.method,assurance:input.assurance,requestedVat:input.requestedVat,proposedFilingDate:input.proposedFilingDate,rules,lines};
}
export const builders={deduction:deductionPlan,reconciliation:reconciliationPlan,refund:refundPlan};
export async function dependencies(tx,c,kind,item){
 if(kind==='refund')await refundPackageGuard(tx,c,item.id);
 if(kind==='deduction'){await frozen(tx,c,item.period);return;}
 if(kind==='reconciliation'){
  if((await tx.query(`SELECT id FROM vat_refund_requests WHERE reconciliation_id=? AND status IN ${active} UNION ALL SELECT id FROM vat_reconciliations WHERE previous_id=? AND status IN ${active} UNION ALL SELECT q.id FROM vat_refund_requests q JOIN vat_refund_lines l ON l.refund_id=q.id JOIN vat_reconciliation_deductions d ON d.deduction_id=l.deduction_id WHERE d.reconciliation_id=? AND q.status IN ${active}`,[item.id,item.id,item.id])).rows.length)throw fail('VAT_REFUND_DEPENDENCIES','Release dependent refund requests and later reconciliations before changing this month.');
 }
}
