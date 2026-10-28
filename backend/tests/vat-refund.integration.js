import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
import {query} from '../src/db/query.js';
import {closePool,getMigrationPool} from '../src/db/pool.js';
import {runMigrations} from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import {tables,triggers} from '../src/migrations/m019_vat_refund_reconciliation.js';
import {createVatCostFixture} from './vat-cost-fixture.js';
import * as accounting from '../src/services/accounting-setup.service.js';
import * as costs from '../src/services/vat-cost.service.js';
import * as vat from '../src/services/vat-attributions.service.js';
import * as refund from '../src/services/vat-refund.service.js';
import * as invoices from '../src/services/purchase-invoices.service.js';
import {postJournal} from '../src/services/journal.service.js';
import {invoiceXml} from './invoice-xml-fixture.js';
assert.equal(process.env.DB_NAME,process.env.PR00_TEST_DATABASE);
test('PR-06A deductions, closed KDV1 months and duplicate-safe refund approval',{timeout:300000},async t=>{
 t.after(closePool);await runMigrations({migrations:migrations.slice(0,18)});const before=(await query('SELECT * FROM schema_migrations ORDER BY migration_key')).rows;
 await t.test('additive migration, drift detection and explicit interrupted recovery',async()=>{
  await runMigrations({migrations:migrations.slice(0,19)});await runMigrations({migrations:migrations.slice(0,19)});assert.equal((await query('SHOW TABLES')).rows.length,106);assert.deepEqual((await query("SELECT * FROM schema_migrations WHERE migration_key<>'m019_vat_refund_reconciliation' ORDER BY migration_key")).rows,before);
  for(const [table]of tables)assert.equal((await query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n,0);
  const tr=triggers.find(x=>x[0]==='vat_refund_requests_update');await getMigrationPool().query('DROP TRIGGER '+tr[0]);try{await assert.rejects(runMigrations({migrations:migrations.slice(0,19)}),/trigger differs/);}finally{await getMigrationPool().query('CREATE TRIGGER '+tr[0]+' BEFORE '+tr[1]+' ON '+tr[2]+' FOR EACH ROW '+tr[3]);}
  await query("UPDATE schema_migrations SET status='running' WHERE migration_key='m019_vat_refund_reconciliation'");await assert.rejects(runMigrations({migrations:migrations.slice(0,19)}),{code:'MIGRATION_RECOVERY_REQUIRED'});await runMigrations({migrations:migrations.slice(0,19),retryKey:'m019_vat_refund_reconciliation'});
 });
 const f=await createVatCostFixture(),{ctx,reviewer,purchase,enroll,exit,body,financial}=f,reason={reason:'Independent synthetic tax review'},proof=()=>({reference:randomUUID(),reason:'Synthetic tax review',evidence:'Retained synthetic tax evidence'});
 const purchased=await purchase([{code:'A',name:'Synthetic goods',quantity:'1000',price:'100',rate:'10'}]),source=(await enroll(purchased)).items[0];
 const exported=await exit(301,'1'),goods=(await vat.request(ctx(),body(exported))).item;await vat.act(reviewer(),goods.id,'approve',reason);
 const basis=(await costs.request(ctx(),'basis',{...proof(),period:'2026-10',eligibleValue:'100000',totalValue:'200000',vatFreeValue:'0',generalRate:'20',turnoverEvidence:'Complete synthetic turnover',rateEvidence:'Synthetic dated general rate',completenessConfirmed:true})).item;await costs.act(reviewer(),'basis',basis.id,'approve',reason);
 const di=()=>({...proof(),sourceKind:'GOODS',sourceId:source.id,taxEventDate:'2026-10-10',deductedVat:'10000',priorRefundedVat:'0',bookEvidence:'Synthetic legal book record',eligibilityEvidence:'Reviewed original deductible tax',priorClaimsEvidence:'Synthetic no prior claims'});
 let d,r;
 await t.test('original deduction, legal date window, independent review and idempotency',async()=>{
  await assert.rejects(refund.preview(ctx(),'deduction',{...di(),taxEventDate:'2024-01-01'}),{code:'VAT_DEDUCTION_DATE'});await assert.rejects(refund.preview(ctx(),'deduction',{...di(),taxEventDate:'2026-10-11'}),{code:'VAT_DEDUCTION_DATE'});
  const c=ctx(),input=di();d=(await refund.request(c,'deduction',input)).item;assert.equal((await refund.request(c,'deduction',input)).item.id,d.id);assert.equal(d.period,'2026-10');
  await assert.rejects(refund.act(ctx(),'deduction',d.id,'approve',reason),{code:'INDEPENDENT_REVIEW_REQUIRED'});await refund.act(reviewer(),'deduction',d.id,'approve',reason);await assert.rejects(refund.request(ctx(),'deduction',di()),{code:'VAT_DEDUCTION_DUPLICATE'});
 });
 let costSource,costDeduction,costAllocation;
 await t.test('non-stock deduction retains original journal and previously refunded source capacity',async()=>{
  const invoice=(await invoices.importXml(ctx(),{xml:invoiceXml({date:'2026-10-10',lines:[{code:'FREIGHT',name:'Synthetic freight',quantity:'1',price:'1000',rate:'10'}]}),fileName:'cost.xml',evidence:'Synthetic source'})).item,line=(await invoices.lines(ctx(),invoice.id,{})).items[0];
  await postJournal(ctx(),{sourceModule:'VAT_COST_INVOICE',sourceId:invoice.uuid,documentDate:'2026-10-10',postingDate:'2026-10-10',currency:'TRY',description:'Original freight tax',lines:[{accountId:f.a['191.20'],description:'Original VAT',debit:'100',credit:'0'},{accountId:f.a['320'],description:'Supplier',debit:'0',credit:'100'}]});
  const jl=(await costs.journalLines(ctx(),line.id,{})).items[0];costSource=(await costs.request(ctx(),'source',{...proof(),invoiceLineId:line.id,vatJournalLineId:jl.id,category:'DIRECT_CHARGE',exchangeRate:'1',exchangeDate:'2026-10-10',exchangeEvidence:'Same currency',deductibleVat:'100',availableVat:'100',deductionEvidence:'Synthetic legal eligibility'})).item;await costs.act(reviewer(),'source',costSource.id,'approve',reason);
  costDeduction=(await refund.request(ctx(),'deduction',{...di(),sourceKind:'COST',sourceId:costSource.id,deductedVat:'100',priorRefundedVat:'40'})).item;await refund.act(reviewer(),'deduction',costDeduction.id,'approve',reason);
  await assert.rejects(costs.act(ctx(),'source',costSource.id,'request-void',{...reason,evidence:'Correction'}),{code:'VAT_DEDUCTION_DEPENDENCY'});
  const bl=(await costs.lines(ctx(),'basis',basis.id,{limit:'1'})).items[0];costAllocation=(await costs.request(ctx(),'allocation',{...proof(),sourceId:costSource.id,basisId:basis.id,treatment:'CANDIDATE',basisVat:'100',assetEligibleValue:'0',assetTotalValue:'0',useEvidence:'',relationshipEvidence:'Synthetic direct export freight',earlierCategoriesComplete:true,lines:[{basisLineId:bl.id,weight:'1'}]})).item;await costs.act(reviewer(),'allocation',costAllocation.id,'approve',reason);
 });
 const p=(await accounting.list(ctx(),'accounting_periods',{})).items[0];
 const ri=()=>({...proof(),accountingPeriodId:p.id,previousId:null,basisId:basis.id,openingCarry:'0',otherDeductions:'0',declaredTotalDeductions:'10100',outputVat:'1100',otherRefundVat:'0',exportRefundVat:'3010',declaredPayableVat:'0',declaredClosingCarry:'5990',externalClaimedVat:'0',externalCashVat:'0',filingReference:'SYNTHETIC-KDV1-V1',returnEvidence:'Latest synthetic filed return',openingEvidence:'Reviewed opening baseline',otherAmountsEvidence:'Complete output and other deductions',priorClaimsEvidence:'No external refund requests',completenessConfirmed:true});
 await t.test('closed monthly return, declared amounts, frozen deductions and independent approval',async()=>{
  await assert.rejects(refund.preview(ctx(),'reconciliation',ri()),{code:'VAT_RETURN_MONTH'});await accounting.closePeriod(ctx(),p.id,reason);
  await assert.rejects(refund.preview(ctx(),'reconciliation',{...ri(),declaredClosingCarry:'9000'}),{code:'VAT_RETURN_MISMATCH'});
  r=(await refund.request(ctx(),'reconciliation',ri())).item;assert.equal(r.registeredVat,'10100.000000');assert.equal((await refund.lines(ctx(),'reconciliation',r.id,{})).items.length,2);
  await assert.rejects(refund.act(ctx(),'deduction',d.id,'request-void',{...reason,evidence:'Correction'}),{code:'VAT_PERIOD_RECONCILED'});
  await assert.rejects(refund.act(ctx(),'reconciliation',r.id,'approve',reason),{code:'INDEPENDENT_REVIEW_REQUIRED'});await refund.act(reviewer(),'reconciliation',r.id,'approve',reason);
  await assert.rejects(query("UPDATE accounting_periods SET status='OPEN' WHERE id=?",[p.id]),{code:'ER_SIGNAL_EXCEPTION'});
  await assert.rejects(costs.act(ctx(),'basis',basis.id,'request-void',{...reason,evidence:'Correction'}));
  await assert.rejects(costs.act(ctx(),'allocation',costAllocation.id,'request-void',{...reason,evidence:'Correction'}),{code:'VAT_PERIOD_RECONCILED'});
 });
 const candidates=[];for(let offset=0;offset<302;offset+=100)candidates.push(...(await refund.candidates(ctx(),r.id,{offset:String(offset),limit:'100'})).items);
 const qi=(lines=candidates.filter(l=>l.kind==='GOODS').map(l=>({kind:l.kind,candidateLineId:l.id,claimedVat:'10'})),total='3010')=>({...proof(),reconciliationId:r.id,method:'OFFSET',assurance:'NONE',requestedVat:total,proposedFilingDate:'2026-11-01',procedureEvidence:'Reviewed offset procedure and documents',eligibilityEvidence:'Synthetic standard goods export eligibility',specialTransactionEvidence:'',reviewRequired:false,documentsConfirmed:true,lines});
 await t.test('cost candidates obey original external-refund capacity and the shared return budget',async()=>{
  const cost=candidates.find(l=>l.kind==='COST');assert.equal(cost.sourceRemaining,'60.000000');const input=n=>qi([{kind:'COST',candidateLineId:cost.id,claimedVat:n}],n);
  await assert.rejects(refund.request(ctx(),'refund',input('70')),{code:'VAT_REFUND_SOURCE_EXCEEDED'});const request=(await refund.request(ctx(),'refund',input('60'))).item;await refund.act(reviewer(),'refund',request.id,'approve',reason);await assert.rejects(refund.request(ctx(),'refund',qi()),{code:'VAT_REFUND_BUDGET'});await refund.act(ctx(),'refund',request.id,'request-void',{...reason,evidence:'Synthetic correction'});await refund.act(reviewer(),'refund',request.id,'approve-void',reason);
 });
 let claim;
 await t.test('301 original lines, exact reservation, approval and no stock or GL writes',async()=>{
  assert.equal(candidates.filter(l=>l.kind==='GOODS').length,301);const before=await financial(),input=qi(),c=ctx();claim=(await refund.request(c,'refund',input)).item;assert.equal((await refund.request(c,'refund',input)).item.id,claim.id);assert.equal(claim.plan.rules.processingStatus,'WAITING_AGGREGATION');
  await assert.rejects(refund.request(ctx(),'refund',qi()),{code:'VAT_REFUND_DUPLICATE'});await assert.rejects(refund.act(ctx(),'refund',claim.id,'approve',reason),{code:'INDEPENDENT_REVIEW_REQUIRED'});await refund.act(reviewer(),'refund',claim.id,'approve',reason);assert.deepEqual(await financial(),before);
  assert.equal((await refund.lines(ctx(),'refund',claim.id,{offset:'300',limit:'100'})).items.length,1);await assert.rejects(refund.act(ctx(),'reconciliation',r.id,'request-void',{...reason,evidence:'Correction'}),{code:'VAT_REFUND_DEPENDENCIES'});
 });
 await t.test('void requires independent review, retains reservations and original history',async()=>{
  await refund.act(ctx(),'refund',claim.id,'request-void',{...reason,evidence:'Synthetic correction'});await assert.rejects(refund.request(ctx(),'refund',qi()),{code:'VAT_REFUND_DUPLICATE'});await refund.act(reviewer(),'refund',claim.id,'reject-void',reason);await refund.act(ctx(),'refund',claim.id,'request-void',{...reason,evidence:'New correction'});await refund.act(reviewer(),'refund',claim.id,'approve-void',reason);
  assert.equal((await refund.history(ctx(),'refund',claim.id,{})).items.length,6);assert.equal((await refund.get(ctx(),'refund',claim.id)).item.reviewReason,reason.reason);
 });
 await t.test('racing requests cannot double reserve the same source',async()=>{
  const race=await Promise.allSettled([refund.request(ctx(),'refund',qi()),refund.request(ctx(),'refund',qi())]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);const winner=race.find(x=>x.status==='fulfilled').value.item;await refund.act(ctx(),'refund',winner.id,'cancel',reason);
 });
 await t.test('late audit failure rolls back all claim rows, audit and idempotency',async()=>{
  const counts=async()=>Promise.all(['vat_refund_requests','vat_refund_lines','vat_refund_decisions','audit_events','idempotency_records'].map(async table=>(await query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n)),before=await counts();
  await getMigrationPool().query("CREATE TRIGGER test_refund_failure BEFORE INSERT ON audit_events FOR EACH ROW BEGIN IF NEW.action='vat.refund.requested' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic late failure'; END IF; END");try{await assert.rejects(refund.request(ctx(),'refund',qi()),{code:'ER_SIGNAL_EXCEPTION'});assert.deepEqual(await counts(),before);}finally{await getMigrationPool().query('DROP TRIGGER test_refund_failure');}
 });
 await t.test('scope, read permission, duplicate line and stale input controls',async()=>{
  await assert.rejects(refund.get(ctx(f.f.beta.userId,f.f.beta.entityId),'reconciliation',r.id));await assert.rejects(refund.request(ctx(),'refund',qi([qi().lines[0],qi().lines[0]],'20')));await assert.rejects(refund.request(ctx(),'refund',{...qi(),requestedVat:'3010.001'}));
  await assert.rejects(query('UPDATE vat_refund_lines SET claimed_vat=claimed_vat+1 WHERE refund_id=?',[claim.id]),{code:'ER_SIGNAL_EXCEPTION'});await assert.rejects(query('DELETE FROM vat_refund_requests WHERE id=?',[claim.id]),{code:'ER_SIGNAL_EXCEPTION'});
 });
 await t.test('session, CSRF, Origin, idempotency and entity permission gates protect new routes',async()=>{
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/api/v1',cookies=new Map(),root='/entities/'+f.f.alpha.entityId+'/vat';
  const call=async(path,method='GET',body,headers={})=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const value of response.headers.getSetCookie()){const[k,v]=value.split(';')[0].split('=');cookies.set(k,v);}const responseText=await response.text();return {status:response.status,body:responseText?JSON.parse(responseText):null};};
  try{assert.equal((await call(root+'/reconciliations')).status,401);let csrf=(await call('/auth/csrf')).body.csrfToken;await call('/auth/login','POST',{tenantCode:'ALPHA',email:'admin@alpha.test',password:f.f.password},{'X-CSRF-Token':csrf});csrf=(await call('/auth/csrf')).body.csrfToken;
   assert.equal((await call(root+'/refund-requests','POST',qi())).status,403);assert.equal((await call(root+'/refund-requests','POST',qi(),{'X-CSRF-Token':csrf})).status,400);assert.equal((await call(root+'/refund-requests','POST',qi(),{'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID(),Origin:'https://untrusted.example'})).status,403);assert.equal((await call(root+'/reconciliations/'+r.id+'/candidates?limit=1')).status,200);assert.equal((await call(root+'/refund-periods')).status,200);
   await call('/auth/logout','POST',{}, {'X-CSRF-Token':csrf});
  }finally{await new Promise(resolve=>server.close(resolve));}
  await assert.rejects(refund.list(ctx(f.f.viewer),'refund',{}),{code:'FORBIDDEN'});
 });
 await t.test('next month carries the refund-reduced balance and corrections unwind in reverse order',async()=>{
  const year=(await accounting.list(ctx(),'fiscal_years',{})).items[0],next=(await accounting.createPeriod(ctx(),{code:'NOV',fiscalYearId:year.id,startDate:'2026-11-01',endDate:'2026-11-30'})).period;await accounting.closePeriod(ctx(),next.id,reason);
  const input={...ri(),accountingPeriodId:next.id,previousId:r.id,basisId:null,openingCarry:'5990',declaredTotalDeductions:'5990',outputVat:'0',exportRefundVat:'0',declaredClosingCarry:'5990'};
  await assert.rejects(refund.request(ctx(),'reconciliation',{...input,openingCarry:'9000',declaredTotalDeductions:'9000',declaredClosingCarry:'9000'}),{code:'VAT_PREVIOUS_CARRY'});const nextRecord=(await refund.request(ctx(),'reconciliation',input)).item;await refund.act(reviewer(),'reconciliation',nextRecord.id,'approve',reason);
  await assert.rejects(refund.act(ctx(),'reconciliation',r.id,'request-void',{...reason,evidence:'Correction'}),{code:'VAT_REFUND_DEPENDENCIES'});await refund.act(ctx(),'reconciliation',nextRecord.id,'request-void',{...reason,evidence:'Correction'});await refund.act(reviewer(),'reconciliation',nextRecord.id,'approve-void',reason);
  await refund.act(ctx(),'reconciliation',r.id,'request-void',{...reason,evidence:'Correct original return'});await refund.act(reviewer(),'reconciliation',r.id,'approve-void',reason);await refund.act(ctx(),'deduction',d.id,'request-void',{...reason,evidence:'Correct source recognition'});await refund.act(reviewer(),'deduction',d.id,'approve-void',reason);
 });
 await runMigrations({migrations:migrations.slice(0,19)});
});
