import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { entityId } from '../validators/auth.validators.js';
import * as validate from '../validators/purchasing.validators.js';
import { amount, multiplyAmounts, sumAmounts } from '../shared/money.js';
import { fingerprint } from '../shared/idempotency.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { readPartner } from './trading-partners.service.js';
import { fail, own, pattern, pageRows, serialize, insertRows, skuReferences, checkPrecision } from './purchasing-context.js';

const fields=`d.id,d.kind,d.reference,d.reference AS code,d.purpose AS name,d.document_date AS documentDate,d.required_by AS requiredBy,
  d.valid_from AS validFrom,d.valid_to AS validTo,d.partner_id AS partnerId,d.request_id AS requestId,d.contract_id AS contractId,
  d.partner_snapshot AS partnerSnapshot,d.currency,d.purpose,d.terms,d.ebys_reference AS ebysReference,d.line_count AS lineCount,d.net_total AS netTotal,d.status,
  d.created_by AS createdBy,u.display_name AS createdByName,d.created_at AS createdAt,d.reviewed_by AS reviewedBy,v.display_name AS reviewedByName,
  d.reviewed_at AS reviewedAt,d.review_reason AS reviewReason,d.cancelled_by AS cancelledBy,d.cancelled_at AS cancelledAt,d.cancel_reason AS cancelReason`;
const from='purchasing_documents d JOIN users u ON u.tenant_id=d.tenant_id AND u.id=d.created_by LEFT JOIN users v ON v.tenant_id=d.tenant_id AND v.id=d.reviewed_by';
const micro = value => BigInt(value.replace('.',''));
function kind(resource){if(!Object.hasOwn(validate.kinds,resource))throw notFound();return validate.kinds[resource];}
export async function readDocument(tx,context,resource,id){
  const {rows}=await tx.query(`SELECT ${fields} FROM ${from} WHERE ${own('d')} AND d.kind=? AND d.id=?`,[...scopeArgs(context),kind(resource),id]);
  if(!rows.length)throw notFound();return serialize(rows[0]);
}
export async function get(context,resource,id){await authorize(context,'purchasing.read');return {item:await readDocument({query},context,resource,entityId(id))};}
export async function list(context,resource,input){
  await authorize(context,'purchasing.read');const p=validate.listing(input,['q','status','partnerId','requestId','contractId']),args=[...scopeArgs(context),kind(resource)];let where=own('d')+' AND d.kind=?';
  if(p.q){where+=" AND (d.reference LIKE ? ESCAPE '!' OR d.purpose LIKE ? ESCAPE '!' OR d.ebys_reference LIKE ? ESCAPE '!')";args.push(...Array(3).fill(pattern(p.q)));}
  for(const [key,column]of [['status','status'],['partnerId','partner_id'],['requestId','request_id'],['contractId','contract_id']])if(p[key]){where+=` AND d.${column}=?`;args.push(p[key]);}
  return pageRows(fields,from,where,args,p,'d.document_date DESC,d.created_at DESC,d.id');
}
const requestFields=`l.id,l.request_id AS requestId,l.line_number AS lineNumber,l.line_key AS lineKey,l.sku_id AS skuId,l.unit_id AS unitId,l.sku_snapshot AS skuSnapshot,l.description,l.quantity`;
const commitment = `SELECT ol.request_line_id,SUM(ol.quantity) AS committed FROM purchase_order_lines ol JOIN purchasing_documents o ON o.id=ol.order_id AND o.tenant_id=ol.tenant_id AND o.legal_entity_id=ol.legal_entity_id WHERE ol.tenant_id=? AND ol.legal_entity_id=? AND o.request_id=? AND o.status IN ('ASSEMBLING','REQUESTED','APPROVED') GROUP BY ol.request_line_id`;
export async function lines(context,resource,id,input){
  await authorize(context,'purchasing.read');id=entityId(id);if(!['requests','orders'].includes(resource))throw notFound();await readDocument({query},context,resource,id);const p=validate.listing(input),scope=scopeArgs(context);
  if(resource==='requests')return pageRows(`${requestFields},COALESCE(c.committed,0) AS committedQuantity,l.quantity-COALESCE(c.committed,0) AS availableQuantity`,
    `purchase_request_lines l LEFT JOIN (${commitment}) c ON c.request_line_id=l.id`,`${own('l')} AND l.request_id=?`,[...scope,id,...scope,id],p,'l.line_number');
  return pageRows(`ol.id,ol.order_id AS orderId,ol.line_number AS lineNumber,ol.request_line_id AS requestLineId,l.line_key AS requestLineKey,l.sku_id AS skuId,l.unit_id AS unitId,l.sku_snapshot AS skuSnapshot,l.description,ol.quantity,ol.unit_price AS unitPrice,ol.net_amount AS netAmount,ol.free_reason AS freeReason`,
    'purchase_order_lines ol JOIN purchase_request_lines l ON l.tenant_id=ol.tenant_id AND l.legal_entity_id=ol.legal_entity_id AND l.id=ol.request_line_id',`${own('ol')} AND ol.order_id=?`,[...scope,id],p,'ol.line_number');
}
async function requestSources(tx,context,requestId,ids){
  const result=new Map(),scope=scopeArgs(context);
  for(let offset=0;offset<ids.length;offset+=250){const batch=ids.slice(offset,offset+250);const {rows}=await tx.query(`SELECT ${requestFields},COALESCE(c.committed,0) AS committedQuantity FROM purchase_request_lines l LEFT JOIN (${commitment}) c ON c.request_line_id=l.id WHERE ${own('l')} AND l.request_id=? AND l.id IN (${batch.map(()=>'?').join(',')})`,[...scope,requestId,...scope,requestId,...batch]);for(const row of rows)result.set(row.id,row);}
  for(const id of ids)if(!result.has(id))throw notFound();return result;
}
async function validateDependencies(tx,context,input){
  let partner=null;
  if(input.kind!=='REQUEST')partner=await readPartner(tx,context,input.partnerId,true);
  if(input.kind==='ORDER'){
    const request=await readDocument(tx,context,'requests',input.requestId);
    if(request.status!=='APPROVED')throw fail('REQUEST_NOT_APPROVED','Approve the purchase request before creating an order.');
    if(request.documentDate>input.documentDate)throw fail('SOURCE_DATE','Order date cannot precede its purchase request.');
    if(input.contractId){const contract=await readDocument(tx,context,'contracts',input.contractId);
      if(contract.status!=='APPROVED'||contract.partnerId!==input.partnerId||contract.currency!==input.currency||input.documentDate<contract.documentDate||input.documentDate<contract.validFrom||input.documentDate>contract.validTo)throw fail('CONTRACT_MISMATCH','Use an approved contract matching the supplier, currency and order date.');
    }
  }
  return partner;
}
export async function create(context,resource,body){
  const input=validate.document(resource,body);
  return entityWrite(context,'purchasing.manage',`purchasing.${resource}.submit`,input,async tx=>{
    const partner=await validateDependencies(tx,context,input),scope=scopeArgs(context),id=randomUUID();let prepared=[],total='0.000000';
    if(input.kind==='REQUEST'){
      const skus=await skuReferences(tx,context,input.lines.map(l=>l.skuId));
      prepared=input.lines.map((line,i)=>{const sku=skus.get(line.skuId);checkPrecision(line.quantity,sku);const {active,...snapshot}=sku;return [randomUUID(),...scope,id,i+1,line.lineKey,line.skuId,sku.unitId,JSON.stringify(snapshot),line.description,line.quantity];});
    }else if(input.kind==='ORDER'){
      const sources=await requestSources(tx,context,input.requestId,input.lines.map(l=>l.requestLineId));
      const skus=await skuReferences(tx,context,[...sources.values()].map(l=>l.skuId));
      prepared=input.lines.map((line,i)=>{
        const source=sources.get(line.requestLineId),sku=skus.get(source.skuId);checkPrecision(line.quantity,sku);
        if(sku.unitId!==source.unitId)throw fail('SOURCE_UNIT_CHANGED','The requested SKU base unit changed. Create a new purchase request.');
        if(micro(line.quantity)+micro(amount(source.committedQuantity))>micro(source.quantity))throw fail('REQUEST_QUANTITY_EXCEEDED','Order quantity exceeds the uncommitted purchase request quantity.');
        const net=multiplyAmounts(line.quantity,line.unitPrice);return [randomUUID(),...scope,id,i+1,line.requestLineId,line.quantity,line.unitPrice,net,line.freeReason];
      });
      total=sumAmounts(prepared.map(row=>row[8]));
    }
    await tx.query(`INSERT INTO purchasing_documents (id,tenant_id,legal_entity_id,kind,reference,document_date,required_by,valid_from,valid_to,partner_id,request_id,contract_id,partner_snapshot,currency,purpose,terms,ebys_reference,line_count,net_total,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,...scope,input.kind,input.reference,input.documentDate,input.requiredBy??null,input.validFrom??null,input.validTo??null,input.partnerId??null,input.requestId??null,input.contractId??null,partner?JSON.stringify(partner):null,input.currency??null,input.purpose,input.terms,input.ebysReference,prepared.length,total,context.identity.userId]);
    if(input.kind==='REQUEST')await insertRows(tx,'purchase_request_lines','id,tenant_id,legal_entity_id,request_id,line_number,line_key,sku_id,unit_id,sku_snapshot,description,quantity',prepared);
    if(input.kind==='ORDER')await insertRows(tx,'purchase_order_lines','id,tenant_id,legal_entity_id,order_id,line_number,request_line_id,quantity,unit_price,net_amount,free_reason',prepared);
    await tx.query("UPDATE purchasing_documents SET status='REQUESTED' WHERE tenant_id=? AND legal_entity_id=? AND id=?",[...scope,id]);
    await audit(tx,context,`purchasing.${resource}.submitted`,id,{reference:input.reference,lineCount:prepared.length,netTotal:total,currency:input.currency??null,ebysReference:input.ebysReference,requestId:input.requestId??null,contractId:input.contractId??null});
    return {item:await readDocument(tx,context,resource,id)};
  });
}
async function checkLines(tx,context,item){
  if(item.kind==='CONTRACT')return;
  const {rows}=await tx.query(item.kind==='REQUEST'?`SELECT l.sku_id AS skuId,l.unit_id AS unitId,l.quantity FROM purchase_request_lines l WHERE ${own('l')} AND l.request_id=?`
    :`SELECT l.sku_id AS skuId,l.unit_id AS unitId,o.quantity FROM purchase_order_lines o JOIN purchase_request_lines l ON l.id=o.request_line_id AND l.tenant_id=o.tenant_id AND l.legal_entity_id=o.legal_entity_id WHERE ${own('o')} AND o.order_id=?`,[...scopeArgs(context),item.id]);
  const skus=await skuReferences(tx,context,rows.map(l=>l.skuId));
  for(const line of rows){const sku=skus.get(line.skuId);checkPrecision(line.quantity,sku);if(sku.unitId!==line.unitId)throw fail('SOURCE_UNIT_CHANGED','The requested SKU base unit changed. Cancel and submit a new request.');}
}
export async function act(context,resource,documentId,action,body){
  const id=entityId(documentId),input=validate.reason(body);kind(resource);if(!['approve','reject','cancel'].includes(action))throw notFound();
  return entityWrite(context,action==='cancel'?'purchasing.manage':'purchasing.approve',`purchasing.${resource}.${action}`,{id,...input},async tx=>{
    const item=await readDocument(tx,context,resource,id),scope=scopeArgs(context);
    if(action==='cancel'){
      if(item.createdBy!==context.identity.userId)throw fail('REQUESTER_REQUIRED','Only the requester can cancel this document.',403);
      if(!['REQUESTED','APPROVED'].includes(item.status))throw fail('INVALID_STATE','Only pending or approved documents can be cancelled.');
      if((await tx.query("SELECT id FROM purchasing_documents WHERE tenant_id=? AND legal_entity_id=? AND (request_id=? OR contract_id=?) AND status IN ('ASSEMBLING','REQUESTED','APPROVED') LIMIT 1",[...scope,id,id])).rows.length)throw fail('DEPENDENT_ORDERS','Cancel dependent orders first.');
      if(item.kind==='ORDER'&&(await tx.query("SELECT i.id FROM purchase_invoices i JOIN purchase_invoice_plans p ON p.invoice_id=i.id AND p.revision=i.revision WHERE i.tenant_id=? AND i.legal_entity_id=? AND p.order_id=? AND i.status IN ('REQUESTED','READY') LIMIT 1",[...scope,id])).rows.length)throw fail('DEPENDENT_INVOICES','Cancel linked invoice matching before cancelling this order.');
      await tx.query("UPDATE purchasing_documents SET status='CANCELLED',cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP,cancel_reason=? WHERE tenant_id=? AND legal_entity_id=? AND id=?",[context.identity.userId,input.reason,...scope,id]);
    }else{
      if(item.status!=='REQUESTED')throw fail('INVALID_STATE','This document is no longer awaiting review.');
      if(action==='approve'){
        if(item.createdBy===context.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','Another authorized person must approve.',403);
        const partner=await validateDependencies(tx,context,item);
        if(partner&&fingerprint(partner)!==fingerprint(item.partnerSnapshot))throw fail('STALE_PARTNER','Partner details changed. Cancel and submit the document with current details.');
        await checkLines(tx,context,item);
      }
      await tx.query('UPDATE purchasing_documents SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE tenant_id=? AND legal_entity_id=? AND id=?',[action==='approve'?'APPROVED':'REJECTED',context.identity.userId,input.reason,...scope,id]);
    }
    await audit(tx,context,`purchasing.${resource}.${action}`,id,{reason:input.reason,reference:item.reference,previousStatus:item.status});return {item:await readDocument(tx,context,resource,id)};
  });
}
