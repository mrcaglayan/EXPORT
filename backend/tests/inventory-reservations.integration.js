import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { closePool,getMigrationPool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { tables,triggers } from '../src/migrations/m009_inventory_reservations_issues.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as products from '../src/services/products.service.js';
import * as inventory from '../src/services/inventory-foundation.service.js';
import * as receipts from '../src/services/inventory-receipts.service.js';
import * as transfers from '../src/services/inventory-reallocations.service.js';
import * as stock from '../src/services/inventory-reservations.service.js';

assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-02D reservations, partial release and exact FIFO dispatch', {timeout:180000}, async t=>{
 t.after(closePool);
 await runMigrations({migrations:migrations.slice(0,8)});
 const f=await createFixtures();
 const ctx=(userId=f.alpha.userId,entityId=f.alpha.entityId)=>({identity:{tenantId:f.alpha.tenantId,userId},entityId,idempotencyKey:randomUUID(),requestId:'reservation-test'});
 await accounting.configure(ctx(),{baseCurrency:'TRY'});
 const year=(await accounting.createYear(ctx(),{code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'})).fiscalYear;
 const calendar=(await accounting.createPeriod(ctx(),{code:'JAN',fiscalYearId:year.id,startDate:'2026-01-01',endDate:'2026-01-31'})).period;
 const period=(await inventory.save(ctx(),'periods',{accountingPeriodId:calendar.id})).item;
 const warehouse=(await inventory.save(ctx(),'warehouses',{code:'IST',name:'Istanbul'})).item;
 const movement={};for(const effect of ['RECEIPT','REALLOCATION','ISSUE'])movement[effect]=(await inventory.save(ctx(),'movement-types',{code:effect,name:effect,effect})).item.id;
 const pools={};for(const country of [null,'AF','CM'])pools[country??'GENERAL']=(await inventory.save(ctx(),'pools',{name:country??'General',kind:country?'COUNTRY':'GENERAL',countryCode:country})).item.id;
 const family=(await products.save(ctx(),'families',{code:'GOODS',name:'Goods',parentId:null})).item;
 const unit=(await products.save(ctx(),'units',{code:'EA',name:'Each',symbol:'ea',quantityPrecision:6})).item;
 const makeSku=async code=>(await products.save(ctx(),'skus',{code,name:code,description:'',familyId:family.id,baseUnitId:unit.id})).item;
 const sku=await makeSku('A4');
 const receive=async(skuId,quantity,cost='500',allocations=[{poolId:pools.GENERAL,quantity}],date='2026-01-01',extra={})=>(await receipts.postFixture(ctx(),{sourceId:randomUUID(),documentDate:date,postingDate:date,warehouseId:warehouse.id,movementTypeId:movement.RECEIPT,currency:'TRY',description:'Synthetic receipt',lines:[{sourceLineKey:'1',skuId,quantity,unitCost:cost,allocations}],...extra})).receipt;
 const receipt=await receive(sku.id,'100','500',[{poolId:pools.AF,quantity:'30'},{poolId:pools.GENERAL,quantity:'60'},{poolId:pools.CM,quantity:'10'}]);
 const originalLines=await receipts.receiptLines(ctx(),receipt.id,{});
 const {rows:history}=await query('SELECT * FROM schema_migrations ORDER BY migration_key');
 const {rows:physicalBefore}=await query('SELECT * FROM inventory_balances');
 await t.test('m009 extends m008 without rewriting prior data/history and owns full verification',async()=>{
   const upgrade = options => runMigrations({ migrations: migrations.slice(0,9), ...options });
   await upgrade();await upgrade();assert.equal((await query('SHOW TABLES')).rows.length,50);
   assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key <> 'm009_inventory_reservations_issues' ORDER BY migration_key")).rows,history);
   assert.deepEqual((await query('SELECT * FROM inventory_balances')).rows,physicalBefore);
   const tr=triggers.find(([name])=>name==='inventory_pool_balances_reserved_guard');await getMigrationPool().query(`DROP TRIGGER ${tr[0]}`);
   try{await assert.rejects(upgrade(),/trigger differs/);}finally{await getMigrationPool().query(`CREATE TRIGGER ${tr[0]} BEFORE ${tr[1]} ON ${tr[2]} FOR EACH ROW ${tr[3]}`);}
   await query("UPDATE schema_migrations SET status = 'running' WHERE migration_key = 'm009_inventory_reservations_issues'");
   await assert.rejects(upgrade(),{code:'MIGRATION_RECOVERY_REQUIRED'});await upgrade({retryKey:'m009_inventory_reservations_issues'});await upgrade();
 });
 await runMigrations();
 const reserveBody=(lines=[{skuId:sku.id,quantity:'50'}],extras={})=>({reference:randomUUID(),warehouseId:warehouse.id,destinationPoolId:pools.AF,reservationDate:'2026-01-10',reason:'Confirmed dispatch demand',lines,...extras});
 const reserve=async(lines,extras)=>(await stock.reserve(ctx(),reserveBody(lines,extras))).reservation;
 const lines=async id=>(await stock.reservationLines(ctx(),id,{})).items;
 const issueBody=(reservationLineId,quantity,extra={})=>({reference:randomUUID(),dispatchDate:'2026-01-11',postingDate:'2026-01-11',movementTypeId:movement.ISSUE,description:'Physical dispatch only',lines:[{reservationLineId,quantity}],...extra});
 const cancel=async id=>stock.release(ctx(),id,{reason:'No longer required'},true);
 let first,firstLine;
 await t.test('reservation takes destination then GENERAL, preserves stock and reduces preview/available',async()=>{
   const context=ctx(),body=reserveBody();first=(await stock.reserve(context,body)).reservation;
   assert.deepEqual(await stock.reserve(context,body),{reservation:first});await assert.rejects(stock.reserve(context,{...body,reason:'Changed'}),{code:'IDEMPOTENCY_CONFLICT'});
   firstLine=(await lines(first.id))[0];assert.equal(firstLine.reservedQuantity,'50.000000');
   const a=(await stock.reservationAllocations(ctx(),first.id,{})).items;
   assert.deepEqual(a.map(a=>[a.poolCode,a.quantity]),[['AF','30.000000'],['GENERAL','20.000000']]);
   assert.deepEqual((await query('SELECT * FROM inventory_balances')).rows,physicalBefore);
   const preview=await transfers.preview(ctx(),{warehouseId:warehouse.id,skuId:sku.id,toPoolId:pools.AF,quantity:'50',postingDate:'2026-01-10'});
   assert.deepEqual([preview.destinationQuantity,preview.generalQuantity,preview.shortfall],['0.000000','40.000000','10.000000']);
   const b=(await receipts.list(ctx(),'balances',{})).items[0];assert.deepEqual([b.quantity,b.reservedQuantity,b.availableQuantity],['100.000000','50.000000','50.000000']);
   await assert.rejects(stock.reserve(ctx(),reserveBody([{skuId:sku.id,quantity:'41'}])),{code:'INSUFFICIENT_STOCK'});
 });
 await t.test('reserved stock blocks transfer creation/execution and unreserved transfer keeps correct cost denominator',async()=>{
   const request={reference:randomUUID(),warehouseId:warehouse.id,skuId:sku.id,fromPoolId:pools.GENERAL,toPoolId:pools.CM,quantity:'41',postingDate:'2026-01-10',movementTypeId:movement.REALLOCATION,reason:'Country demand'};
   await assert.rejects(transfers.create(ctx(),request),{code:'INSUFFICIENT_STOCK'});
   const r=(await transfers.create(ctx(),{...request,quantity:'40'})).reallocation;await transfers.act(ctx(),r.id,'approve',{reason:'Approved'});
   const second=await reserve([{skuId:sku.id,quantity:'1'}]);await assert.rejects(transfers.act(ctx(),r.id,'execute',{}),{code:'INSUFFICIENT_STOCK'});await cancel(second.id);
   const done=await transfers.act(ctx(),r.id,'execute',{});assert.equal(done.reallocation.totalValue,'20000.000000');
   assert.equal((await lines(first.id))[0].reservedQuantity,'50.000000');
 });
 await t.test('partial release is append-only, releases GENERAL first and keeps remaining FIFO source plan',async()=>{
   const context=ctx(),input={reason:'Reduce shipment',lines:[{reservationLineId:firstLine.id,quantity:'5'}]};
   const result=await stock.release(context,first.id,input);assert.deepEqual(await stock.release(context,first.id,input),result);
   assert.equal((await lines(first.id))[0].releasedQuantity,'5.000000');
   const a=(await stock.reservationAllocations(ctx(),first.id,{})).items;
   assert.equal(a[0].reservedQuantity,'30.000000');assert.equal(a[1].reservedQuantity,'15.000000');
   assert.equal((await stock.releaseLines(ctx(),result.releaseId,{})).items[0].quantity,'5.000000');
   assert.equal((await stock.releases(ctx(),first.id,{})).items[0].reason,'Reduce shipment');
 });
 let firstIssue;
 await t.test('partial dispatch consumes matching physical/pool stock, preserves receipt and records source',async()=>{
   const context=ctx(),body=issueBody(firstLine.id,'35');firstIssue=(await stock.postIssue(context,first.id,body)).issue;
   assert.equal(firstIssue.totalValue,'17500.000000');assert.equal(firstIssue.status,'POSTED');
   assert.deepEqual(await stock.postIssue(context,first.id,body),{issue:firstIssue});assert.deepEqual(await stock.postIssue(ctx(),first.id,body),{issue:firstIssue});
   await assert.rejects(stock.postIssue(ctx(),first.id,{...body,description:'Different'}),{code:'SOURCE_CONFLICT'});
   const consumed=(await stock.issueLines(ctx(),firstIssue.id,{})).items;
   assert.deepEqual(consumed.map(l=>[l.poolCode,l.quantity]),[['AF','30.000000'],['GENERAL','5.000000']]);
   assert.ok(consumed.every(l=>l.receiptId===receipt.id&&l.sourceLineKey==='1'));
   const b=(await receipts.list(ctx(),'balances',{})).items[0];assert.deepEqual([b.quantity,b.value,b.reservedQuantity],['65.000000','32500.000000','10.000000']);
   assert.deepEqual(await receipts.receiptLines(ctx(),receipt.id,{}),originalLines);
   const ledger=(await receipts.list(ctx(),'physical-ledger',{})).items;assert.ok(ledger.some(l=>l.issueId===firstIssue.id&&l.quantity==='-35.000000'&&l.postingDate==='2026-01-11'));
   await assert.rejects(stock.postIssue(ctx(),first.id,issueBody(firstLine.id,'11')),{code:'RESERVATION_EXCEEDED'});
   await cancel(first.id);assert.equal((await stock.getReservation(ctx(),first.id)).reservation.status,'CANCELLED');
   assert.deepEqual([(await lines(first.id))[0].issuedQuantity,(await lines(first.id))[0].releasedQuantity],['35.000000','15.000000']);
 });
 await t.test('ten concurrent reservations and dispatches cannot overspend or consume twice',async()=>{
   const raceSku=await makeSku('RACE');await receive(raceSku.id,'10');
   const attempts=await Promise.allSettled(Array.from({length:10},()=>reserve([{skuId:raceSku.id,quantity:'6'}])));
   assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.ok(attempts.filter(r=>r.status==='rejected').every(r=>r.reason.code==='INSUFFICIENT_STOCK'));
   const r=attempts.find(r=>r.status==='fulfilled').value,l=(await lines(r.id))[0];
   await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.noAccess,f.alpha.roleId,f.alpha.entityId]);
   const issues=await Promise.allSettled(Array.from({length:10},(_,i)=>stock.postIssue(ctx(i%2?f.noAccess:f.alpha.userId),r.id,issueBody(l.id,'6'))));
   assert.equal(issues.filter(r=>r.status==='fulfilled').length,1);assert.ok(issues.filter(r=>r.status==='rejected').every(r=>r.reason.code==='INVALID_STATE'));
   const b=(await receipts.list(ctx(),'balances',{skuId:raceSku.id})).items[0];assert.equal(b.quantity,'4.000000');assert.equal(b.reservedQuantity,'0.000000');
 });
 await t.test('FIFO separates repeated SKU lines and different SKUs, pools, free goods and fractional residual cost',async()=>{
   const x=await makeSku('FIFO'),free=await makeSku('FREE');
   await receive(x.id,'2','5',[{poolId:pools.GENERAL,quantity:'2'}],'2026-01-01');
   await receive(x.id,'2','8',[{poolId:pools.AF,quantity:'2'}],'2026-01-02');
   await receive(x.id,'0.000003','0.5',[{poolId:pools.GENERAL,quantity:'0.000003'}],'2026-01-03');
   await receive(free.id,'1','0');
   const r=await reserve([{skuId:x.id,quantity:'1'},{skuId:x.id,quantity:'3.000003'},{skuId:free.id,quantity:'1'}]),ls=await lines(r.id);
   const body=issueBody(ls[0].id,'1',{lines:ls.map(l=>({reservationLineId:l.id,quantity:l.quantity}))});
   const result=(await stock.postIssue(ctx(),r.id,body)).issue;assert.equal(result.totalValue,'26.000002');
   const details=(await stock.issueLines(ctx(),result.id,{})).items;assert.equal(details[0].poolCode,'AF');assert.ok(details.some(l=>l.skuId===free.id&&l.value==='0.000000'));
   assert.equal(new Set(details.filter(l=>l.skuId===x.id).map(l=>l.layerId)).size,3);
   assert.ok((await receipts.list(ctx(),'balances',{skuId:x.id})).items.every(b=>b.quantity==='0.000000'&&b.value==='0.000000'));
   assert.equal((await stock.getReservation(ctx(),r.id)).reservation.status,'CLOSED');
 });
 await t.test('audit failure rolls back reservation, release and dispatch including counters and retry records',async()=>{
   const x=await makeSku('ROLLBACK');await receive(x.id,'10');const r=await reserve([{skuId:x.id,quantity:'5'}]),l=(await lines(r.id))[0];
   const snap=async()=>Object.fromEntries(await Promise.all(tables.map(async([name])=>[name,(await query(`SELECT * FROM ${name}`)).rows])));
   for(const action of ['reserve','release','issue']){
     const before=await snap(),context=ctx();await getMigrationPool().query("CREATE TRIGGER reservation_audit_fail BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic failure'");
     try{await assert.rejects(action==='reserve'?stock.reserve(context,reserveBody([{skuId:x.id,quantity:'1'}])):action==='release'?stock.release(context,r.id,{reason:'Release',lines:[{reservationLineId:l.id,quantity:'1'}]}):stock.postIssue(context,r.id,issueBody(l.id,'1')));}
     finally{await getMigrationPool().query('DROP TRIGGER reservation_audit_fail');}
     assert.deepEqual(await snap(),before);assert.equal((await query('SELECT COUNT(*) AS n FROM idempotency_records WHERE idempotency_key = ?',[context.idempotencyKey])).rows[0].n,0);
   }
   await cancel(r.id);
 });
 await t.test('closed periods, backdated layers, wrong SKU/scope/effect and deactivation are guarded; release works after close',async()=>{
   const x=await makeSku('GUARDS');await receive(x.id,'4');const r=await reserve([{skuId:x.id,quantity:'4'}]),l=(await lines(r.id))[0];
   await assert.rejects(stock.postIssue(ctx(),r.id,issueBody(l.id,'1',{movementTypeId:movement.RECEIPT})),{code:'MOVEMENT_EFFECT_MISMATCH'});
   await assert.rejects(stock.postIssue(ctx(),r.id,issueBody(l.id,'1',{lines:[{reservationLineId:firstLine.id,quantity:'1'}]})),{status:404});
   await assert.rejects(stock.getReservation(ctx(f.alpha.userId,f.secondEntity),r.id),{status:404});
   await assert.rejects(stock.reserve(ctx(f.viewer,f.secondEntity),reserveBody()),{status:403});
   await assert.rejects(stock.postIssue(ctx(),r.id,issueBody(l.id,'1',{postingDate:'2026-01-09'})),{code:'INVALID_DISPATCH_DATE'});
   await stock.postIssue(ctx(),r.id,issueBody(l.id,'1',{postingDate:'2026-01-15',dispatchDate:'2026-01-15'}));
   await assert.rejects(stock.postIssue(ctx(),r.id,issueBody(l.id,'1')),{code:'INSUFFICIENT_STOCK'});
   await assert.rejects(inventory.save(ctx(),'movement-types',{name:'Issue',active:false},movement.ISSUE),{code:'INVENTORY_IN_USE'});
   for(const [table,id] of [['inventory_periods',period.id],['accounting_periods',calendar.id]]){
     await query(`UPDATE ${table} SET status = 'CLOSED' WHERE id = ?`,[id]);
     await assert.rejects(stock.postIssue(ctx(),r.id,issueBody(l.id,'1',{postingDate:'2026-01-15'})),{code:'PERIOD_CLOSED'});
     await assert.rejects(stock.reserve(ctx(),reserveBody([{skuId:x.id,quantity:'1'}])),{code:'PERIOD_CLOSED'});
     if(table==='inventory_periods')await stock.release(ctx(),r.id,{reason:'Closed-period release',lines:[{reservationLineId:l.id,quantity:'1'}]});
     await query(`UPDATE ${table} SET status = 'OPEN' WHERE id = ?`,[id]);
   }
   await cancel(r.id);
 });
 await t.test('SQL rejects edited consumption, unsupported pool, forged counters and stock below reservations',async()=>{
   const x=await makeSku('SQL');await receive(x.id,'2');const r=await reserve([{skuId:x.id,quantity:'2'}]);
   for(const table of ['inventory_reservations','inventory_reservation_lines','inventory_reservation_allocations','inventory_reservation_releases','inventory_reservation_release_lines','inventory_issues','inventory_issue_lines'])await assert.rejects(query(`DELETE FROM ${table} LIMIT 1`),{code:'ER_SIGNAL_EXCEPTION'});
   await assert.rejects(query('UPDATE inventory_reservation_allocations SET released_quantity = released_quantity + 1 WHERE reservation_id = ?',[r.id]),{code:'ER_SIGNAL_EXCEPTION'});
   await assert.rejects(query('UPDATE inventory_pool_balances SET quantity = 1 WHERE sku_id = ?',[x.id]),{code:'ER_SIGNAL_EXCEPTION'});
   await assert.rejects(query('UPDATE inventory_balances SET quantity = 1 WHERE sku_id = ?',[x.id]),{code:'ER_SIGNAL_EXCEPTION'});
   await assert.rejects(query('UPDATE inventory_issue_lines SET value = value + 1 LIMIT 1'),{code:'ER_SIGNAL_EXCEPTION'});
   await cancel(r.id);
 });
 await t.test('HTTP protects all writes, preserves source reads and scopes stock readers',async()=>{
   const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const cookies=new Map();
   const call=async(path,method='GET',body,headers={})=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of res.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:res.status,body:await res.json()};};
   try{
     const root=`/entities/${f.alpha.entityId}/inventory`;assert.equal((await call(`${root}/reservations`)).status,401);
     let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
     assert.equal((await call(`${root}/reservations`,'POST',reserveBody())).status,403);
     assert.equal((await call(`${root}/reservations`,'POST',reserveBody(),{'X-CSRF-Token':csrf})).body.error.code,'IDEMPOTENCY_KEY_REQUIRED');
     assert.equal((await call(`${root}/reservations/${first.id}/allocations`)).status,200);
     assert.equal((await call(`${root}/issues/${firstIssue.id}/lines`)).status,200);
     assert.equal((await call(`${root}/issues/${firstIssue.id}`,'PATCH',{}, {'X-CSRF-Token':csrf})).status,404);
   }finally{await new Promise(resolve=>server.close(resolve));}
 });
 await t.test('301 source lines remain atomic and paginated without a document ceiling',async()=>{
   const x=await makeSku('MANY');await receive(x.id,'301','1');
   const r=await reserve(Array.from({length:301},()=>({skuId:x.id,quantity:'1'})));
   const all=[];for(let offset=0;offset<301;offset+=100)all.push(...(await stock.reservationLines(ctx(),r.id,{limit:'100',offset:String(offset)})).items);
   assert.equal(all.length,301);const started=performance.now();
   const result=(await stock.postIssue(ctx(),r.id,issueBody(all[0].id,'1',{lines:all.map(l=>({reservationLineId:l.id,quantity:'1'}))}))).issue;
   console.log(`301-line dispatch: ${Math.round(performance.now()-started)} ms (local disposable schema, not a deployment SLA).`);
   assert.equal(result.totalValue,'301.000000');assert.equal((await stock.issueLines(ctx(),result.id,{limit:'100',offset:'300'})).items[0].lineNumber,301);
 });
 await t.test('physical equals pools, all ledgers/counters reconcile and no financial/VAT event is inferred',async()=>{
   const {rows}=await query(`SELECT b.layer_id FROM inventory_balances b WHERE b.quantity <> (SELECT SUM(p.quantity) FROM inventory_pool_balances p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id)
    OR b.value <> (SELECT SUM(p.value) FROM inventory_pool_balances p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id)
    OR b.quantity <> (SELECT SUM(p.quantity) FROM inventory_physical_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id)
    OR b.value <> (SELECT SUM(p.value) FROM inventory_physical_ledger p WHERE p.tenant_id = b.tenant_id AND p.legal_entity_id = b.legal_entity_id AND p.layer_id = b.layer_id)`);assert.equal(rows.length,0);
   for(const table of ['journals','posting_requests'])assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,0);
   for(const table of ['inventory_reservations','inventory_reservation_releases','inventory_issues'])assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table} WHERE status = 'ASSEMBLING'`)).rows[0].n,0);
   await runMigrations();
 });
});
