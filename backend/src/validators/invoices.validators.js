import {object,text,entityId,invalid} from './auth.validators.js';
import {page} from './accounting.validators.js';
export function source(body){object(body,['xml','fileName','evidence']);if(typeof body.xml!=='string')throw invalid();return {xml:body.xml,fileName:text(body.fileName,160),evidence:text(body.evidence,1000)};}
export function recipient(body){object(body,['receiverScheme','receiverTaxId','reason']);if(!['VKN','TCKN'].includes(body.receiverScheme)||typeof body.receiverTaxId!=='string'||!(body.receiverScheme==='VKN'?/^\d{10}$/:/^\d{11}$/).test(body.receiverTaxId))throw invalid();return {receiverScheme:body.receiverScheme,receiverTaxId:body.receiverTaxId,reason:text(body.reason,1000)};}
export function plan(body){
  object(body,['expectedRevision','partnerId','orderId','reason','autoMap','updates']);
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.autoMap!==undefined&&typeof body.autoMap!=='boolean'||!Array.isArray(body.updates))throw invalid();
  const seen=new Set(),updates=body.updates.map(row=>{object(row,['invoiceLineId','skuId','orderLineId','unitConfirmed','freeReason']);const invoiceLineId=entityId(row.invoiceLineId);if(seen.has(invoiceLineId))throw invalid();seen.add(invoiceLineId);
    if(typeof row.unitConfirmed!=='boolean')throw invalid();return {invoiceLineId,skuId:row.skuId==null?null:entityId(row.skuId),orderLineId:row.orderLineId==null?null:entityId(row.orderLineId),unitConfirmed:row.unitConfirmed,freeReason:text(row.freeReason??'',255,0)||null};});
  return {expectedRevision:body.expectedRevision,partnerId:entityId(body.partnerId),orderId:body.orderId==null?null:entityId(body.orderId),reason:text(body.reason,1000),autoMap:body.autoMap??false,updates};
}
export function reason(body){object(body,['reason']);return {reason:text(body.reason,1000)};}
export function listing(input,allowed=[]){object(input,['limit','offset',...allowed]);const p=page({limit:input.limit,offset:input.offset});if(input.q!==undefined)p.q=text(input.q,160,0);if(input.status!==undefined){if(!['STAGED','REQUESTED','READY','REJECTED','CANCELLED'].includes(input.status))throw invalid();p.status=input.status;}if(input.revision!==undefined){const n=Number(input.revision);if(!Number.isSafeInteger(n)||n<1)throw invalid();p.revision=n;}return p;}
