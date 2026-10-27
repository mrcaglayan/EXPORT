import { object, text, code, entityId, invalid } from './auth.validators.js';
import { date, currency, page } from './accounting.validators.js';
import { amount } from '../shared/money.js';
import { isCountryCode } from '../shared/country-codes.js';

export const kinds = Object.freeze({ contracts: 'CONTRACT', requests: 'REQUEST', orders: 'ORDER' });
export const statuses = ['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'];
export function reference(value) {
  const result = text(value,64);
  if (!/^[A-Za-z0-9._:-]+$/.test(result)) throw invalid();
  return result;
}
const optionalText = (value,max) => text(value ?? '',max,0);
export function partner(body,updating=false) {
  const common=['name','countryCode','taxIdentifier','taxOffice','address','email','phone'];
  object(body,[...common,...(updating?['active']:['code','kind','supplierId'])]);
  if(!isCountryCode(body.countryCode)) throw invalid();
  const result={name:text(body.name,160),countryCode:body.countryCode,taxIdentifier:optionalText(body.taxIdentifier,40)||null,
    taxOffice:optionalText(body.taxOffice,160),address:optionalText(body.address,1000),email:optionalText(body.email,254),phone:optionalText(body.phone,80)};
  if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw invalid();
  if(updating){if(typeof body.active!=='boolean')throw invalid();result.active=body.active;}
  else {if(!['SUPPLIER','CUSTOMER','BOTH'].includes(body.kind))throw invalid();Object.assign(result,{code:code(body.code),kind:body.kind,supplierId:body.supplierId==null?null:entityId(body.supplierId)});if(body.kind==='CUSTOMER'&&result.supplierId)throw invalid();}
  return result;
}
export function document(resource,body) {
  if(!Object.hasOwn(kinds,resource))throw invalid();
  const kind=kinds[resource],common=['reference','documentDate','purpose','terms','ebysReference'];
  object(body,[...common,...(kind==='CONTRACT'?['partnerId','currency','validFrom','validTo']:kind==='REQUEST'?['requiredBy','lines']:['partnerId','requestId','contractId','currency','requiredBy','lines'])]);
  const result={kind,reference:reference(body.reference),documentDate:date(body.documentDate),purpose:text(body.purpose,1000),terms:kind==='CONTRACT'?text(body.terms,2000):optionalText(body.terms,2000),ebysReference:text(body.ebysReference,160)};
  if(kind!=='REQUEST')Object.assign(result,{partnerId:entityId(body.partnerId),currency:currency(body.currency)});
  if(kind==='CONTRACT') {Object.assign(result,{validFrom:date(body.validFrom),validTo:date(body.validTo)});if(result.validTo<result.validFrom)throw invalid();return result;}
  result.requiredBy=date(body.requiredBy);if(result.requiredBy<result.documentDate)throw invalid();
  if(kind==='ORDER')Object.assign(result,{requestId:entityId(body.requestId),contractId:body.contractId==null?null:entityId(body.contractId)});
  if(!Array.isArray(body.lines)||!body.lines.length)throw invalid();
  const keys=new Set();
  result.lines=body.lines.map(line=>{
    object(line,kind==='REQUEST'?['lineKey','skuId','description','quantity']:['requestLineId','quantity','unitPrice','freeReason']);
    const quantity=amount(line.quantity);if(quantity==='0.000000')throw invalid();
    const item=kind==='REQUEST'?{lineKey:reference(line.lineKey),skuId:entityId(line.skuId),description:optionalText(line.description,255),quantity}
      :{requestLineId:entityId(line.requestLineId),quantity,unitPrice:amount(line.unitPrice),freeReason:optionalText(line.freeReason,255)||null};
    const key=kind==='REQUEST'?item.lineKey:item.requestLineId;if(keys.has(key))throw invalid();keys.add(key);
    if(kind==='ORDER'&&((item.unitPrice==='0.000000')!==Boolean(item.freeReason)))throw invalid();
    return item;
  });
  return result;
}
export function reason(body){object(body,['reason']);return {reason:text(body.reason,1000)};}
export function listing(input,allowed=[]){
  object(input,['offset','limit',...allowed]);const result=page({offset:input.offset,limit:input.limit});
  if(input.q!==undefined)result.q=text(input.q,160,0);
  if(input.status!==undefined){if(!statuses.includes(input.status))throw invalid();result.status=input.status;}
  if(input.active!==undefined){if(!['true','false'].includes(input.active))throw invalid();result.active=input.active==='true';}
  if(input.kind!==undefined){if(!['SUPPLIER','CUSTOMER','BOTH'].includes(input.kind))throw invalid();result.kind=input.kind;}
  for(const field of ['partnerId','requestId','contractId'])if(input[field]!==undefined)result[field]=entityId(input[field]);
  return result;
}
