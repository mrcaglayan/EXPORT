import {randomUUID} from 'node:crypto';
import {query,withTransaction} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/purchase-receipts.validators.js';
import {authorize,entityWrite,audit,scopeArgs,notFound} from './entity-context.js';
import {fail,own,pageRows,serialize} from './purchasing-context.js';
import {readInvoice,orderSources} from './invoice-records.js';
import {inspect} from './invoice-validation.js';
import {discountEvidence} from './invoice-xml.js';
import {fingerprint} from '../shared/idempotency.js';
async function proposal(tx,context,invoice){
 const checked=await inspect(tx,context,invoice,{applyResolution:false});
 const source=(await tx.query(`SELECT raw_xml AS xml FROM purchase_invoices i WHERE ${own('i')} AND i.id=?`,[...scopeArgs(context),invoice.id])).rows[0];
 const discount=discountEvidence(source.xml);
 const covered=checked.issues.filter(i=>i.code==='PRICE_MISMATCH'||discount.supported&&(i.code==='LINE_NET_ARITHMETIC'||i.code==='NET_TOTAL'||i.code==='UNSUPPORTED_ADJUSTMENT'&&i.lineKey===null&&i.message.startsWith('AllowanceCharge ')||i.code==='UNSUPPORTED_TOTAL_ADJUSTMENT'&&i.message.startsWith('AllowanceTotalAmount ')));
 const ordered=checked.plan?.orderId?await orderSources(tx,context,checked.plan.orderId):[],map=new Map(checked.mappings.map(m=>[m.invoiceLineId,m]));
 return {contextHash:checked.baseHash,revision:invoice.revision,covered,remaining:checked.issues.filter(i=>!covered.includes(i)),discount,acceptedPrices:checked.lines.map(l=>({invoiceLineId:l.id,lineKey:l.lineKey,quantity:l.quantity,sourceUnitPrice:l.unitPrice,sourcePriceBase:l.priceBaseQuantity,acceptedNet:l.netAmount,approvedOrderPrice:ordered.find(o=>o.id===map.get(l.id)?.orderLineId)?.unitPrice??null})),orderId:checked.plan?.orderId??null};
}
export async function preview(context,id){entityId(id);await authorize(context,'purchasing.read');return withTransaction(async tx=>({proposal:await proposal(tx,context,await readInvoice(tx,context,id,true))}));}
export async function list(context,id,input){entityId(id);const p=v.listing(input);await authorize(context,'purchasing.read');await readInvoice({query},context,id);return pageRows('r.id,r.invoice_id AS invoiceId,r.revision,r.status,r.proposal,r.reason,r.evidence,r.context_hash AS contextHash,r.requested_by AS requestedBy,r.requested_at AS requestedAt,r.reviewed_by AS reviewedBy,r.reviewed_at AS reviewedAt,r.review_reason AS reviewReason','purchase_invoice_resolutions r',`${own('r')} AND r.invoice_id=?`,[...scopeArgs(context),id],p,'r.requested_at DESC,r.id DESC');}
export async function request(context,id,body){entityId(id);const input=v.evidence(body);return entityWrite(context,'purchasing.exception.request','purchasing.exception.request',{id,...input},async tx=>{
 const invoice=await readInvoice(tx,context,id,true);if(invoice.status!=='STAGED')throw fail('INVOICE_NOT_STAGED','Return the invoice for mapping revision before requesting a commercial resolution.');
 const p=await proposal(tx,context,invoice);if(!p.covered.length)throw fail('NO_COMMERCIAL_EXCEPTION','There is no supported commercial difference to resolve.');
 if(p.remaining.length)throw fail('NONCOMMERCIAL_EXCEPTIONS','Resolve identity, quantity, tax and other unsupported source exceptions before requesting a commercial resolution.');
 const resolutionId=randomUUID();await tx.query(`INSERT INTO purchase_invoice_resolutions (id,tenant_id,legal_entity_id,invoice_id,revision,context_hash,proposal,reason,evidence,requested_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,[resolutionId,...scopeArgs(context),id,invoice.revision,p.contextHash,JSON.stringify(p),input.reason,input.evidence,context.identity.userId]);
 await audit(tx,context,'purchasing.exception.requested',resolutionId,{invoiceId:id,issueCount:p.covered.length});return {item:{id:resolutionId,status:'REQUESTED',proposal:p}};
});}
export async function review(context,id,action,body){entityId(id);if(!['approve','reject'].includes(action))throw notFound();const input=v.reason(body);return entityWrite(context,'purchasing.exception.review','purchasing.exception.'+action,{id,...input},async tx=>{
 const row=(await tx.query(`SELECT * FROM purchase_invoice_resolutions r WHERE ${own('r')} AND r.id=? FOR UPDATE`,[...scopeArgs(context),id])).rows[0];if(!row)throw notFound();if(row.status!=='REQUESTED')throw fail('INVALID_STATE','This resolution has already been reviewed.');
 const invoice=await readInvoice(tx,context,row.invoice_id,true),p=await proposal(tx,context,invoice),checked=await inspect(tx,context,invoice,{applyResolution:false});
 if([row.requested_by,invoice.importedBy,checked.plan?.createdBy].includes(context.identity.userId))throw fail('INDEPENDENT_REVIEW_REQUIRED','The resolution reviewer must be independent of importing, mapping and the exception request.');
 if(action==='approve'&&(invoice.status!=='STAGED'||row.context_hash!==p.contextHash||fingerprint(row.proposal)!==fingerprint(p)))throw fail('STALE_RESOLUTION','Referenced details changed. Request a fresh resolution.');
 await tx.query('UPDATE purchase_invoice_resolutions SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE id=?',[action==='approve'?'APPROVED':'REJECTED',context.identity.userId,input.reason,id]);
 await audit(tx,context,'purchasing.exception.'+action,id,{invoiceId:invoice.id,reason:input.reason});return {item:serialize({id,status:action==='approve'?'APPROVED':'REJECTED'})};
});}
