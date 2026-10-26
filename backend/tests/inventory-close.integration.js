import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { closePool, getMigrationPool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
const upgradeClose = options => runMigrations({ ...options, migrations: migrations.slice(0,10) });
import { triggers } from '../src/migrations/m010_inventory_period_close.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as journals from '../src/services/journal.service.js';
import * as products from '../src/services/products.service.js';
import * as inventory from '../src/services/inventory-foundation.service.js';
import * as receipts from '../src/services/inventory-receipts.service.js';
import * as stock from '../src/services/inventory-reservations.service.js';
import * as closing from '../src/services/inventory-close.service.js';
import * as reports from '../src/services/inventory-report.service.js';

assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-02E immutable stock closes, explicit reconciliation and dependent reopen',{timeout:180000},async t=>{
 t.after(closePool);await runMigrations({migrations:migrations.slice(0,9)});const f=await createFixtures();
 const ctx=(userId=f.alpha.userId,entityId=f.alpha.entityId)=>({identity:{tenantId:f.alpha.tenantId,userId},entityId,requestId:'stock-close-test',idempotencyKey:randomUUID()});
 await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.noAccess,f.alpha.roleId,f.alpha.entityId]);
 const reviewer=()=>ctx(f.noAccess);
 await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.viewer,f.viewerRole,f.alpha.entityId]);
 await query("INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,'inventory.read')",[f.alpha.tenantId,f.viewerRole]);
 await accounting.configure(ctx(),{baseCurrency:'TRY'});
 const year=(await accounting.createYear(ctx(),{code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'})).fiscalYear;
 const calendars={},periods={};for(const [code,start,end]of [['JAN','2026-01-01','2026-01-31'],['FEB','2026-02-01','2026-02-28'],['MAR','2026-03-01','2026-03-31']]){
  calendars[code]=(await accounting.createPeriod(ctx(),{code,fiscalYearId:year.id,startDate:start,endDate:end})).period;
  periods[code]=(await inventory.save(ctx(),'periods',{accountingPeriodId:calendars[code].id})).item;
 }
 const warehouse=(await inventory.save(ctx(),'warehouses',{code:'IST',name:'Istanbul'})).item;
 const movement={};for(const effect of ['RECEIPT','ISSUE'])movement[effect]=(await inventory.save(ctx(),'movement-types',{code:effect,name:effect,effect})).item.id;
 const pools={};for(const country of [null,'AF'])pools[country??'GENERAL']=(await inventory.save(ctx(),'pools',{name:country??'General',kind:country?'COUNTRY':'GENERAL',countryCode:country})).item.id;
 const family=(await products.save(ctx(),'families',{code:'GOODS',name:'Goods',parentId:null})).item;
 const unit=(await products.save(ctx(),'units',{code:'EA',name:'Each',symbol:'ea',quantityPrecision:6})).item;
 const sku=(await products.save(ctx(),'skus',{code:'A4',name:'A4',description:'',familyId:family.id,baseUnitId:unit.id})).item;
 const accounts={};for(const [code,type]of [['153','ASSET'],['320','LIABILITY'],['621','EXPENSE']])accounts[code]=(await accounting.createAccount(ctx(),{code,name:`Synthetic ${code}`,accountType:type})).account.id;
 const receiptBody=(q,date)=>({sourceId:randomUUID(),documentDate:date,postingDate:date,warehouseId:warehouse.id,movementTypeId:movement.RECEIPT,currency:'TRY',description:'Synthetic close receipt',lines:[{sourceLineKey:'1',skuId:sku.id,quantity:q,unitCost:'100',allocations:[{poolId:pools.GENERAL,quantity:q}]}]});
 await receipts.postFixture(ctx(),receiptBody('100','2026-01-01'));
 const {rows:history}=await query('SELECT * FROM schema_migrations ORDER BY migration_key'),{rows:before}=await query('SELECT * FROM inventory_balances');
 await t.test('m010 upgrades retained stock without editing prior history, verifies rerun and detects tampering',async()=>{
  await upgradeClose();await upgradeClose();assert.equal((await query('SHOW TABLES')).rows.length,57);
  assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key <> 'm010_inventory_period_close' ORDER BY migration_key")).rows,history);
  assert.deepEqual((await query('SELECT * FROM inventory_balances')).rows,before);
  const tr=triggers.find(t=>t[0]==='stock_snapshot_transition');await getMigrationPool().query(`DROP TRIGGER ${tr[0]}`);
  try{await assert.rejects(upgradeClose(),/Stock close trigger differs/);}finally{await getMigrationPool().query(`CREATE TRIGGER ${tr[0]} BEFORE ${tr[1]} ON ${tr[2]} FOR EACH ROW ${tr[3]}`);}
  await query("UPDATE schema_migrations SET status = 'running' WHERE migration_key = 'm010_inventory_period_close'");await assert.rejects(upgradeClose(),{code:'MIGRATION_RECOVERY_REQUIRED'});
  await upgradeClose({retryKey:'m010_inventory_period_close'});await upgradeClose();
 });
 await runMigrations();
 const journalBody=(value,date,issue=false)=>({sourceModule:'MANUAL',sourceId:randomUUID(),documentDate:date,postingDate:date,currency:'TRY',description:'Explicit synthetic reconciliation journal',lines:issue?[{accountId:accounts['621'],description:'Cost',debit:value,credit:'0'},{accountId:accounts['153'],description:'Inventory',debit:'0',credit:value}]:[{accountId:accounts['153'],description:'Inventory',debit:value,credit:'0'},{accountId:accounts['320'],description:'Payable',debit:'0',credit:value}]});
 const post=async(value,date,issue=false)=>journals.postJournal(ctx(),journalBody(value,date,issue));
 const report=(code,extra={})=>reports.trialBalance(ctx(),{periodId:periods[code].id,...extra});
 const reconcile=code=>reports.reconciliation(ctx(),{periodId:periods[code].id});
 const prepare=code=>closing.prepare(ctx(),periods[code].id,{reason:'Reviewed stock and explicit GL comparison'});
 const approve=id=>closing.review(reviewer(),id,'approve',{reason:'Independent reconciliation review'});
 let reservation,line,janSnapshot,janFrozen,febSnapshot;
 await t.test('live report shows exact TRY stock, mappings are explicit and mismatch blocks close',async()=>{
  const r=await report('JAN');assert.equal(r.summary.stockValue,'10000.000000');assert.equal(r.items[0].closingQuantity,'100.000000');assert.equal('financial' in r.summary,false);
  assert.equal((await reconcile('JAN')).summary.financial.status,'NOT_CONFIGURED');await assert.rejects(prepare('JAN'),{code:'RECONCILIATION_FAILED'});
  await assert.rejects(closing.setMapping(ctx(),{accountIds:[accounts['320']],reason:'Invalid type'}),{code:'ACCOUNT_UNAVAILABLE'});
  await assert.rejects(closing.setMapping(ctx(),{accountIds:[randomUUID()],reason:'Foreign account'}),{code:'ACCOUNT_UNAVAILABLE'});
  await closing.setMapping(ctx(),{accountIds:[accounts['153']],reason:'Selected inventory asset account'});
  assert.equal((await reconcile('JAN')).summary.financial.difference,'10000.000000');await assert.rejects(prepare('JAN'),{code:'RECONCILIATION_FAILED'});
  await post('10000','2026-01-01');assert.equal((await reconcile('JAN')).summary.financial.status,'MATCHED');
 });
 await t.test('period reports preserve source identity, partial issues and reservation carry without reducing on-hand twice',async()=>{
  reservation=(await stock.reserve(ctx(),{reference:randomUUID(),warehouseId:warehouse.id,destinationPoolId:pools.AF,reservationDate:'2026-01-10',reason:'Shipment',lines:[{skuId:sku.id,quantity:'20'}]})).reservation;
  line=(await stock.reservationLines(ctx(),reservation.id,{})).items[0];
  await stock.postIssue(ctx(),reservation.id,{reference:randomUUID(),dispatchDate:'2026-01-11',postingDate:'2026-01-11',movementTypeId:movement.ISSUE,description:'Physical shipment',lines:[{reservationLineId:line.id,quantity:'10'}]});
  await post('1000','2026-01-11',true);
  const r=await report('JAN');assert.deepEqual([r.items[0].incomingQuantity,r.items[0].outgoingQuantity,r.items[0].closingQuantity,r.items[0].reservedQuantity,r.items[0].availableQuantity],['100.000000','10.000000','90.000000','10.000000','80.000000']);
  for(const groupBy of ['sku','family','warehouse'])assert.equal((await report('JAN',{groupBy})).items[0].closingQuantity,'90.000000');
  assert.equal((await report('JAN',{grain:'POOL',groupBy:'pool'})).filteredClosingValue,'9000.000000');
  assert.equal((await reports.movements(ctx(),{periodId:periods.JAN.id})).total,2);
  await stock.release(ctx(),reservation.id,{reason:'Released after January end',lines:[{reservationLineId:line.id,quantity:'5'}]});
  assert.equal((await report('JAN')).items[0].reservedQuantity,'10.000000');
 });
 await t.test('projection corruption blocks close and prior periods must be approved in order',async()=>{
  await query('UPDATE inventory_balances SET value = value + 1 WHERE sku_id = ?',[sku.id]);
  try{assert.ok((await reconcile('JAN')).summary.blockers.includes('PROJECTION_MISMATCH'));await assert.rejects(prepare('JAN'),{code:'RECONCILIATION_FAILED'});}finally{await query('UPDATE inventory_balances SET value = value - 1 WHERE sku_id = ?',[sku.id]);}
  await assert.rejects(prepare('FEB'),{code:'EARLIER_PERIOD_OPEN'});
 });
 await t.test('prepare locks stock and mapped journals; independent approval freezes immutable history',async()=>{
  const context=ctx(),body={reason:'January review'};const first=await closing.prepare(context,periods.JAN.id,body);assert.deepEqual(await closing.prepare(context,periods.JAN.id,body),first);janSnapshot=first.snapshot;
  assert.equal((await closing.closeStatus(ctx(),periods.JAN.id)).period.status,'IN_REVIEW');
  await assert.rejects(closing.review(ctx(),janSnapshot.id,'approve',{reason:'Self review'}),{code:'INDEPENDENT_REVIEW_REQUIRED'});
  await assert.rejects(receipts.postFixture(ctx(),receiptBody('1','2026-01-12')),{code:'PERIOD_CLOSED'});
  await assert.rejects(post('100','2026-01-12'),{code:'INVENTORY_PERIOD_LOCKED'});
  await assert.rejects(closing.setMapping(ctx(),{accountIds:[accounts['153']],reason:'Change during review'}),{code:'MAPPING_LOCKED'});
  janSnapshot=(await approve(janSnapshot.id)).snapshot;assert.equal(janSnapshot.watermark,'APPROVED');janFrozen=await report('JAN');
  for(const sql of ["UPDATE inventory_period_snapshots SET reason = 'changed' WHERE id = ?",'DELETE FROM inventory_period_snapshots WHERE id = ?','UPDATE inventory_snapshot_lines SET closing_value = closing_value + 1 WHERE snapshot_id = ?','DELETE FROM inventory_snapshot_events WHERE snapshot_id = ?'])await assert.rejects(query(sql,[janSnapshot.id]),{code:'ER_SIGNAL_EXCEPTION'});
  await assert.rejects(query("UPDATE inventory_periods SET status = 'OPEN' WHERE id = ?",[periods.JAN.id]),{code:'ER_SIGNAL_EXCEPTION'});
 });
 await t.test('later reports start from approved snapshot plus movements and leave January reproducible',async()=>{
  await receipts.postFixture(ctx(),receiptBody('50','2026-02-01'));await post('5000','2026-02-01');
  await stock.postIssue(ctx(),reservation.id,{reference:randomUUID(),dispatchDate:'2026-02-02',postingDate:'2026-02-02',movementTypeId:movement.ISSUE,description:'Remaining shipment',lines:[{reservationLineId:line.id,quantity:'5'}]});await post('500','2026-02-02',true);
  const feb=await report('FEB',{groupBy:'sku'});assert.deepEqual([feb.items[0].openingQuantity,feb.items[0].incomingQuantity,feb.items[0].outgoingQuantity,feb.items[0].closingQuantity,feb.items[0].reservedQuantity],['90.000000','50.000000','5.000000','135.000000','5.000000']);assert.equal(feb.summary.baseSnapshotId,janSnapshot.id);
  assert.deepEqual(await report('JAN'),janFrozen);febSnapshot=(await approve((await prepare('FEB')).snapshot.id)).snapshot;
  await accounting.closePeriod(ctx(),calendars.JAN.id,{reason:'Accounting checked'});await accounting.closePeriod(ctx(),calendars.FEB.id,{reason:'Accounting checked'});
 });
 await t.test('approved reopen invalidates dependent closes and reopens their accounting calendars without deleting snapshots',async()=>{
  const request=(await closing.requestReopen(ctx(),periods.JAN.id,{reason:'Late authorized correction'})).reopen;
  const affected=await closing.reopenPeriods(ctx(),request.id,{});assert.equal(affected.total,2);assert.ok(affected.items.every(p=>p.accountingClosed));
  await assert.rejects(closing.reviewReopen(ctx(),request.id,'approve',{reason:'Self'}),{code:'INDEPENDENT_REVIEW_REQUIRED'});
  await assert.rejects(prepare('MAR'),{code:'REOPEN_PENDING'});
  await getMigrationPool().query("CREATE TRIGGER fail_reopen_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic reopen audit failure'");
  try{await assert.rejects(closing.reviewReopen(reviewer(),request.id,'approve',{reason:'Audit rollback'}));}finally{await getMigrationPool().query('DROP TRIGGER fail_reopen_audit');}
  assert.equal((await closing.getReopen(ctx(),request.id)).reopen.status,'REQUESTED');
  for(const code of ['JAN','FEB'])assert.equal((await closing.closeStatus(ctx(),periods[code].id)).period.status,'CLOSED');
  await closing.reviewReopen(reviewer(),request.id,'approve',{reason:'Approved with dependent recalculation'});
  for(const code of ['JAN','FEB']){const p=(await closing.closeStatus(ctx(),periods[code].id)).period;assert.equal(p.status,'OPEN');assert.equal(p.accountingStatus,'OPEN');assert.equal(p.currentSnapshotId,null);}
  const old=await report('JAN',{snapshotId:janSnapshot.id});assert.deepEqual(old.items,janFrozen.items);assert.equal(old.snapshot.watermark,'SUPERSEDED');
  assert.equal((await closing.getSnapshot(ctx(),febSnapshot.id)).snapshot.watermark,'SUPERSEDED');
 });
 await t.test('reclosing creates new versions and frozen movement membership excludes later backdated corrections',async()=>{
  await receipts.postFixture(ctx(),receiptBody('5','2026-01-20'));await post('500','2026-01-20');
  await assert.rejects(prepare('FEB'),{code:'EARLIER_PERIOD_OPEN'});
  const second=(await approve((await prepare('JAN')).snapshot.id)).snapshot;assert.equal(second.version,2);assert.notEqual(second.contentHash,janSnapshot.contentHash);
  const feb=(await approve((await prepare('FEB')).snapshot.id)).snapshot;assert.equal(feb.version,2);assert.equal(feb.baseSnapshotId,second.id);
  const r=await report('FEB',{groupBy:'sku'});assert.equal(r.items[0].openingQuantity,'95.000000');assert.equal(r.items[0].closingQuantity,'140.000000');
  assert.equal((await reports.movements(ctx(),{periodId:periods.JAN.id,snapshotId:janSnapshot.id})).total,2);
  assert.equal((await reports.movements(ctx(),{periodId:periods.JAN.id,snapshotId:second.id})).total,3);
  assert.equal((await closing.listSnapshots(ctx(),periods.JAN.id,{})).total,2);
 });
 await t.test('audit failure rolls back prepare, rejection unlocks only review, and concurrent prepare/approval happen once',async()=>{
  await getMigrationPool().query("CREATE TRIGGER fail_close_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'");
  try{await assert.rejects(prepare('MAR'));}finally{await getMigrationPool().query('DROP TRIGGER fail_close_audit');}
  assert.equal((await closing.closeStatus(ctx(),periods.MAR.id)).period.status,'OPEN');assert.equal((await closing.listSnapshots(ctx(),periods.MAR.id,{})).total,0);
  const first=(await prepare('MAR')).snapshot;
  await accounting.updateAccount(ctx(),accounts['153'],{name:'Inventory name reviewed after preparation',active:true});
  await assert.rejects(approve(first.id),{code:'SNAPSHOT_STALE'});
  await closing.review(ctx(),first.id,'reject',{reason:'Withdraw stale version for review'});assert.equal((await closing.closeStatus(ctx(),periods.MAR.id)).period.status,'OPEN');
  const results=await Promise.allSettled(Array.from({length:10},()=>prepare('MAR')));const success=results.filter(r=>r.status==='fulfilled');assert.equal(success.length,1);
  const id=success[0].value.snapshot.id,decisions=await Promise.allSettled(Array.from({length:10},()=>approve(id)));assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await closing.listSnapshots(ctx(),periods.MAR.id,{})).total,2);
 });
 await t.test('301 receipt layers snapshot in batches and a close/post race has a consistent watermark',async()=>{
  calendars.APR=(await accounting.createPeriod(ctx(),{code:'APR',fiscalYearId:year.id,startDate:'2026-04-01',endDate:'2026-04-30'})).period;
  periods.APR=(await inventory.save(ctx(),'periods',{accountingPeriodId:calendars.APR.id})).item;
  const body=receiptBody('1','2026-04-01');body.lines=Array.from({length:301},(_,i)=>({...body.lines[0],sourceLineKey:String(i+1),unitCost:'1'}));
  await receipts.postFixture(ctx(),body);await post('301','2026-04-01');
  const free=receiptBody('1','2026-04-02');free.lines[0].unitCost='0';
  const start=performance.now(),results=await Promise.allSettled([prepare('APR'),receipts.postFixture(ctx(),free)]);
  assert.equal(results[0].status,'fulfilled');if(results[1].status==='rejected')assert.equal(results[1].reason.code,'PERIOD_CLOSED');
  const s=results[0].value.snapshot;assert.ok(s.lineCount>=608);await approve(s.id);
  const reportResult=await report('APR',{limit:'100',offset:'300'});assert.ok(reportResult.total>=304);assert.ok(reportResult.items.length>=4);assert.equal(reportResult.summary.stockValue,'14301.000000');
  const events=await reports.movements(ctx(),{periodId:periods.APR.id,limit:'100'});assert.equal(events.total,301+(results[1].status==='fulfilled'?1:0));
  console.log(`301-layer close preparation: ${Math.round(performance.now()-start)} ms including review/read verification (disposable local schema, not a deployment SLA).`);
 });
 await t.test('scope, permission and query guards protect both reports and financial information',async()=>{
  const reader=ctx(f.viewer);const result=await reports.trialBalance(reader,{periodId:periods.JAN.id});assert.equal('financial' in result.summary,false);
  await assert.rejects(reports.reconciliation(reader,{periodId:periods.JAN.id}),{code:'FORBIDDEN'});await assert.rejects(closing.prepare(reader,periods.JAN.id,{reason:'No rights'}),{code:'FORBIDDEN'});
  const foreign={...ctx(),identity:{tenantId:f.beta.tenantId,userId:f.beta.userId},entityId:f.beta.entityId};await assert.rejects(reports.trialBalance(foreign,{periodId:periods.JAN.id}),{code:'NOT_FOUND'});
  await assert.rejects(reports.trialBalance(ctx(),{periodId:periods.JAN.id,grain:'PHYSICAL',poolId:pools.AF}),{code:'VALIDATION_ERROR'});
  await assert.rejects(reports.trialBalance(ctx(),{periodId:periods.JAN.id,snapshotId:febSnapshot.id}),{code:'NOT_FOUND'});
 });
 await t.test('HTTP close routes require authentication, CSRF, idempotency and preserve read-only snapshot access',async()=>{
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const cookies=new Map();
  const call=async(path,method='GET',body,headers={})=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of res.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:res.status,body:await res.json()};};
  try{const root=`/entities/${f.alpha.entityId}/inventory`;assert.equal((await call(`${root}/trial-balance?periodId=${periods.JAN.id}`)).status,401);
   let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
   assert.equal((await call(`${root}/periods/${periods.JAN.id}/reopens`,'POST',{reason:'No CSRF'})).status,403);
   assert.equal((await call(`${root}/periods/${periods.JAN.id}/reopens`,'POST',{reason:'No key'},{'X-CSRF-Token':csrf})).body.error.code,'IDEMPOTENCY_KEY_REQUIRED');
   assert.equal((await call(`${root}/snapshots/${janSnapshot.id}`)).status,200);assert.equal((await call(`${root}/snapshots/${janSnapshot.id}`,'DELETE',{}, {'X-CSRF-Token':csrf})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
 await t.test('all snapshots remain versioned and both original ledgers and current projections reconcile',async()=>{
  assert.equal((await query("SELECT COUNT(*) AS n FROM inventory_period_snapshots WHERE status = 'ASSEMBLING'")).rows[0].n,0);
  assert.equal((await reports.reconciliation(ctx(),{periodId:periods.MAR.id})).summary.financial.status,'MATCHED');await runMigrations();
 });
});
