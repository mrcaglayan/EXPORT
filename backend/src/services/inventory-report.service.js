import { withTransaction } from '../db/query.js';
import { fingerprint } from '../shared/idempotency.js';
import { authorize, scopeArgs, notFound } from './entity-context.js';
import * as validate from '../validators/inventory-close.validators.js';

export const signed = value => { const negative = value < 0n, n = negative ? -value : value; return `${negative ? '-' : ''}${n / 1000000n}.${String(n % 1000000n).padStart(6, '0')}`; };
export const micro = value => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(`${whole}${fraction.padEnd(6, '0')}`); };
const own = a => `${a}.tenant_id = ? AND ${a}.legal_entity_id = ?`;
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
export const eventJoins = `JOIN inventory_events e ON e.tenant_id = l.tenant_id AND e.legal_entity_id = l.legal_entity_id AND e.id = l.event_id
 LEFT JOIN stock_receipts r ON r.tenant_id = e.tenant_id AND r.legal_entity_id = e.legal_entity_id AND r.id = e.receipt_id
 LEFT JOIN inventory_reallocations t ON t.tenant_id = e.tenant_id AND t.legal_entity_id = e.legal_entity_id AND t.id = e.reallocation_id
 LEFT JOIN inventory_issues i ON i.tenant_id = e.tenant_id AND i.legal_entity_id = e.legal_entity_id AND i.id = e.issue_id
 LEFT JOIN inventory_corrections c ON c.tenant_id = e.tenant_id AND c.legal_entity_id = e.legal_entity_id AND c.id = e.correction_id`;
export const eventDate = 'e.posting_date';
export async function periodDetails(tx, context, id) {
 const { rows } = await tx.query(`SELECT p.id,p.status,p.accounting_period_id AS accountingPeriodId,a.code,a.start_date AS startDate,a.end_date AS endDate,a.status AS accountingStatus,
  c.current_snapshot_id AS currentSnapshotId,c.pending_snapshot_id AS pendingSnapshotId FROM inventory_periods p
  JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
  LEFT JOIN inventory_period_controls c ON c.tenant_id = p.tenant_id AND c.legal_entity_id = p.legal_entity_id AND c.period_id = p.id WHERE ${own('p')} AND p.id = ?`, [...scopeArgs(context), id]);
 if (!rows.length) throw notFound(); return rows[0];
}
const fields = ['openingQuantity','openingValue','incomingQuantity','incomingValue','outgoingQuantity','outgoingValue','closingQuantity','closingValue','reservedQuantity'];
const sqlFields = ['opening_quantity','opening_value','incoming_quantity','incoming_value','outgoing_quantity','outgoing_value','closing_quantity','closing_value','reserved_quantity'];
export { fields, sqlFields };
export async function snapshotRows(tx, context, id) {
 const { rows } = await tx.query(`SELECT grain,grain_key AS grainKey,identity_data AS identityData,${sqlFields.map((f,i)=>`${f} AS ${fields[i]}`).join(',')} FROM inventory_snapshot_lines WHERE tenant_id = ? AND legal_entity_id = ? AND snapshot_id = ? ORDER BY grain,grain_key`, [...scopeArgs(context), id]);
 return rows.map(row => { const { identityData, ...numbers } = row; return { ...json(identityData), ...numbers, availableQuantity: signed(micro(row.closingQuantity)-micro(row.reservedQuantity)) }; });
}
export async function snapshotHeader(tx, context, id) {
 const { rows } = await tx.query(`SELECT s.id,s.period_id AS periodId,s.version,s.base_snapshot_id AS baseSnapshotId,s.status,s.content_hash AS contentHash,s.line_count AS lineCount,s.summary,s.reason,
  s.prepared_by AS preparedBy,u.display_name AS preparedByName,s.prepared_at AS preparedAt,s.reviewed_by AS reviewedBy,v.display_name AS reviewedByName,s.reviewed_at AS reviewedAt,s.review_reason AS reviewReason,
  c.current_snapshot_id = s.id AS isCurrent FROM inventory_period_snapshots s JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.prepared_by
  LEFT JOIN users v ON v.tenant_id = s.tenant_id AND v.id = s.reviewed_by LEFT JOIN inventory_period_controls c ON c.tenant_id = s.tenant_id AND c.legal_entity_id = s.legal_entity_id AND c.period_id = s.period_id
  WHERE ${own('s')} AND s.id = ?`, [...scopeArgs(context), id]);
 if (!rows.length) throw notFound(); const s=rows[0];
 return { ...s, summary:json(s.summary), isCurrent:Boolean(s.isCurrent), preparedAt:s.preparedAt instanceof Date?s.preparedAt.toISOString():s.preparedAt, reviewedAt:s.reviewedAt instanceof Date?s.reviewedAt.toISOString():s.reviewedAt,
  watermark:s.status==='APPROVED'?(s.isCurrent?'APPROVED':'SUPERSEDED'):s.status };
}
export async function accountMapping(tx, context) {
 return (await tx.query(`SELECT a.id,a.code,a.name,a.active,a.account_type AS accountType FROM inventory_reconciliation_accounts m JOIN accounts a
 ON a.tenant_id = m.tenant_id AND a.legal_entity_id = m.legal_entity_id AND a.id = m.account_id WHERE ${own('m')} ORDER BY a.id`,scopeArgs(context))).rows.map(r=>({...r,active:Boolean(r.active)}));
}
export async function buildReport(tx, context, period) {
 const scope=scopeArgs(context), blockers=[];
 const {rows:config}=await tx.query('SELECT base_currency AS currency FROM accounting_settings WHERE tenant_id = ? AND legal_entity_id = ?',scope);
 const currency=config[0]?.currency??null;if(currency!=='TRY')blockers.push('TRY_BASE_CURRENCY_REQUIRED');
 const {rows:bases}=await tx.query(`SELECT s.id,a.end_date AS endDate FROM inventory_period_controls c JOIN inventory_periods p ON p.tenant_id = c.tenant_id AND p.legal_entity_id = c.legal_entity_id AND p.id = c.period_id
  JOIN accounting_periods a ON a.tenant_id = p.tenant_id AND a.legal_entity_id = p.legal_entity_id AND a.id = p.accounting_period_id
  JOIN inventory_period_snapshots s ON s.tenant_id = c.tenant_id AND s.legal_entity_id = c.legal_entity_id AND s.id = c.current_snapshot_id
  WHERE ${own('c')} AND a.end_date < ? AND p.status = 'CLOSED' AND s.status = 'APPROVED' ORDER BY a.end_date DESC LIMIT 1`,[...scope,period.startDate]);
 const base=bases[0],balances=new Map();
 if(base)for(const row of await snapshotRows(tx,context,base.id))balances.set(`${row.grain}:${row.grainKey}`,{...row,...Object.fromEntries(fields.map(f=>[f,0n])),openingQuantity:micro(row.closingQuantity),openingValue:micro(row.closingValue)});
 const {rows:identityRows}=await tx.query(`SELECT x.id AS layerId,x.warehouse_id AS warehouseId,w.code AS warehouseCode,x.sku_id AS skuId,s.code AS skuCode,s.family_id AS familyId,f.code AS familyCode,s.base_unit_id AS unitId,u.code AS unitCode,
  x.receipt_line_id AS receiptLineId,h.id AS receiptId,h.source_id AS sourceId,l.source_line_key AS sourceLineKey FROM inventory_layers x
  JOIN warehouses w ON w.tenant_id = x.tenant_id AND w.legal_entity_id = x.legal_entity_id AND w.id = x.warehouse_id
  JOIN product_skus s ON s.tenant_id = x.tenant_id AND s.legal_entity_id = x.legal_entity_id AND s.id = x.sku_id
  JOIN product_families f ON f.tenant_id = s.tenant_id AND f.legal_entity_id = s.legal_entity_id AND f.id = s.family_id
  JOIN unit_of_measure u ON u.tenant_id = s.tenant_id AND u.legal_entity_id = s.legal_entity_id AND u.id = s.base_unit_id
  JOIN stock_receipt_lines l ON l.tenant_id = x.tenant_id AND l.legal_entity_id = x.legal_entity_id AND l.id = x.receipt_line_id
  JOIN stock_receipts h ON h.tenant_id = l.tenant_id AND h.legal_entity_id = l.legal_entity_id AND h.id = l.receipt_id WHERE ${own('x')}`,scope);
 const identities=new Map(identityRows.map(r=>[r.layerId,r])),poolCodes=new Map((await tx.query('SELECT id,code FROM inventory_pools WHERE tenant_id = ? AND legal_entity_id = ?',scope)).rows.map(r=>[r.id,r.code]));
 const eventIds=new Set();
 for(const [grain,table]of [['PHYSICAL','inventory_physical_ledger'],['POOL','inventory_pool_ledger']]){
  const {rows}=await tx.query(`SELECT l.layer_id AS layerId,${grain==='POOL'?'l.pool_id':'NULL'} AS poolId,l.quantity,l.value,e.id AS eventId,${eventDate} AS postingDate FROM ${table} l ${eventJoins}
    WHERE ${own('l')} AND ${eventDate} > ? AND ${eventDate} <= ? ORDER BY ${eventDate},e.id,l.id`,[...scope,base?.endDate??'1000-01-01',period.endDate]);
  for(const move of rows){
   const grainKey=`${move.layerId}:${move.poolId??'PHYSICAL'}`,key=`${grain}:${grainKey}`;
   if(!balances.has(key))balances.set(key,{...identities.get(move.layerId),grain,grainKey,poolId:move.poolId,poolCode:poolCodes.get(move.poolId)??null,...Object.fromEntries(fields.map(f=>[f,0n]))});
   const row=balances.get(key),q=micro(move.quantity),v=micro(move.value);
   if(move.postingDate<period.startDate){row.openingQuantity+=q;row.openingValue+=v;}
   else {eventIds.add(move.eventId);if(q>0n||(q===0n&&v>0n)){row.incomingQuantity+=q;row.incomingValue+=v;}else{row.outgoingQuantity-=q;row.outgoingValue-=v;}}
  }
 }
 // Releases have no editable business date: their recorded UTC timestamp is the
 // effective release time. Reservation and issue business dates remain explicit.
 const {rows:reserved}=await tx.query(`SELECT a.id,a.layer_id AS layerId,a.pool_id AS poolId,a.quantity,
  COALESCE((SELECT SUM(l.quantity) FROM inventory_issue_lines l JOIN inventory_issues i ON i.tenant_id = l.tenant_id AND i.legal_entity_id = l.legal_entity_id AND i.id = l.issue_id WHERE l.tenant_id = a.tenant_id AND l.legal_entity_id = a.legal_entity_id AND l.allocation_id = a.id AND i.status = 'POSTED' AND i.posting_date <= ?),0) AS issued,
  COALESCE((SELECT SUM(l.quantity) FROM inventory_reservation_release_lines l JOIN inventory_reservation_releases r ON r.tenant_id = l.tenant_id AND r.legal_entity_id = l.legal_entity_id AND r.id = l.release_id WHERE l.tenant_id = a.tenant_id AND l.legal_entity_id = a.legal_entity_id AND l.allocation_id = a.id AND r.status = 'POSTED' AND UNIX_TIMESTAMP(r.created_at) < TIMESTAMPDIFF(SECOND,'1970-01-01',DATE_ADD(?,INTERVAL 1 DAY))),0) AS released
  FROM inventory_reservation_allocations a JOIN inventory_reservations r ON r.tenant_id = a.tenant_id AND r.legal_entity_id = a.legal_entity_id AND r.id = a.reservation_id
  WHERE ${own('a')} AND r.status <> 'ASSEMBLING' AND r.reservation_date <= ? ORDER BY a.id`,[period.endDate,period.endDate,...scope,period.endDate]);
 for(const r of reserved){const quantity=micro(r.quantity)-micro(r.issued)-micro(r.released);
  for(const key of [`PHYSICAL:${r.layerId}:PHYSICAL`,`POOL:${r.layerId}:${r.poolId}`]){
   const row=balances.get(key);if(row)row.reservedQuantity+=quantity;else if(quantity!==0n)blockers.push('RESERVATION_WITHOUT_STOCK');
  }
 }
 const rows=[...balances.values()].sort((a,b)=>a.grain.localeCompare(b.grain)||a.grainKey.localeCompare(b.grainKey));
 let stockValue=0n;const poolTotals=new Map();
 for(const row of rows){row.closingQuantity=row.openingQuantity+row.incomingQuantity-row.outgoingQuantity;row.closingValue=row.openingValue+row.incomingValue-row.outgoingValue;
  if(row.openingQuantity<0n||row.openingValue<0n||row.closingValue<0n||row.reservedQuantity<0n||row.closingQuantity<row.reservedQuantity)blockers.push('INVALID_HISTORICAL_STOCK');
  if(row.grain==='PHYSICAL')stockValue+=row.closingValue;
  else {const old=poolTotals.get(row.layerId)??[0n,0n,0n];poolTotals.set(row.layerId,[old[0]+row.closingQuantity,old[1]+row.closingValue,old[2]+row.reservedQuantity]);}
 }
 for(const row of rows.filter(r=>r.grain==='PHYSICAL')){
  const p=poolTotals.get(row.layerId)??[0n,0n,0n];if(p[0]!==row.closingQuantity||p[1]!==row.closingValue||p[2]!==row.reservedQuantity)blockers.push('POOL_PHYSICAL_MISMATCH');
 }
 // Compare current projections to the complete immutable ledger independently
 // of the period report and its preceding snapshot.
 for(const [table,ledger,pool]of [['inventory_balances','inventory_physical_ledger',false],['inventory_pool_balances','inventory_pool_ledger',true]]){
  const {rows:bad}=await tx.query(`WITH totals AS (SELECT l.layer_id${pool?',l.pool_id':''},SUM(l.quantity) AS quantity,SUM(l.value) AS value FROM ${ledger} l WHERE ${own('l')} GROUP BY l.layer_id${pool?',l.pool_id':''})
   SELECT b.layer_id FROM ${table} b LEFT JOIN totals l ON l.layer_id = b.layer_id ${pool?'AND l.pool_id = b.pool_id':''}
   WHERE ${own('b')} AND (b.quantity <> COALESCE(l.quantity,0) OR b.value <> COALESCE(l.value,0)) LIMIT 1`,[...scope,...scope]);
  if(bad.length)blockers.push('PROJECTION_MISMATCH');
 }
 const {rows:pending}=await tx.query(`SELECT id FROM posting_requests WHERE tenant_id = ? AND legal_entity_id = ? AND status <> 'POSTED' AND period_id IN (SELECT id FROM accounting_periods WHERE tenant_id = ? AND legal_entity_id = ? AND start_date <= ?) LIMIT 1`,[...scope,...scope,period.endDate]);
 if(pending.length)blockers.push('UNPOSTED_REQUESTS');
 if((await tx.query("SELECT id FROM journals WHERE tenant_id = ? AND legal_entity_id = ? AND status <> 'POSTED' AND posting_date <= ? LIMIT 1",[...scope,period.endDate])).rows.length)blockers.push('UNPOSTED_JOURNALS');
 for(const [table,status]of [['stock_receipts','ASSEMBLING'],['inventory_issues','ASSEMBLING'],['inventory_reallocations','EXECUTING'],['inventory_reservations','ASSEMBLING'],['inventory_reservation_releases','ASSEMBLING'],['inventory_corrections','POSTING'],['inventory_corrections','ASSEMBLING']]){
  if((await tx.query(`SELECT id FROM ${table} WHERE tenant_id = ? AND legal_entity_id = ? AND status = ? LIMIT 1`,[...scope,status])).rows.length)blockers.push('INCOMPLETE_STOCK_EVENT');
 }
 const accounts=await accountMapping(tx,context);let glValue=0n;const journalIds=new Set();
 const {rows:gl}=await tx.query(`SELECT j.id,l.account_id AS accountId,SUM(l.debit-l.credit) AS value FROM journals j JOIN journal_lines l ON l.tenant_id = j.tenant_id AND l.legal_entity_id = j.legal_entity_id AND l.journal_id = j.id
  JOIN inventory_reconciliation_accounts m ON m.tenant_id = l.tenant_id AND m.legal_entity_id = l.legal_entity_id AND m.account_id = l.account_id
  WHERE ${own('j')} AND j.status = 'POSTED' AND j.posting_date <= ? GROUP BY j.id,l.account_id ORDER BY j.id,l.account_id`,[...scope,period.endDate]);
 for(const r of gl){glValue+=micro(r.value);journalIds.add(r.id);}
 const financial={status:!accounts.length?'NOT_CONFIGURED':accounts.some(a=>!a.active||a.accountType!=='ASSET')?'ACCOUNT_UNAVAILABLE':glValue===stockValue?'MATCHED':'MISMATCH',accounts,stockValue:signed(stockValue),glValue:signed(glValue),difference:signed(stockValue-glValue),journalIds:[...journalIds].sort()};
 if(financial.status!=='MATCHED')blockers.push(`GL_${financial.status}`);
 const summary={period:{id:period.id,code:period.code,startDate:period.startDate,endDate:period.endDate},currency,baseSnapshotId:base?.id??null,stockValue:signed(stockValue),financial,
  blockers:[...new Set(blockers)].sort(),eventCount:eventIds.size,reservationSourceHash:fingerprint(reserved),reservationCutoff:`${period.endDate}T23:59:59.999999Z`};
 const serializedRows=rows.map(row=>({...row,...Object.fromEntries(fields.map(f=>[f,signed(row[f])])),availableQuantity:signed(row.closingQuantity-row.reservedQuantity)}));
 return {summary,rows:serializedRows,eventIds:[...eventIds].sort(),contentHash:fingerprint({summary,rows:serializedRows,eventIds:[...eventIds].sort()})};
}
export function aggregate(rows,filter){
 const filtered=rows.filter(r=>r.grain===filter.grain&&['warehouseId','skuId','familyId','poolId','layerId'].every(k=>!filter[k]||r[k]===filter[k]));
 const groups=new Map(),dimension=filter.groupBy;
 for(const row of filtered){
  const key=dimension==='layer'?row.grainKey:`${row[`${dimension}Id`]}:${row.unitId}`;
  if(!groups.has(key)){
   const identity=dimension==='layer'?Object.fromEntries(Object.entries(row).filter(([k])=>!fields.includes(k)&&k!=='availableQuantity')):{[`${dimension}Id`]:row[`${dimension}Id`],[`${dimension}Code`]:row[`${dimension}Code`],unitId:row.unitId,unitCode:row.unitCode,grain:row.grain};
   groups.set(key,{id:key,...identity,...Object.fromEntries(fields.map(f=>[f,0n]))});
  }
  const group=groups.get(key);for(const f of fields)group[f]+=micro(row[f]);
 }
 const all=[...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({...r,...Object.fromEntries(fields.map(f=>[f,signed(r[f])])),availableQuantity:signed(r.closingQuantity-r.reservedQuantity)}));
 return {items:all.slice(filter.offset,filter.offset+filter.limit),total:all.length,limit:filter.limit,offset:filter.offset,filteredClosingValue:signed(filtered.reduce((s,r)=>s+micro(r.closingValue),0n))};
}
// Closed-period pages aggregate in MySQL; reading a page never loads an entire
// retained close into the API process. Frozen JSON labels remain the authority.
async function snapshotPage(tx,context,id,f){
 const args=[...scopeArgs(context),id,f.grain];let where='tenant_id = ? AND legal_entity_id = ? AND snapshot_id = ? AND grain = ?';
 for(const [key,col]of [['warehouseId','warehouse_id'],['skuId','sku_id'],['familyId','family_id'],['poolId','pool_id'],['layerId','layer_id']])if(f[key]){where+=` AND ${col} = ?`;args.push(f[key]);}
 const dimension={sku:'sku',family:'family',warehouse:'warehouse',pool:'pool'}[f.groupBy],group=f.groupBy==='layer'?'grain_key':`${dimension}_id,unit_id`;
 const label=key=>`NULLIF(JSON_UNQUOTE(JSON_EXTRACT(identity_data,'$.${key}')),'null')`;
 const dimensions=f.groupBy==='layer'?['warehouseId','warehouseCode','skuId','skuCode','familyId','familyCode','unitId','unitCode','layerId','poolId','poolCode','receiptLineId','receiptId','sourceId','sourceLineKey']:[`${dimension}Id`,`${dimension}Code`,'unitId','unitCode'];
 const identity=dimensions.map(k=>`MAX(${label(k)}) AS ${k}`).join(','),rowId=f.groupBy==='layer'?'grain_key':`CONCAT(${dimension}_id,':',unit_id)`;
 const {rows:count}=await tx.query(`SELECT COUNT(*) AS total FROM (SELECT ${group} FROM inventory_snapshot_lines WHERE ${where} GROUP BY ${group}) g`,args);
 const {rows:total}=await tx.query(`SELECT COALESCE(SUM(closing_value),0) AS value FROM inventory_snapshot_lines WHERE ${where}`,args);
 const {rows}=await tx.query(`SELECT ${rowId} AS id,MAX(grain) AS grain,${f.groupBy==='layer'?'grain_key AS grainKey,':''}${identity},${sqlFields.map((s,i)=>`SUM(${s}) AS ${fields[i]}`).join(',')},SUM(closing_quantity-reserved_quantity) AS availableQuantity
  FROM inventory_snapshot_lines WHERE ${where} GROUP BY ${group} ORDER BY id LIMIT ${f.limit} OFFSET ${f.offset}`,args);
 return {items:rows,total:count[0].total,limit:f.limit,offset:f.offset,filteredClosingValue:total[0].value};
}
export async function trialBalance(context,input){
 const filter=validate.report(input);return withTransaction(async tx=>{
  await authorize(context,'inventory.read',tx);const period=await periodDetails(tx,context,filter.periodId);
  const id=filter.snapshotId??period.currentSnapshotId;let report,snapshot=null,page;
  if(id){snapshot=await snapshotHeader(tx,context,id);if(snapshot.periodId!==period.id)throw notFound();report={summary:snapshot.summary};page=await snapshotPage(tx,context,id,filter);}
  else report=await buildReport(tx,context,period);
  // Financial detail has a separate permission boundary and endpoint.
  const {financial,...summary}=report.summary;
  return {...(page??aggregate(report.rows,filter)),summary:{...summary,blockers:summary.blockers.filter(b=>!b.startsWith('GL_'))},period,snapshot:snapshot?{id:snapshot.id,version:snapshot.version,watermark:snapshot.watermark,contentHash:snapshot.contentHash,preparedAt:snapshot.preparedAt}:null};
 });
}
export async function reconciliation(context,input){
 const filter=validate.report(input);return withTransaction(async tx=>{
  await authorize(context,'inventory.reconciliation.read',tx);const period=await periodDetails(tx,context,filter.periodId);const id=filter.snapshotId??period.currentSnapshotId;
  if(id){const s=await snapshotHeader(tx,context,id);if(s.periodId!==period.id)throw notFound();return {summary:s.summary,watermark:s.watermark,snapshotId:s.id};}
  return {summary:(await buildReport(tx,context,period)).summary,watermark:'LIVE',snapshotId:null};
 });
}
export async function movements(context,input){
 const f=validate.report(input);return withTransaction(async tx=>{
  await authorize(context,'inventory.read',tx);const p=await periodDetails(tx,context,f.periodId),snapshotId=f.snapshotId??p.currentSnapshotId;
  if(snapshotId&&(await snapshotHeader(tx,context,snapshotId)).periodId!==p.id)throw notFound();
  const table=f.grain==='POOL'?'inventory_pool_ledger':'inventory_physical_ledger',args=[...scopeArgs(context),p.startDate,p.endDate];
  let where=`${own('l')} AND ${eventDate} BETWEEN ? AND ?`;
  for(const [key,column]of [['warehouseId','l.warehouse_id'],['skuId','l.sku_id'],['layerId','l.layer_id'],['familyId','s.family_id'],['poolId','l.pool_id']])if(f[key]){where+=` AND ${column} = ?`;args.push(f[key]);}
  if(snapshotId){where+=' AND EXISTS (SELECT 1 FROM inventory_snapshot_events se WHERE se.tenant_id = e.tenant_id AND se.legal_entity_id = e.legal_entity_id AND se.event_id = e.id AND se.snapshot_id = ?)';args.push(snapshotId);}
  const from=`${table} l ${eventJoins} JOIN product_skus s ON s.tenant_id = l.tenant_id AND s.legal_entity_id = l.legal_entity_id AND s.id = l.sku_id
    JOIN warehouses w ON w.tenant_id = l.tenant_id AND w.legal_entity_id = l.legal_entity_id AND w.id = l.warehouse_id
    ${f.grain==='POOL'?'JOIN inventory_pools p ON p.tenant_id = l.tenant_id AND p.legal_entity_id = l.legal_entity_id AND p.id = l.pool_id':''}`;
  const {rows:count}=await tx.query(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`,args);
  const {rows}=await tx.query(`SELECT l.id,e.id AS eventId,e.kind,${eventDate} AS postingDate,COALESCE(c.reference,i.reference,t.reference,r.source_id) AS reference,l.layer_id AS layerId,l.sku_id AS skuId,s.code AS skuCode,l.warehouse_id AS warehouseId,w.code AS warehouseCode,
    ${f.grain==='POOL'?'l.pool_id AS poolId,p.code AS poolCode':'NULL AS poolId,NULL AS poolCode'},l.quantity,l.value FROM ${from} WHERE ${where} ORDER BY ${eventDate},e.id,l.id LIMIT ${f.limit} OFFSET ${f.offset}`,args);
  return {items:rows,total:count[0].total,limit:f.limit,offset:f.offset,snapshotId:snapshotId??null};
 });
}
