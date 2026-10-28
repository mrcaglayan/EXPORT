import {withTransaction} from '../db/query.js';
import {authorize,scopeArgs} from './entity-context.js';
import {entityId} from '../validators/auth.validators.js';
import {own,fail} from './purchasing-context.js';
import {read,members} from './vat-claim-records.js';
import {fingerprint} from '../shared/idempotency.js';
import {bundle} from './vat-claim-files.js';
export async function download(c,id){entityId(id);await authorize(c,'vat.read');return withTransaction(async tx=>{
 const item=await read(tx,c,'package',id),rows=(await tx.query(`SELECT line_number AS lineNumber,list_kind AS listKind,period,source_key AS sourceKey,data,snapshot FROM vat_claim_package_rows l WHERE ${own('l')} AND package_id=?`,[...scopeArgs(c),id])).rows.sort((a,b)=>a.lineNumber-b.lineNumber).map(({lineNumber,...row})=>row),requests=(await members(tx,c,id)).map(({refundId,requestedVat,snapshot})=>({refundId,requestedVat,snapshot}));
 if(fingerprint({input:item.input,plan:item.plan})!==item.contextHash||fingerprint(rows)!==fingerprint(item.plan.rows)||fingerprint(requests)!==fingerprint(item.plan.requests))throw fail('VAT_PACKAGE_INTEGRITY','Stored list or source evidence differs from the reviewed package.');
 return {name:'vat-claim-'+id+'.zip',bytes:bundle(item)};
 });}
