import Decimal from 'decimal.js';
import {amount} from '../shared/money.js';
import {fail} from './purchasing-context.js';
const D=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP});
export const vatAmount=value=>amount(new D(value).toFixed(6));
export const convertVat=(value,rate)=>vatAmount(new D(value).times(rate));
export const vatFields=['nativeVat','convertedVat','deductibleVat','capitalizedVat'];
export const zero='0.000000';
// Pending allocations reserve both quantity and exact amounts. Last depletion
// takes the residual, including after a cancelled request releases its amounts.
export function allocateVat(source,used,quantity){
 const remaining=new D(source.quantity).minus(used.quantity),q=new D(quantity);
 if(q.lte(0)||q.gt(remaining))throw fail('VAT_SOURCE_EXCEEDED','Attribution exceeds the remaining original purchase-source quantity.');
 const result={};for(const field of vatFields){const available=new D(source[field]).minus(used[field]);if(available.lt(0))throw fail('VAT_SOURCE_MISMATCH','Committed VAT exceeds its original source.');result[field]=vatAmount(q.eq(remaining)?available:Decimal.min(new D(source[field]).times(q).div(source.quantity).toDecimalPlaces(6),available));}
 return result;
}
