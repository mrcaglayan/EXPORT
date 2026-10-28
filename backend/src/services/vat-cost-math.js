import Decimal from 'decimal.js';
import {amount} from '../shared/money.js';
import {micro,decimal} from './inventory-stock.js';
import {fail} from './purchasing-context.js';
const D=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP});
export const zero='0.000000';
export const value=x=>amount(new D(x).toFixed(6));
export const sum=xs=>value(xs.reduce((n,x)=>n.plus(x),new D(0)));
export const subtract=(a,b)=>value(new D(a).minus(b));
export const floorSubtract=(a,b)=>value(D.max(0,new D(a).minus(b)));
export const less=(a,b)=>new D(a).lt(b);
export const minimum=(...xs)=>value(D.min(...xs));
export function ratio(tax,numerator,denominator){if(new D(denominator).lte(0)||new D(numerator).lt(0)||new D(numerator).gt(denominator))throw fail('VAT_ALLOCATION_RATIO','Eligible value must fit a positive total operation value.',422);return value(new D(tax).times(numerator).div(denominator));}
export function ceiling(eligible,vatFree,rate){if(new D(vatFree).gt(eligible)||new D(rate).lte(0)||new D(rate).gt(100))throw fail('VAT_PERIOD_BASIS','Check eligible turnover, VAT-free acquisitions and the evidenced general rate.',422);return value(new D(eligible).minus(vatFree).times(rate).div(100));}
export function assetShare(base,eligible,total,previous){return floorSubtract(ratio(base,eligible,total),previous);}
// Integer micro-unit largest remainder; ties follow stable original source IDs.
export function weighted(total,lines){const n=micro(total),weights=lines.map(l=>micro(l.weight)),denominator=weights.reduce((s,w)=>s+w,0n);if(denominator<=0n||weights.some(w=>w<=0n))throw fail('VAT_ALLOCATION_WEIGHT','Every allocation weight must be positive.',422);const result=lines.map((l,i)=>({id:l.basisLineId,units:n*weights[i]/denominator,remainder:n*weights[i]%denominator}));let left=n-result.reduce((s,r)=>s+r.units,0n);const order=[...result].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1);for(let i=0;left>0n;i++,left--)order[i].units++;return new Map(result.map(r=>[r.id,decimal(r.units)]));}
