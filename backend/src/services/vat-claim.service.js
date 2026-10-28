import {randomUUID} from 'node:crypto';
import {query,withTransaction} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/vat-claim.validators.js';
import {authorize,entityWrite,audit,scopeArgs,notFound} from './entity-context.js';
import {fail,insertRows} from './purchasing-context.js';
import {fingerprint} from '../shared/idempotency.js';
import {packagePlan,trackingPlan,sourceContext,dependencies} from './vat-claim-plans.js';
const builders={package:packagePlan,tracking:trackingPlan};
const parse=(kind,body)=>kind==='package'?v.packageInput(body):v.tracking(body);
import {read,metadata,camel} from './vat-claim-records.js';

export {list,get,rows,requests,history} from './vat-claim-records.js';
export async function preview(c,kind,body){metadata(kind);await authorize(c,'vat.read');const input=parse(kind,body);return withTransaction(async tx=>({plan:await builders[kind](tx,c,input)}));}
async function decision(tx,c,kind,id,action,reason,context){const m=metadata(kind),sequence=(await tx.query(`SELECT COALESCE(MAX(sequence_number),0)+1 AS n FROM vat_claim_decisions WHERE ${m.parent}=?`,[id])).rows[0].n;await tx.query(`INSERT INTO vat_claim_decisions (id,tenant_id,legal_entity_id,${m.parent},sequence_number,action,reason,context,actor_id) VALUES (?,?,?,?,?,?,?,?,?)`,[randomUUID(),...scopeArgs(c),id,sequence,action,reason,JSON.stringify(context),c.identity.userId]);}
export async function request(c,kind,body){const m=metadata(kind),input=parse(kind,body);return entityWrite(c,`vat.${kind}.request`,`vat.${kind}.request`,input,async tx=>{
 const plan=await builders[kind](tx,c,input),contextHash=fingerprint({input,plan}),id=randomUUID();
 const columns='id,tenant_id,legal_entity_id,reference,base_currency,input,plan,context_hash,reason,evidence,requested_by,'+m.columns;
 const args=[id,...scopeArgs(c),input.reference,plan.baseCurrency,JSON.stringify(input),JSON.stringify(plan),contextHash,input.reason,input.evidence,c.identity.userId,...m.columns.split(',').map(k=>plan[camel(k)])];
 await tx.query(`INSERT INTO ${m.table} (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args);
  if(kind==='package'){
   await insertRows(tx,'vat_claim_package_requests','id,tenant_id,legal_entity_id,package_id,refund_id,line_number,requested_vat,snapshot',plan.requests.map((r,i)=>[randomUUID(),...scopeArgs(c),id,r.refundId,i+1,r.requestedVat,JSON.stringify(r.snapshot)]));
   await insertRows(tx,'vat_claim_package_rows','id,tenant_id,legal_entity_id,package_id,list_kind,period,line_number,source_key,data,snapshot',plan.rows.map((r,i)=>[randomUUID(),...scopeArgs(c),id,r.listKind,r.period,i+1,r.sourceKey,JSON.stringify(r.data),JSON.stringify(r.snapshot)]));
  }
 await tx.query(`UPDATE ${m.table} SET status='REQUESTED' WHERE id=?`,[id]);await decision(tx,c,kind,id,'REQUEST',input.reason,{contextHash});await audit(tx,c,`vat.${kind}.requested`,id,{reference:input.reference,contextHash,lineCount:plan.lines?.length??0});return {item:await read(tx,c,kind,id)};
 });}
async function dependentCheck(tx,c,kind,item){await dependencies(tx,c,kind,item);}
async function approveCheck(tx,c,kind,item){
 if(fingerprint({input:item.input,plan:item.plan})!==item.contextHash)throw fail('VAT_PLAN_CHANGED','Retained request hash differs.');
 const fresh=await builders[kind](tx,c,item.input,item.id);
 if(fingerprint({input:item.input,plan:fresh})!==item.contextHash)throw fail('VAT_PLAN_CHANGED','Source evidence changed. Cancel and request a fresh review.');
}
export async function act(c,kind,id,action,body){entityId(id);const m=metadata(kind);if(!(kind==='package'?['approve','reject','cancel','request-void','approve-void','reject-void']:['approve','reject','cancel']).includes(action))throw notFound();const input=action==='request-void'?v.evidence(body):v.reason(body),review=['approve','reject','approve-void','reject-void'].includes(action);
 return entityWrite(c,`vat.${kind}.${review?'review':'request'}`,`vat.${kind}.${action}`,{id,...input},async tx=>{
 const item=await read(tx,c,kind,id),expected=action==='request-void'?'APPROVED':action.endsWith('-void')?'VOID_REQUESTED':'REQUESTED';if(item.status!==expected)throw fail('INVALID_STATE','This VAT request is not awaiting that action.');
 if(review&&(action.endsWith('-void')?item.voidRequestedBy:item.requestedBy)===c.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','Another authorized person must review this request.');
 if(['reject','cancel','request-void','approve-void'].includes(action))await dependentCheck(tx,c,kind,item);
 if(action==='approve')await approveCheck(tx,c,kind,item);
 if(action==='cancel')await tx.query(`UPDATE ${m.table} SET status='CANCELLED',cancel_reason=? WHERE id=?`,[input.reason,id]);
 else if(action==='request-void')await tx.query(`UPDATE ${m.table} SET status='VOID_REQUESTED',void_requested_by=?,void_requested_at=CURRENT_TIMESTAMP,void_reason=?,void_evidence=?,void_reviewed_by=NULL,void_reviewed_at=NULL,void_review_reason=NULL WHERE id=?`,[c.identity.userId,input.reason,input.evidence,id]);
 else if(action.endsWith('-void'))await tx.query(`UPDATE ${m.table} SET status=?,void_reviewed_by=?,void_reviewed_at=CURRENT_TIMESTAMP,void_review_reason=? WHERE id=?`,[action==='approve-void'?'VOIDED':'APPROVED',c.identity.userId,input.reason,id]);
 else await tx.query(`UPDATE ${m.table} SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE id=?`,[action==='approve'?'APPROVED':'REJECTED',c.identity.userId,input.reason,id]);
 await decision(tx,c,kind,id,action.toUpperCase().replace('-','_'),input.reason,{previousStatus:item.status,contextHash:item.contextHash,evidence:input.evidence??null,priorVoid:{requestedBy:item.voidRequestedBy,requestedAt:item.voidRequestedAt,reason:item.voidReason,evidence:item.voidEvidence,reviewedBy:item.voidReviewedBy,reviewedAt:item.voidReviewedAt,reviewReason:item.voidReviewReason}});
 await audit(tx,c,`vat.${kind}.${action}`,id,{reason:input.reason,evidence:input.evidence??null});return {item:await read(tx,c,kind,id)};
  });}

export async function sources(c,body){await authorize(c,'vat.read');const input=v.selection(body);return withTransaction(async tx=>{const x=await sourceContext(tx,c,input.refundIds);return {declarations:x.declarations,units:x.units,returns:x.reconciliations.map(r=>({id:r.id,period:r.period,otherDeductions:r.otherDeductions,registeredVat:r.registeredVat})),requests:x.refunds.map(r=>({id:r.id,reference:r.reference,requestedVat:r.requestedVat,period:r.period,method:r.method}))};});}
