import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { sumAmounts } from '../shared/money.js';
import { fingerprint } from '../shared/idempotency.js';
import { entityId } from '../validators/auth.validators.js';
import * as validate from '../validators/reservations.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { references, period, available, plan, micro, decimal, transferValue } from './inventory-stock.js';
import { settings } from './accounting-context.js';

const fail = (code,message,status=409) => new AppError(status,code,message);
const own = alias => `${alias}.tenant_id = ? AND ${alias}.legal_entity_id = ?`;
const serialized = row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value]));
const reservationFrom = `inventory_reservations r JOIN warehouses w ON w.tenant_id = r.tenant_id AND w.legal_entity_id = r.legal_entity_id AND w.id = r.warehouse_id
  JOIN inventory_pools p ON p.tenant_id = r.tenant_id AND p.legal_entity_id = r.legal_entity_id AND p.id = r.destination_pool_id
  JOIN users u ON u.tenant_id = r.tenant_id AND u.id = r.created_by`;
const reservationFields = `r.id, r.reference, r.warehouse_id AS warehouseId, w.code AS warehouseCode, r.destination_pool_id AS destinationPoolId, p.code AS destinationPoolCode,
  r.reservation_date AS reservationDate, r.period_id AS periodId, r.reason, r.status, r.created_by AS createdBy, u.display_name AS createdByName, r.created_at AS createdAt`;
async function reservationHeader(tx,context,id) {
  const {rows} = await tx.query(`SELECT ${reservationFields} FROM ${reservationFrom} WHERE ${own('r')} AND r.id = ?`,[...scopeArgs(context),id]);
  if (!rows.length) throw notFound();
  return {reservation:serialized(rows[0])};
}
export async function getReservation(context,id) {
  await authorize(context,'inventory.read'); return reservationHeader({query},context,entityId(id));
}
export async function listReservations(context,input) {
  await authorize(context,'inventory.read');
  const page=validate.filters(input), args=scopeArgs(context);let where=own('r');
  if(page.status){where+=' AND r.status = ?';args.push(page.status);}
  if(page.warehouseId){where+=' AND r.warehouse_id = ?';args.push(page.warehouseId);}
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_reservations r WHERE ${where}`,args);
  const {rows}=await query(`SELECT ${reservationFields} FROM ${reservationFrom} WHERE ${where} ORDER BY r.created_at DESC,r.id LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows.map(serialized),total:count[0].total,limit:page.limit,offset:page.offset};
}
export async function reservationLines(context,id,input) {
  await authorize(context,'inventory.read');await reservationHeader({query},context,entityId(id));
  const page=validate.filters(input,'lines'), args=[...scopeArgs(context),id];
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_reservation_lines l WHERE ${own('l')} AND l.reservation_id = ?`,args);
  const {rows}=await query(`SELECT l.id,l.line_number AS lineNumber,l.sku_id AS skuId,s.code AS skuCode,u.code AS unitCode,l.quantity,
    COALESCE((SELECT SUM(a.released_quantity) FROM inventory_reservation_allocations a WHERE a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.reservation_line_id = l.id),0) AS releasedQuantity,
    COALESCE((SELECT SUM(a.issued_quantity) FROM inventory_reservation_allocations a WHERE a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.reservation_line_id = l.id),0) AS issuedQuantity
    FROM inventory_reservation_lines l JOIN product_skus s ON s.tenant_id = l.tenant_id AND s.legal_entity_id = l.legal_entity_id AND s.id = l.sku_id
    JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
    WHERE ${own('l')} AND l.reservation_id = ? ORDER BY l.line_number LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows.map(l=>({...l,reservedQuantity:decimal(micro(l.quantity)-micro(l.releasedQuantity)-micro(l.issuedQuantity))})),total:count[0].total,...page};
}
const allocationFrom = `inventory_reservation_allocations a JOIN inventory_layers x ON x.tenant_id = a.tenant_id AND x.legal_entity_id = a.legal_entity_id AND x.id = a.layer_id
  JOIN stock_receipt_lines l ON l.tenant_id = x.tenant_id AND l.legal_entity_id = x.legal_entity_id AND l.id = x.receipt_line_id
  JOIN stock_receipts h ON h.tenant_id = l.tenant_id AND h.legal_entity_id = l.legal_entity_id AND h.id = l.receipt_id
  JOIN inventory_pools p ON p.tenant_id = a.tenant_id AND p.legal_entity_id = a.legal_entity_id AND p.id = a.pool_id
  JOIN inventory_reservation_lines r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_line_id`;
export async function reservationAllocations(context,id,input) {
  await authorize(context,'inventory.read');await reservationHeader({query},context,entityId(id));
  const page=validate.filters(input,'lines'),args=[...scopeArgs(context),id];
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_reservation_allocations a WHERE ${own('a')} AND a.reservation_id = ?`,args);
  const {rows}=await query(`SELECT a.id,a.allocation_number AS allocationNumber,a.reservation_line_id AS reservationLineId,r.line_number AS lineNumber,
    a.layer_id AS layerId,a.pool_id AS poolId,p.code AS poolCode,a.quantity,a.released_quantity AS releasedQuantity,a.issued_quantity AS issuedQuantity,
    a.quantity-a.released_quantity-a.issued_quantity AS reservedQuantity,h.id AS receiptId,h.source_id AS sourceId,l.source_line_key AS sourceLineKey,x.received_date AS receivedDate
    FROM ${allocationFrom} WHERE ${own('a')} AND a.reservation_id = ? ORDER BY a.allocation_number LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows,total:count[0].total,...page};
}
async function insert(tx,table,columns,rows) {
  for(let start=0;start<rows.length;start+=250){const batch=rows.slice(start,start+250);
    await tx.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${batch.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')}`,batch.flat());
  }
}
export async function reserve(context,body) {
  const input=validate.reservation(body);
  return entityWrite(context,'inventory.reservation.manage','inventory.reservation.create',input,async tx=>{
    const scope=scopeArgs(context), periodId=await period(tx,context,input.reservationDate);
    const {rows:general}=await tx.query("SELECT id FROM inventory_pools WHERE tenant_id = ? AND legal_entity_id = ? AND kind = 'GENERAL' AND active = 1",scope);
    const stock=new Map(),precision=new Map();
    for(const line of input.lines){
      if(stock.has(line.skuId))continue;
      const selection={warehouseId:input.warehouseId,toPoolId:input.destinationPoolId,skuId:line.skuId,quantity:line.quantity,postingDate:input.reservationDate};
      const refs=await references(tx,context,selection);precision.set(line.skuId,refs.quantityPrecision);
      const rows=[];
      for(const poolId of [input.destinationPoolId,...general.map(p=>p.id)]) rows.push(...(await available(tx,context,selection,poolId)).map(row=>({...row,poolId})));
      stock.set(line.skuId,rows);
    }
    const id=randomUUID(),lines=[],allocations=[];
    for(const [index,line] of input.lines.entries()){
      if(/[1-9]/.test(line.quantity.split('.')[1].slice(precision.get(line.skuId))))throw fail('QUANTITY_PRECISION','Quantity must respect the SKU base-unit precision.',422);
      const lineId=randomUUID(),rows=stock.get(line.skuId),picked=plan(rows,line.quantity);
      if(picked.remaining!=='0.000000')throw fail('INSUFFICIENT_STOCK','Destination and GENERAL have insufficient unreserved stock. Borrow from another country through an approved transfer first.');
      lines.push([lineId,...scope,id,index+1,line.skuId,line.quantity]);
      for(const chosen of picked.selected){
        const current=rows.find(row=>row.layerId===chosen.layerId&&row.poolId===chosen.poolId);
        current.quantity=decimal(micro(current.quantity)-micro(chosen.quantity));
        allocations.push([randomUUID(),...scope,id,lineId,allocations.length+1,input.warehouseId,line.skuId,chosen.layerId,chosen.poolId,chosen.quantity]);
      }
    }
    await insert(tx,'inventory_reservations',['id','tenant_id','legal_entity_id','reference','warehouse_id','destination_pool_id','reservation_date','period_id','reason','created_by'],[[id,...scope,input.reference,input.warehouseId,input.destinationPoolId,input.reservationDate,periodId,input.reason,context.identity.userId]]);
    await insert(tx,'inventory_reservation_lines',['id','tenant_id','legal_entity_id','reservation_id','line_number','sku_id','quantity'],lines);
    await insert(tx,'inventory_reservation_allocations',['id','tenant_id','legal_entity_id','reservation_id','reservation_line_id','allocation_number','warehouse_id','sku_id','layer_id','pool_id','quantity'],allocations);
    await tx.query("UPDATE inventory_reservations SET status = 'ACTIVE' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,id]);
    await audit(tx,context,'inventory.reservation.created',id,{reference:input.reference,lineCount:lines.length,allocationCount:allocations.length,reason:input.reason});
    return reservationHeader(tx,context,id);
  });
}
async function selectOutstanding(tx,context,reservationId,requested,reverse=false) {
  const {rows}=await tx.query(`SELECT a.id,a.reservation_line_id AS reservationLineId,a.allocation_number AS allocationNumber,a.warehouse_id AS warehouseId,a.sku_id AS skuId,a.layer_id AS layerId,a.pool_id AS poolId,
    a.quantity-a.released_quantity-a.issued_quantity AS quantity,u.quantity_precision AS quantityPrecision FROM inventory_reservation_allocations a
    JOIN product_skus s ON s.tenant_id = a.tenant_id AND s.legal_entity_id = a.legal_entity_id AND s.id = a.sku_id
    JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
    WHERE ${own('a')} AND a.reservation_id = ? ORDER BY a.allocation_number ${reverse?'DESC':'ASC'}`,[...scopeArgs(context),reservationId]);
  if(!requested)return rows.filter(row=>micro(row.quantity)>0n);
  const selected=[];
  for(const input of requested){
    const candidates=rows.filter(row=>row.reservationLineId===input.reservationLineId);
    if(!candidates.length)throw notFound();
    if(/[1-9]/.test(input.quantity.split('.')[1].slice(candidates[0].quantityPrecision)))throw fail('QUANTITY_PRECISION','Quantity must respect the SKU base-unit precision.',422);
    const picked=plan(candidates,input.quantity);
    if(picked.remaining!=='0.000000')throw fail('RESERVATION_EXCEEDED','Quantity exceeds the unissued, unreleased reservation.');
    selected.push(...picked.selected);
  }
  return selected.sort((a,b)=>a.allocationNumber-b.allocationNumber);
}
async function finishReservation(tx,context,id,cancel=false) {
  const {rows}=await tx.query('SELECT SUM(quantity-released_quantity-issued_quantity) AS remaining FROM inventory_reservation_allocations WHERE tenant_id = ? AND legal_entity_id = ? AND reservation_id = ?',[...scopeArgs(context),id]);
  if(micro(rows[0].remaining)===0n)await tx.query('UPDATE inventory_reservations SET status = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[cancel?'CANCELLED':'CLOSED',...scopeArgs(context),id]);
}
export async function release(context,reservationId,body,cancel=false) {
  const id=entityId(reservationId),input=validate.release(body,cancel);
  return entityWrite(context,'inventory.reservation.manage',`inventory.reservation.${cancel?'cancel':'release'}`,{id,...input},async tx=>{
    const {reservation:r}=await reservationHeader(tx,context,id);
    if(r.status!=='ACTIVE')throw fail('INVALID_STATE','Only active reservations have stock to release.');
    const selected=await selectOutstanding(tx,context,id,input.lines,true),scope=scopeArgs(context),releaseId=randomUUID();
    if(!selected.length)throw fail('INVALID_STATE','No outstanding stock remains.');
    await insert(tx,'inventory_reservation_releases',['id','tenant_id','legal_entity_id','reservation_id','kind','reason','created_by'],[[releaseId,...scope,id,cancel?'CANCEL':'RELEASE',input.reason,context.identity.userId]]);
    await insert(tx,'inventory_reservation_release_lines',['id','tenant_id','legal_entity_id','release_id','allocation_id','quantity'],selected.map(l=>[randomUUID(),...scope,releaseId,l.id,l.quantity]));
    for(const line of selected)await tx.query('UPDATE inventory_reservation_allocations SET released_quantity = released_quantity + ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[line.quantity,...scope,line.id]);
    await tx.query("UPDATE inventory_reservation_releases SET status = 'POSTED' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,releaseId]);
    await finishReservation(tx,context,id,cancel);
    await audit(tx,context,`inventory.reservation.${cancel?'cancelled':'released'}`,id,{releaseId,reason:input.reason,allocationCount:selected.length});
    return {...await reservationHeader(tx,context,id),releaseId};
  });
}
export async function releases(context,id,input) {
  await authorize(context,'inventory.read');await reservationHeader({query},context,entityId(id));
  const page=validate.filters(input,'lines'),args=[...scopeArgs(context),id];
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_reservation_releases r WHERE ${own('r')} AND r.reservation_id = ?`,args);
  const {rows}=await query(`SELECT r.id,r.kind,r.reason,r.created_at AS createdAt,u.display_name AS createdByName FROM inventory_reservation_releases r JOIN users u ON u.tenant_id = r.tenant_id AND u.id = r.created_by WHERE ${own('r')} AND r.reservation_id = ? ORDER BY r.created_at DESC,r.id LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows.map(serialized),total:count[0].total,...page};
}
export async function releaseLines(context,id,input) {
  await authorize(context,'inventory.read');entityId(id);const page=validate.filters(input,'lines'),args=[...scopeArgs(context),id];
  const {rows:exists}=await query(`SELECT id FROM inventory_reservation_releases r WHERE ${own('r')} AND r.id = ?`,args);if(!exists.length)throw notFound();
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_reservation_release_lines l WHERE ${own('l')} AND l.release_id = ?`,args);
  const {rows}=await query(`SELECT l.id,l.allocation_id AS allocationId,a.reservation_line_id AS reservationLineId,a.layer_id AS layerId,a.pool_id AS poolId,l.quantity FROM inventory_reservation_release_lines l JOIN inventory_reservation_allocations a ON a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.id = l.allocation_id WHERE ${own('l')} AND l.release_id = ? ORDER BY a.allocation_number LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows,total:count[0].total,...page};
}
const issueFrom=`inventory_issues i JOIN inventory_reservations r ON r.tenant_id = i.tenant_id AND r.legal_entity_id = i.legal_entity_id AND r.id = i.reservation_id JOIN users u ON u.tenant_id = i.tenant_id AND u.id = i.created_by`;
const issueFields=`i.id,i.reference,i.reservation_id AS reservationId,r.reference AS reservationReference,i.dispatch_date AS dispatchDate,i.posting_date AS postingDate,i.period_id AS periodId,i.movement_type_id AS movementTypeId,i.description,i.currency,i.total_value AS totalValue,i.status,i.created_by AS createdBy,u.display_name AS createdByName,i.created_at AS createdAt`;
async function issueHeader(tx,context,id) {
  const {rows}=await tx.query(`SELECT ${issueFields} FROM ${issueFrom} WHERE ${own('i')} AND i.id = ?`,[...scopeArgs(context),id]);
  if(!rows.length)throw notFound();return {issue:serialized(rows[0])};
}
export async function getIssue(context,id){await authorize(context,'inventory.read');return issueHeader({query},context,entityId(id));}
export async function listIssues(context,input) {
  await authorize(context,'inventory.read');const page=validate.filters(input,'issues'),args=scopeArgs(context);let where=own('i');
  if(page.reservationId){where+=' AND i.reservation_id = ?';args.push(page.reservationId);}
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_issues i WHERE ${where}`,args);
  const {rows}=await query(`SELECT ${issueFields} FROM ${issueFrom} WHERE ${where} ORDER BY i.posting_date DESC,i.created_at DESC,i.id LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows.map(serialized),total:count[0].total,limit:page.limit,offset:page.offset};
}
export async function issueLines(context,id,input) {
  await authorize(context,'inventory.read');await issueHeader({query},context,entityId(id));const page=validate.filters(input,'lines'),args=[...scopeArgs(context),id];
  const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_issue_lines l WHERE ${own('l')} AND l.issue_id = ?`,args);
  const {rows}=await query(`SELECT l.id,l.line_number AS lineNumber,l.allocation_id AS allocationId,a.reservation_line_id AS reservationLineId,l.sku_id AS skuId,s.code AS skuCode,l.layer_id AS layerId,l.pool_id AS poolId,p.code AS poolCode,l.quantity,l.value,h.id AS receiptId,h.source_id AS sourceId,source.source_line_key AS sourceLineKey
    FROM inventory_issue_lines l JOIN inventory_reservation_allocations a ON a.tenant_id = l.tenant_id AND a.legal_entity_id = l.legal_entity_id AND a.id = l.allocation_id
    JOIN inventory_layers x ON x.tenant_id = l.tenant_id AND x.legal_entity_id = l.legal_entity_id AND x.id = l.layer_id
    JOIN stock_receipt_lines source ON source.tenant_id = x.tenant_id AND source.legal_entity_id = x.legal_entity_id AND source.id = x.receipt_line_id
    JOIN stock_receipts h ON h.tenant_id = source.tenant_id AND h.legal_entity_id = source.legal_entity_id AND h.id = source.receipt_id
    JOIN product_skus s ON s.tenant_id = l.tenant_id AND s.legal_entity_id = l.legal_entity_id AND s.id = l.sku_id
    JOIN inventory_pools p ON p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.id = l.pool_id
    WHERE ${own('l')} AND l.issue_id = ? ORDER BY l.line_number LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows,total:count[0].total,...page};
}
export async function postIssue(context,reservationId,body) {
  const id=entityId(reservationId),input=validate.issue(body);
  return entityWrite(context,'inventory.issue.post','inventory.issue.post',{id,...input},async tx=>{
    const scope=scopeArgs(context),hash=fingerprint({id,...input});
    const {rows:prior}=await tx.query('SELECT id,payload_hash AS hash,status FROM inventory_issues WHERE tenant_id = ? AND legal_entity_id = ? AND reference = ?',[...scope,input.reference]);
    if(prior.length){if(prior[0].hash!==hash||prior[0].status!=='POSTED')throw fail('SOURCE_CONFLICT','This dispatch reference already has different content.');return issueHeader(tx,context,prior[0].id);}
    const {reservation:r}=await reservationHeader(tx,context,id);
    if(r.status!=='ACTIVE')throw fail('INVALID_STATE','Only active reservations can be dispatched.');
    if(input.postingDate<r.reservationDate||input.dispatchDate<r.reservationDate)throw fail('INVALID_DISPATCH_DATE','Dispatch and posting dates cannot precede the reservation date.',422);
    const periodId=await period(tx,context,input.postingDate),currency=(await settings(tx,context)).baseCurrency;
    const selected=await selectOutstanding(tx,context,id,input.lines),stock=new Map();
    for(const l of selected){
      const k=`${l.skuId}:${l.poolId}`;if(stock.has(k))continue;
      const selection={warehouseId:r.warehouseId,skuId:l.skuId,toPoolId:r.destinationPoolId,quantity:l.quantity,postingDate:input.postingDate,movementTypeId:input.movementTypeId};
      await references(tx,context,selection,'ISSUE');
      const {rows:pool}=await tx.query('SELECT active FROM inventory_pools WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[...scope,l.poolId]);
      if(!pool[0]?.active)throw fail('INACTIVE_REFERENCE','The reserved source pool is inactive.');
      stock.set(k,new Map((await available(tx,context,selection,l.poolId)).map(b=>[b.layerId,b])));
    }
    const physical=new Map(),pools=new Map();
    for(const l of selected){
      const b=stock.get(`${l.skuId}:${l.poolId}`).get(l.layerId);
      if(!b||micro(b.onHandQuantity)<micro(l.quantity))throw fail('INSUFFICIENT_STOCK','A reserved source layer is unavailable on this posting date.');
      l.value=transferValue(l.quantity,b.onHandQuantity,b.value);
      b.onHandQuantity=decimal(micro(b.onHandQuantity)-micro(l.quantity));b.value=decimal(micro(b.value)-micro(l.value));
      for(const [map,key] of [[physical,l.layerId],[pools,`${l.layerId}:${l.poolId}`]]){
        if(!map.has(key))map.set(key,{...l,quantity:'0.000000',value:'0.000000'});
        const entry=map.get(key);entry.quantity=sumAmounts([entry.quantity,l.quantity]);entry.value=sumAmounts([entry.value,l.value]);
      }
    }
    const issueId=randomUUID(),eventId=randomUUID(),totalValue=sumAmounts(selected.map(l=>l.value));
    await insert(tx,'inventory_issues',['id','tenant_id','legal_entity_id','reservation_id','reference','payload_hash','dispatch_date','posting_date','period_id','movement_type_id','description','currency','total_value','created_by'],[[issueId,...scope,id,input.reference,hash,input.dispatchDate,input.postingDate,periodId,input.movementTypeId,input.description,currency,totalValue,context.identity.userId]]);
    await insert(tx,'inventory_issue_lines',['id','tenant_id','legal_entity_id','issue_id','allocation_id','reservation_id','line_number','warehouse_id','sku_id','layer_id','pool_id','quantity','value'],selected.map((l,i)=>[randomUUID(),...scope,issueId,l.id,id,i+1,l.warehouseId,l.skuId,l.layerId,l.poolId,l.quantity,l.value]));
    await tx.query("INSERT INTO inventory_events (id,tenant_id,legal_entity_id,kind,issue_id) VALUES (?,?,?,'ISSUE',?)",[eventId,...scope,issueId]);
    await insert(tx,'inventory_physical_ledger',['id','tenant_id','legal_entity_id','warehouse_id','sku_id','layer_id','event_id','quantity','value'],[...physical.values()].map(l=>[randomUUID(),...scope,l.warehouseId,l.skuId,l.layerId,eventId,`-${l.quantity}`,`-${l.value}`]));
    await insert(tx,'inventory_pool_ledger',['id','tenant_id','legal_entity_id','warehouse_id','sku_id','layer_id','event_id','pool_id','quantity','value'],[...pools.values()].map(l=>[randomUUID(),...scope,l.warehouseId,l.skuId,l.layerId,eventId,l.poolId,`-${l.quantity}`,`-${l.value}`]));
    // Release the consumed part of this reservation before lowering stock. SQL
    // projection guards still protect every other outstanding allocation.
    for(const l of selected)await tx.query('UPDATE inventory_reservation_allocations SET issued_quantity = issued_quantity + ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[l.quantity,...scope,l.id]);
    for(const [table,map,pool] of [['inventory_balances',physical,false],['inventory_pool_balances',pools,true]])for(const l of [...map.values()].sort((a,b)=>a.skuId.localeCompare(b.skuId)||a.layerId.localeCompare(b.layerId)||a.poolId.localeCompare(b.poolId)))
      await tx.query(`UPDATE ${table} SET quantity = quantity - ?,value = value - ? WHERE tenant_id = ? AND legal_entity_id = ? AND warehouse_id = ? AND sku_id = ? AND layer_id = ?${pool?' AND pool_id = ?':''}`,[l.quantity,l.value,...scope,l.warehouseId,l.skuId,l.layerId,...(pool?[l.poolId]:[])]);
    await tx.query("UPDATE inventory_issues SET status = 'POSTED' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,issueId]);
    await finishReservation(tx,context,id);
    await audit(tx,context,'inventory.issue.posted',issueId,{reservationId:id,reference:input.reference,eventId,totalValue,currency,allocationCount:selected.length});
    return issueHeader(tx,context,issueId);
  });
}
