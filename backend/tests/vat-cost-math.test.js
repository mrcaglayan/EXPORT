import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ratio,ceiling,assetShare,weighted,sum} from '../src/services/vat-cost-math.js';
test('VAT overhead and cumulative asset ratios retain six-decimal accuracy',()=>{
 assert.equal(ratio('150','1','3'),'50.000000');assert.equal(ceiling('1000','100','20'),'180.000000');
 assert.equal(assetShare('1000000','100000','1000000','0'),'100000.000000');
 assert.equal(assetShare('1000000','110000','2000000','100000'),'0.000000');
 assert.equal(assetShare('1000000','600000','3000000','100000'),'100000.000000');
 assert.throws(()=>ratio('1','2','1'),{code:'VAT_ALLOCATION_RATIO'});assert.throws(()=>ceiling('100','101','20'),{code:'VAT_PERIOD_BASIS'});
});
test('301 weighted lines conserve every micro-unit with stable residuals and large amounts',()=>{
 const lines=Array.from({length:301},(_,i)=>({basisLineId:String(i).padStart(4,'0'),weight:String(i+1)}));
 for(const total of ['0.000001','100.000001','99999999999999.999999']){const result=weighted(total,lines);assert.equal(sum([...result.values()]),total);assert.deepEqual(weighted(total,[...lines].reverse()),new Map([...result].reverse()));}
 assert.deepEqual([...weighted('0.000002',[{basisLineId:'c',weight:'1'},{basisLineId:'a',weight:'1'},{basisLineId:'b',weight:'1'}])],[['c','0.000000'],['a','0.000001'],['b','0.000001']]);
});
