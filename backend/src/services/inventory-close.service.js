import { randomUUID } from 'node:crypto';
import {reopenCalendar} from './vat-refund-guards.js';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { entityId, object } from '../validators/auth.validators.js';
import * as validate from '../validators/inventory-close.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { buildReport, periodDetails, snapshotHeader, accountMapping, fields, sqlFields } from './inventory-report.service.js';

const fail=(code,message,status=409)=>new AppError(status,code,message);
const own=a=>`${a}.tenant_id = ? AND ${a}.legal_entity_id = ?`;
const safeSnapshot=s=>{const {financial,...summary}=s.summary;return {...s,summary:{...summary,blockers:summary.blockers.filter(b=>!b.startsWith('GL_'))}};};
async function insert(tx,table,columns,rows){for(let start=0;start<rows.length;start+=250){const batch=rows.slice(start,start+250);await tx.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${batch.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')}`,batch.flat());}}
export async function getMapping(context,input){object(input,[]);await authorize(context,'inventory.reconciliation.read');return {items:await accountMapping({query},context)};}
export async function setMapping(context,body){
 const input=validate.mapping(body);return entityWrite(context,'inventory.reconciliation.configure','inventory.reconciliation.configure',input,async tx=>{
  await authorize(context,'accounting.configure',tx);
  const scope=scopeArgs(context);
  if((await tx.query('SELECT period_id FROM inventory_period_controls WHERE tenant_id = ? AND legal_entity_id = ? AND (current_snapshot_id IS NOT NULL OR pending_snapshot_id IS NOT NULL) LIMIT 1',scope)).rows.length)throw fail('MAPPING_LOCKED','Reject pending reviews and reopen all approved stock closes before changing mapped accounts.');
  for(let offset=0;offset<input.accountIds.length;offset+=500){const ids=input.accountIds.slice(offset,offset+500);const {rows}=await tx.query(`SELECT id,account_type AS type,active FROM accounts WHERE tenant_id = ? AND legal_entity_id = ? AND id IN (${ids.map(()=>'?').join(',')})`,[...scope,...ids]);
   if(rows.length!==ids.length||rows.some(r=>r.type!=='ASSET'||!r.active))throw fail('ACCOUNT_UNAVAILABLE','Select active asset accounts in this company.',422);
  }
  const before=await accountMapping(tx,context);
  await tx.query('DELETE FROM inventory_reconciliation_accounts WHERE tenant_id = ? AND legal_entity_id = ?',scope);
  await insert(tx,'inventory_reconciliation_accounts',['tenant_id','legal_entity_id','account_id'],input.accountIds.map(id=>[...scope,id]));
  await audit(tx,context,'inventory.reconciliation.configured',context.entityId,{beforeAccountIds:before.map(a=>a.id),accountIds:input.accountIds,reason:input.reason});
  return {items:await accountMapping(tx,context)};
 });
}
async function sequence(tx,context,p){
 const scope=scopeArgs(context);
 const {rows:earlier}=await tx.query(`SELECT p.id FROM inventory_periods p JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
  LEFT JOIN inventory_period_controls c ON c.tenant_id = p.tenant_id AND c.legal_entity_id = p.legal_entity_id AND c.period_id = p.id WHERE ${own('p')} AND a.start_date < ? AND (p.status <> 'CLOSED' OR c.current_snapshot_id IS NULL) LIMIT 1`,[...scope,p.startDate]);
 if(earlier.length)throw fail('EARLIER_PERIOD_OPEN','Approve all earlier inventory periods before closing this period.');
 const {rows:reopens}=await tx.query(`SELECT r.id FROM inventory_period_reopens r JOIN inventory_periods p ON p.tenant_id = r.tenant_id AND p.legal_entity_id = r.legal_entity_id AND p.id = r.period_id
  JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id WHERE ${own('r')} AND r.status = 'REQUESTED' AND a.start_date <= ? LIMIT 1`,[...scope,p.startDate]);
 if(reopens.length)throw fail('REOPEN_PENDING','Resolve the pending reopen request before preparing or approving dependent closes.');
}
export async function prepare(context,id,body){
 id=entityId(id);const input=validate.reason(body);return entityWrite(context,'inventory.period.prepare','inventory.period.prepare',{id,...input},async tx=>{
  await authorize(context,'inventory.reconciliation.read',tx);const p=await periodDetails(tx,context,id),scope=scopeArgs(context);
  if(p.status!=='OPEN')throw fail('INVALID_STATE','Only an open inventory period can be prepared.');await sequence(tx,context,p);
  const report=await buildReport(tx,context,p);
  if(report.summary.blockers.length)throw fail('RECONCILIATION_FAILED',`Resolve stock close checks: ${report.summary.blockers.join(', ')}.`);
  const {rows:v}=await tx.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM inventory_period_snapshots WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ?',[...scope,id]);
  const snapshotId=randomUUID(),version=v[0].version;
  await insert(tx,'inventory_period_snapshots',['id','tenant_id','legal_entity_id','period_id','version','base_snapshot_id','content_hash','line_count','summary','reason','prepared_by'],[[snapshotId,...scope,id,version,report.summary.baseSnapshotId,report.contentHash,report.rows.length,JSON.stringify(report.summary),input.reason,context.identity.userId]]);
  const identities=['warehouseId','warehouseCode','skuId','skuCode','familyId','familyCode','unitId','unitCode','layerId','poolId','poolCode','receiptLineId','receiptId','sourceId','sourceLineKey'];
  await insert(tx,'inventory_snapshot_lines',['id','tenant_id','legal_entity_id','snapshot_id','grain','grain_key','warehouse_id','sku_id','family_id','unit_id','layer_id','pool_id','identity_data',...sqlFields],report.rows.map(r=>[randomUUID(),...scope,snapshotId,r.grain,r.grainKey,r.warehouseId,r.skuId,r.familyId,r.unitId,r.layerId,r.poolId,JSON.stringify(Object.fromEntries(identities.map(k=>[k,r[k]]))),...fields.map(k=>r[k])]));
  await insert(tx,'inventory_snapshot_events',['tenant_id','legal_entity_id','snapshot_id','event_id'],report.eventIds.map(eventId=>[...scope,snapshotId,eventId]));
  await tx.query("UPDATE inventory_period_snapshots SET status = 'IN_REVIEW' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,snapshotId]);
  const {rows:c}=await tx.query('SELECT period_id FROM inventory_period_controls WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ?',[...scope,id]);
  if(c.length)await tx.query('UPDATE inventory_period_controls SET pending_snapshot_id = ? WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ?',[snapshotId,...scope,id]);
  else await insert(tx,'inventory_period_controls',['tenant_id','legal_entity_id','period_id','pending_snapshot_id'],[[...scope,id,snapshotId]]);
  await tx.query("UPDATE inventory_periods SET status = 'IN_REVIEW' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,id]);
  await audit(tx,context,'inventory.period.prepared',id,{snapshotId,version,contentHash:report.contentHash,reason:input.reason});
  return {snapshot:safeSnapshot(await snapshotHeader(tx,context,snapshotId))};
 });
}
export async function review(context,id,action,body){
 id=entityId(id);const input=validate.reason(body);if(!['approve','reject'].includes(action))throw notFound();
 return entityWrite(context,'inventory.period.approve',`inventory.snapshot.${action}`,{id,...input},async tx=>{
  await authorize(context,'inventory.reconciliation.read',tx);const s=await snapshotHeader(tx,context,id),p=await periodDetails(tx,context,s.periodId),scope=scopeArgs(context);
  if(s.status!=='IN_REVIEW'||p.status!=='IN_REVIEW'||p.pendingSnapshotId!==id)throw fail('INVALID_STATE','This snapshot is no longer awaiting review.');
  if(action==='approve'){
   if(s.preparedBy===context.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','Another authorized user must approve this close.',403);
   await sequence(tx,context,p);const report=await buildReport(tx,context,p);
   if(report.summary.blockers.length||report.contentHash!==s.contentHash)throw fail('SNAPSHOT_STALE','The report changed or no longer reconciles. Reject this version and prepare a new one.');
  }
  await tx.query('UPDATE inventory_period_snapshots SET status = ?,reviewed_by = ?,reviewed_at = UTC_TIMESTAMP(),review_reason = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[action==='approve'?'APPROVED':'REJECTED',context.identity.userId,input.reason,...scope,id]);
  await tx.query('UPDATE inventory_period_controls SET current_snapshot_id = ?,pending_snapshot_id = NULL WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ?',[action==='approve'?id:null,...scope,p.id]);
  await tx.query('UPDATE inventory_periods SET status = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[action==='approve'?'CLOSED':'OPEN',...scope,p.id]);
  await audit(tx,context,`inventory.period.${action==='approve'?'closed':'review_rejected'}`,p.id,{snapshotId:id,version:s.version,reason:input.reason});
  return {snapshot:safeSnapshot(await snapshotHeader(tx,context,id))};
 });
}
export async function getSnapshot(context,id){await authorize(context,'inventory.read');return {snapshot:safeSnapshot(await snapshotHeader({query},context,entityId(id)))};}
export async function listSnapshots(context,id,input){
 await authorize(context,'inventory.read');id=entityId(id);await periodDetails({query},context,id);const page=validate.pagination(input),args=[...scopeArgs(context),id];
 const {rows:count}=await query('SELECT COUNT(*) AS total FROM inventory_period_snapshots WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ?',args);
 const {rows}=await query(`SELECT s.id,s.version,s.status,s.prepared_by AS preparedBy,u.display_name AS preparedByName,s.prepared_at AS preparedAt,s.reason,s.content_hash AS contentHash,c.current_snapshot_id = s.id AS isCurrent FROM inventory_period_snapshots s JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.prepared_by
  LEFT JOIN inventory_period_controls c ON c.tenant_id = s.tenant_id AND c.legal_entity_id = s.legal_entity_id AND c.period_id = s.period_id
  WHERE ${own('s')} AND s.period_id = ? ORDER BY s.version DESC LIMIT ${page.limit} OFFSET ${page.offset}`,args);
 return {items:rows.map(r=>({...r,isCurrent:Boolean(r.isCurrent),watermark:r.status==='APPROVED'?(r.isCurrent?'APPROVED':'SUPERSEDED'):r.status})),total:count[0].total,...page};
}
export async function closeStatus(context,id){await authorize(context,'inventory.read');return {period:await periodDetails({query},context,entityId(id))};}
async function dependents(tx,context,p){
 const {rows}=await tx.query(`SELECT p.id AS periodId,a.code,a.start_date AS startDate,a.end_date AS endDate,a.status AS accountingStatus,p.status,c.current_snapshot_id AS snapshotId FROM inventory_periods p
  JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
  LEFT JOIN inventory_period_controls c ON c.tenant_id = p.tenant_id AND c.legal_entity_id = p.legal_entity_id AND c.period_id = p.id WHERE ${own('p')} AND a.start_date >= ? ORDER BY a.start_date,p.id`,[...scopeArgs(context),p.startDate]);
 if(rows.some(r=>r.status==='IN_REVIEW'))throw fail('DEPENDENT_REVIEW_PENDING','Reject dependent pending reviews before requesting a reopen.');
 return rows.filter(r=>r.status==='CLOSED').map(r=>({...r,accountingClosed:r.accountingStatus==='CLOSED'}));
}
async function reopenHeader(tx,context,id){
 const {rows}=await tx.query(`SELECT r.id,r.period_id AS periodId,r.status,r.reason,r.requested_by AS requestedBy,u.display_name AS requestedByName,r.requested_at AS requestedAt,
  r.reviewed_by AS reviewedBy,v.display_name AS reviewedByName,r.reviewed_at AS reviewedAt,r.review_reason AS reviewReason FROM inventory_period_reopens r JOIN users u ON u.tenant_id = r.tenant_id AND u.id = r.requested_by LEFT JOIN users v ON v.tenant_id = r.tenant_id AND v.id = r.reviewed_by WHERE ${own('r')} AND r.id = ?`,[...scopeArgs(context),id]);
 if(!rows.length)throw notFound();return Object.fromEntries(Object.entries(rows[0]).map(([k,v])=>[k,v instanceof Date?v.toISOString():v]));
}
export async function requestReopen(context,id,body){
 id=entityId(id);const input=validate.reason(body);return entityWrite(context,'inventory.period.reopen','inventory.period.reopen',{id,...input},async tx=>{
  await authorize(context,'accounting.period.close',tx);const p=await periodDetails(tx,context,id),scope=scopeArgs(context);
  if(p.status!=='CLOSED'||!p.currentSnapshotId)throw fail('INVALID_STATE','Only an approved closed inventory period can be reopened.');
  if((await tx.query("SELECT id FROM inventory_period_reopens WHERE tenant_id = ? AND legal_entity_id = ? AND status = 'REQUESTED' LIMIT 1",scope)).rows.length)throw fail('REOPEN_PENDING','Resolve the existing reopen request first.');
  const affected=await dependents(tx,context,p);if(affected.some(r=>!r.snapshotId))throw fail('MISSING_SNAPSHOT','Every dependent close needs an approved snapshot.');
  const reopenId=randomUUID();await insert(tx,'inventory_period_reopens',['id','tenant_id','legal_entity_id','period_id','reason','requested_by'],[[reopenId,...scope,id,input.reason,context.identity.userId]]);
  await insert(tx,'inventory_reopen_periods',['id','tenant_id','legal_entity_id','reopen_id','period_id','snapshot_id','accounting_closed'],affected.map(r=>[randomUUID(),...scope,reopenId,r.periodId,r.snapshotId,r.accountingClosed]));
  await audit(tx,context,'inventory.period.reopen_requested',id,{reopenId,affectedPeriodIds:affected.map(r=>r.periodId),reason:input.reason});return {reopen:await reopenHeader(tx,context,reopenId)};
 });
}
export async function reviewReopen(context,id,action,body){
 id=entityId(id);const input=validate.reason(body);if(!['approve','reject'].includes(action))throw notFound();
 return entityWrite(context,'inventory.period.approve',`inventory.reopen.${action}`,{id,...input},async tx=>{
  await authorize(context,'accounting.period.close',tx);const r=await reopenHeader(tx,context,id),scope=scopeArgs(context);
  if(r.status!=='REQUESTED')throw fail('INVALID_STATE','Only a pending reopen request can be reviewed.');
  let affected=[];
  if(action==='approve'){
   if(r.requestedBy===context.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','Another authorized user must approve reopening.',403);
   const p=await periodDetails(tx,context,r.periodId);affected=await dependents(tx,context,p);
   const {rows:plan}=await tx.query('SELECT period_id AS periodId,snapshot_id AS snapshotId,accounting_closed AS accountingClosed FROM inventory_reopen_periods WHERE tenant_id = ? AND legal_entity_id = ? AND reopen_id = ? ORDER BY period_id',[...scope,id]);
   const shape=rows=>rows.map(x=>({periodId:x.periodId,snapshotId:x.snapshotId,accountingClosed:Boolean(x.accountingClosed)})).sort((a,b)=>a.periodId.localeCompare(b.periodId));
   if(JSON.stringify(shape(affected))!==JSON.stringify(shape(plan)))throw fail('REOPEN_STALE','Dependent periods changed. Reject this request and create another.');
  }
  await tx.query('UPDATE inventory_period_reopens SET status = ?,reviewed_by = ?,reviewed_at = UTC_TIMESTAMP(),review_reason = ? WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?',[action==='approve'?'APPROVED':'REJECTED',context.identity.userId,input.reason,...scope,id]);
  for(const p of affected){
   if(p.accountingClosed){const calendar=(await tx.query('SELECT accounting_period_id AS id FROM inventory_periods WHERE tenant_id=? AND legal_entity_id=? AND id=?',[...scope,p.periodId])).rows[0];await reopenCalendar(tx,context,calendar.id);}
   await tx.query('UPDATE inventory_period_controls SET current_snapshot_id = NULL WHERE tenant_id = ? AND legal_entity_id = ? AND period_id = ?',[...scope,p.periodId]);
   await tx.query("UPDATE inventory_periods SET status = 'OPEN' WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?",[...scope,p.periodId]);
   if(p.accountingClosed)await tx.query("UPDATE accounting_periods SET status = 'OPEN',closed_at = NULL WHERE tenant_id = ? AND legal_entity_id = ? AND id = (SELECT accounting_period_id FROM inventory_periods WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?)",[...scope,...scope,p.periodId]);
  }
  await audit(tx,context,`inventory.period.reopen_${action==='approve'?'approved':'rejected'}`,r.periodId,{reopenId:id,affectedPeriodIds:affected.map(r=>r.periodId),reason:input.reason});
  return {reopen:await reopenHeader(tx,context,id)};
 });
}
export async function listReopens(context,id,input){
 await authorize(context,'inventory.read');id=entityId(id);await periodDetails({query},context,id);const page=validate.pagination(input),args=[...scopeArgs(context),id];
 const where='tenant_id = ? AND legal_entity_id = ? AND period_id = ?';
 const {rows:count}=await query(`SELECT COUNT(*) AS total FROM inventory_period_reopens WHERE ${where}`,args);
 const {rows}=await query(`SELECT id,reason,status,requested_by AS requestedBy,requested_at AS requestedAt FROM inventory_period_reopens WHERE ${where} ORDER BY requested_at DESC,id LIMIT ${page.limit} OFFSET ${page.offset}`,args);
 return {items:rows,total:count[0].total,...page};
}
export async function getReopen(context,id){await authorize(context,'inventory.read');return {reopen:await reopenHeader({query},context,entityId(id))};}
export async function reopenPeriods(context,id,input){
 await authorize(context,'inventory.read');id=entityId(id);await reopenHeader({query},context,id);const page=validate.pagination(input),args=[...scopeArgs(context),id];
 const {rows:count}=await query('SELECT COUNT(*) AS total FROM inventory_reopen_periods WHERE tenant_id = ? AND legal_entity_id = ? AND reopen_id = ?',args);
 const {rows}=await query(`SELECT l.id,l.period_id AS periodId,l.snapshot_id AS snapshotId,l.accounting_closed AS accountingClosed,a.code,a.start_date AS startDate,a.end_date AS endDate FROM inventory_reopen_periods l
  JOIN inventory_periods p ON p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.id = l.period_id JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
  WHERE ${own('l')} AND l.reopen_id = ? ORDER BY a.start_date LIMIT ${page.limit} OFFSET ${page.offset}`,args);
 return {items:rows.map(r=>({...r,accountingClosed:Boolean(r.accountingClosed)})),total:count[0].total,...page};
}
