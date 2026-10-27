import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
import {query} from '../src/db/query.js';
import {closePool,getMigrationPool} from '../src/db/pool.js';
import {runMigrations} from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import {setup} from './inventory-correction-fixtures.js';
import * as corrections from '../src/services/inventory-corrections.service.js';
import * as reallocations from '../src/services/inventory-reallocations.service.js';
import * as reservations from '../src/services/inventory-reservations.service.js';
import * as reports from '../src/services/inventory-report.service.js';
import * as closing from '../src/services/inventory-close.service.js';
import * as journals from '../src/services/journal.service.js';
import * as receipts from '../src/services/inventory-receipts.service.js';
import * as feeds from '../src/services/inventory-movements.service.js';
import {triggers} from '../src/migrations/m011_inventory_corrections.js';

assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-02F exact reversals, approved stock corrections and retained close history',{timeout:240000},async t=>{
 t.after(closePool);await runMigrations({migrations:migrations.slice(0,10)});const x=await setup(),{ctx,reviewer,pools,layerId,periods}=x;
 const {rows:history}=await query('SELECT * FROM schema_migrations ORDER BY migration_key'),{rows:oldEvents}=await query('SELECT * FROM inventory_events ORDER BY id'),{rows:oldStock}=await query('SELECT * FROM inventory_balances');
 await t.test('forward migration backfills only derived event dates, retains history and verifies rerun/tampering',async()=>{
   const upgradeCorrections=options=>runMigrations({...options,migrations:migrations.slice(0,11)});
   await upgradeCorrections();await upgradeCorrections();assert.equal((await query('SHOW TABLES')).rows.length,59);
  assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key NOT IN ('m011_inventory_corrections','m012_purchasing_foundation') ORDER BY migration_key")).rows,history);assert.deepEqual((await query('SELECT * FROM inventory_balances')).rows,oldStock);
  const current=(await query('SELECT * FROM inventory_events ORDER BY id')).rows;assert.deepEqual(current.map(({correction_id,reverses_event_id,posting_date,...r})=>r),oldEvents);assert.equal(current[0].posting_date,'2026-01-01');
   const tr=triggers.find(t=>t[0]==='correction_line_insert');await getMigrationPool().query(`DROP TRIGGER ${tr[0]}`);try{await assert.rejects(upgradeCorrections(),/trigger differs/);}finally{await getMigrationPool().query(`CREATE TRIGGER ${tr[0]} BEFORE ${tr[1]} ON ${tr[2]} FOR EACH ROW ${tr[3]}`);}await upgradeCorrections();
   await query("UPDATE schema_migrations SET status = 'running' WHERE migration_key = 'm011_inventory_corrections'");await assert.rejects(upgradeCorrections(),{code:'MIGRATION_RECOVERY_REQUIRED'});await upgradeCorrections({retryKey:'m011_inventory_corrections'});await runMigrations();
 });
 const request=(kind,extra={},context=ctx())=>corrections.create(context,{reference:randomUUID(),kind,postingDate:'2026-01-15',reason:'Reviewed synthetic correction',evidence:'Synthetic count sheet or valuation approval',...extra});
 const decision=(id,action,context=reviewer())=>corrections.act(context,id,action,{reason:'Independent evidence checked'});
 const execute=async r=>{await decision(r.correction.id,'approve');return decision(r.correction.id,'post',ctx());};
 const balance=async(pool=pools.GENERAL)=>(await query('SELECT quantity,value FROM inventory_pool_balances WHERE layer_id = ? AND pool_id = ?',[layerId,pool])).rows[0];
 let issueEvent,issueId,reversed,closed;
 await t.test('receipt to AF allocation, reservation, dispatch and independent exact reversal preserves source and returns unreserved stock',async()=>{
  const a=(await reallocations.create(ctx(),{reference:randomUUID(),warehouseId:x.warehouse.id,skuId:x.sku.id,fromPoolId:pools.GENERAL,toPoolId:pools.AF,quantity:'20',postingDate:'2026-01-02',movementTypeId:x.movement.REALLOCATION,reason:'Synthetic AF allocation'})).reallocation;
  await reallocations.act(reviewer(),a.id,'approve',{reason:'Approved'});await reallocations.act(ctx(),a.id,'execute',{});
  const r=(await reservations.reserve(ctx(),{reference:randomUUID(),warehouseId:x.warehouse.id,destinationPoolId:pools.AF,reservationDate:'2026-01-03',reason:'Synthetic dispatch',lines:[{skuId:x.sku.id,quantity:'10'}]})).reservation;
  const l=(await reservations.reservationLines(ctx(),r.id,{})).items[0];const issue=(await reservations.postIssue(ctx(),r.id,{reference:randomUUID(),dispatchDate:'2026-01-04',postingDate:'2026-01-04',movementTypeId:x.movement.ISSUE,description:'Synthetic shipment',lines:[{reservationLineId:l.id,quantity:'10'}]})).issue;issueId=issue.id;
  issueEvent=(await query('SELECT id FROM inventory_events WHERE issue_id = ?',[issueId])).rows[0].id;
  const req=await request('REVERSAL',{originalEventId:issueEvent});await assert.rejects(decision(req.correction.id,'approve',ctx()),{code:'INDEPENDENT_REVIEW_REQUIRED'});reversed=(await execute(req)).correction;
  assert.deepEqual(await balance(pools.AF),{quantity:'20.000000',value:'200.000000'});assert.equal((await reservations.getReservation(ctx(),r.id)).reservation.status,'CLOSED');
  assert.equal((await query('SELECT issued_quantity FROM inventory_reservation_allocations WHERE reservation_id = ?',[r.id])).rows[0].issued_quantity,'10.000000');
  const replay=await decision(reversed.id,'post',ctx());assert.equal(replay.correction.eventId,reversed.eventId);await assert.rejects(request('REVERSAL',{originalEventId:issueEvent}),{code:'ALREADY_REVERSED'});await assert.rejects(request('REVERSAL',{originalEventId:reversed.eventId}),{code:'REVERSAL_OF_REVERSAL'});
  assert.equal((await feeds.integrity(ctx())).status,'MATCHED');
 });
 await t.test('physical counts and value-only revaluation retain exact deltas; stale plans cannot post',async()=>{
  const count=await request('COUNT',{lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'75'}]});const stale=await request('REVALUATION',{lines:[{layerId,poolId:pools.GENERAL,targetValue:'900'}]});await decision(stale.correction.id,'approve');await execute(count);
  assert.deepEqual(await balance(),{quantity:'75.000000',value:'750.000000'});await assert.rejects(decision(stale.correction.id,'post',ctx()),{code:'STALE_CORRECTION'});await decision(stale.correction.id,'cancel',ctx());
  const valuation=(await execute(await request('REVALUATION',{lines:[{layerId,poolId:pools.GENERAL,targetValue:'825'}]}))).correction;
  assert.deepEqual(await balance(),{quantity:'75.000000',value:'825.000000'});const ledger=(await query('SELECT quantity,value FROM inventory_physical_ledger WHERE event_id = ?',[valuation.eventId])).rows[0];assert.deepEqual(ledger,{quantity:'0.000000',value:'75.000000'});
  const r=await reports.trialBalance(ctx(),{periodId:periods.JAN.id});assert.equal(r.items[0].closingQuantity,'95.000000');assert.equal(r.summary.stockValue,'1025.000000');assert.equal(r.items[0].incomingValue,'1175.000000');
  await execute(await request('REVERSAL',{originalEventId:valuation.eventId}));assert.deepEqual(await balance(),{quantity:'75.000000',value:'750.000000'});
 });
 await t.test('reserved stock, empty carrying value, inactive references and backdating are guarded',async()=>{
  const earlier=await request('COUNT',{lines:[{layerId,poolId:pools.AF,observedQuantity:'0'}]});await decision(earlier.correction.id,'approve');
  const r=(await reservations.reserve(ctx(),{reference:randomUUID(),warehouseId:x.warehouse.id,destinationPoolId:pools.AF,reservationDate:'2026-01-16',reason:'Hold stock',lines:[{skuId:x.sku.id,quantity:'20'}]})).reservation;
  await assert.rejects(decision(earlier.correction.id,'post',ctx()),{code:'RESERVED_STOCK'});await decision(earlier.correction.id,'cancel',ctx());
  await assert.rejects(request('COUNT',{postingDate:'2026-01-16',lines:[{layerId,poolId:pools.AF,observedQuantity:'0'}]}),{code:'RESERVED_STOCK'});
  await reservations.release(ctx(),r.id,{reason:'Cancel hold'},true);
  await assert.rejects(request('COUNT',{postingDate:'2026-01-01',lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'70'}]}),{code:'LATER_STOCK_MOVEMENT'});
  await assert.rejects(request('COUNT',{lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'75'}]}),{code:'NO_CHANGE'});
  await assert.rejects(query('UPDATE inventory_pool_balances SET quantity = 0 WHERE layer_id = ? AND pool_id = ?',[layerId,pools.GENERAL]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
  await query('UPDATE warehouses SET active = 0 WHERE id = ?',[x.warehouse.id]);try{await assert.rejects(request('COUNT',{lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'74'}]}),{code:'INACTIVE_REFERENCE'});}finally{await query('UPDATE warehouses SET active = 1 WHERE id = ?',[x.warehouse.id]);}
  await assert.rejects(request('COUNT',{lines:[{layerId:randomUUID(),poolId:pools.GENERAL,observedQuantity:'74'}]}),{code:'NOT_FOUND'});
 });
 await t.test('auditing failure rolls back every correction write; concurrent posts reverse once',async()=>{
  const c=await request('COUNT',{lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'80'}]});await decision(c.correction.id,'approve');const before=await balance();
  await getMigrationPool().query("CREATE TRIGGER fail_correction_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'");
  try{await assert.rejects(decision(c.correction.id,'post',ctx()));}finally{await getMigrationPool().query('DROP TRIGGER fail_correction_audit');}assert.deepEqual(await balance(),before);assert.equal((await corrections.get(ctx(),c.correction.id)).correction.status,'APPROVED');
  const results=await Promise.all(Array.from({length:10},()=>decision(c.correction.id,'post',ctx())));assert.equal(new Set(results.map(r=>r.correction.eventId)).size,1);assert.deepEqual(await balance(),{quantity:'80.000000',value:'800.000000'});
  const c1=await request('REVERSAL',{originalEventId:results[0].correction.eventId}),c2=await request('REVERSAL',{originalEventId:results[0].correction.eventId});await decision(c1.correction.id,'approve');await decision(c2.correction.id,'approve');const races=await Promise.allSettled([decision(c1.correction.id,'post',ctx()),decision(c2.correction.id,'post',ctx())]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
 });
 await t.test('ledger cursor walks tied timestamps without duplicates and respects scope/filter boundaries',async()=>{
  const ids=[];let cursor;do{const r=await feeds.movements(ctx(),{grain:'POOL',limit:'2',...(cursor?{cursor}:{})});ids.push(...r.items.map(l=>l.id));cursor=r.nextCursor;}while(cursor);
  assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,(await query('SELECT COUNT(*) AS n FROM inventory_pool_ledger')).rows[0].n);
  const first=await feeds.movements(ctx(),{limit:'1'});await assert.rejects(feeds.movements(ctx(),{grain:'POOL',cursor:first.nextCursor}),{code:'VALIDATION_ERROR'});
  const reader=ctx(x.f.viewer);assert.equal((await feeds.integrity(reader)).status,'MATCHED');await assert.rejects(request('COUNT',{lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'74'}]},reader),{code:'FORBIDDEN'});
  await assert.rejects(corrections.get({...ctx(),identity:{tenantId:x.f.beta.tenantId,userId:x.f.beta.userId},entityId:x.f.beta.entityId},reversed.id),{code:'NOT_FOUND'});
 });
 await t.test('correction HTTP writes enforce session, CSRF, scoped retry keys and request replay',async()=>{
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const cookies=new Map();
  const call=async(path,method='GET',body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:r.status,body:await r.json()};};
  try{const base=`/entities/${x.f.alpha.entityId}/inventory`;assert.equal((await call(`${base}/corrections`)).status,401);let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:x.f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
   const body={reference:randomUUID(),kind:'COUNT',postingDate:'2026-01-15',reason:'HTTP test',evidence:'Synthetic evidence',lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'74'}]};
   assert.equal((await call(`${base}/corrections`,'POST',body)).status,403);assert.equal((await call(`${base}/corrections`,'POST',body,{'X-CSRF-Token':csrf})).body.error.code,'IDEMPOTENCY_KEY_REQUIRED');
   const headers={'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},first=await call(`${base}/corrections`,'POST',body,headers);assert.equal(first.status,200);assert.equal((await call(`${base}/corrections`,'POST',body,headers)).body.correction.id,first.body.correction.id);
   assert.equal((await call(`${base}/corrections/${first.body.correction.id}`,'DELETE',{},headers)).status,404);assert.equal((await call(`${base}/movements?cursor=malformed`)).status,400);
   await decision(first.body.correction.id,'cancel',ctx());
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
 await t.test('stock correction leaves GL difference explicit; close and reopen preserve frozen pre-correction history',async()=>{
  await closing.setMapping(ctx(),{accountIds:[x.accounts['153']],reason:'Explicit synthetic asset mapping'});assert.equal((await reports.reconciliation(ctx(),{periodId:periods.JAN.id})).summary.financial.difference,'950.000000');
  await journals.postJournal(ctx(),{sourceModule:'MANUAL',sourceId:randomUUID(),documentDate:'2026-01-15',postingDate:'2026-01-15',currency:'TRY',description:'Explicit synthetic approved valuation',lines:[{accountId:x.accounts['153'],debit:'950',credit:'0'},{accountId:x.accounts['320'],debit:'0',credit:'950'}]});
  closed=(await closing.prepare(ctx(),periods.JAN.id,{reason:'Stock and explicit GL checked'})).snapshot;await closing.review(reviewer(),closed.id,'approve',{reason:'Independent review'});const before=await reports.trialBalance(ctx(),{periodId:periods.JAN.id});
  await assert.rejects(request('COUNT',{lines:[{layerId,poolId:pools.GENERAL,observedQuantity:'76'}]}),{code:'PERIOD_CLOSED'});
  const reopen=(await closing.requestReopen(ctx(),periods.JAN.id,{reason:'Authorized valuation correction'})).reopen;await closing.reviewReopen(reviewer(),reopen.id,'approve',{reason:'Approved reopen'});
  await execute(await request('REVALUATION',{lines:[{layerId,poolId:pools.GENERAL,targetValue:'700'}]}));const old=await reports.trialBalance(ctx(),{periodId:periods.JAN.id,snapshotId:closed.id});assert.deepEqual(old.items,before.items);assert.equal(old.snapshot.watermark,'SUPERSEDED');assert.equal((await reports.trialBalance(ctx(),{periodId:periods.JAN.id})).summary.stockValue,'900.000000');
  await assert.rejects(closing.prepare(ctx(),periods.JAN.id,{reason:'Difference still unresolved'}),{code:'RECONCILIATION_FAILED'});assert.equal((await feeds.integrity(ctx())).status,'MATCHED');
 });
 await t.test('301 correction lines, free goods and SQL immutability preserve all source rows',async()=>{
  const receipt=await receipts.postFixture(ctx(),x.receiptBody('1','0',301));const layers=(await query('SELECT x.id FROM inventory_layers x JOIN stock_receipt_lines l ON l.id = x.receipt_line_id WHERE l.receipt_id = ? ORDER BY x.id',[receipt.receipt.id])).rows;
  const req=await request('COUNT',{lines:layers.map(l=>({layerId:l.id,poolId:pools.GENERAL,observedQuantity:'2'}))});const done=await execute(req);assert.equal((await corrections.lines(ctx(),done.correction.id,{offset:'300'})).total,301);assert.equal((await corrections.lines(ctx(),done.correction.id,{offset:'300'})).items[0].value,'0.000000');
  await assert.rejects(query("UPDATE inventory_corrections SET reason = 'changed' WHERE id = ?",[done.correction.id]),{code:'ER_SIGNAL_EXCEPTION'});await assert.rejects(query('DELETE FROM inventory_correction_lines WHERE correction_id = ?',[done.correction.id]),{code:'ER_SIGNAL_EXCEPTION'});
  assert.equal((await feeds.integrity(ctx())).status,'MATCHED');await runMigrations();
 });
 await t.test('pool-only transfer and receipt reversals retain exact costs without orphan balances',async()=>{
  const body=x.receiptBody('2','3.333333');body.lines[0].allocations=[{poolId:pools.CM,quantity:'2'}];const receipt=(await receipts.postFixture(ctx(),body)).receipt;
  const receiptEvent=(await query('SELECT id FROM inventory_events WHERE receipt_id = ?',[receipt.id])).rows[0].id;
  const transfer=(await reallocations.create(ctx(),{reference:randomUUID(),warehouseId:x.warehouse.id,skuId:x.sku.id,fromPoolId:pools.CM,toPoolId:pools.AF,quantity:'1',postingDate:'2026-01-15',movementTypeId:x.movement.REALLOCATION,reason:'Explicit source pool test'})).reallocation;
  await reallocations.act(reviewer(),transfer.id,'approve',{reason:'Independent country borrowing review'});await reallocations.act(ctx(),transfer.id,'execute',{});
  const event=(await query('SELECT id FROM inventory_events WHERE reallocation_id = ?',[transfer.id])).rows[0].id;
  const undone=(await execute(await request('REVERSAL',{originalEventId:event}))).correction;assert.equal((await query('SELECT COUNT(*) AS n FROM inventory_physical_ledger WHERE event_id = ?',[undone.eventId])).rows[0].n,0);
  await execute(await request('REVERSAL',{originalEventId:receiptEvent}));const original=(await receipts.receiptLines(ctx(),receipt.id,{})).items[0];assert.equal(original.quantity,'2.000000');assert.equal(original.value,'6.666666');
  assert.deepEqual((await query('SELECT quantity,value FROM inventory_balances WHERE layer_id = ?',[original.layerId])).rows[0],{quantity:'0.000000',value:'0.000000'});assert.equal((await feeds.integrity(ctx())).status,'MATCHED');
 });
});
