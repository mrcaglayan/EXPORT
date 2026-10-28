import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {query} from '../src/db/query.js';
import {getMigrationPool,closePool} from '../src/db/pool.js';
import {runMigrations} from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import {triggers} from '../src/migrations/m013_purchase_invoice_staging.js';
import {createFixtures} from './auth-fixtures.js';
import {createApp} from '../src/app.js';
import {invoiceXml} from './invoice-xml-fixture.js';
import * as products from '../src/services/products.service.js';
import * as aliases from '../src/services/product-aliases.service.js';
import * as reviews from '../src/services/product-reviews.service.js';
import * as partners from '../src/services/trading-partners.service.js';
import * as docs from '../src/services/purchasing-documents.service.js';
import * as invoices from '../src/services/purchase-invoices.service.js';

assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-03B immutable invoice staging, exact mapping and independent source matching',{timeout:240000},async t=>{
  t.after(closePool);await runMigrations({migrations:migrations.slice(0,12)});const f=await createFixtures();
  const ctx=(userId=f.alpha.userId,entityId=f.alpha.entityId)=>({identity:{tenantId:f.alpha.tenantId,userId},entityId,requestId:'invoice-test',idempotencyKey:randomUUID()});
  const partner=(await partners.save(ctx(),{code:'SUP',name:'Synthetic supplier',kind:'SUPPLIER',countryCode:'TR',taxIdentifier:'1111111111'})).item;
  const history=(await query('SELECT * FROM schema_migrations ORDER BY migration_key')).rows,oldPartners=(await query('SELECT * FROM trading_partners')).rows;
  await t.test('m013 preserves suppliers/history, reruns and detects missing guards/recovery',async()=>{
    const upgradeInvoice=options=>runMigrations({...options,migrations:migrations.slice(0,13)});
    await upgradeInvoice();await upgradeInvoice();assert.equal((await query('SHOW TABLES')).rows.length,69);
    assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key<'m013_purchase_invoice_staging' ORDER BY migration_key")).rows,history);assert.deepEqual((await query('SELECT * FROM trading_partners')).rows,oldPartners);
    for(const table of ['purchase_invoice_settings','purchase_invoices','purchase_invoice_lines','purchase_invoice_plans','purchase_invoice_mappings','purchase_invoice_decisions'])assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,0);
    const tr=triggers.find(t=>t[0]==='purchase_invoice_mapping_insert');await getMigrationPool().query(`DROP TRIGGER ${tr[0]}`);try{await assert.rejects(upgradeInvoice(),/trigger differs/);}finally{await getMigrationPool().query(`CREATE TRIGGER ${tr[0]} BEFORE ${tr[1]} ON ${tr[2]} FOR EACH ROW ${tr[3]}`);}
    await query("UPDATE schema_migrations SET status='running' WHERE migration_key='m013_purchase_invoice_staging'");await assert.rejects(upgradeInvoice(),{code:'MIGRATION_RECOVERY_REQUIRED'});await upgradeInvoice({retryKey:'m013_purchase_invoice_staging'});await runMigrations();
  });
  const reviewRole=randomUUID();await query("INSERT INTO roles (id,tenant_id,code,name) VALUES (?,?,'INVOICE_REVIEWER','Invoice reviewer')",[reviewRole,f.alpha.tenantId]);
  for(const p of ['workspace.read','purchasing.read','purchasing.invoice.review'])await query('INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,?)',[f.alpha.tenantId,reviewRole,p]);
  await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.noAccess,reviewRole,f.alpha.entityId]);
  // A separate authorizer approves purchasing records, without granting the invoice reviewer purchasing writes.
  const authorizer=randomUUID();await query("INSERT INTO users (id,tenant_id,email,display_name,password_hash) SELECT ?,tenant_id,'purchase-authorizer@alpha.test','Synthetic authorizer',password_hash FROM users WHERE id=?",[authorizer,f.alpha.userId]);await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,authorizer,f.alpha.roleId,f.alpha.entityId]);
  const reviewer=()=>ctx(f.noAccess),approveDoc=(resource,id)=>docs.act(ctx(authorizer),resource,id,'approve',{reason:'Independent purchasing approval'});
  const unit=(await products.save(ctx(),'units',{code:'EA',name:'Each',symbol:'ea',quantityPrecision:6})).item,family=(await products.save(ctx(),'families',{code:'GOODS',name:'Goods',parentId:null})).item;
  const skus=[];for(const code of ['A4','A3'])skus.push((await products.save(ctx(),'skus',{code,name:code,description:'Synthetic',familyId:family.id,baseUnitId:unit.id})).item);
  const common=()=>({reference:randomUUID(),documentDate:'2026-10-01',purpose:'Synthetic purchasing source',ebysReference:'EBYS-SYNTHETIC'});
  async function order(quantity='10',count=2,prices=['100','200']){
    const r=(await docs.create(ctx(),'requests',{...common(),requiredBy:'2026-11-30',lines:Array.from({length:count},(_,i)=>({lineKey:'r-'+i,skuId:skus[i%2].id,quantity}))})).item;await approveDoc('requests',r.id);
    const source=[];for(let offset=0;offset<count;offset+=100)source.push(...(await docs.lines(ctx(),'requests',r.id,{limit:'100',offset:String(offset)})).items);
    const o=(await docs.create(ctx(),'orders',{...common(),partnerId:partner.id,requestId:r.id,requiredBy:'2026-11-30',currency:'TRY',lines:source.map((l,i)=>({requestLineId:l.id,quantity,unitPrice:prices[i%prices.length],...(prices[i%prices.length]==='0'&&{freeReason:'Synthetic approved free sample'})}))})).item;await approveDoc('orders',o.id);
    const lines=[];for(let offset=0;offset<count;offset+=100)lines.push(...(await docs.lines(ctx(),'orders',o.id,{limit:'100',offset:String(offset)})).items);return {item:o,lines};
  }
  const original=await order(),sourceXml=invoiceXml({orderReference:original.item.reference});let imported;
  const importXml=(xml=sourceXml,context=ctx())=>invoices.importXml(context,{xml,fileName:'synthetic.xml',evidence:'Synthetic test fixture'});
  const action=(id,verb,context=reviewer())=>invoices.act(context,id,verb,{reason:'Checked original XML and matching evidence'});
  async function map(id,order=original,updates,extra={}){const invoice=(await invoices.get(ctx(),id)).item,lineRows=[];for(let offset=0;offset<invoice.lineCount;offset+=100)lineRows.push(...(await invoices.lines(ctx(),id,{offset:String(offset),limit:'100'})).items);
    const rows=updates??lineRows.map((l,i)=>({invoiceLineId:l.id,skuId:order.lines[i].skuId,orderLineId:order.lines[i].id,unitConfirmed:true,freeReason:l.unitPrice==='0.000000'?'Approved invoice free sample':null}));
    return invoices.savePlan(ctx(),id,{expectedRevision:invoice.revision,partnerId:partner.id,orderId:order.item.id,reason:'Explicit source line mapping',updates:rows,...extra});
  }
  await t.test('raw XML/source lines retained exactly; same UUID/hash replays and conflicting UUID/number is rejected',async()=>{
    const context=ctx(),body={xml:sourceXml,fileName:'synthetic.xml',evidence:'Synthetic fixture'};imported=(await invoices.importXml(context,body)).item;
    assert.equal((await invoices.importXml(context,body)).item.id,imported.id);assert.equal((await importXml()).item.id,imported.id);
    assert.equal((await invoices.source(ctx(),imported.id)).xml,sourceXml);const lines=await invoices.lines(ctx(),imported.id,{});assert.equal(lines.items.length,2);assert.equal(lines.items[0].description,' Supplier A4 ');assert.equal(lines.items[0].taxes[0].percent,'10.000000');
    assert.equal((await invoices.lineSource(ctx(),imported.id,lines.items[0].id)).source.name,'InvoiceLine');
    await assert.rejects(importXml(sourceXml+' '),{code:'INVOICE_UUID_CONFLICT'});await assert.rejects(importXml(sourceXml.replace(imported.uuid,randomUUID())),{code:'INVOICE_NUMBER_CONFLICT'});
    const races=await Promise.all(Array.from({length:5},()=>importXml()));assert.equal(new Set(races.map(r=>r.item.id)).size,1);
  });
  await t.test('recipient configuration and every source-line mapping must be resolved before submission',async()=>{
    assert.ok((await invoices.validation(ctx(),imported.id,{})).items.some(i=>i.code==='RECIPIENT_NOT_CONFIGURED'));
    await invoices.saveSettings(ctx(),{receiverScheme:'VKN',receiverTaxId:'2222222222',reason:'Synthetic fixture recipient'});await map(imported.id);
    assert.equal((await invoices.validation(ctx(),imported.id,{})).summary.canSubmit,true);
    await action(imported.id,'submit',ctx());await assert.rejects(action(imported.id,'approve',ctx()),{code:'INDEPENDENT_REVIEW_REQUIRED'});await action(imported.id,'approve');
    assert.equal((await invoices.get(ctx(),imported.id)).item.status,'READY');assert.equal((await invoices.validation(ctx(),imported.id,{})).summary.canSubmit,true);
    await assert.rejects(docs.act(ctx(),'orders',original.item.id,'cancel',{reason:'Linked approved matching'}),{code:'DEPENDENT_INVOICES'});
    await assert.rejects(invoices.saveSettings(ctx(),{receiverScheme:'VKN',receiverTaxId:'3333333333',reason:'Changed'}),{code:'INVOICE_RECIPIENT_IN_USE'});
  });
  await t.test('mapping revisions retain history and stale concurrent edits cannot overwrite each other',async()=>{
    const i=(await importXml(invoiceXml())).item;await map(i.id);const rows=(await invoices.lines(ctx(),i.id,{})).items;
    const body={expectedRevision:1,partnerId:partner.id,orderId:original.item.id,reason:'Revision race',updates:[{invoiceLineId:rows[0].id,skuId:skus[0].id,orderLineId:original.lines[0].id,unitConfirmed:false}]};
    const races=await Promise.allSettled([invoices.savePlan(ctx(),i.id,body),invoices.savePlan(ctx(),i.id,body)]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.code,'STALE_MAPPING');
    assert.equal((await invoices.plans(ctx(),i.id,{})).total,2);assert.equal((await invoices.lines(ctx(),i.id,{revision:'1'})).items[0].unitConfirmed,1);
    assert.ok((await invoices.validation(ctx(),i.id,{})).items.some(e=>e.code==='UNIT_CONFIRMATION'));
    await assert.rejects(query("UPDATE purchase_invoice_lines SET description='Changed' WHERE invoice_id=?",[i.id]),{code:'ER_SIGNAL_EXCEPTION'});await assert.rejects(query('DELETE FROM purchase_invoice_plans WHERE invoice_id=?',[i.id]),{code:'ER_SIGNAL_EXCEPTION'});
  });
  await t.test('verified exact aliases fill only missing SKU maps and preserve original supplier wording',async()=>{
    const a=(await aliases.create(ctx(),{supplierId:partner.supplierId,supplierCode:'SUP-A4',supplierDescription:' Supplier A4 ',skuId:skus[0].id,sourceReference:'Synthetic alias evidence'})).item;
    for(const decision of ['REVIEWED','VERIFIED'])await reviews.review(ctx(authorizer),'alias',a.id,{decision,reason:'Exact source checked'});
    const i=(await importXml(invoiceXml())).item;await map(i.id,original,[],{autoMap:true});const lines=(await invoices.lines(ctx(),i.id,{})).items;
    assert.equal(lines[0].basis,'VERIFIED_ALIAS');assert.equal(lines[0].aliasId,a.id);assert.equal(lines[1].skuId,null);assert.ok((await invoices.validation(ctx(),i.id,{})).items.some(e=>e.code==='UNMAPPED_LINE'));
    const changed=(await importXml(invoiceXml().replace(' Supplier A4 ','Supplier A4'))).item;await map(changed.id,original,[],{autoMap:true});assert.equal((await invoices.lines(ctx(),changed.id,{})).items[0].skuId,null);
  });
  await t.test('mixed VAT stays line-specific; unsupported arithmetic, discounts and taxes block release',async()=>{
    for(const xml of [invoiceXml().replace('<cbc:Amount currencyID="TRY">0.00','<cbc:Amount currencyID="TRY">1.00'),invoiceXml().replaceAll('<cbc:Percent>10.000000','<cbc:Percent>11.000000'),invoiceXml().replaceAll('<cbc:TaxTypeCode>0015','<cbc:TaxTypeCode>9999')]){
      const i=(await importXml(xml)).item;await map(i.id);assert.equal((await invoices.validation(ctx(),i.id,{})).summary.canSubmit,false);await assert.rejects(action(i.id,'submit',ctx()),{code:'INVOICE_EXCEPTIONS'});
    }
  });
  await t.test('supplier/customer, order, unit, price and source scope mismatches stay explicit',async()=>{
    const i=(await importXml(invoiceXml({receiverTax:'3333333333'}))).item;await map(i.id);assert.ok((await invoices.validation(ctx(),i.id,{})).items.some(e=>e.code==='RECIPIENT_MISMATCH'));
    const wrongPrice=(await importXml(invoiceXml({lines:[{code:'A4',name:'Item',quantity:'1',price:'101'}]}))).item;await map(wrongPrice.id);assert.ok((await invoices.validation(ctx(),wrongPrice.id,{})).items.some(e=>e.code==='PRICE_MISMATCH'));
    const rows=(await invoices.lines(ctx(),wrongPrice.id,{})).items;await assert.rejects(map(wrongPrice.id,original,[{invoiceLineId:rows[0].id,skuId:skus[1].id,orderLineId:original.lines[0].id,unitConfirmed:true}]),{code:'ORDER_SOURCE_MISMATCH'});
    await assert.rejects(invoices.lineSource(ctx(),wrongPrice.id,(await invoices.lines(ctx(),i.id,{})).items[0].id),{code:'NOT_FOUND'});
  });
  await t.test('two invoice submissions cannot claim the same remaining order quantity; reject/cancel releases it',async()=>{
    const o=await order('1',1,['100']),body=()=>invoiceXml({orderReference:o.item.reference,lines:[{code:'A4',name:'Item',quantity:'1',price:'100'}]});
    const a=(await importXml(body())).item,b=(await importXml(body())).item;await map(a.id,o);await map(b.id,o);
    const races=await Promise.allSettled([action(a.id,'submit',ctx()),action(b.id,'submit',ctx())]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);const winner=(await invoices.get(ctx(),a.id)).item.status==='REQUESTED'?a:b,loser=winner.id===a.id?b:a;
    await action(winner.id,'reject');await action(loser.id,'submit',ctx());await action(loser.id,'approve');await action(loser.id,'cancel');
    const c=(await importXml(body())).item;await map(c.id,o);assert.equal((await invoices.validation(ctx(),c.id,{})).summary.canSubmit,true);
  });
  await t.test('stale referenced details block approval, and importing/mapping/submission actors cannot self-approve',async()=>{
    const o=await order('2',1,['100']),i=(await importXml(invoiceXml({lines:[{code:'A4',name:'Item',quantity:'1',price:'100'}]}))).item;await map(i.id,o);await action(i.id,'submit',ctx());
    await query("UPDATE trading_partners SET address='Changed after submission' WHERE id=?",[partner.id]);try{await assert.rejects(action(i.id,'approve'),{code:'INVOICE_EXCEPTIONS'});assert.equal((await invoices.validation(ctx(),i.id,{})).summary.reviewStale,true);}finally{await query("UPDATE trading_partners SET address='' WHERE id=?",[partner.id]);}
    await action(i.id,'reopen');assert.equal((await invoices.get(ctx(),i.id)).item.status,'STAGED');
    assert.ok((await invoices.decisions(ctx(),i.id,{})).items.some(e=>e.action==='REOPEN'));
    await map(i.id,o);await action(i.id,'submit',ctx());await action(i.id,'approve');
    const prior=await invoices.decisions(ctx(),i.id,{});assert.equal(prior.items.filter(e=>e.action==='SUBMIT').length,2);
    await action(i.id,'cancel');
    const next=(await importXml(invoiceXml({lines:[{code:'A4',name:'Item',quantity:'1',price:'100'}]}))).item,l=(await invoices.lines(ctx(),next.id,{})).items[0];
    await invoices.savePlan(ctx(authorizer),next.id,{expectedRevision:0,partnerId:partner.id,orderId:o.item.id,reason:'Different mapper',updates:[{invoiceLineId:l.id,skuId:skus[0].id,orderLineId:o.lines[0].id,unitConfirmed:true}]});await action(next.id,'submit',ctx());
    await assert.rejects(action(next.id,'approve',ctx(authorizer)),{code:'INDEPENDENT_REVIEW_REQUIRED'});await action(next.id,'cancel');
  });
  await t.test('audit failure rolls back imported XML, mappings, review and retry records atomically',async()=>{
    const i=(await importXml(invoiceXml())).item,unmapped=(await importXml(invoiceXml())).item;await map(i.id);await action(i.id,'submit',ctx());const count=(await invoices.list(ctx(),{})).total;
    await getMigrationPool().query("CREATE TRIGGER fail_invoice_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'");
    try{await assert.rejects(importXml(invoiceXml()));await assert.rejects(action(i.id,'approve'));await assert.rejects(map(unmapped.id));}finally{await getMigrationPool().query('DROP TRIGGER fail_invoice_audit');}
    assert.equal((await invoices.list(ctx(),{})).total,count);assert.equal((await invoices.get(ctx(),i.id)).item.status,'REQUESTED');await action(i.id,'cancel');
    assert.equal((await invoices.get(ctx(),unmapped.id)).item.revision,0);assert.equal((await invoices.plans(ctx(),unmapped.id,{})).total,0);
  });
  await t.test('301 source lines map/approve in batches with independent IDs and paged source evidence',async()=>{
    const o=await order('1',301,['1.234567']),xml=invoiceXml({lines:Array.from({length:301},(_,i)=>({code:'BULK-'+i,name:'Synthetic item '+i,quantity:'1',price:'1.234567',rate:i%2?'10':'20'}))});
    const i=(await importXml(xml)).item;await map(i.id,o);await action(i.id,'submit',ctx());await action(i.id,'approve');assert.equal((await invoices.lines(ctx(),i.id,{offset:'300'})).items[0].lineKey,'301');assert.equal((await invoices.lines(ctx(),i.id,{offset:'300'})).total,301);
  });
  await t.test('read-only and cross-tenant/entity access, HTTP auth/CSRF/idempotency are enforced',async()=>{
    await query("INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,'purchasing.read')",[f.alpha.tenantId,f.viewerRole]);await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.viewer,f.viewerRole,f.alpha.entityId]);
    assert.equal((await invoices.get(ctx(f.viewer),imported.id)).item.id,imported.id);await assert.rejects(importXml(invoiceXml(),ctx(f.viewer)),{code:'FORBIDDEN'});await assert.rejects(invoices.get(ctx(f.alpha.userId,f.secondEntity),imported.id),{code:'NOT_FOUND'});
    const beta={identity:{tenantId:f.beta.tenantId,userId:f.beta.userId},entityId:f.beta.entityId};await assert.rejects(invoices.source(beta,imported.id),{code:'NOT_FOUND'});
    const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const cookies=new Map();const call=async(path,method='GET',body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:r.status,body:await r.json()};};
    try{const base=`/entities/${f.alpha.entityId}/purchasing/invoices`;assert.equal((await call(base)).status,401);let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
      const body={xml:invoiceXml(),fileName:'http.xml',evidence:'HTTP fixture'},headers={'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()};assert.equal((await call(base,'POST',body)).status,403);const first=await call(base,'POST',body,headers);assert.equal(first.status,200);assert.equal((await call(base,'POST',body,headers)).body.item.id,first.body.item.id);assert.equal((await call(base+'/'+first.body.item.id,'PATCH',{},headers)).status,404);
    }finally{await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('no stock/GL posting and no destructive source edit routes are introduced',async()=>{for(const table of ['stock_receipts','inventory_events','journals'])assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,0);await runMigrations();});
});
