import {object,text,entityId,invalid} from './auth.validators.js';
import {date,currency} from './accounting.validators.js';
import {amount} from '../shared/money.js';
import {positive} from './receipts.validators.js';
import {cents} from './vat-refund.validators.js';
export {listing,reason,evidence} from './vat.validators.js';
const proof=b=>({reference:text(b.reference,64),reason:text(b.reason,255),evidence:text(b.evidence,255)});
const ids=value=>{if(!Array.isArray(value)||!value.length)throw invalid();const list=value.map(entityId).sort();if(new Set(list).size!==list.length)throw invalid();return list;};
const rows=(value,parse,key)=>{if(!Array.isArray(value))throw invalid();const result=value.map(parse),seen=new Set();for(const r of result){const k=key(r);if(seen.has(k))throw invalid();seen.add(k);}return result.sort((a,b)=>key(a).localeCompare(key(b)));};
export function selection(b){object(b,['refundIds']);return {refundIds:ids(b.refundIds)};}
export const listKinds=['INPUT','LOADED','SALES','CUSTOMS'];
export function packageInput(b){
 object(b,['reference','reason','evidence','refundIds','customs','units','otherDeductions','additionalInputs','formatEvidence','legalEvidence','completenessConfirmed']);if(b.completenessConfirmed!==true)throw invalid();
 const customs=rows(b.customs,r=>{object(r,['declarationId','registrationNumber','currency','totalInvoiceAmount','documentType','evidence']);if(!['GCB','ETGB'].includes(r.documentType))throw invalid();const registrationNumber=text(r.registrationNumber,18);if(!(r.documentType==='GCB'?/^\d{8}EX\d{6}$/:/^\d{8}EX\d{8}$/).test(registrationNumber))throw invalid();return {declarationId:entityId(r.declarationId),registrationNumber,currency:currency(r.currency),totalInvoiceAmount:amount(r.totalInvoiceAmount),documentType:r.documentType,evidence:text(r.evidence,255)};},r=>r.declarationId);
 if(new Set(customs.map(r=>r.registrationNumber)).size!==customs.length)throw invalid();
 const units=rows(b.units,r=>{object(r,['sourceUnit','customsUnit','evidence']);return {sourceUnit:text(r.sourceUnit,40),customsUnit:text(r.customsUnit,20),evidence:text(r.evidence,255)};},r=>r.sourceUnit);
 const otherDeductions=rows(b.otherDeductions,r=>{object(r,['reconciliationId','nonDocumentVat','evidence']);return {reconciliationId:entityId(r.reconciliationId),nonDocumentVat:cents(r.nonDocumentVat),evidence:text(r.evidence,255)};},r=>r.reconciliationId);
 const additionalInputs=rows(b.additionalInputs,r=>{object(r,['reconciliationId','invoiceDate','series','number','sellerName','taxId','description','quantity','netTry','deductedVat','importNumber','inputType','evidence']);const taxId=text(r.taxId,11);if(!/^\d{10,11}$/.test(taxId)||!['DOMESTIC','IMPORT','WITHHELD'].includes(r.inputType))throw invalid();return {reconciliationId:entityId(r.reconciliationId),invoiceDate:date(r.invoiceDate),series:text(r.series??'',20,0),number:text(r.number,64),sellerName:text(r.sellerName,255),taxId,description:text(r.description,2000),quantity:text(r.quantity,2000),netTry:amount(r.netTry),deductedVat:positive(r.deductedVat),importNumber:text(r.importNumber??'',32,0),inputType:r.inputType,evidence:text(r.evidence,255)};},r=>r.reconciliationId+':'+r.taxId+':'+r.series+':'+r.number);
 return {...proof(b),refundIds:ids(b.refundIds),customs,units,otherDeductions,additionalInputs,formatEvidence:text(b.formatEvidence,255),legalEvidence:text(b.legalEvidence,255),completenessConfirmed:true};
}
export const trackingKinds=['SUBMISSION','WITHDRAWAL','CASH','OFFSET','REVERSAL'];
export function tracking(b){
 object(b,['reference','reason','evidence','packageId','kind','refundId','reversesId','eventDate','externalReference','amount','counterparty','processingEvidence','externalAggregationVat','periods','externalConfirmed']);if(!trackingKinds.includes(b.kind)||b.externalConfirmed!==true)throw invalid();
 const financial=['CASH','OFFSET','REVERSAL'].includes(b.kind),periods=rows(b.periods??[],r=>{object(r,['reconciliationId','filingDate','petitionReference','listReceiptReference','evidence']);return {reconciliationId:entityId(r.reconciliationId),filingDate:date(r.filingDate),petitionReference:text(r.petitionReference,128),listReceiptReference:text(r.listReceiptReference,128),evidence:text(r.evidence,255)};},r=>r.reconciliationId);
 if(b.kind!=='SUBMISSION'&&periods.length||!financial&&(b.refundId||b.reversesId)||b.kind!=='REVERSAL'&&b.reversesId)throw invalid();
 return {...proof(b),packageId:entityId(b.packageId),kind:b.kind,refundId:financial?entityId(b.refundId):null,reversesId:b.kind==='REVERSAL'?entityId(b.reversesId):null,eventDate:date(b.eventDate),externalReference:text(b.externalReference,128),amount:financial?cents(b.amount):cents(b.amount??'0'),counterparty:text(b.counterparty??'',255,financial?1:0),processingEvidence:text(b.processingEvidence??'',255,['CASH','OFFSET'].includes(b.kind)?1:0),externalAggregationVat:cents(b.externalAggregationVat??'0'),periods,externalConfirmed:true};
}
