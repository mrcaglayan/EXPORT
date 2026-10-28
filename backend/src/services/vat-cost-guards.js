import {scopeArgs} from './entity-context.js';
import {fail} from './purchasing-context.js';
export async function retainCostInvoice(tx,c,invoice){
 if((await tx.query("SELECT id FROM journals WHERE tenant_id=? AND legal_entity_id=? AND source_module='VAT_COST_INVOICE' AND source_id=? AND status='POSTED' LIMIT 1",[...scopeArgs(c),invoice.uuid])).rows.length)throw fail('VAT_COST_INVOICE_RETAINED','This invoice has a posted non-stock journal. Retain its source; it cannot also receive goods or be cancelled.');
}
export async function unfrozenGoods(tx,c,input){
 if(input.treatment!=='CANDIDATE')return;
 if((await tx.query("SELECT b.id FROM vat_allocation_bases b JOIN export_customs_documents d ON d.id=? AND d.tenant_id=b.tenant_id AND d.legal_entity_id=b.legal_entity_id WHERE b.tenant_id=? AND b.legal_entity_id=? AND b.period=DATE_FORMAT(d.event_date,'%Y-%m') AND b.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') LIMIT 1",[input.clearanceId,...scopeArgs(c)])).rows.length)throw fail('VAT_COST_GOODS_FROZEN','Release dependent cost allocations and independently void the monthly basis before changing candidate goods.');
}
