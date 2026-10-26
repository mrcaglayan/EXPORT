import {object,text,entityId,invalid} from './auth.validators.js';
import {date,page} from './accounting.validators.js';
import {amount} from '../shared/money.js';

export function correction(body){
 object(body,['reference','kind','originalEventId','postingDate','reason','evidence','lines']);
 const reference=text(body.reference,64);if(!/^[A-Za-z0-9._:-]+$/.test(reference)||!['REVERSAL','COUNT','REVALUATION'].includes(body.kind))throw invalid();
 const result={reference,kind:body.kind,postingDate:date(body.postingDate),reason:text(body.reason,255),evidence:text(body.evidence,255)};
 if(body.kind==='REVERSAL'){if(body.lines!==undefined)throw invalid();return {...result,originalEventId:entityId(body.originalEventId)};}
 if(body.originalEventId!==undefined||!Array.isArray(body.lines)||!body.lines.length)throw invalid();
 const keys=new Set();return {...result,lines:body.lines.map(l=>{const field=body.kind==='COUNT'?'observedQuantity':'targetValue';object(l,['layerId','poolId',field]);const layerId=entityId(l.layerId),poolId=entityId(l.poolId),key=layerId+poolId;if(keys.has(key))throw invalid();keys.add(key);return {layerId,poolId,[field]:amount(l[field])};})};
}
export function reason(body){object(body,['reason']);return {reason:text(body.reason,255)};}
export function filters(input){object(input,['limit','offset','status']);if(input.status!==undefined&&!['REQUESTED','APPROVED','REJECTED','CANCELLED','POSTED'].includes(input.status))throw invalid();return {...page({limit:input.limit,offset:input.offset}),...(input.status?{status:input.status}:{})};}
