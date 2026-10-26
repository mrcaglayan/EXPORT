import {withTransaction} from '../db/query.js';
import {authorize,scopeArgs} from './entity-context.js';
import {object,entityId,invalid} from '../validators/auth.validators.js';
import {page} from '../validators/accounting.validators.js';
import {fingerprint} from '../shared/idempotency.js';
export async function movements(context,input){
 object(input,['grain','limit','cursor','warehouseId','skuId','poolId']);const grain=input.grain??'PHYSICAL';if(!['PHYSICAL','POOL'].includes(grain)||(grain==='PHYSICAL'&&input.poolId))throw invalid();
 const filter={grain,...Object.fromEntries(['warehouseId','skuId','poolId'].filter(k=>input[k]).map(k=>[k,entityId(input[k])]))},limit=page({limit:input.limit}).limit;
 const scope=scopeArgs(context),scopeHash=fingerprint({scope,filter});let cursor;
 if(input.cursor!==undefined){try{if(typeof input.cursor!=='string'||input.cursor.length>1500)throw invalid();cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));object(cursor,['scopeHash','createdAt','eventId','entryId']);if(cursor.scopeHash!==scopeHash||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cursor.createdAt))throw invalid();entityId(cursor.eventId);entityId(cursor.entryId);}catch{throw invalid();}}
 return withTransaction(async tx=>{
  await authorize(context,'inventory.read',tx);const pool=grain==='POOL',args=[...scope];let where='e.tenant_id = ? AND e.legal_entity_id = ?';
  for(const [key,col]of [['warehouseId','warehouse_id'],['skuId','sku_id'],['poolId','pool_id']])if(filter[key]){where+=` AND l.${col} = ?`;args.push(filter[key]);}
  if(cursor){where+=' AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?) OR (e.created_at = ? AND e.id = ? AND l.id < ?))';args.push(cursor.createdAt,cursor.createdAt,cursor.eventId,cursor.createdAt,cursor.eventId,cursor.entryId);}
  const {rows}=await tx.query(`SELECT l.id,l.event_id AS eventId,e.kind AS eventKind,e.posting_date AS postingDate,DATE_FORMAT(e.created_at,'%Y-%m-%d %H:%i:%s') AS cursorTime,
   l.layer_id AS layerId,l.sku_id AS skuId,s.code AS skuCode,l.warehouse_id AS warehouseId,w.code AS warehouseCode,${pool?'l.pool_id AS poolId,p.code AS poolCode':'NULL AS poolId,NULL AS poolCode'},
   l.quantity,l.value,e.reverses_event_id AS reversesEventId,e.correction_id AS correctionId,c.kind AS correctionKind,COALESCE(c.reference,i.reference,a.reference,r.source_id) AS reference,
   (SELECT rev.id FROM inventory_events rev WHERE rev.tenant_id = e.tenant_id AND rev.legal_entity_id = e.legal_entity_id AND rev.reverses_event_id = e.id) AS reversedByEventId
   FROM inventory_events e JOIN ${pool?'inventory_pool_ledger':'inventory_physical_ledger'} l ON l.tenant_id = e.tenant_id AND l.legal_entity_id = e.legal_entity_id AND l.event_id = e.id
   JOIN product_skus s ON s.tenant_id = l.tenant_id AND s.legal_entity_id = l.legal_entity_id AND s.id = l.sku_id JOIN warehouses w ON w.tenant_id = l.tenant_id AND w.legal_entity_id = l.legal_entity_id AND w.id = l.warehouse_id
   ${pool?'JOIN inventory_pools p ON p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.id = l.pool_id':''}
   LEFT JOIN stock_receipts r ON r.id = e.receipt_id AND r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id
   LEFT JOIN inventory_reallocations a ON a.id = e.reallocation_id AND a.tenant_id = e.tenant_id AND a.legal_entity_id = e.legal_entity_id
   LEFT JOIN inventory_issues i ON i.id = e.issue_id AND i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id
   LEFT JOIN inventory_corrections c ON c.id = e.correction_id AND c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id
   WHERE ${where} ORDER BY e.created_at DESC,e.id DESC,l.id DESC LIMIT ${limit+1}`,args);
  const hasMore=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1);return {items:items.map(({cursorTime,...r})=>r),limit,hasMore,nextCursor:hasMore?Buffer.from(JSON.stringify({scopeHash,createdAt:last.cursorTime,eventId:last.eventId,entryId:last.id})).toString('base64url'):null};
 });
}
export async function integrity(context){return withTransaction(async tx=>{
 await authorize(context,'inventory.read',tx);const scope=scopeArgs(context),checks=[];
 for(const [grain,balance,ledger,pool]of [['PHYSICAL','inventory_balances','inventory_physical_ledger',false],['POOL','inventory_pool_balances','inventory_pool_ledger',true]]){
  const group=`tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id${pool?',pool_id':''}`,join=['tenant_id','legal_entity_id','warehouse_id','sku_id','layer_id',...(pool?['pool_id']:[])].map(k=>`l.${k} = b.${k}`).join(' AND ');
  const {rows}=await tx.query(`WITH ledger AS (SELECT ${group},SUM(quantity) AS quantity,SUM(value) AS value FROM ${ledger} WHERE tenant_id = ? AND legal_entity_id = ? GROUP BY ${group})
   SELECT COUNT(*) AS checked,SUM(IF(b.quantity < 0 OR b.value < 0 OR (b.quantity = 0 AND b.value <> 0) OR b.quantity <> COALESCE(l.quantity,0) OR b.value <> COALESCE(l.value,0),1,0)) AS invalid
   FROM ${balance} b LEFT JOIN ledger l ON ${join} WHERE b.tenant_id = ? AND b.legal_entity_id = ?`,[...scope,...scope]);checks.push({grain,checked:Number(rows[0].checked),invalid:Number(rows[0].invalid??0)});
 }
 const {rows}=await tx.query(`WITH pools AS (SELECT tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id,SUM(quantity) AS quantity,SUM(value) AS value FROM inventory_pool_balances WHERE tenant_id = ? AND legal_entity_id = ? GROUP BY tenant_id,legal_entity_id,warehouse_id,sku_id,layer_id)
 SELECT COUNT(*) AS checked,SUM(IF(b.quantity <> COALESCE(p.quantity,0) OR b.value <> COALESCE(p.value,0),1,0)) AS invalid FROM inventory_balances b LEFT JOIN pools p ON p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id WHERE b.tenant_id = ? AND b.legal_entity_id = ?`,[...scope,...scope]);checks.push({grain:'LAYER_POOLS',checked:Number(rows[0].checked),invalid:Number(rows[0].invalid??0)});
 const {rows:r}=await tx.query(`WITH reserved AS (SELECT a.tenant_id,a.legal_entity_id,a.layer_id,a.pool_id,SUM(a.quantity-a.released_quantity-a.issued_quantity) AS quantity FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id WHERE a.tenant_id = ? AND a.legal_entity_id = ? AND r.status = 'ACTIVE' GROUP BY a.tenant_id,a.legal_entity_id,a.layer_id,a.pool_id)
 SELECT COUNT(*) AS checked,SUM(IF(r.quantity < 0 OR r.quantity > COALESCE(b.quantity,0),1,0)) AS invalid FROM reserved r LEFT JOIN inventory_pool_balances b ON b.tenant_id = r.tenant_id AND b.legal_entity_id = r.legal_entity_id AND b.layer_id = r.layer_id AND b.pool_id = r.pool_id`,scope);checks.push({grain:'RESERVATIONS',checked:Number(r[0].checked),invalid:Number(r[0].invalid??0)});
 return {status:checks.some(c=>c.invalid)?'MISMATCH':'MATCHED',checks};
});}
