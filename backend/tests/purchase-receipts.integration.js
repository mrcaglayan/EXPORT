import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {query} from '../src/db/query.js';
import {getMigrationPool,closePool} from '../src/db/pool.js';
import {runMigrations} from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import {triggers,additions} from '../src/migrations/m014_purchase_receipts.js';
import {createFixtures} from './auth-fixtures.js';
import {createApp} from '../src/app.js';
import {invoiceXml} from './invoice-xml-fixture.js';
import * as products from '../src/services/products.service.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as inventory from '../src/services/inventory-foundation.service.js';
import * as partners from '../src/services/trading-partners.service.js';
import * as documents from '../src/services/purchasing-documents.service.js';
import * as invoices from '../src/services/purchase-invoices.service.js';
import * as resolutions from '../src/services/invoice-resolutions.service.js';
import * as receipts from '../src/services/purchase-receipts.service.js';
import * as stock from '../src/services/inventory-receipts.service.js';
import * as corrections from '../src/services/inventory-corrections.service.js';
import {postJournal} from '../src/services/journal.service.js';
assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-03C reviewed commercial exceptions and atomic multi-line purchase stock/VAT/payables',{timeout:240000},async t=>{
 t.after(closePool);await runMigrations({migrations:migrations.slice(0,13)});const f=await createFixtures();
 const ctx=(userId=f.alpha.userId,entityId=f.alpha.entityId)=>({identity:{tenantId:f.alpha.tenantId,userId},entityId,requestId:'purchase-receipt-test',idempotencyKey:randomUUID()});
 const reviewer=()=>ctx(f.noAccess);
 const original=(await invoices.importXml(ctx(),{xml:invoiceXml(),fileName:'retained.xml',evidence:'Synthetic retained source'})).item;
 const history=(await query('SELECT * FROM schema_migrations ORDER BY migration_key')).rows,sourceBefore=(await query('SELECT * FROM purchase_invoices WHERE id=?',[original.id])).rows;
 await t.test('m014 preserves m001–m013 history and source rows, reruns, verifies guards and explicit recovery',async()=>{
  const upgradeReceipt=options=>runMigrations({...options,migrations:migrations.slice(0,14)});await upgradeReceipt();await upgradeReceipt();assert.equal((await query('SHOW TABLES')).rows.length,73);
  assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key<>'m014_purchase_receipts' ORDER BY migration_key")).rows,history);
  assert.deepEqual((await query('SELECT * FROM purchase_invoices WHERE id=?',[original.id])).rows,sourceBefore);
  for(const [table]of additions)assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,0);
  const tr=triggers.find(t=>t[0]==='purchase_receipt_update');await getMigrationPool().query(`DROP TRIGGER ${tr[0]}`);try{await assert.rejects(upgradeReceipt(),/trigger differs/);}finally{await getMigrationPool().query(`CREATE TRIGGER ${tr[0]} BEFORE ${tr[1]} ON ${tr[2]} FOR EACH ROW ${tr[3]}`);}
  await query("UPDATE schema_migrations SET status='running' WHERE migration_key='m014_purchase_receipts'");await assert.rejects(upgradeReceipt(),{code:'MIGRATION_RECOVERY_REQUIRED'});await upgradeReceipt({retryKey:'m014_purchase_receipts'});await runMigrations();
 });
 await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.noAccess,f.alpha.roleId,f.alpha.entityId]);
 await accounting.configure(ctx(),{baseCurrency:'TRY'});const year=(await accounting.createYear(ctx(),{code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'})).fiscalYear;
 const calendar=(await accounting.createPeriod(ctx(),{code:'OCT',fiscalYearId:year.id,startDate:'2026-10-01',endDate:'2026-10-31'})).period;
 const period=(await inventory.save(ctx(),'periods',{accountingPeriodId:calendar.id})).item;
 const warehouse=(await inventory.save(ctx(),'warehouses',{code:'MAIN',name:'Synthetic main'})).item,movement=(await inventory.save(ctx(),'movement-types',{code:'RECEIPT',name:'Receipt',effect:'RECEIPT'})).item;
 const pools=[];for(const country of [null,'AF'])pools.push((await inventory.save(ctx(),'pools',{name:country??'General',kind:country?'COUNTRY':'GENERAL',countryCode:country})).item);
 const family=(await products.save(ctx(),'families',{code:'GOODS',name:'Goods',parentId:null})).item,unit=(await products.save(ctx(),'units',{code:'EA',name:'Each',symbol:'ea',quantityPrecision:6})).item;
 const skus=[];for(const code of ['A','B'])skus.push((await products.save(ctx(),'skus',{code,name:code,description:'Synthetic',familyId:family.id,baseUnitId:unit.id})).item);
 const supplier=(await partners.save(ctx(),{code:'SUP',name:'Synthetic supplier',kind:'SUPPLIER',countryCode:'TR',taxIdentifier:'1111111111'})).item;
 await invoices.saveSettings(ctx(),{receiverScheme:'VKN',receiverTaxId:'2222222222',reason:'Synthetic recipient'});
 const a={};for(const [code,accountType]of [['153','ASSET'],['191.10','ASSET'],['191.20','ASSET'],['320','LIABILITY'],['689','EXPENSE']])a[code]=(await accounting.createAccount(ctx(),{code,name:'Synthetic '+code,accountType})).account.id;
 const policy={inventoryAccountId:a['153'],payableAccountId:a['320'],roundingAccountId:a['689'],vatAccounts:[{rate:'10',accountId:a['191.10']},{rate:'20',accountId:a['191.20']}],reason:'Explicit synthetic stock/VAT/payable mappings'};
 await receipts.saveSettings(ctx(),policy);
 const common=()=>({reference:randomUUID(),documentDate:'2026-10-01',purpose:'Synthetic purchasing',ebysReference:'SYNTHETIC'});
 async function staged(lines=[{code:'A',name:'Goods',quantity:'100',price:'500',rate:'10'}],{currency='TRY',transform=xml=>xml,orderPrices=null}={}){
  const r=(await documents.create(ctx(),'requests',{...common(),requiredBy:'2026-11-01',lines:lines.map((l,i)=>({lineKey:String(i),skuId:skus[i%2].id,quantity:l.quantity}))})).item;await documents.act(reviewer(),'requests',r.id,'approve',{reason:'Independent source review'});
  const rl=[];for(let offset=0;offset<lines.length;offset+=100)rl.push(...(await documents.lines(ctx(),'requests',r.id,{limit:'100',offset:String(offset)})).items);
  const o=(await documents.create(ctx(),'orders',{...common(),partnerId:supplier.id,requestId:r.id,requiredBy:'2026-11-01',currency,lines:rl.map((l,i)=>({requestLineId:l.id,quantity:lines[i].quantity,unitPrice:orderPrices?.[i]??lines[i].price,...((orderPrices?.[i]??lines[i].price)==='0'&&{freeReason:'Approved free sample'})}))})).item;await documents.act(reviewer(),'orders',o.id,'approve',{reason:'Independent order review'});
  const ol=[];for(let offset=0;offset<lines.length;offset+=100)ol.push(...(await documents.lines(ctx(),'orders',o.id,{limit:'100',offset:String(offset)})).items);
  const xml=transform(invoiceXml({lines,currency,orderReference:o.reference})),invoice=(await invoices.importXml(ctx(),{xml,fileName:'synthetic.xml',evidence:'Synthetic source'})).item;
  const il=[];for(let offset=0;offset<lines.length;offset+=100)il.push(...(await invoices.lines(ctx(),invoice.id,{limit:'100',offset:String(offset)})).items);
  await invoices.savePlan(ctx(),invoice.id,{expectedRevision:0,partnerId:supplier.id,orderId:o.id,reason:'Source match',updates:il.map((l,i)=>({invoiceLineId:l.id,skuId:skus[i%2].id,orderLineId:ol[i].id,unitConfirmed:true,freeReason:l.unitPrice==='0.000000'?'Free sample evidence':null}))});
  return {invoice,lines:il,xml,order:o};
 }
 const ready=async s=>{await invoices.act(ctx(),s.invoice.id,'submit',{reason:'Matched source'});await invoices.act(reviewer(),s.invoice.id,'approve',{reason:'Independent invoice review'});return s;};
 const input=s=>({reference:randomUUID(),postingDate:'2026-10-27',warehouseId:warehouse.id,movementTypeId:movement.id,exchangeRate:'1',exchangeDate:'2026-10-27',exchangeEvidence:'Invoice and base currency are TRY; rate 1',physicalReceiptConfirmed:true,reason:'Counted complete delivery',evidence:'Synthetic delivery note',lines:s.lines.map(l=>({invoiceLineId:l.id,vatTreatment:l.vatAmount==='0.000000'?'NONE':'DEDUCTIBLE',vatReason:'Synthetic approved deduction basis',allocations:[{poolId:pools[0].id,quantity:l.quantity}]}))});
 const approve=async(id)=>receipts.act(reviewer(),id,'approve',{reason:'Independent count and journal review'});
 let first;
 await t.test('153 debit 50,000 + 191.10 debit 5,000 = 320 credit 55,000; source links and exact allocations',async()=>{
  const s=await ready(await staged()),body=input(s);body.lines[0].allocations=[{poolId:pools[0].id,quantity:'60'},{poolId:pools[1].id,quantity:'40'}];
  const preview=(await receipts.preview(ctx(),s.invoice.id,body)).plan;assert.deepEqual(preview.journal.lines.map(l=>[l.accountId,l.debit,l.credit]),[[a['153'],'50000.000000','0.000000'],[a['191.10'],'5000.000000','0.000000'],[a['320'],'0.000000','55000.000000']]);
  first=(await receipts.request(ctx(),s.invoice.id,body)).item;await approve(first.id);
  const context=ctx(),posted=(await receipts.act(context,first.id,'post',{reason:'Post reviewed delivery'})).item;assert.equal(posted.status,'POSTED');assert.ok(posted.stockReceiptId&&posted.journalId);first=posted;
  const stockLines=(await stock.receiptLines(ctx(),posted.stockReceiptId,{})).items;assert.equal(stockLines[0].sourceLineKey,s.lines[0].id);assert.deepEqual(stockLines[0].allocations.map(l=>l.value).sort(),['20000.000000','30000.000000']);
  const lineage=(await receipts.lines(ctx(),posted.id,{})).items[0].details;assert.equal(lineage.goodsJournalLine,1);assert.equal(lineage.vatJournalLine,2);assert.equal(lineage.orderLineId.length,36);
  assert.equal((await receipts.act(context,first.id,'post',{reason:'Post reviewed delivery'})).item.id,first.id);
  await assert.rejects(receipts.request(ctx(),s.invoice.id,input(s)),{code:'INVOICE_ALREADY_RECEIVED'});await assert.rejects(invoices.act(reviewer(),s.invoice.id,'reopen',{reason:'Change'}),{code:'DEPENDENT_RECEIPT'});
  const event=(await query('SELECT id FROM inventory_events WHERE receipt_id=?',[posted.stockReceiptId])).rows[0];await assert.rejects(corrections.create(ctx(),{reference:randomUUID(),kind:'REVERSAL',originalEventId:event.id,postingDate:'2026-10-27',reason:'Reverse',evidence:'Synthetic'}),{code:'FINANCIAL_REVERSAL_REQUIRED'});
 });
 await t.test('self approval, scope and full quantities are enforced; rejected/cancelled requests retain history',async()=>{
  const s=await ready(await staged()),body=input(s);await assert.rejects(receipts.request(ctx(),s.invoice.id,{...body,physicalReceiptConfirmed:false}),{code:'VALIDATION_ERROR'});body.lines[0].allocations[0].quantity='1';await assert.rejects(receipts.preview(ctx(),s.invoice.id,body),{code:'ALLOCATION_MISMATCH'});
  const r=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await assert.rejects(receipts.act(ctx(),r.id,'approve',{reason:'Self review'}),{code:'INDEPENDENT_REVIEW_REQUIRED'});await receipts.act(reviewer(),r.id,'reject',{reason:'Count discrepancy'});
  const next=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await receipts.act(ctx(),next.id,'cancel',{reason:'Recount'});assert.equal((await receipts.list(ctx(),s.invoice.id,{})).total,2);
  await assert.rejects(receipts.get(ctx(f.alpha.userId,f.secondEntity),r.id),{code:'NOT_FOUND'});await assert.rejects(query('DELETE FROM purchase_receipts WHERE id=?',[r.id]),{code:'ER_SIGNAL_EXCEPTION'});
 });
 await t.test('multiple SKUs, mixed source VAT, capitalized VAT, exempt and free goods preserve each line',async()=>{
  const s=await ready(await staged([{code:'A',name:'A',quantity:'2',price:'100',rate:'10'},{code:'B',name:'B',quantity:'3',price:'200',rate:'20'},{code:'C',name:'Exempt',quantity:'1',price:'30',rate:'0'},{code:'D',name:'Free',quantity:'1',price:'0',rate:'0'}]));
  const b=input(s);b.lines[1].vatTreatment='CAPITALIZE';const r=(await receipts.request(ctx(),s.invoice.id,b)).item;await approve(r.id);const post=(await receipts.act(ctx(),r.id,'post',{reason:'Post mixed delivery'})).item;
  assert.equal(post.plan.totalValue,'950.000000');assert.equal(post.plan.payable,'970.000000');const l=(await receipts.lines(ctx(),r.id,{})).items;assert.equal(l[1].details.inventoryValue,'720.000000');assert.equal(l[1].details.deductibleVat,'0.000000');assert.equal(l[3].value,'0.000000');
 });
 await t.test('all-free goods create stock at zero value without inventing a nominal journal',async()=>{
  const s=await ready(await staged([{code:'A',name:'Free',quantity:'2',price:'0',rate:'0'}]));const r=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await approve(r.id);const p=(await receipts.act(ctx(),r.id,'post',{reason:'Receive approved free sample'})).item;assert.equal(p.journalId,null);assert.equal(p.plan.totalValue,'0.000000');
 });
 await t.test('commercial price changes require independent evidenced resolution and become stale on mapping revision',async()=>{
  const s=await staged([{code:'A',name:'Price difference',quantity:'2',price:'110',rate:'10'}],{orderPrices:['100']});await assert.rejects(ready(s),{code:'INVOICE_EXCEPTIONS'});
  const r=(await resolutions.request(ctx(),s.invoice.id,{reason:'Accept documented supplier price variation',evidence:'Synthetic approval note'})).item;await assert.rejects(resolutions.review(ctx(),r.id,'approve',{reason:'Self'}),{code:'INDEPENDENT_REVIEW_REQUIRED'});await resolutions.review(reviewer(),r.id,'approve',{reason:'Price variation authorized'});assert.equal((await invoices.validation(ctx(),s.invoice.id,{})).summary.canSubmit,true);
  await ready(s);const receipt=(await receipts.request(ctx(),s.invoice.id,input(s))).item;assert.equal(receipt.plan.commercialResolutionId,r.id);await receipts.act(ctx(),receipt.id,'cancel',{reason:'Revise source matching'});await invoices.act(reviewer(),s.invoice.id,'reopen',{reason:'Revise mapping'});
  const plan=(await invoices.get(ctx(),s.invoice.id)).plan;await invoices.savePlan(ctx(),s.invoice.id,{expectedRevision:1,partnerId:supplier.id,orderId:plan.orderId,reason:'New revision',updates:[]});assert.equal((await invoices.validation(ctx(),s.invoice.id,{})).summary.canSubmit,false);
 });
 await t.test('document discount variant preserves original totals/factors and exact net 100 for quantity 3',async()=>{
  const transform=xml=>xml.replaceAll('99.999999','100.000000').replaceAll('119.999999','120.000000').replace('<cbc:PriceAmount currencyID="TRY">33.333333</cbc:PriceAmount>','<cbc:PriceAmount currencyID="TRY">40</cbc:PriceAmount>').replace('<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="TRY">100.000000','<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="TRY">120.000000').replace('</cac:LegalMonetaryTotal>','<cbc:AllowanceTotalAmount currencyID="TRY">20</cbc:AllowanceTotalAmount></cac:LegalMonetaryTotal>').replace('<cac:TaxTotal>','<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="TRY">20</cbc:Amount><cbc:BaseAmount currencyID="TRY">119.97</cbc:BaseAmount><cbc:MultiplierFactorNumeric>0.1667</cbc:MultiplierFactorNumeric></cac:AllowanceCharge><cac:TaxTotal>');
  const s=await staged([{code:'A',name:'Discounted',quantity:'3',price:'33.333333',rate:'20'}],{transform,orderPrices:['40']}),p=(await resolutions.preview(ctx(),s.invoice.id)).proposal;assert.equal(p.discount.supported,true);assert.equal(p.remaining.length,0);assert.equal(p.discount.lines[0].discount,'20.000000');assert.equal(p.discount.allowances[0].baseAmount,'119.97');
  const r=(await resolutions.request(ctx(),s.invoice.id,{reason:'Accept explicit source discount allocation',evidence:'Synthetic commercial reconciliation'})).item;await resolutions.review(reviewer(),r.id,'approve',{reason:'Checked source net and VAT'});await ready(s);
  const receipt=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await approve(receipt.id);const posted=(await receipts.act(ctx(),receipt.id,'post',{reason:'Post exact net'})).item;const l=(await stock.receiptLines(ctx(),posted.stockReceiptId,{})).items[0];assert.equal(l.unitCost,'33.333333');assert.equal(l.value,'100.000000');assert.equal((await invoices.source(ctx(),s.invoice.id)).xml,s.xml);
 });
 await t.test('identity and tax arithmetic exceptions cannot be accepted through commercial review',async()=>{
  for(const transform of [xml=>xml.replace('2222222222','3333333333'),xml=>xml.replaceAll('<cbc:Percent>10.000000','<cbc:Percent>11.000000')]){const s=await staged([{code:'A',name:'Invalid',quantity:'1',price:'110',rate:'10'}],{transform,orderPrices:['100']});await assert.rejects(resolutions.request(ctx(),s.invoice.id,{reason:'Attempt bypass',evidence:'Synthetic'}),{code:'NONCOMMERCIAL_EXCEPTIONS'});}
 });
 await t.test('foreign currency conversion retains rate evidence and posts exact balanced base-currency values',async()=>{
  const s=await ready(await staged([{code:'A',name:'Foreign',quantity:'3',price:'0.333333',rate:'20'}],{currency:'USD'})),b={...input(s),exchangeRate:'34.123458',exchangeEvidence:'Synthetic dated conversion evidence'};
  const p=(await receipts.preview(ctx(),s.invoice.id,b)).plan;assert.equal(p.baseCurrency,'TRY');assert.equal(p.currency,'USD');assert.notEqual(p.conversionRounding,'0.000000');const r=(await receipts.request(ctx(),s.invoice.id,b)).item;await approve(r.id);assert.equal((await receipts.act(ctx(),r.id,'post',{reason:'Post converted source'})).item.status,'POSTED');
 });
 await t.test('closed periods, inactive accounts, changed policy and stale reviews block posting',async()=>{
  const s=await ready(await staged()),r=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await approve(r.id);
  await query("UPDATE accounting_periods SET status='CLOSED' WHERE id=?",[calendar.id]);try{await assert.rejects(receipts.act(ctx(),r.id,'post',{reason:'Closed'}),{code:'PERIOD_CLOSED'});}finally{await query("UPDATE accounting_periods SET status='OPEN' WHERE id=?",[calendar.id]);}
  await query('UPDATE accounts SET active=0 WHERE id=?',[a['191.10']]);try{await assert.rejects(receipts.act(ctx(),r.id,'post',{reason:'Inactive'}),{code:'POSTING_ACCOUNT_UNAVAILABLE'});}finally{await query('UPDATE accounts SET active=1 WHERE id=?',[a['191.10']]);}
  await accounting.updateAccount(ctx(),a['153'],{name:'Changed stock mapping context',active:true});await assert.rejects(receipts.act(ctx(),r.id,'post',{reason:'Stale'}),{code:'STALE_RECEIPT'});await receipts.act(ctx(),r.id,'cancel',{reason:'Refresh reviewed account context'});
 });
 await t.test('journal and audit failure roll back stock, GL, receipt state and retry records; concurrent post executes once',async()=>{
  const s=await ready(await staged()),r=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await approve(r.id);
  const counts=async()=>Promise.all(['stock_receipts','journals','inventory_layers','inventory_physical_ledger','inventory_balances'].map(async table=>(await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n));const before=await counts();
  for(const [name,table]of [['fail_purchase_journal','journal_lines'],['fail_purchase_audit','audit_events']]){await getMigrationPool().query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic atomicity failure'`);try{await assert.rejects(receipts.act(ctx(),r.id,'post',{reason:'Must roll back'}));}finally{await getMigrationPool().query(`DROP TRIGGER ${name}`);}assert.deepEqual(await counts(),before);assert.equal((await receipts.get(ctx(),r.id)).item.status,'APPROVED');}
  const results=await Promise.all(Array.from({length:4},()=>receipts.act(ctx(),r.id,'post',{reason:'Concurrent safe retry'})));assert.equal(new Set(results.map(r=>r.item.stockReceiptId)).size,1);assert.equal(new Set(results.map(r=>r.item.journalId)).size,1);
 });
 await t.test('301 invoice lines post in bounded SQL batches with paged provenance and balanced journal',async()=>{
  const s=await ready(await staged(Array.from({length:301},(_,i)=>({code:'SKU'+i,name:'Synthetic line '+i,quantity:'1',price:'1.234567',rate:i%2?'10':'20'}))));const r=(await receipts.request(ctx(),s.invoice.id,input(s))).item;await approve(r.id);const p=(await receipts.act(ctx(),r.id,'post',{reason:'Post full multi-line receipt'})).item;
  assert.equal((await receipts.lines(ctx(),r.id,{offset:'300'})).items[0].lineNumber,301);assert.equal((await stock.receiptLines(ctx(),p.stockReceiptId,{offset:'300'})).total,301);const j=(await receipts.journalPreview(ctx(),r.id)).journal;assert.equal(j.lines.length,603);
 });
 await t.test('read permissions, HTTP auth/CSRF and idempotency protect the new endpoints',async()=>{
  const reserved=(await receipts.journalPreview(ctx(),first.id)).journal;await assert.rejects(postJournal(ctx(),{...reserved,lines:reserved.lines.map(({accountId,description,debit,credit})=>({accountId,description,debit,credit}))}),{code:'SOURCE_RESERVED'});
  await assert.rejects(receipts.request(ctx(f.viewer),original.id,{}),{code:'VALIDATION_ERROR'});await assert.rejects(receipts.get(ctx(f.viewer),first.id),{code:'FORBIDDEN'});
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const cookies=new Map(),call=async(path,method='GET',body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:r.status,body:await r.json()};};
  try{const base=`/entities/${f.alpha.entityId}/purchasing`;assert.equal((await call(base+'/posting-settings')).status,401);let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
   assert.equal((await call(base+'/posting-settings','POST',policy)).status,403);const headers={'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()};assert.equal((await call(base+'/posting-settings','POST',policy,headers)).status,200);assert.equal((await call(base+'/posting-settings','POST',policy,headers)).status,200);assert.equal((await call(base+`/receipts/${first.id}/journal`)).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
 await t.test('posted purchase stock, all pool values and explicitly mapped 153 journal balance reconcile exactly',async()=>{
  const stockValue=(await query('SELECT SUM(value) AS v FROM inventory_balances WHERE tenant_id=? AND legal_entity_id=?',[f.alpha.tenantId,f.alpha.entityId])).rows[0].v;
  const poolValue=(await query('SELECT SUM(value) AS v FROM inventory_pool_balances WHERE tenant_id=? AND legal_entity_id=?',[f.alpha.tenantId,f.alpha.entityId])).rows[0].v;
  const gl=(await query("SELECT SUM(l.debit-l.credit) AS v FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.tenant_id=? AND l.legal_entity_id=? AND l.account_id=? AND j.status='POSTED'",[f.alpha.tenantId,f.alpha.entityId,a['153']])).rows[0].v;
  assert.equal(stockValue,poolValue);assert.equal(stockValue,gl);
 });
 await runMigrations();assert.equal((await query('SELECT status FROM inventory_periods WHERE id=?',[period.id])).rows[0].status,'OPEN');
});
