import {randomUUID} from 'node:crypto';
import {query} from '../db/query.js';
import {AppError} from '../shared/AppError.js';
import {fingerprint} from '../shared/idempotency.js';
import {amount} from '../shared/money.js';
import {entityId} from '../validators/auth.validators.js';
import * as validate from '../validators/corrections.validators.js';
import {scopeArgs,authorize,entityWrite,audit,notFound} from './entity-context.js';
import {period} from './inventory-stock.js';
import {micro,signed} from './inventory-report.service.js';
const fail=(code,message,status=409)=>new AppError(status,code,message);
const own=a=>`${a}.tenant_id = ? AND ${a}.legal_entity_id = ?`;
const serialize=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString():v]));
const fields=`c.id,c.reference,c.kind,c.original_event_id AS originalEventId,c.posting_date AS postingDate,c.period_id AS periodId,c.reason,c.evidence,c.status,
 c.requested_by AS requestedBy,u.display_name AS requestedByName,c.requested_at AS requestedAt,c.reviewed_by AS reviewedBy,v.display_name AS reviewedByName,
 c.reviewed_at AS reviewedAt,c.review_reason AS reviewReason,c.posted_by AS postedBy,c.posted_at AS postedAt,c.cancel_reason AS cancelReason,e.id AS eventId`;
const from=`inventory_corrections c JOIN users u ON u.tenant_id = c.tenant_id AND u.id = c.requested_by LEFT JOIN users v ON v.tenant_id = c.tenant_id AND v.id = c.reviewed_by LEFT JOIN inventory_events e ON e.tenant_id = c.tenant_id AND e.legal_entity_id = c.legal_entity_id AND e.correction_id = c.id`;
async function header(tx,context,id){const {rows}=await tx.query(`SELECT ${fields} FROM ${from} WHERE ${own('c')} AND c.id = ?`,[...scopeArgs(context),id]);if(!rows.length)throw notFound();return {correction:serialize(rows[0])};}
export async function get(context,id){await authorize(context,'inventory.read');return header({query},context,entityId(id));}
export async function list(context,input){await authorize(context,'inventory.read');const p=validate.filters(input),args=scopeArgs(context),where=own('c')+(p.status?' AND c.status = ?':'');if(p.status)args.push(p.status);const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_corrections c WHERE ${where}`,args);const {rows}=await query(`SELECT ${fields} FROM ${from} WHERE ${where} ORDER BY c.requested_at DESC,c.id LIMIT ${p.limit} OFFSET ${p.offset}`,args);return {items:rows.map(serialize),total:count[0].total,limit:p.limit,offset:p.offset};}
async function planned(tx,context,id){return (await tx.query(`SELECT l.id,l.line_number AS lineNumber,l.warehouse_id AS warehouseId,l.sku_id AS skuId,l.layer_id AS layerId,l.pool_id AS poolId,l.source_entry_id AS sourceEntryId,
 l.before_quantity AS beforeQuantity,l.before_value AS beforeValue,l.quantity,l.value,l.observed_quantity AS observedQuantity,l.target_value AS targetValue,l.movement_hash AS movementHash
 FROM inventory_correction_lines l WHERE ${own('l')} AND l.correction_id = ? ORDER BY l.line_number`,[...scopeArgs(context),id])).rows;}
export async function lines(context,id,input){await authorize(context,'inventory.read');await header({query},context,entityId(id));const p=validate.filters(input),args=[...scopeArgs(context),id];const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_correction_lines l WHERE ${own('l')} AND l.correction_id = ?`,args);const {rows}=await query(`SELECT l.id,l.line_number AS lineNumber,l.layer_id AS layerId,l.pool_id AS poolId,p.code AS poolCode,s.code AS skuCode,w.code AS warehouseCode,u.code AS unitCode,
 l.source_entry_id AS sourceEntryId,l.before_quantity AS beforeQuantity,l.before_value AS beforeValue,l.quantity,l.value,l.observed_quantity AS observedQuantity,l.target_value AS targetValue,
 h.source_id AS sourceId,r.source_line_key AS sourceLineKey,r.receipt_id AS receiptId FROM inventory_correction_lines l
 JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.id = l.layer_id
 JOIN stock_receipt_lines r ON r.tenant_id = x.tenant_id AND r.legal_entity_id = x.legal_entity_id AND r.id = x.receipt_line_id JOIN stock_receipts h ON h.id = r.receipt_id AND h.tenant_id = r.tenant_id AND h.legal_entity_id = r.legal_entity_id
 JOIN product_skus s ON s.tenant_id = l.tenant_id AND s.legal_entity_id = l.legal_entity_id AND s.id = l.sku_id
 JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
 JOIN warehouses w ON w.tenant_id = l.tenant_id AND w.legal_entity_id = l.legal_entity_id AND w.id = l.warehouse_id JOIN inventory_pools p ON p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.id = l.pool_id
 WHERE ${own('l')} AND l.correction_id = ? ORDER BY l.line_number LIMIT ${p.limit} OFFSET ${p.offset}`,args);return {items:rows,total:count[0].total,limit:p.limit,offset:p.offset};}
// Load only affected source layers, in bounded batches. Include all pools so the
// physical and layer+pool invariants can be checked before posting.
async function stock(tx,context,layerIds){
 const ids=[...new Set(layerIds)].sort(),out=new Map(),history=new Map();
 for(let offset=0;offset<ids.length;offset+=250){const batch=ids.slice(offset,offset+250),marks=batch.map(()=>'?').join(','),args=[...scopeArgs(context),...batch];
  const {rows}=await tx.query(`SELECT b.layer_id AS layerId,b.pool_id AS poolId,b.warehouse_id AS warehouseId,b.sku_id AS skuId,b.quantity,b.value,x.unit_cost AS originalCost,x.received_date AS receivedDate,
   pb.quantity AS physicalQuantity,pb.value AS physicalValue,u.quantity_precision AS precisionValue,(w.active AND p.active AND s.active AND f.active AND u.active) AS active,
   COALESCE((SELECT SUM(a.quantity-a.released_quantity-a.issued_quantity) FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id WHERE a.tenant_id = b.tenant_id AND a.legal_entity_id = b.legal_entity_id AND a.layer_id = b.layer_id AND a.pool_id = b.pool_id AND r.status = 'ACTIVE'),0) AS reservedQuantity
   FROM inventory_pool_balances b JOIN inventory_balances pb ON pb.tenant_id = b.tenant_id AND pb.legal_entity_id = b.legal_entity_id AND pb.layer_id = b.layer_id
   JOIN inventory_layers x ON x.tenant_id = b.tenant_id AND x.legal_entity_id = b.legal_entity_id AND x.id = b.layer_id
   JOIN warehouses w ON w.tenant_id = b.tenant_id AND w.legal_entity_id = b.legal_entity_id AND w.id = b.warehouse_id
   JOIN inventory_pools p ON p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.id = b.pool_id
   JOIN product_skus s ON s.tenant_id = b.tenant_id AND s.legal_entity_id = b.legal_entity_id AND s.id = b.sku_id
   JOIN product_families f ON f.tenant_id = s.tenant_id AND f.legal_entity_id = s.legal_entity_id AND f.id = s.family_id
   JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
   WHERE ${own('b')} AND b.layer_id IN (${marks}) ORDER BY b.layer_id,b.pool_id`,args);
  for(const r of rows)out.set(r.layerId+':'+r.poolId,r);
  const {rows:events}=await tx.query(`SELECT l.id,l.layer_id AS layerId,l.pool_id AS poolId,l.quantity,l.value,e.posting_date AS postingDate FROM inventory_pool_ledger l JOIN inventory_events e ON e.tenant_id = l.tenant_id AND e.legal_entity_id = l.legal_entity_id AND e.id = l.event_id WHERE ${own('l')} AND l.layer_id IN (${marks}) ORDER BY l.id`,args);
  for(const e of events){if(!history.has(e.layerId))history.set(e.layerId,[]);history.get(e.layerId).push(e);}
 }
 for(const [layerId,events]of history){const movementHash=fingerprint(events),lastDate=events.reduce((d,e)=>e.postingDate>d?e.postingDate:d,'1000-01-01');
  const pools=[...out.values()].filter(b=>b.layerId===layerId);let q=0n,v=0n;
  for(const b of pools){const source=events.filter(e=>e.poolId===b.poolId);if(source.reduce((n,e)=>n+micro(e.quantity),0n)!==micro(b.quantity)||source.reduce((n,e)=>n+micro(e.value),0n)!==micro(b.value))throw fail('PROJECTION_MISMATCH','Stock does not reconcile to its immutable ledger.');q+=micro(b.quantity);v+=micro(b.value);Object.assign(b,{movementHash,lastDate});}
  if(pools.some(b=>micro(b.physicalQuantity)!==q||micro(b.physicalValue)!==v))throw fail('POOL_PHYSICAL_MISMATCH','Pool stock does not reconcile to physical stock.');
 }
 return out;
}
async function source(tx,context,id){const {rows}=await tx.query(`SELECT e.*,c.kind AS correctionKind,COALESCE(c.status,r.status,a.status,i.status) AS sourceStatus FROM inventory_events e
 LEFT JOIN inventory_corrections c ON c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id AND c.id = e.correction_id
 LEFT JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
 LEFT JOIN inventory_reallocations a ON a.tenant_id = e.tenant_id AND a.legal_entity_id = e.legal_entity_id AND a.id = e.reallocation_id
 LEFT JOIN inventory_issues i ON i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id AND i.id = e.issue_id
 WHERE ${own('e')} AND e.id = ?`,[...scopeArgs(context),id]);if(!rows.length)throw notFound();const event=rows[0];if(!['POSTED','EXECUTED'].includes(event.sourceStatus))throw fail('SOURCE_NOT_POSTED','Only a completed stock event can be reversed.');if(event.correctionKind==='REVERSAL')throw fail('REVERSAL_OF_REVERSAL','A reversal cannot itself be reversed. Submit a documented adjustment.');if((await tx.query(`SELECT id FROM inventory_events e WHERE ${own('e')} AND e.reverses_event_id = ?`,[...scopeArgs(context),id])).rows.length)throw fail('ALREADY_REVERSED','This event already has an exact reversal.');return event;}
function checkPlan(rows,balances,date,stale=false){
 for(const l of rows){const b=balances.get(l.layerId+':'+l.poolId);if(!b)throw notFound();if(!b.active)throw fail('INACTIVE_REFERENCE','Correction references must be active.');if(b.lastDate>date||b.receivedDate>date)throw fail('LATER_STOCK_MOVEMENT','Use a posting date on or after the latest source-layer movement.');
  if(stale&&(b.quantity!==l.beforeQuantity||b.value!==l.beforeValue||b.movementHash!==l.movementHash))throw fail('STALE_CORRECTION','The source stock changed. Cancel and prepare a new correction.');
  const q=micro(b.quantity)+micro(l.quantity),v=micro(b.value)+micro(l.value);
  if(q<micro(b.reservedQuantity))throw fail('RESERVED_STOCK','A correction cannot consume outstanding reservations.');
  if(q<0n||v<0n||(q===0n&&v!==0n))throw fail('INVALID_CARRYING_VALUE','The correction would leave negative stock or value without quantity.');
  amount(signed(q));amount(signed(v));
 }
 const grouped=new Map();for(const l of rows){const b=balances.get(l.layerId+':'+l.poolId),r=grouped.get(l.layerId)??{q:micro(b.physicalQuantity),v:micro(b.physicalValue)};r.q+=micro(l.quantity);r.v+=micro(l.value);grouped.set(l.layerId,r);}for(const r of grouped.values()){if(r.q<0n||r.v<0n||(r.q===0n&&r.v!==0n))throw fail('INVALID_CARRYING_VALUE','Physical stock would have an invalid carrying value.');amount(signed(r.q));amount(signed(r.v));}
}
async function insertRows(tx,table,columns,rows){for(let o=0;o<rows.length;o+=250){const batch=rows.slice(o,o+250);await tx.query(`INSERT INTO ${table} (${columns}) VALUES ${batch.map(()=>`(${batch[0].map(()=>'?').join(',')})`).join(',')}`,batch.flat());}}
export async function create(context,body){const input=validate.correction(body);return entityWrite(context,'inventory.correction.request','inventory.correction.request',input,async tx=>{
 const scope=scopeArgs(context),periodId=await period(tx,context,input.postingDate);let raw;
 if(input.kind==='REVERSAL'){const e=await source(tx,context,input.originalEventId);if(e.posting_date>input.postingDate)throw fail('SOURCE_DATE','Reversal cannot precede its source event.');raw=(await tx.query(`SELECT l.layer_id AS layerId,l.pool_id AS poolId,l.id AS sourceEntryId,-l.quantity AS quantity,-l.value AS value FROM inventory_pool_ledger l WHERE ${own('l')} AND l.event_id = ? ORDER BY l.layer_id,l.pool_id`,[...scope,input.originalEventId])).rows;}
 else raw=input.lines;
 if(!raw.length)throw fail('EMPTY_CORRECTION','The source event has no stock entries.');
 const balances=await stock(tx,context,raw.map(l=>l.layerId)),rows=raw.map(l=>{
  const b=balances.get(l.layerId+':'+l.poolId);if(!b)throw notFound();let q,v;
  if(input.kind==='REVERSAL'){q=micro(l.quantity);v=micro(l.value);}
  else if(input.kind==='REVALUATION'){if(micro(b.quantity)===0n)throw fail('NO_QUANTITY','Revaluation requires stock quantity on hand.');q=0n;v=micro(l.targetValue)-micro(b.value);}
  else{if(/[1-9]/.test(l.observedQuantity.split('.')[1].slice(b.precisionValue)))throw fail('QUANTITY_PRECISION','Count must respect base-unit precision.',422);q=micro(l.observedQuantity)-micro(b.quantity);const n=q<0n?-q:q;
   v=micro(b.quantity)>0n?(micro(b.value)*n+micro(b.quantity)/2n)/micro(b.quantity):(micro(b.originalCost)*n+500000n)/1000000n;if(q<0n)v=-v;
  }
  if(q===0n&&v===0n)throw fail('NO_CHANGE','Every correction line must change stock quantity or value.',422);
  amount(signed(q<0n?-q:q));amount(signed(v<0n?-v:v));
  return {...l,warehouseId:b.warehouseId,skuId:b.skuId,beforeQuantity:b.quantity,beforeValue:b.value,movementHash:b.movementHash,quantity:signed(q),value:signed(v)};
 });checkPlan(rows,balances,input.postingDate);
 const id=randomUUID();await tx.query('INSERT INTO inventory_corrections (id,tenant_id,legal_entity_id,reference,kind,original_event_id,posting_date,period_id,reason,evidence,requested_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,...scope,input.reference,input.kind,input.originalEventId??null,input.postingDate,periodId,input.reason,input.evidence,context.identity.userId]);
 await insertRows(tx,'inventory_correction_lines','id,tenant_id,legal_entity_id,correction_id,line_number,warehouse_id,sku_id,layer_id,pool_id,source_entry_id,before_quantity,before_value,quantity,value,observed_quantity,target_value,movement_hash',rows.map((l,i)=>[randomUUID(),...scope,id,i+1,l.warehouseId,l.skuId,l.layerId,l.poolId,l.sourceEntryId??null,l.beforeQuantity,l.beforeValue,l.quantity,l.value,l.observedQuantity??null,l.targetValue??null,l.movementHash]));
 await tx.query("UPDATE inventory_corrections SET status = 'REQUESTED' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,id]);await audit(tx,context,'inventory.correction.requested',id,{kind:input.kind,originalEventId:input.originalEventId??null,reason:input.reason,evidence:input.evidence,lineCount:rows.length});return header(tx,context,id);
});}
export async function act(context,correctionId,action,body){const id=entityId(correctionId),input=validate.reason(body);if(!['approve','reject','cancel','post'].includes(action))throw notFound();const permission=action==='post'?'post':action==='cancel'?'request':'review';return entityWrite(context,`inventory.correction.${permission}`,`inventory.correction.${action}`,{id,...input},async tx=>{
 const {correction:c}=await header(tx,context,id),scope=scopeArgs(context);
 if(action==='post'&&c.status==='POSTED')return {correction:c};
 if(action==='cancel'){if(c.requestedBy!==context.identity.userId)throw fail('REQUESTER_REQUIRED','Only the requester can cancel.',403);if(!['REQUESTED','APPROVED'].includes(c.status))throw fail('INVALID_STATE','This correction cannot be cancelled.');await tx.query("UPDATE inventory_corrections SET status = 'CANCELLED',cancel_reason = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[input.reason,...scope,id]);}
 else{
  if(c.status!==(action==='post'?'APPROVED':'REQUESTED'))throw fail('INVALID_STATE','Correction is not ready for this action.');
  if(action==='approve'&&c.requestedBy===context.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','Another authorized person must approve.',403);
  let rows;
  if(action!=='reject'){await period(tx,context,c.postingDate);if(c.originalEventId)await source(tx,context,c.originalEventId);rows=await planned(tx,context,id);checkPlan(rows,await stock(tx,context,rows.map(l=>l.layerId)),c.postingDate,true);}
  if(action!=='post')await tx.query('UPDATE inventory_corrections SET status = ?,reviewed_by = ?,reviewed_at = CURRENT_TIMESTAMP,review_reason = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[action==='approve'?'APPROVED':'REJECTED',context.identity.userId,input.reason,...scope,id]);
  else{
   await tx.query("UPDATE inventory_corrections SET status = 'POSTING' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,id]);const eventId=randomUUID();await tx.query("INSERT INTO inventory_events (id,tenant_id,legal_entity_id,kind,correction_id,reverses_event_id) VALUES (?,?,?,'CORRECTION',?,?)",[eventId,...scope,id,c.originalEventId]);
   const physical=new Map();for(const l of rows){const p=physical.get(l.layerId)??{...l,q:0n,v:0n};p.q+=micro(l.quantity);p.v+=micro(l.value);physical.set(l.layerId,p);}
   await insertRows(tx,'inventory_pool_ledger','id,tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id,event_id,pool_id,quantity,value',rows.map(l=>[randomUUID(),...scope,l.warehouseId,l.skuId,l.layerId,eventId,l.poolId,l.quantity,l.value]));
   const physicalRows=[...physical.values()].filter(l=>l.q!==0n||l.v!==0n);await insertRows(tx,'inventory_physical_ledger','id,tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id,event_id,quantity,value',physicalRows.map(l=>[randomUUID(),...scope,l.warehouseId,l.skuId,l.layerId,eventId,signed(l.q),signed(l.v)]));
   for(const l of [...rows].sort((a,b)=>(a.layerId+a.poolId).localeCompare(b.layerId+b.poolId)))await tx.query('UPDATE inventory_pool_balances SET quantity = quantity + ?,value = value + ? WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND sku_id = ? AND layer_id = ? AND pool_id = ?',[l.quantity,l.value,...scope,l.warehouseId,l.skuId,l.layerId,l.poolId]);
   for(const l of physicalRows.sort((a,b)=>a.layerId.localeCompare(b.layerId)))await tx.query('UPDATE inventory_balances SET quantity = quantity + ?,value = value + ? WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND sku_id = ? AND layer_id = ?',[signed(l.q),signed(l.v),...scope,l.warehouseId,l.skuId,l.layerId]);
   await tx.query("UPDATE inventory_corrections SET status = 'POSTED',posted_by = ?,posted_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[context.identity.userId,...scope,id]);
  }
 }
 await audit(tx,context,`inventory.correction.${action}`,id,{reason:input.reason,kind:c.kind,originalEventId:c.originalEventId});return header(tx,context,id);
});}
