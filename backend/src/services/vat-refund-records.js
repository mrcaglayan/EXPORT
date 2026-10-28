import {query} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/vat-refund.validators.js';
import {authorize,scopeArgs,notFound} from './entity-context.js';
import {own,serialize,pageRows,pattern} from './purchasing-context.js';
export const active="('REQUESTED','APPROVED','VOID_REQUESTED')";
export const kinds={
 deduction:{table:'vat_deductions',parent:'deduction_id',columns:'goods_source_id,cost_source_id,period,tax_event_date,book_date,deducted_vat,prior_refunded_vat'},
 reconciliation:{table:'vat_reconciliations',parent:'reconciliation_id',columns:'accounting_period_id,period,previous_id,basis_id,registered_vat,opening_carry,other_deductions,total_deductions,output_vat,other_refund_vat,export_refund_vat,payable_vat,closing_carry,external_claimed_vat,external_cash_vat',lineTable:'vat_reconciliation_deductions',lineColumns:'deduction_id,deducted_vat'},
 refund:{table:'vat_refund_requests',parent:'refund_id',columns:'reconciliation_id,period,method,assurance,requested_vat,proposed_filing_date',lineTable:'vat_refund_lines',lineColumns:'deduction_id,goods_line_id,cost_line_id,claimed_vat'},
};
export const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
export function metadata(kind){const m=kinds[kind];if(!m)throw notFound();return m;}
const common='id,reference,base_currency,context_hash,reason,evidence,status,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,cancel_reason,void_requested_by,void_requested_at,void_reason,void_evidence,void_reviewed_by,void_reviewed_at,void_review_reason';
export const fields=(columns,alias)=>columns.split(',').map(k=>`${alias}.${k} AS ${camel(k)}`).join(',');
export async function read(tx,c,kind,id){const m=metadata(kind);const item=(await tx.query(`SELECT ${fields(common+','+m.columns+',input,plan','h')} FROM ${m.table} h WHERE ${own('h')} AND h.id=?`,[...scopeArgs(c),id])).rows[0];if(!item)throw notFound();return serialize(item);}
export async function get(c,kind,id){entityId(id);await authorize(c,'vat.read');return {item:await read({query},c,kind,id)};}
export async function list(c,kind,input){const m=metadata(kind);await authorize(c,'vat.read');const p=v.listing(input),args=scopeArgs(c);let where=own('h');if(p.q){where+=" AND h.reference LIKE ? ESCAPE '!'";args.push(pattern(p.q));}if(p.status){where+=' AND h.status=?';args.push(p.status);}return pageRows(fields(common+','+m.columns,'h'),m.table+' h',where,args,p,'h.requested_at DESC,h.id');}
export async function lines(c,kind,id,input){entityId(id);await authorize(c,'vat.read');const m=metadata(kind);if(!m.lineTable)throw notFound();await read({query},c,kind,id);return pageRows(fields('id,line_number,'+m.lineColumns+',snapshot','l'),m.lineTable+' l',`${own('l')} AND l.${m.parent}=?`,[...scopeArgs(c),id],v.listing(input),'l.line_number');}
export async function history(c,kind,id,input){entityId(id);await authorize(c,'vat.read');const m=metadata(kind);await read({query},c,kind,id);return pageRows(fields('id,sequence_number,action,reason,context,actor_id,created_at','d'),'vat_refund_decisions d',`${own('d')} AND d.${m.parent}=?`,[...scopeArgs(c),id],v.listing(input),'d.sequence_number DESC');}
