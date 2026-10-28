import {object,text,entityId,invalid} from './auth.validators.js';
import {date,page} from './accounting.validators.js';
import {positive} from './receipts.validators.js';
import {amount} from '../shared/money.js';
export function reference(value){const r=text(value,64);if(!/^[A-Za-z0-9._:-]+$/.test(r))throw invalid();return r;}
export function reason(body){object(body,['reason']);return {reason:text(body.reason,255)};}
export function listing(input,allowed=[]){object(input,['limit','offset',...allowed]);const p=page({limit:input.limit,offset:input.offset});if(input.q!==undefined)p.q=text(input.q,160,0);if(input.status!==undefined)p.status=text(input.status,24);if(input.active!==undefined){if(!['true','false'].includes(input.active))throw invalid();p.active=input.active==='true';}return p;}
export function sourceLine(l){
 object(l,['lineKey','itemCode','description','quantity','unitCode','packageReference','packageCount','netWeightKg','grossWeightKg']);
 const raw=(v,max,required=true)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw invalid();return v;};
 const packageCount=l.packageCount==null||l.packageCount===''?null:String(l.packageCount);if(packageCount!==null&&(!/^[1-9]\d{0,9}$/.test(packageCount)||BigInt(packageCount)>4294967295n))throw invalid();
 const weight=x=>x==null||x===''?null:amount(x),netWeightKg=weight(l.netWeightKg),grossWeightKg=weight(l.grossWeightKg);
 if(netWeightKg!==null&&grossWeightKg!==null&&BigInt(netWeightKg.replace('.',''))>BigInt(grossWeightKg.replace('.','')))throw invalid();
 return {lineKey:reference(l.lineKey),itemCode:raw(l.itemCode,120),description:raw(l.description,1000),quantity:positive(l.quantity),unitCode:raw(l.unitCode,16),packageReference:raw(l.packageReference??'',120,false),packageCount,netWeightKg,grossWeightKg};
}
export function intake(body){
 object(body,['reference','documentDate','evidence','sourceKind','fileName','csv','lines']);
 if(!['MANUAL','CSV'].includes(body.sourceKind))throw invalid();
 if(body.sourceKind==='CSV'&&(typeof body.csv!=='string'||body.lines!==undefined)||body.sourceKind==='MANUAL'&&(!Array.isArray(body.lines)||!body.lines.length||body.csv!==undefined))throw invalid();
 return {reference:reference(body.reference),documentDate:date(body.documentDate),evidence:text(body.evidence,255),sourceKind:body.sourceKind,fileName:text(body.fileName,160),...(body.sourceKind==='CSV'?{csv:body.csv}:{lines:body.lines})};
}
export function mapping(body){
 object(body,['expectedRevision','customerId','warehouseId','destinationPoolId','plannedDate','reason','autoMap','updates']);
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.autoMap!==undefined&&typeof body.autoMap!=='boolean'||!Array.isArray(body.updates))throw invalid();
 const seen=new Set(),updates=body.updates.map(l=>{object(l,['packingLineId','skuId','unitConfirmed']);const packingLineId=entityId(l.packingLineId);if(seen.has(packingLineId)||typeof l.unitConfirmed!=='boolean')throw invalid();seen.add(packingLineId);return {packingLineId,skuId:l.skuId==null?null:entityId(l.skuId),unitConfirmed:l.unitConfirmed};});
 return {expectedRevision:body.expectedRevision,customerId:entityId(body.customerId),warehouseId:entityId(body.warehouseId),destinationPoolId:entityId(body.destinationPoolId),plannedDate:date(body.plannedDate),reason:text(body.reason,255),autoMap:body.autoMap??false,updates};
}
export function shipment(body){
 object(body,['reference','reservationDate','expectedDispatchDate','reason','evidence','lines']);if(!Array.isArray(body.lines)||!body.lines.length)throw invalid();const seen=new Set();
 const lines=body.lines.map(l=>{object(l,['packingLineId','quantity']);const packingLineId=entityId(l.packingLineId);if(seen.has(packingLineId))throw invalid();seen.add(packingLineId);return {packingLineId,quantity:positive(l.quantity)};}).sort((a,b)=>a.packingLineId.localeCompare(b.packingLineId));
 const reservationDate=date(body.reservationDate),expectedDispatchDate=date(body.expectedDispatchDate);if(expectedDispatchDate<reservationDate)throw invalid();
 return {reference:reference(body.reference),reservationDate,expectedDispatchDate,reason:text(body.reason,255),evidence:text(body.evidence,255),lines};
}
export function dispatch(body){object(body,['dispatchDate','postingDate','movementTypeId','reason','evidence']);const dispatchDate=date(body.dispatchDate),postingDate=date(body.postingDate);if(postingDate<dispatchDate)throw invalid();return {dispatchDate,postingDate,movementTypeId:entityId(body.movementTypeId),reason:text(body.reason,255),evidence:text(body.evidence,255)};}
