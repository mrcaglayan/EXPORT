import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { query } from '../src/db/query.js';
import { getMigrationPool, closePool } from '../src/db/pool.js';
import { runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { triggers } from '../src/migrations/m012_purchasing_foundation.js';
import { createFixtures } from './auth-fixtures.js';
import { createApp } from '../src/app.js';
import * as products from '../src/services/products.service.js';
import * as catalogue from '../src/services/product-references.service.js';
import * as partners from '../src/services/trading-partners.service.js';
import * as docs from '../src/services/purchasing-documents.service.js';
import * as refs from '../src/services/purchasing-references.service.js';

assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-03A purchasing source identity, approvals, quantities and atomic history',{timeout:180000},async t=>{
  t.after(closePool);await runMigrations({migrations:migrations.slice(0,11)});const f=await createFixtures();
  const ctx=(userId=f.alpha.userId,entityId=f.alpha.entityId)=>({identity:{tenantId:f.alpha.tenantId,userId},entityId,requestId:'purchasing-test',idempotencyKey:randomUUID()});
  const beta=()=>({identity:{tenantId:f.beta.tenantId,userId:f.beta.userId},entityId:f.beta.entityId,requestId:'purchasing-test',idempotencyKey:randomUUID()});
  const supplier=(await catalogue.save(ctx(),'suppliers',{code:'SUP-EXISTING',name:'Existing catalogue supplier'})).item;
  const {rows:history}=await query('SELECT * FROM schema_migrations ORDER BY migration_key'),{rows:oldSuppliers}=await query('SELECT * FROM product_suppliers ORDER BY id');
  await t.test('upgrade preserves supplier identities and migration history; rerun, tamper detection and recovery',async()=>{
    const upgradePurchasing=options=>runMigrations({...options,migrations:migrations.slice(0,12)});
    await upgradePurchasing();await upgradePurchasing();assert.equal((await query('SHOW TABLES')).rows.length,63);
    assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key<>'m012_purchasing_foundation' ORDER BY migration_key")).rows,history);
    assert.deepEqual((await query('SELECT * FROM product_suppliers ORDER BY id')).rows,oldSuppliers);
    for(const table of ['trading_partners','purchasing_documents','purchase_request_lines','purchase_order_lines'])assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,0);
    const tr=triggers.find(r=>r[0]==='purchase_order_line_insert');await getMigrationPool().query(`DROP TRIGGER ${tr[0]}`);
    try{await assert.rejects(upgradePurchasing(),/trigger differs/);}finally{await getMigrationPool().query(`CREATE TRIGGER ${tr[0]} BEFORE ${tr[1]} ON ${tr[2]} FOR EACH ROW ${tr[3]}`);}
    await query("UPDATE schema_migrations SET status='running' WHERE migration_key='m012_purchasing_foundation'");await assert.rejects(upgradePurchasing(),{code:'MIGRATION_RECOVERY_REQUIRED'});await upgradePurchasing({retryKey:'m012_purchasing_foundation'});await runMigrations();
  });
  const reviewRole=randomUUID();await query("INSERT INTO roles (id,tenant_id,code,name) VALUES (?,?,'PURCHASE_REVIEWER','Purchase reviewer')",[reviewRole,f.alpha.tenantId]);
  for(const p of ['workspace.read','purchasing.read','purchasing.approve'])await query('INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,?)',[f.alpha.tenantId,reviewRole,p]);
  await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.noAccess,reviewRole,f.alpha.entityId]);
  await query("INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,'purchasing.read')",[f.alpha.tenantId,f.viewerRole]);
  await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)',[f.alpha.tenantId,f.viewer,f.viewerRole,f.alpha.entityId]);
  const reviewer=()=>ctx(f.noAccess),reader=()=>ctx(f.viewer);
  const unit=(await products.save(ctx(),'units',{code:'EA',name:'Each',symbol:'ea',quantityPrecision:6})).item;
  const family=(await products.save(ctx(),'families',{code:'GOODS',name:'Goods',parentId:null})).item;
  const skus=[];for(const code of ['A4','A3'])skus.push((await products.save(ctx(),'skus',{code,name:code,description:'Synthetic purchasing item',familyId:family.id,baseUnitId:unit.id})).item);
  const common=()=>({reference:randomUUID(),documentDate:'2026-10-01',purpose:'Synthetic purchasing evidence',terms:'Agreed delivery terms',ebysReference:'EBYS-SYNTHETIC-001'});
  const pbody=(code,extra={})=>({code,name:'Synthetic supplier',kind:'SUPPLIER',countryCode:'TR',taxIdentifier:null,taxOffice:'',address:'Synthetic address',email:'',phone:'',...extra});
  const updatePartner=item=>Object.fromEntries(['name','countryCode','taxIdentifier','taxOffice','address','email','phone','active'].map(key=>[key,item[key]]));
  const approve=(resource,id)=>docs.act(reviewer(),resource,id,'approve',{reason:'Independent EBYS and source review'});
  const request=async(quantity='10',count=2)=>docs.create(ctx(),'requests',{...common(),requiredBy:'2026-10-31',lines:Array.from({length:count},(_,i)=>({lineKey:`source-${i+1}`,skuId:skus[i%2].id,description:`Original requested item ${i+1}`,quantity}))});
  let partner,contract,req,requestLines,order;
  await t.test('partners reuse existing catalogue suppliers and retain customer-only identities',async()=>{
    partner=(await partners.save(ctx(),pbody('SUP',{supplierId:supplier.id}))).item;
    assert.equal(partner.supplierId,supplier.id);assert.equal((await query('SELECT COUNT(*) AS n FROM product_suppliers')).rows[0].n,1);
    await assert.rejects(partners.save(ctx(),pbody('DUP',{supplierId:supplier.id})),{code:'DUPLICATE_CODE'});
    const customer=(await partners.save(ctx(),pbody('CUSTOMER',{kind:'CUSTOMER'}))).item;assert.equal(customer.supplierId,null);
    const fresh=(await partners.save(ctx(),pbody('BOTH',{kind:'BOTH',taxIdentifier:'SYNTHETIC-TAX'}))).item;assert.ok(fresh.supplierId);
    await assert.rejects(partners.save(ctx(),pbody('DUP-TAX',{taxIdentifier:'SYNTHETIC-TAX'})),{code:'DUPLICATE_CODE'});
    assert.equal((await refs.reference(reader(),'suppliers',{})).total,2);assert.equal((await partners.list(ctx(),{q:'SUP',kind:'SUPPLIER'})).items.some(p=>p.id===partner.id),true);
    await assert.rejects(partners.save(ctx(),pbody('FOREIGN',{supplierId:randomUUID()})),{code:'NOT_FOUND'});
    await assert.rejects(partners.save(ctx(),{...updatePartner(partner),kind:'BOTH'},partner.id),{code:'VALIDATION_ERROR'});
  });
  await t.test('contracts preserve supplier snapshot, dates and EBYS with independent approval',async()=>{
    contract=(await docs.create(ctx(),'contracts',{...common(),partnerId:partner.id,currency:'TRY',validFrom:'2026-10-01',validTo:'2026-12-31'})).item;
    assert.equal(contract.partnerSnapshot.supplierId,supplier.id);
    await assert.rejects(docs.act(ctx(),'contracts',contract.id,'approve',{reason:'Self approve'}),{code:'INDEPENDENT_REVIEW_REQUIRED'});
    contract=(await approve('contracts',contract.id)).item;assert.equal(contract.status,'APPROVED');
    await assert.rejects(docs.create(ctx(),'contracts',{...common(),partnerId:partner.id,currency:'TRY',validFrom:'2026-12-31',validTo:'2026-10-01'}),{code:'VALIDATION_ERROR'});
  });
  await t.test('requests retain multiple SKUs and stable lines before approving an order',async()=>{
    req=(await request()).item;requestLines=(await docs.lines(ctx(),'requests',req.id,{})).items;
    assert.equal(requestLines.length,2);assert.deepEqual(requestLines.map(l=>l.lineKey),['source-1','source-2']);assert.notEqual(requestLines[0].skuId,requestLines[1].skuId);
    assert.equal(requestLines[0].skuSnapshot.unitCode,'EA');assert.equal(requestLines[0].availableQuantity,'10.000000');
    await assert.rejects(docs.create(ctx(),'orders',{...common(),partnerId:partner.id,requestId:req.id,currency:'TRY',requiredBy:'2026-10-31',lines:[{requestLineId:requestLines[0].id,quantity:'1',unitPrice:'1'}]}),{code:'REQUEST_NOT_APPROVED'});
    req=(await approve('requests',req.id)).item;
  });
  const orderBody=(overrides={})=>({...common(),partnerId:partner.id,requestId:req.id,contractId:contract.id,currency:'TRY',requiredBy:'2026-10-31',lines:requestLines.map((l,i)=>({requestLineId:l.id,quantity:i?'1':'4',unitPrice:i?'0':'123.456789',...(i&&{freeReason:'Supplier-approved free sample'})})),...overrides});
  await t.test('multi-item order retains exact decimal prices, free goods and idempotent replay',async()=>{
    const context=ctx(),body=orderBody();order=(await docs.create(context,'orders',body)).item;
    assert.equal(order.netTotal,'493.827156');assert.equal((await docs.create(context,'orders',body)).item.id,order.id);
    await assert.rejects(docs.create(context,'orders',{...body,purpose:'Different'}),{code:'IDEMPOTENCY_CONFLICT'});
    assert.equal((await docs.lines(ctx(),'requests',req.id,{})).items[0].availableQuantity,'6.000000');
    const lines=(await docs.lines(ctx(),'orders',order.id,{})).items;assert.equal(lines[1].netAmount,'0.000000');assert.equal(lines[1].freeReason,'Supplier-approved free sample');
    await assert.rejects(docs.create(ctx(),'orders',orderBody({currency:'USD'})),{code:'CONTRACT_MISMATCH'});
    await assert.rejects(docs.create(ctx(),'orders',orderBody({lines:[{requestLineId:requestLines[0].id,quantity:'1',unitPrice:'0'}]})),{code:'VALIDATION_ERROR'});
    await approve('orders',order.id);
  });
  await t.test('concurrent split orders reserve only remaining request quantity; reject and cancel release it',async()=>{
    const r=(await request('10',1)).item;await approve('requests',r.id);const line=(await docs.lines(ctx(),'requests',r.id,{})).items[0];
    const body=()=>orderBody({requestId:r.id,lines:[{requestLineId:line.id,quantity:'7',unitPrice:'1'}]});
    const result=await Promise.allSettled([docs.create(ctx(),'orders',body()),docs.create(ctx(),'orders',body())]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'REQUEST_QUANTITY_EXCEEDED');
    const first=result.find(r=>r.status==='fulfilled').value.item;await docs.act(reviewer(),'orders',first.id,'reject',{reason:'Declined supplier quote'});
    const second=(await docs.create(ctx(),'orders',body())).item;await approve('orders',second.id);await docs.act(ctx(),'orders',second.id,'cancel',{reason:'No external commitment sent'});
    assert.equal((await docs.lines(ctx(),'requests',r.id,{})).items[0].availableQuantity,'10.000000');
  });
  await t.test('pending and approved content is immutable; parent cancellations guard dependent orders',async()=>{
    await assert.rejects(docs.act(ctx(),'requests',req.id,'cancel',{reason:'Try cancelling source'}),{code:'DEPENDENT_ORDERS'});
    await assert.rejects(docs.act(ctx(),'contracts',contract.id,'cancel',{reason:'Try cancelling source'}),{code:'DEPENDENT_ORDERS'});
    await assert.rejects(query("UPDATE purchasing_documents SET ebys_reference='changed' WHERE id=?",[order.id]),{code:'ER_SIGNAL_EXCEPTION'});
    await assert.rejects(query('UPDATE purchase_order_lines SET quantity=1 WHERE order_id=?',[order.id]),{code:'ER_SIGNAL_EXCEPTION'});
    await assert.rejects(query('DELETE FROM purchase_request_lines WHERE request_id=?',[req.id]),{code:'ER_SIGNAL_EXCEPTION'});
    await assert.rejects(partners.save(ctx(),{...updatePartner(partner),active:false},partner.id),{code:'PARTNER_IN_USE'});
    await assert.rejects(query("UPDATE trading_partners SET supplier_id=NULL WHERE id=?",[partner.id]),{code:'ER_SIGNAL_EXCEPTION'});
  });
  await t.test('scope, read-only and reviewer permissions are independently enforced',async()=>{
    assert.equal((await docs.get(reader(),'orders',order.id)).item.id,order.id);await assert.rejects(docs.create(reader(),'requests',{...common()}),{code:'VALIDATION_ERROR'});
    await assert.rejects(partners.save(reader(),pbody('DENIED')),{code:'FORBIDDEN'});await assert.rejects(partners.save(reviewer(),pbody('DENIED')),{code:'FORBIDDEN'});
    await assert.rejects(docs.get(beta(),'orders',order.id),{code:'NOT_FOUND'});await assert.rejects(docs.get(ctx(f.alpha.userId,f.secondEntity),'orders',order.id),{code:'NOT_FOUND'});
    await assert.rejects(refs.auditEvents(reader(),{}),{code:'FORBIDDEN'});assert.ok((await refs.auditEvents(ctx(),{})).total>0);
    await assert.rejects(docs.act(reviewer(),'orders',order.id,'cancel',{reason:'Not requester'}),{code:'FORBIDDEN'});
  });
  await t.test('stale partner, inactive source and changed base-unit checks precede approval',async()=>{
    const pending=(await docs.create(ctx(),'orders',orderBody({lines:[{requestLineId:requestLines[0].id,quantity:'1',unitPrice:'5'}]}))).item;
    await partners.save(ctx(),{...updatePartner(partner),address:'Changed address'},partner.id);
    await assert.rejects(approve('orders',pending.id),{code:'STALE_PARTNER'});
    assert.equal((await docs.get(ctx(),'contracts',contract.id)).item.partnerSnapshot.address,'Synthetic address');
    await docs.act(ctx(),'orders',pending.id,'cancel',{reason:'Resubmit current supplier evidence'});await partners.save(ctx(),updatePartner(partner),partner.id);
    const r=(await request('1',1)).item;await query('UPDATE product_skus SET active=0 WHERE id=?',[skus[0].id]);try{await assert.rejects(approve('requests',r.id),{code:'INACTIVE_REFERENCE'});}finally{await query('UPDATE product_skus SET active=1 WHERE id=?',[skus[0].id]);}
    await query('UPDATE unit_of_measure SET quantity_precision=0 WHERE id=?',[unit.id]);try{await assert.rejects(request('0.5',1),{code:'QUANTITY_PRECISION'});}finally{await query('UPDATE unit_of_measure SET quantity_precision=6 WHERE id=?',[unit.id]);}
  });
  await t.test('audit failure rolls back creation and approval including quantity commitments',async()=>{
    const r=(await request('1',1)).item;const before=(await query('SELECT COUNT(*) AS n FROM purchasing_documents')).rows[0].n;
    const available=(await docs.lines(ctx(),'requests',req.id,{})).items[0].availableQuantity;
    await getMigrationPool().query("CREATE TRIGGER fail_purchasing_audit BEFORE INSERT ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'");
    try{await assert.rejects(request());await assert.rejects(approve('requests',r.id));await assert.rejects(docs.create(ctx(),'orders',orderBody({lines:[{requestLineId:requestLines[0].id,quantity:'1',unitPrice:'1'}]})));}finally{await getMigrationPool().query('DROP TRIGGER fail_purchasing_audit');}
    assert.equal((await query('SELECT COUNT(*) AS n FROM purchasing_documents')).rows[0].n,before);assert.equal((await docs.get(ctx(),'requests',r.id)).item.status,'REQUESTED');
    assert.equal((await docs.lines(ctx(),'requests',req.id,{})).items[0].availableQuantity,available);
  });
  await t.test('source-line substitution, direct SQL over-ordering and invalid dates cannot bypass the workflow',async()=>{
    const r=(await request('1',1)).item;await approve('requests',r.id);const foreignLine=(await docs.lines(ctx(),'requests',r.id,{})).items[0];
    await assert.rejects(docs.create(ctx(),'orders',orderBody({lines:[{requestLineId:foreignLine.id,quantity:'1',unitPrice:'1'}]})),{code:'NOT_FOUND'});
    await assert.rejects(docs.create(ctx(),'orders',orderBody({documentDate:'2026-09-30'})),{code:'SOURCE_DATE'});
    await assert.rejects(docs.create(ctx(),'orders',orderBody({documentDate:'2027-01-01',requiredBy:'2027-01-02'})),{code:'CONTRACT_MISMATCH'});
    const source=(await query('SELECT * FROM purchasing_documents WHERE id=?',[order.id])).rows[0];
    const bypassId=randomUUID();await query(`INSERT INTO purchasing_documents (id,tenant_id,legal_entity_id,kind,reference,document_date,required_by,partner_id,request_id,contract_id,partner_snapshot,currency,purpose,terms,ebys_reference,line_count,net_total,created_by) VALUES (?,?,?,'ORDER',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[bypassId,f.alpha.tenantId,f.alpha.entityId,randomUUID(),source.document_date,source.required_by,source.partner_id,source.request_id,source.contract_id,JSON.stringify(source.partner_snapshot),source.currency,source.purpose,source.terms,source.ebys_reference,1,'10',f.alpha.userId]);
    await assert.rejects(query('INSERT INTO purchase_order_lines (id,tenant_id,legal_entity_id,order_id,line_number,request_line_id,quantity,unit_price,net_amount,free_reason) VALUES (?,?,?,?,1,?,10,1,10,NULL)',[randomUUID(),f.alpha.tenantId,f.alpha.entityId,bypassId,requestLines[0].id]),{code:'ER_SIGNAL_EXCEPTION'});
    await assert.rejects(query("UPDATE purchasing_documents SET status='REQUESTED' WHERE id=?",[bypassId]),{code:'ER_SIGNAL_EXCEPTION'});
    // This intentionally incomplete document lives only in this disposable schema.
    await assert.rejects(query("UPDATE purchasing_documents SET status='APPROVED',reviewed_by=created_by,reviewed_at=CURRENT_TIMESTAMP,review_reason='Bypass' WHERE id=?",[bypassId]),{code:'ER_SIGNAL_EXCEPTION'});
  });
  await t.test('301 source lines and free/decimal orders use paged reads without a business line cap',async()=>{
    const r=(await request('1.234567',301)).item;await approve('requests',r.id);const all=[];for(let offset=0;offset<301;offset+=100)all.push(...(await docs.lines(ctx(),'requests',r.id,{offset:String(offset),limit:'100'})).items);
    assert.equal(all.length,301);const o=(await docs.create(ctx(),'orders',orderBody({requestId:r.id,lines:all.map(l=>({requestLineId:l.id,quantity:'1.234567',unitPrice:'0.333333'}))}))).item;
    await approve('orders',o.id);assert.equal(o.netTotal,'123.868122');const last=await docs.lines(ctx(),'orders',o.id,{offset:'300'});assert.equal(last.total,301);assert.equal(last.items.length,1);assert.equal(last.items[0].requestLineKey,'source-301');
    assert.equal((await docs.list(ctx(),'orders',{limit:'1',offset:'1'})).items.length,1);await assert.rejects(docs.list(ctx(),'orders',{limit:'101'}),{code:'VALIDATION_ERROR'});
  });
  await t.test('HTTP session, CSRF, idempotency and scoped source reads',async()=>{
    const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const cookies=new Map();
    const call=async(path,method='GET',body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:r.status,body:await r.json()};};
    try{const base=`/entities/${f.alpha.entityId}/purchasing`;assert.equal((await call(`${base}/requests`)).status,401);let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
      const body=pbody('HTTP');assert.equal((await call(`${base}/partners`,'POST',body)).status,403);assert.equal((await call(`${base}/partners`,'POST',body,{'X-CSRF-Token':csrf})).body.error.code,'IDEMPOTENCY_KEY_REQUIRED');
      const headers={'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},first=await call(`${base}/partners`,'POST',body,headers);assert.equal(first.status,200);assert.equal((await call(`${base}/partners`,'POST',body,headers)).body.item.id,first.body.item.id);
      assert.equal((await call(`${base}/orders/${order.id}/lines`)).body.items.length,2);assert.equal((await call(`${base}/orders/${order.id}`,'PATCH',{},headers)).status,404);
    }finally{await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('purchasing has no stock, journal or VAT effects and migrations still verify',async()=>{
    for(const table of ['stock_receipts','inventory_events','journals'])assert.equal((await query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,0);
    await runMigrations();
  });
});
