import Decimal from 'decimal.js';
import {fail} from './purchasing-context.js';
import {sum,subtract,floorSubtract,less,zero} from './vat-cost-math.js';
const D=Decimal.clone({precision:60});
export const rounded=x=>new D(x).toDecimalPlaces(2,D.ROUND_HALF_UP).toFixed(6);
export const previousMonth=period=>new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5))-2,1)).toISOString().slice(0,7);
export const deadline=period=>`${Number(period.slice(0,4))+2}-12-31`;
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function reconcile(input,registeredVat){
 const totalDeductions=sum([input.openingCarry,rounded(registeredVat),input.otherDeductions]),payableVat=floorSubtract(input.outputVat,totalDeductions),available=floorSubtract(totalDeductions,input.outputVat),refunds=sum([input.otherRefundVat,input.exportRefundVat]);
 if(less(available,refunds))throw fail('VAT_RETURN_BUDGET','Declared refunds exceed VAT remaining after output tax.');
 const closingCarry=subtract(available,refunds);
 if(totalDeductions!==input.declaredTotalDeductions||payableVat!==input.declaredPayableVat||closingCarry!==input.declaredClosingCarry)throw fail('VAT_RETURN_MISMATCH','Reported deduction total, payable VAT or closing carry does not reconcile.');
 if(less(input.exportRefundVat,input.externalClaimedVat)||less(input.externalClaimedVat,input.externalCashVat))throw fail('VAT_EXTERNAL_CLAIMS','Prior external claims must fit the declared export refund.');
 return {registeredVat,totalDeductions,payableVat,closingCarry,roundingDifference:new D(rounded(registeredVat)).minus(registeredVat).toFixed(6)};
}
export function policy(period,input,{periodClaims,cashClaims,ordinaryCeiling},asOf=today()){
 // Versioned standard goods-export policy, reviewed against GİB on 2026-10-28.
 if(period<'2025-04'||period>='2030-01')throw fail('VAT_POLICY_PERIOD','This policy supports standard goods exports from April 2025 through 2029; another period needs a reviewed policy version.');
 const filingDeadline=deadline(period);
 if(input.proposedFilingDate>filingDeadline||asOf>filingDeadline||input.proposedFilingDate<asOf||input.proposedFilingDate.slice(0,7)<=period)throw fail('VAT_REFUND_DEADLINE','Use a proposed filing date after the export month, no earlier than today and within the statutory request deadline.');
 const aboveOrdinary=less(ordinaryCeiling,periodClaims);
 if((aboveOrdinary||input.reviewRequired)&&input.assurance!=='TAX_REVIEW')throw fail('VAT_TAX_REVIEW_REQUIRED','Above-ceiling direct VAT or a review-required case needs the tax-inspection procedure.');
 if(input.method==='CASH'&&less('50000.000000',cashClaims)&&input.assurance==='NONE')throw fail('VAT_CASH_ASSURANCE','Aggregate cash requests above TRY 50,000 need a reviewed YMM, guarantee or tax-inspection procedure.');
 return {version:'TR-301-2026-10-28',transactionCode:'301',filingDeadline,minimumProcessingVat:'10000.000000',cashReportThreshold:'50000.000000',aboveOrdinary,processingStatus:less(periodClaims,'10000.000000')?'WAITING_AGGREGATION':'DOCUMENT_REVIEW_REQUIRED',note:'Internal preparation approval only. Record actual filing and settlement separately in claim tracking.'};
}
export {sum,subtract,floorSubtract,less,zero};
