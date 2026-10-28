import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcile,policy,previousMonth,deadline} from '../src/services/vat-refund-math.js';
test('return reconciliation subtracts all refunds from carry, with one explicit cents rounding',()=>{
 const b={openingCarry:'100.000000',otherDeductions:'0.000000',declaredTotalDeductions:'150.010000',outputVat:'20.000000',otherRefundVat:'10.000000',exportRefundVat:'50.000000',declaredPayableVat:'0.000000',declaredClosingCarry:'70.010000',externalClaimedVat:'0.000000',externalCashVat:'0.000000'};
 const r=reconcile(b,'50.005000');assert.equal(r.closingCarry,'70.010000');assert.equal(r.roundingDifference,'0.005000');assert.throws(()=>reconcile({...b,declaredClosingCarry:'120.010000'},'50.005000'),{code:'VAT_RETURN_MISMATCH'});assert.throws(()=>reconcile({...b,exportRefundVat:'1000.000000'},'50.005000'),{code:'VAT_RETURN_BUDGET'});
});
test('dated standard export limits retain small claims and require cash or excess procedures',()=>{
 const input={proposedFilingDate:'2026-11-01',method:'CASH',assurance:'NONE',reviewRequired:false},budget={periodClaims:'9999.990000',cashClaims:'9999.990000',ordinaryCeiling:'100000.000000'},run=(i=input,b=budget)=>policy('2026-10',i,b,'2026-10-28');
 assert.equal(run().processingStatus,'WAITING_AGGREGATION');assert.equal(run(input,{...budget,periodClaims:'10000.000000'}).processingStatus,'DOCUMENT_REVIEW_REQUIRED');
 assert.throws(()=>run(input,{...budget,cashClaims:'50000.010000'}),{code:'VAT_CASH_ASSURANCE'});assert.equal(run({...input,assurance:'YMM'},{...budget,cashClaims:'60000.000000'}).cashReportThreshold,'50000.000000');
 assert.throws(()=>run(input,{...budget,ordinaryCeiling:'9000.000000'}),{code:'VAT_TAX_REVIEW_REQUIRED'});assert.equal(run({...input,assurance:'TAX_REVIEW'},{...budget,ordinaryCeiling:'9000.000000'}).aboveOrdinary,true);
 assert.throws(()=>run({...input,reviewRequired:true}),{code:'VAT_TAX_REVIEW_REQUIRED'});assert.throws(()=>run({...input,proposedFilingDate:'2029-01-01'}),{code:'VAT_REFUND_DEADLINE'});assert.throws(()=>policy('2023-10',{...input,proposedFilingDate:'2024-01-01'},budget,'2026-10-28'),{code:'VAT_POLICY_PERIOD'});assert.equal(previousMonth('2026-01'),'2025-12');assert.equal(deadline('2026-10'),'2028-12-31');
});
