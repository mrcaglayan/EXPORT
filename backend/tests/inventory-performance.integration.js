import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {closePool} from '../src/db/pool.js';
import {query} from '../src/db/query.js';
import {runMigrations} from '../src/migrationRunner.js';
import {setup} from './inventory-correction-fixtures.js';
import * as receipts from '../src/services/inventory-receipts.service.js';
import * as corrections from '../src/services/inventory-corrections.service.js';
import * as reports from '../src/services/inventory-report.service.js';
import * as feeds from '../src/services/inventory-movements.service.js';
import * as closing from '../src/services/inventory-close.service.js';
import * as journals from '../src/services/journal.service.js';
test('synthetic inventory capacity budgets: 1001 source layers and over 10000 ledger entries',{timeout:600000},async t=>{
 t.after(closePool);await runMigrations();const x=await setup(),samples={};
 const timed=async(name,budget,fn)=>{const start=performance.now(),result=await fn(),ms=Math.round(performance.now()-start);samples[name]={ms,budgetMs:budget};console.log(`${name}: ${ms} ms / ${budget} ms local regression budget`);assert.ok(ms<budget,`${name} exceeded regression budget`);return result;};
 const receipt=await timed('receipt1000',60000,()=>receipts.postFixture(x.ctx(),x.receiptBody('100','10',1000)));
 const layers=(await query('SELECT x.id FROM inventory_layers x JOIN stock_receipt_lines l ON l.id = x.receipt_line_id WHERE l.receipt_id = ? ORDER BY x.id',[receipt.receipt.id])).rows;
 for(let n=1;n<=4;n++)await timed(`revalue1000_${n}`,35000,async()=>{
  const r=(await timed(`request1000_${n}`,10000,()=>corrections.create(x.ctx(),{reference:randomUUID(),kind:'REVALUATION',postingDate:`2026-01-${String(n+10).padStart(2,'0')}`,reason:'Synthetic approved value update',evidence:'Synthetic benchmark review',lines:layers.map(l=>({layerId:l.id,poolId:x.pools.GENERAL,targetValue:String(1000+n)}))}))).correction;
  await timed(`review1000_${n}`,5000,()=>corrections.act(x.reviewer(),r.id,'approve',{reason:'Independent benchmark review'}));
  await timed(`post1000_${n}`,20000,()=>corrections.act(x.ctx(),r.id,'post',{reason:'Post approved benchmark correction'}));
 });
 const {rows:[n]}=await query('SELECT COUNT(*) AS n FROM inventory_pool_ledger');
 assert.ok(n.n>=5001);
 const r=await timed('liveMonthReport',3000,()=>reports.trialBalance(x.ctx(),{periodId:x.periods.JAN.id,groupBy:'sku'}));assert.equal(r.summary.stockValue,'1005000.000000');
 await timed('integrityReport',3000,async()=>assert.equal((await feeds.integrity(x.ctx())).status,'MATCHED'));
 let cursor;for(let i=0;i<4;i++){const result=await timed(`ledgerPage${i+1}`,3000,()=>feeds.movements(x.ctx(),{grain:'POOL',limit:'100',...(cursor?{cursor}:{})}));cursor=result.nextCursor;assert.ok(cursor);}
 await closing.setMapping(x.ctx(),{accountIds:[x.accounts['153']],reason:'Explicit benchmark stock asset'});
 await journals.postJournal(x.ctx(),{sourceModule:'MANUAL',sourceId:randomUUID(),documentDate:'2026-01-20',postingDate:'2026-01-20',currency:'TRY',description:'Explicit synthetic stock GL',lines:[{accountId:x.accounts['153'],debit:'1005000',credit:'0'},{accountId:x.accounts['320'],debit:'0',credit:'1005000'}]});
 const snapshot=await timed('prepareClose1001',30000,()=>closing.prepare(x.ctx(),x.periods.JAN.id,{reason:'Synthetic stock reconciled'}));await timed('approveClose1001',15000,()=>closing.review(x.reviewer(),snapshot.snapshot.id,'approve',{reason:'Independent benchmark close'}));
 const closed=await timed('closedMonthPage',3000,()=>reports.trialBalance(x.ctx(),{periodId:x.periods.JAN.id,groupBy:'sku'}));assert.deepEqual(closed.items,r.items);
 await timed('closedLayerPage',3000,()=>reports.trialBalance(x.ctx(),{periodId:x.periods.JAN.id,offset:'900',limit:'100'}));
 await mkdir(new URL('../../.local/benchmarks/',import.meta.url),{recursive:true});await writeFile(new URL('../../.local/benchmarks/pr02f.json',import.meta.url),JSON.stringify({dataset:{sourceLayers:1001,minimumLedgerEntries:10002},samples,note:'Repository-local synthetic regression budgets; not a production SLA.'},null,2));
});
