import {object,text,entityId,invalid} from './auth.validators.js';
import {date} from './accounting.validators.js';
import {amount} from '../shared/money.js';
import {positive} from './receipts.validators.js';
export {listing,reason,evidence} from './vat.validators.js';
const proof=b=>({reference:text(b.reference,64),reason:text(b.reason,255),evidence:text(b.evidence,255)});
const optionalId=x=>x==null||x===''?null:entityId(x);
export function cents(x){const a=amount(x);if(!a.endsWith('0000'))throw invalid();return a;}
export function deduction(b){
 object(b,['reference','reason','evidence','sourceKind','sourceId','taxEventDate','deductedVat','priorRefundedVat','bookEvidence','eligibilityEvidence','priorClaimsEvidence']);
 if(!['GOODS','COST'].includes(b.sourceKind))throw invalid();
 return {...proof(b),sourceKind:b.sourceKind,sourceId:entityId(b.sourceId),taxEventDate:date(b.taxEventDate),deductedVat:positive(b.deductedVat),priorRefundedVat:amount(b.priorRefundedVat),bookEvidence:text(b.bookEvidence,255),eligibilityEvidence:text(b.eligibilityEvidence,255),priorClaimsEvidence:text(b.priorClaimsEvidence,255)};
}
export const declarationAmounts=['openingCarry','otherDeductions','declaredTotalDeductions','outputVat','otherRefundVat','exportRefundVat','declaredPayableVat','declaredClosingCarry','externalClaimedVat','externalCashVat'];
export function reconciliation(b){
 object(b,['reference','reason','evidence','accountingPeriodId','previousId','basisId',...declarationAmounts,'filingReference','returnEvidence','openingEvidence','otherAmountsEvidence','priorClaimsEvidence','completenessConfirmed']);
 if(b.completenessConfirmed!==true)throw invalid();
 return {...proof(b),accountingPeriodId:entityId(b.accountingPeriodId),previousId:optionalId(b.previousId),basisId:optionalId(b.basisId),...Object.fromEntries(declarationAmounts.map(k=>[k,cents(b[k])])),filingReference:text(b.filingReference,128),returnEvidence:text(b.returnEvidence,255),openingEvidence:text(b.openingEvidence,255),otherAmountsEvidence:text(b.otherAmountsEvidence,255),priorClaimsEvidence:text(b.priorClaimsEvidence,255),completenessConfirmed:true};
}
export function refund(b){
 object(b,['reference','reason','evidence','reconciliationId','method','assurance','requestedVat','proposedFilingDate','procedureEvidence','eligibilityEvidence','specialTransactionEvidence','reviewRequired','documentsConfirmed','lines']);
 if(!['CASH','OFFSET'].includes(b.method)||!['NONE','YMM','GUARANTEE','TAX_REVIEW'].includes(b.assurance)||typeof b.reviewRequired!=='boolean'||b.documentsConfirmed!==true||!Array.isArray(b.lines)||!b.lines.length)throw invalid();
 const seen=new Set(),lines=b.lines.map(l=>{object(l,['kind','candidateLineId','claimedVat']);if(!['GOODS','COST'].includes(l.kind))throw invalid();const id=entityId(l.candidateLineId),key=l.kind+id;if(seen.has(key))throw invalid();seen.add(key);return {kind:l.kind,candidateLineId:id,claimedVat:positive(l.claimedVat)};}).sort((a,b)=>(a.kind+a.candidateLineId).localeCompare(b.kind+b.candidateLineId));
 return {...proof(b),reconciliationId:entityId(b.reconciliationId),method:b.method,assurance:b.assurance,requestedVat:cents(b.requestedVat),proposedFilingDate:date(b.proposedFilingDate),procedureEvidence:text(b.procedureEvidence,255),eligibilityEvidence:text(b.eligibilityEvidence,255),specialTransactionEvidence:text(b.specialTransactionEvidence??'',255,0),reviewRequired:b.reviewRequired,documentsConfirmed:true,lines};
}
