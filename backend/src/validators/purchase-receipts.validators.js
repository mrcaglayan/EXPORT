import {object,text,entityId,invalid} from './auth.validators.js';
import {date,page} from './accounting.validators.js';
import {amount} from '../shared/money.js';
import {positive} from './receipts.validators.js';
export function reason(body){object(body,['reason']);return {reason:text(body.reason,255)};}
export function evidence(body){object(body,['reason','evidence']);return {reason:text(body.reason,255),evidence:text(body.evidence,255)};}
export function policy(body){
 object(body,['inventoryAccountId','payableAccountId','roundingAccountId','vatAccounts','reason']);
 if(!Array.isArray(body.vatAccounts))throw invalid();const rates=new Set();
 const vatAccounts=body.vatAccounts.map(r=>{object(r,['rate','accountId']);const rate=amount(r.rate);if(Number(rate)>100||rates.has(rate))throw invalid();rates.add(rate);return {rate,accountId:entityId(r.accountId)};}).sort((a,b)=>a.rate.localeCompare(b.rate));
 return {inventoryAccountId:entityId(body.inventoryAccountId),payableAccountId:entityId(body.payableAccountId),roundingAccountId:body.roundingAccountId?entityId(body.roundingAccountId):null,vatAccounts,reason:text(body.reason,255)};
}
export function request(body){
 object(body,['reference','postingDate','warehouseId','movementTypeId','exchangeRate','exchangeDate','exchangeEvidence','physicalReceiptConfirmed','reason','evidence','lines']);
 if(body.physicalReceiptConfirmed!==true||!Array.isArray(body.lines)||!body.lines.length)throw invalid();
 const seen=new Set(),lines=body.lines.map(l=>{object(l,['invoiceLineId','vatTreatment','vatReason','allocations']);const invoiceLineId=entityId(l.invoiceLineId);if(seen.has(invoiceLineId)||!['DEDUCTIBLE','CAPITALIZE','NONE'].includes(l.vatTreatment)||!Array.isArray(l.allocations)||!l.allocations.length)throw invalid();seen.add(invoiceLineId);
  const pools=new Set(),allocations=l.allocations.map(a=>{object(a,['poolId','quantity']);const poolId=entityId(a.poolId);if(pools.has(poolId))throw invalid();pools.add(poolId);return {poolId,quantity:positive(a.quantity)};}).sort((a,b)=>a.poolId.localeCompare(b.poolId));
  return {invoiceLineId,vatTreatment:l.vatTreatment,vatReason:text(l.vatReason??'',255,0),allocations};
 }).sort((a,b)=>a.invoiceLineId.localeCompare(b.invoiceLineId));
 return {reference:text(body.reference,64),postingDate:date(body.postingDate),warehouseId:entityId(body.warehouseId),movementTypeId:entityId(body.movementTypeId),exchangeRate:positive(body.exchangeRate),exchangeDate:date(body.exchangeDate),exchangeEvidence:text(body.exchangeEvidence,255),physicalReceiptConfirmed:true,reason:text(body.reason,255),evidence:text(body.evidence,255),lines};
}
export function listing(input){object(input,['limit','offset']);return page(input);}
