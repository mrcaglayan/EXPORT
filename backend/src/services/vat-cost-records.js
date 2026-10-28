import {query} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/vat-cost.validators.js';
import {authorize,scopeArgs,notFound} from './entity-context.js';
import {own,serialize,pageRows,pattern} from './purchasing-context.js';
export const active="('REQUESTED','APPROVED','VOID_REQUESTED')";
export const kinds={
 source:{table:'vat_cost_sources',parent:'source_id',columns:'invoice_line_id,vat_journal_line_id,category,native_vat,converted_vat,deductible_vat,available_vat,asset_reference,first_use_date'},
 basis:{table:'vat_allocation_bases',parent:'basis_id',columns:'period,eligible_value,total_value,vat_free_value,general_rate,ordinary_ceiling,goods_vat',lineTable:'vat_allocation_basis_lines',lineColumns:'attribution_line_id,candidate_vat'},
 allocation:{table:'vat_cost_allocations',parent:'allocation_id',columns:'source_id,basis_id,period,category,treatment,basis_vat,calculated_vat,allocated_vat,candidate_vat,non_export_vat,limited_vat,asset_eligible_value,asset_total_value',lineTable:'vat_cost_allocation_lines',lineColumns:'basis_line_id,weight,allocated_vat,candidate_vat'},
};
export const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
export function metadata(kind){const m=kinds[kind];if(!m)throw notFound();return m;}
const common='id,reference,base_currency,context_hash,reason,evidence,status,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,cancel_reason,void_requested_by,void_requested_at,void_reason,void_evidence,void_reviewed_by,void_reviewed_at,void_review_reason';
export const fields=(columns,alias)=>columns.split(',').map(k=>`${alias}.${k} AS ${camel(k)}`).join(',');
export async function read(tx,c,kind,id){const m=metadata(kind);const item=(await tx.query(`SELECT ${fields(common+','+m.columns+',input,plan','h')} FROM ${m.table} h WHERE ${own('h')} AND h.id=?`,[...scopeArgs(c),id])).rows[0];if(!item)throw notFound();return serialize(item);}
export async function get(c,kind,id){entityId(id);await authorize(c,'vat.read');return {item:await read({query},c,kind,id)};}
export async function list(c,kind,input){const m=metadata(kind);await authorize(c,'vat.read');const p=v.listing(input),args=scopeArgs(c);let where=own('h');if(p.q){where+=" AND h.reference LIKE ? ESCAPE '!'";args.push(pattern(p.q));}if(p.status){where+=' AND h.status=?';args.push(p.status);}return pageRows(fields(common+','+m.columns,'h'),m.table+' h',where,args,p,'h.requested_at DESC,h.id');}
export async function lines(c,kind,id,input){entityId(id);await authorize(c,'vat.read');const m=metadata(kind);if(!m.lineTable)throw notFound();await read({query},c,kind,id);return pageRows(fields('id,line_number,'+m.lineColumns+',snapshot','l'),m.lineTable+' l',`${own('l')} AND l.${m.parent}=?`,[...scopeArgs(c),id],v.listing(input),'l.line_number');}
export async function history(c,kind,id,input){entityId(id);await authorize(c,'vat.read');const m=metadata(kind);await read({query},c,kind,id);return pageRows(fields('id,sequence_number,action,reason,context,actor_id,created_at','d'),'vat_cost_decisions d',`${own('d')} AND d.${m.parent}=?`,[...scopeArgs(c),id],v.listing(input),'d.sequence_number DESC');}
