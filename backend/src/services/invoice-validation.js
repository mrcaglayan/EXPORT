import Decimal from 'decimal.js';
import {fingerprint} from '../shared/idempotency.js';
import {amount} from '../shared/money.js';
import {scopeArgs} from './entity-context.js';
import {readPartner} from './trading-partners.service.js';
import {readDocument} from './purchasing-documents.service.js';
import {own,skuReferences,checkPrecision} from './purchasing-context.js';
import {sourceLines,readPlan,mappings,settings,orderSources} from './invoice-records.js';
const D=Decimal.clone({precision:50});
export async function inspect(tx,context,invoice,{applyResolution=true}={}){
  const issues=[...invoice.parsedHeader.issues],add=(code,message,lineKey=null)=>issues.push({code,message,lineKey});
  const config=await settings(tx,context),plan=await readPlan(tx,context,invoice.id,invoice.revision),lines=await sourceLines(tx,context,invoice.id),map=plan?await mappings(tx,context,plan.id):[];
  if(!config)add('RECIPIENT_NOT_CONFIGURED','Configure this company’s receiving VKN/TCKN before submitting a match.');
  else if(config.receiverScheme!==invoice.receiverScheme||config.receiverTaxId!==invoice.receiverTaxId)add('RECIPIENT_MISMATCH','Invoice customer identity differs from the configured company recipient.');
  let partner=null,order=null,orderLines=[],skus=new Map();
  if(!plan)add('NO_MAPPING_PLAN','Save the supplier and source-line mapping plan.');
  if(plan){
    try{partner=await readPartner(tx,context,plan.partnerId,true);}catch(e){if(![404,409].includes(e.status))throw e;add('SUPPLIER_INACTIVE','The selected supplier is missing or inactive.');}
    if(partner&&(partner.countryCode!=='TR'||partner.taxIdentifier!==invoice.supplierTaxId||invoice.supplierScheme!==(partner.taxIdentifier?.length===10?'VKN':'TCKN')))add('SUPPLIER_IDENTITY','Selected supplier tax identity does not match the XML supplier.');
    if(!plan.orderId)add('NO_APPROVED_ORDER','Select an approved purchase order.');
    else{try{order=await readDocument(tx,context,'orders',plan.orderId);orderLines=await orderSources(tx,context,plan.orderId);}catch(e){if(e.status!==404)throw e;add('ORDER_NOT_FOUND','Selected order is not accessible.');}}
    if(order&&(order.status!=='APPROVED'||order.partnerId!==plan.partnerId||order.currency!==invoice.currency||order.documentDate>invoice.issueDate))add('ORDER_MISMATCH','Order must be approved and match supplier, currency and invoice date.');
    if(order&&invoice.parsedHeader.orderReferences.length&&!invoice.parsedHeader.orderReferences.includes(order.reference))add('ORDER_REFERENCE','XML order reference does not identify the selected purchase order.');
    try{skus=await skuReferences(tx,context,map.map(m=>m.skuId));}catch(e){if(![404,409].includes(e.status))throw e;add('SKU_INACTIVE','A mapped SKU, family or base unit is missing or inactive.');}
  }
  const mapped=new Map(map.map(m=>[m.invoiceLineId,m])),sources=new Map(orderLines.map(l=>[l.id,l])),quantity=new Map();
  for(const line of lines){
    const m=mapped.get(line.id);if(!m){add('UNMAPPED_LINE','Choose a SKU and approved order line.',line.lineKey);continue;}
    const sku=skus.get(m.skuId),source=sources.get(m.orderLineId);
    if(sku){try{checkPrecision(line.quantity,sku);}catch(e){if(e.code!=='QUANTITY_PRECISION')throw e;add(e.code,e.message,line.lineKey);}
      if(line.unitCode!==sku.unitCode&&!m.unitConfirmed)add('UNIT_CONFIRMATION','Confirm that the source unit represents one SKU base unit; conversions are not supported.',line.lineKey);
    }
    if(!source)add('UNMATCHED_ORDER_LINE','Choose a line belonging to the selected approved order.',line.lineKey);
    else{
      if(source.skuId!==m.skuId||sku&&source.unitId!==sku.unitId)add('ORDER_SKU_UNIT','Mapped SKU/base unit differs from the approved order source.',line.lineKey);
      if(!new D(line.unitPrice).div(line.priceBaseQuantity).eq(source.unitPrice)||amount(new D(line.quantity).times(source.unitPrice).toFixed(line.amountScale))!==line.netAmount)add('PRICE_MISMATCH','Invoice price/net differs from the approved order price at the source line amount precision.',line.lineKey);
      quantity.set(source.id,(quantity.get(source.id)??new D(0)).plus(line.quantity));
      if(line.unitPrice==='0.000000'&&(!m.freeReason||!source.freeReason))add('FREE_GOODS_EVIDENCE','Free goods need retained invoice mapping and approved order reasons.',line.lineKey);
    }
  }
  let other=[];
  if(plan?.orderId){
    other=(await tx.query(`SELECT m.order_line_id AS orderLineId,SUM(l.quantity) AS quantity FROM purchase_invoices i JOIN purchase_invoice_plans p ON p.invoice_id=i.id AND p.revision=i.revision JOIN purchase_invoice_mappings m ON m.plan_id=p.id JOIN purchase_invoice_lines l ON l.id=m.invoice_line_id WHERE ${own('i')} AND i.id<>? AND i.status IN ('REQUESTED','READY') AND p.order_id=? GROUP BY m.order_line_id ORDER BY m.order_line_id`,[...scopeArgs(context),invoice.id,plan.orderId])).rows;
    const committed=new Map(other.map(r=>[r.orderLineId,new D(r.quantity)]));
    for(const [id,q]of quantity)if(q.plus(committed.get(id)??0).gt(sources.get(id).quantity))add('ORDER_QUANTITY_EXCEEDED','Invoice quantities exceed the remaining unmatched approved order quantity.',sources.get(id).lineKey);
  }
  // Bind review to the selected plan and current referenced business state. Other
  // invoices are rechecked for quantities, but not hashed so valid partial matches
  // can be reviewed independently without invalidating each other.
  const business={version:1,xmlHash:invoice.xmlHash,planId:plan?.id??null,config,partner,order,orderLines,skus:[...skus.values()].sort((a,b)=>a.id.localeCompare(b.id))};
  const baseHash=fingerprint(business);
  let resolution=null;
  if(applyResolution){
    resolution=(await tx.query(`SELECT id,proposal FROM purchase_invoice_resolutions WHERE tenant_id=? AND legal_entity_id=? AND invoice_id=? AND revision=? AND context_hash=? AND status='APPROVED' ORDER BY requested_at DESC,id DESC LIMIT 1`,[...scopeArgs(context),invoice.id,invoice.revision,baseHash])).rows[0]??null;
    if(resolution){const covered=new Set(resolution.proposal.covered.map(fingerprint));for(let i=issues.length-1;i>=0;i--)if(covered.has(fingerprint(issues[i])))issues.splice(i,1);}
  }
  const reviewHash=resolution?fingerprint({baseHash,resolutionId:resolution.id}):baseHash,reviewStale=Boolean(invoice.reviewContext&&invoice.reviewContext.hash!==reviewHash);
  if(reviewStale)add('STALE_REVIEW','Referenced details changed after submission. Cancel and submit a fresh import/matching decision.');
  return {issues,reviewHash,baseHash,resolution,canSubmit:issues.length===0,reviewStale,lineCount:lines.length,plan,lines,mappings:map};
}
