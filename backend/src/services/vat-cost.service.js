import {randomUUID} from 'node:crypto';
import {query,withTransaction} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/vat-cost.validators.js';
import {authorize,entityWrite,audit,scopeArgs,notFound} from './entity-context.js';
import {own,fail,pageRows,pattern,insertRows} from './purchasing-context.js';
import {fingerprint} from '../shared/idempotency.js';
import {builders,dependencies} from './vat-cost-plans.js';
import {active,read,metadata,camel} from './vat-cost-records.js';
import {less,sum} from './vat-cost-math.js';
import {costChange} from './vat-refund-guards.js';
export {list,get,lines,history} from './vat-cost-records.js';
export async function preview(c,kind,body){metadata(kind);await authorize(c,'vat.read');const input=v[kind](body);return withTransaction(async tx=>({plan:await builders[kind](tx,c,input)}));}
async function decision(tx,c,kind,id,action,reason,context){const m=metadata(kind),sequence=(await tx.query(`SELECT COALESCE(MAX(sequence_number),0)+1 AS n FROM vat_cost_decisions WHERE ${m.parent}=?`,[id])).rows[0].n;await tx.query(`INSERT INTO vat_cost_decisions (id,tenant_id,legal_entity_id,${m.parent},sequence_number,action,reason,context,actor_id) VALUES (?,?,?,?,?,?,?,?,?)`,[randomUUID(),...scopeArgs(c),id,sequence,action,reason,JSON.stringify(context),c.identity.userId]);}
export async function request(c,kind,body){const m=metadata(kind),input=v[kind](body);return entityWrite(c,`vat.cost.${kind}.request`,`vat.cost.${kind}.request`,input,async tx=>{
 const plan=await builders[kind](tx,c,input),contextHash=fingerprint({input,plan}),id=randomUUID();await costChange(tx,c,kind,plan);
 const columns='id,tenant_id,legal_entity_id,reference,base_currency,input,plan,context_hash,reason,evidence,requested_by,'+m.columns;
 const args=[id,...scopeArgs(c),input.reference,plan.baseCurrency,JSON.stringify(input),JSON.stringify(plan),contextHash,input.reason,input.evidence,c.identity.userId,...m.columns.split(',').map(k=>plan[camel(k)])];
 await tx.query(`INSERT INTO ${m.table} (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args);
 if(m.lineTable)await insertRows(tx,m.lineTable,`id,tenant_id,legal_entity_id,${m.parent},line_number,${m.lineColumns},snapshot`,plan.lines.map((l,i)=>[randomUUID(),...scopeArgs(c),id,i+1,...m.lineColumns.split(',').map(k=>l[camel(k)]),JSON.stringify(l.snapshot)]));
 await tx.query(`UPDATE ${m.table} SET status='REQUESTED' WHERE id=?`,[id]);await decision(tx,c,kind,id,'REQUEST',input.reason,{contextHash});await audit(tx,c,`vat.cost.${kind}.requested`,id,{reference:input.reference,contextHash,lineCount:plan.lines?.length??0});return {item:await read(tx,c,kind,id)};
 });}
async function dependentCheck(tx,c,kind,item){
  await costChange(tx,c,kind,item);
 if(kind==='allocation'){await dependencies(tx,c,item);return;}
 const parent=metadata(kind).parent;
 if((await tx.query(`SELECT id FROM vat_cost_allocations WHERE tenant_id=? AND legal_entity_id=? AND ${parent}=? AND status IN ${active} LIMIT 1`,[...scopeArgs(c),item.id])).rows.length)throw fail('VAT_COST_DEPENDENCIES','Release dependent allocations before voiding this source or monthly basis.');
}
async function approveCheck(tx,c,kind,item){
 if(fingerprint({input:item.input,plan:item.plan})!==item.contextHash)throw fail('VAT_COST_SOURCE_CHANGED','Retained plan differs from its request hash.');
 if(kind!=='allocation'){const plan=await builders[kind](tx,c,item.input,item.id);if(fingerprint({input:item.input,plan})!==item.contextHash)throw fail('VAT_COST_SOURCE_CHANGED','Source evidence changed. Cancel and request a fresh review.');return;}
 const source=await read(tx,c,'source',item.sourceId),basis=await read(tx,c,'basis',item.basisId);
 if(source.status!=='APPROVED'||basis.status!=='APPROVED'||source.contextHash!==item.plan.sourceHash||basis.contextHash!==item.plan.basisHash)throw fail('VAT_COST_SOURCE_CHANGED','The approved source and monthly basis must remain available.');
 const used=(await tx.query(`SELECT basis_vat AS basisVat FROM vat_cost_allocations WHERE source_id=? AND id<>? AND status IN ${active}`,[source.id,item.id])).rows;
 if(less(source.availableVat,sum([item.basisVat,...used.map(a=>a.basisVat)])))throw fail('VAT_COST_SOURCE_EXCEEDED','Committed allocations exceed their original source.');
}
export async function act(c,kind,id,action,body){entityId(id);const m=metadata(kind);if(!['approve','reject','cancel','request-void','approve-void','reject-void'].includes(action))throw notFound();const input=action==='request-void'?v.evidence(body):v.reason(body),review=['approve','reject','approve-void','reject-void'].includes(action);
 return entityWrite(c,`vat.cost.${kind}.${review?'review':'request'}`,`vat.cost.${kind}.${action}`,{id,...input},async tx=>{
 const item=await read(tx,c,kind,id),expected=action==='request-void'?'APPROVED':action.endsWith('-void')?'VOID_REQUESTED':'REQUESTED';if(item.status!==expected)throw fail('INVALID_STATE','This VAT cost request is not awaiting that action.');
 if(review&&(action.endsWith('-void')?item.voidRequestedBy:item.requestedBy)===c.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','Another authorized person must review this request.');
 if(['reject','cancel','request-void','approve-void'].includes(action))await dependentCheck(tx,c,kind,item);
 if(action==='approve')await approveCheck(tx,c,kind,item);
 if(action==='cancel')await tx.query(`UPDATE ${m.table} SET status='CANCELLED',cancel_reason=? WHERE id=?`,[input.reason,id]);
 else if(action==='request-void')await tx.query(`UPDATE ${m.table} SET status='VOID_REQUESTED',void_requested_by=?,void_requested_at=CURRENT_TIMESTAMP,void_reason=?,void_evidence=?,void_reviewed_by=NULL,void_reviewed_at=NULL,void_review_reason=NULL WHERE id=?`,[c.identity.userId,input.reason,input.evidence,id]);
 else if(action.endsWith('-void'))await tx.query(`UPDATE ${m.table} SET status=?,void_reviewed_by=?,void_reviewed_at=CURRENT_TIMESTAMP,void_review_reason=? WHERE id=?`,[action==='approve-void'?'VOIDED':'APPROVED',c.identity.userId,input.reason,id]);
 else await tx.query(`UPDATE ${m.table} SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE id=?`,[action==='approve'?'APPROVED':'REJECTED',c.identity.userId,input.reason,id]);
 await decision(tx,c,kind,id,action.toUpperCase().replace('-','_'),input.reason,{previousStatus:item.status,contextHash:item.contextHash,evidence:input.evidence??null,priorVoid:{requestedBy:item.voidRequestedBy,requestedAt:item.voidRequestedAt,reason:item.voidReason,evidence:item.voidEvidence,reviewedBy:item.voidReviewedBy,reviewedAt:item.voidReviewedAt,reviewReason:item.voidReviewReason}});
 await audit(tx,c,`vat.cost.${kind}.${action}`,id,{reason:input.reason,evidence:input.evidence??null});return {item:await read(tx,c,kind,id)};
 });}
export async function invoiceLines(c,input){await authorize(c,'vat.read');const p=v.listing(input),args=scopeArgs(c);let where=own('l')+" AND i.status<>'CANCELLED' AND l.vat_amount>0";if(p.q){where+=" AND (i.invoice_number LIKE ? ESCAPE '!' OR l.description LIKE ? ESCAPE '!')";args.push(pattern(p.q),pattern(p.q));}
 return pageRows(`l.id,l.line_number AS lineNumber,l.description,l.net_amount AS netAmount,l.vat_amount AS nativeVat,i.uuid AS invoiceUuid,i.invoice_number AS invoiceNumber,i.currency,i.issue_date AS invoiceDate,i.supplier_name AS supplierName,
 CASE WHEN EXISTS (SELECT 1 FROM purchase_receipts r WHERE r.active_invoice_id=i.id) THEN 'GOODS_RECEIPT' WHEN EXISTS (SELECT 1 FROM vat_cost_sources s WHERE s.invoice_line_id=l.id AND s.status IN ${active}) THEN 'SOURCE_COMMITTED' ELSE NULL END AS blocker`,'purchase_invoice_lines l JOIN purchase_invoices i ON i.id=l.invoice_id',where,args,p,'i.issue_date DESC,i.id,l.line_number');}
export async function journalLines(c,lineId,input){entityId(lineId);await authorize(c,'vat.read');const invoice=(await query(`SELECT i.uuid FROM purchase_invoice_lines l JOIN purchase_invoices i ON i.id=l.invoice_id WHERE ${own('l')} AND l.id=?`,[...scopeArgs(c),lineId])).rows[0];if(!invoice)throw notFound();
 return pageRows(`l.id,l.line_number AS lineNumber,l.description,l.debit,l.account_id AS accountId,a.code AS accountCode,j.posting_date AS postingDate,j.currency,l.debit-COALESCE((SELECT SUM(s.deductible_vat) FROM vat_cost_sources s WHERE s.vat_journal_line_id=l.id AND s.status IN ${active}),0) AS remainingDebit`,
 'journal_lines l JOIN journals j ON j.id=l.journal_id JOIN accounts a ON a.id=l.account_id',`${own('l')} AND j.status='POSTED' AND j.source_module='VAT_COST_INVOICE' AND j.source_id=? AND a.account_type='ASSET' AND l.debit>0 AND l.credit=0`,[...scopeArgs(c),invoice.uuid],v.listing(input),'l.line_number');}
