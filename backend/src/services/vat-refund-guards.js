import {scopeArgs} from './entity-context.js';
import {fail} from './purchasing-context.js';
const active="('REQUESTED','APPROVED','VOID_REQUESTED')";
export async function costChange(tx,c,kind,item){
 if(kind==='source'){
  if((await tx.query(`SELECT id FROM vat_deductions WHERE tenant_id=? AND legal_entity_id=? AND cost_source_id=? AND status IN ${active} LIMIT 1`,[...scopeArgs(c),item.id??''])).rows.length)throw fail('VAT_DEDUCTION_DEPENDENCY','Void the dependent VAT deduction before changing this cost source.');
 }else{
  const basis=kind==='basis'?item.id:item.basisId;
  if((kind==='basis'||item.treatment==='CANDIDATE')&&(await tx.query(`SELECT id FROM vat_reconciliations WHERE tenant_id=? AND legal_entity_id=? AND basis_id=? AND status IN ${active} LIMIT 1`,[...scopeArgs(c),basis??''])).rows.length)throw fail('VAT_PERIOD_RECONCILED','Void the dependent KDV1 reconciliation before changing its monthly basis or candidate allocations.');
 }
}
export async function reopenCalendar(tx,c,periodId){
 if((await tx.query(`SELECT id FROM vat_reconciliations WHERE tenant_id=? AND legal_entity_id=? AND accounting_period_id=? AND status IN ${active} LIMIT 1`,[...scopeArgs(c),periodId])).rows.length)throw fail('VAT_PERIOD_RECONCILED','Void the dependent KDV1 reconciliation before reopening this accounting month.');
}
