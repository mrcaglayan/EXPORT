import {randomUUID,createHash} from 'node:crypto';
import {query,withTransaction} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as validate from '../validators/invoices.validators.js';
import {scopeArgs,authorize,entityWrite,audit,notFound} from './entity-context.js';
import {fail,own,pattern,pageRows,insertRows,skuReferences} from './purchasing-context.js';
import {readPartner} from './trading-partners.service.js';
import {readDocument} from './purchasing-documents.service.js';
import {parseInvoice} from './invoice-xml.js';
import {fields,lineFields,readInvoice,readPlan,sourceLines,mappings,settings,orderSources} from './invoice-records.js';
import {inspect} from './invoice-validation.js';
export async function list(context,input){await authorize(context,'purchasing.read');const p=validate.listing(input,['q','status']),args=scopeArgs(context);let where=own('i');if(p.q){where+=" AND (i.invoice_number LIKE ? ESCAPE '!' OR i.supplier_name LIKE ? ESCAPE '!' OR i.uuid LIKE ? ESCAPE '!')";args.push(...Array(3).fill(pattern(p.q)));}if(p.status){where+=' AND i.status=?';args.push(p.status);}return pageRows(fields,'purchase_invoices i',where,args,p,'i.issue_date DESC,i.imported_at DESC,i.id');}
export async function get(context,id){await authorize(context,'purchasing.read');id=entityId(id);const item=await readInvoice({query},context,id);return {item,plan:await readPlan({query},context,id,item.revision)};}
export async function lines(context,id,input){
  await authorize(context,'purchasing.read');id=entityId(id);const item=await readInvoice({query},context,id),p=validate.listing(input,['revision']),revision=p.revision??item.revision;
  return pageRows(`${lineFields},m.sku_id AS skuId,s.code AS skuCode,m.order_line_id AS orderLineId,m.unit_confirmed AS unitConfirmed,m.free_reason AS freeReason,m.basis,m.alias_id AS aliasId`,
    `purchase_invoice_lines l LEFT JOIN purchase_invoice_plans p ON p.invoice_id=l.invoice_id AND p.revision=? LEFT JOIN purchase_invoice_mappings m ON m.plan_id=p.id AND m.invoice_line_id=l.id LEFT JOIN product_skus s ON s.id=m.sku_id AND s.tenant_id=m.tenant_id AND s.legal_entity_id=m.legal_entity_id`,
    `${own('l')} AND l.invoice_id=?`,[revision,...scopeArgs(context),id],p,'l.line_number');
}
export async function plans(context,id,input){await authorize(context,'purchasing.read');id=entityId(id);await readInvoice({query},context,id);const p=validate.listing(input);return pageRows('p.id,p.revision,p.partner_id AS partnerId,p.order_id AS orderId,p.line_count AS lineCount,p.reason,p.created_by AS createdBy,p.created_at AS createdAt','purchase_invoice_plans p',`${own('p')} AND p.invoice_id=?`,[...scopeArgs(context),id],p,'p.revision DESC');}
export async function decisions(context,id,input){await authorize(context,'purchasing.read');id=entityId(id);await readInvoice({query},context,id);const p=validate.listing(input);return pageRows('e.id,e.action,e.revision,e.sequence_number AS sequenceNumber,e.actor_id AS actorId,u.display_name AS actorName,e.reason,e.context,e.created_at AS createdAt','purchase_invoice_decisions e JOIN users u ON u.id=e.actor_id AND u.tenant_id=e.tenant_id',`${own('e')} AND e.invoice_id=?`,[...scopeArgs(context),id],p,'e.sequence_number DESC');}
export async function validation(context,id,input){await authorize(context,'purchasing.read');id=entityId(id);const p=validate.listing(input);return withTransaction(async tx=>{const result=await inspect(tx,context,await readInvoice(tx,context,id,true));return {summary:{canSubmit:result.canSubmit,reviewStale:result.reviewStale,lineCount:result.lineCount,issueCount:result.issues.length},items:result.issues.slice(p.offset,p.offset+p.limit),total:result.issues.length,limit:p.limit,offset:p.offset};});}
export async function source(context,id){await authorize(context,'purchasing.read');id=entityId(id);const item=await readInvoice({query},context,id);const {rows}=await query(`SELECT raw_xml AS xml FROM purchase_invoices WHERE tenant_id=? AND legal_entity_id=? AND id=?`,[...scopeArgs(context),id]);return {xml:rows[0].xml,fileName:item.fileName,sha256:item.xmlHash};}
export async function lineSource(context,id,lineId){await authorize(context,'purchasing.read');id=entityId(id);lineId=entityId(lineId);await readInvoice({query},context,id);const {rows}=await query(`SELECT source_json AS source FROM purchase_invoice_lines WHERE tenant_id=? AND legal_entity_id=? AND invoice_id=? AND id=?`,[...scopeArgs(context),id,lineId]);if(!rows.length)throw notFound();return rows[0];}
export async function getSettings(context){await authorize(context,'purchasing.read');return {item:await settings({query},context)};}
export async function saveSettings(context,body){const input=validate.recipient(body);return entityWrite(context,'purchasing.invoice.configure','purchasing.invoice.recipient',input,async tx=>{
  const old=await settings(tx,context);if(old&&(old.receiverScheme!==input.receiverScheme||old.receiverTaxId!==input.receiverTaxId)&&(await tx.query(`SELECT id FROM purchase_invoices WHERE tenant_id=? AND legal_entity_id=? AND status IN ('REQUESTED','READY') LIMIT 1`,scopeArgs(context))).rows.length)throw fail('INVOICE_RECIPIENT_IN_USE','Cancel pending/ready invoice matches before changing company recipient identity.');
  await tx.query('INSERT INTO purchase_invoice_settings (id,tenant_id,legal_entity_id,receiver_scheme,receiver_tax_id,updated_by) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE receiver_scheme=VALUES(receiver_scheme),receiver_tax_id=VALUES(receiver_tax_id),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP',[randomUUID(),...scopeArgs(context),input.receiverScheme,input.receiverTaxId,context.identity.userId]);await audit(tx,context,'purchasing.invoice.recipient.updated',context.entityId,{before:old,after:{receiverScheme:input.receiverScheme,receiverTaxId:input.receiverTaxId},reason:input.reason});return {item:await settings(tx,context)};
});}
export async function importXml(context,body){
  const input=validate.source(body);await authorize(context,'purchasing.invoice.import');const parsed=parseInvoice(input.xml);
  return entityWrite(context,'purchasing.invoice.import','purchasing.invoice.import',{fileName:input.fileName,evidence:input.evidence,xmlHash:parsed.sha256},async tx=>{
    const scope=scopeArgs(context),existing=(await tx.query(`SELECT id,xml_hash AS hash FROM purchase_invoices WHERE tenant_id=? AND legal_entity_id=? AND uuid=?`,[...scope,parsed.uuid])).rows[0];
    if(existing){if(existing.hash!==parsed.sha256)throw fail('INVOICE_UUID_CONFLICT','This UUID already has a different retained XML source.');return {item:await readInvoice(tx,context,existing.id),duplicate:true};}
    if((await tx.query('SELECT id FROM purchase_invoices WHERE tenant_id=? AND legal_entity_id=? AND supplier_scheme=? AND supplier_tax_id=? AND invoice_number=?',[...scope,parsed.supplier.taxScheme,parsed.supplier.taxId,parsed.invoiceNumber])).rows.length)throw fail('INVOICE_NUMBER_CONFLICT','This supplier invoice number already exists with another UUID.');
    const id=randomUUID(),{lines,...header}=parsed;
    await tx.query(`INSERT INTO purchase_invoices (id,tenant_id,legal_entity_id,uuid,invoice_number,issue_date,currency,profile,invoice_type,supplier_scheme,supplier_tax_id,supplier_name,receiver_scheme,receiver_tax_id,receiver_name,file_name,evidence,raw_xml,xml_hash,parsed_header,line_count,net_total,vat_total,gross_total,payable_total,imported_by) VALUES (${Array(26).fill('?').join(',')})`,
      [id,...scope,parsed.uuid,parsed.invoiceNumber,parsed.issueDate,parsed.currency,parsed.profile,parsed.invoiceType,parsed.supplier.taxScheme,parsed.supplier.taxId,parsed.supplier.name,parsed.customer.taxScheme,parsed.customer.taxId,parsed.customer.name,input.fileName,input.evidence,input.xml,parsed.sha256,JSON.stringify(header),lines.length,parsed.netTotal,parsed.vatTotal,parsed.grossTotal,parsed.payableTotal,context.identity.userId]);
    await insertRows(tx,'purchase_invoice_lines','id,tenant_id,legal_entity_id,invoice_id,line_number,line_key,supplier_code,description,quantity,unit_code,unit_price,price_base_quantity,amount_scale,net_amount,vat_amount,taxes,source_json',lines.map(l=>[randomUUID(),...scope,id,l.lineNumber,l.lineKey,l.supplierCode,l.description,l.quantity,l.unitCode,l.unitPrice,l.priceBaseQuantity,l.amountScale,l.netAmount,l.vatAmount,JSON.stringify(l.taxes),JSON.stringify(l.source)]));
    await tx.query("UPDATE purchase_invoices SET status='STAGED' WHERE tenant_id=? AND legal_entity_id=? AND id=?",[...scope,id]);await audit(tx,context,'purchasing.invoice.imported',id,{uuid:parsed.uuid,xmlHash:parsed.sha256,lineCount:lines.length,issueCount:parsed.issues.length,fileName:input.fileName,evidence:input.evidence});return {item:await readInvoice(tx,context,id),duplicate:false};
  });
}
async function verifiedAlias(tx,context,partner,line){
  const hash=createHash('sha256').update(JSON.stringify([line.supplierCode,line.description])).digest('hex');
  const {rows}=await tx.query(`SELECT a.id,a.sku_id AS skuId,s.supplier_code AS supplierCode,s.supplier_description AS description FROM product_aliases a JOIN product_alias_sources s ON s.id=a.source_id AND s.tenant_id=a.tenant_id AND s.legal_entity_id=a.legal_entity_id JOIN product_skus k ON k.id=a.sku_id AND k.tenant_id=a.tenant_id AND k.legal_entity_id=a.legal_entity_id JOIN product_families f ON f.id=k.family_id JOIN unit_of_measure u ON u.id=k.base_unit_id WHERE ${own('a')} AND s.supplier_id=? AND s.source_hash=? AND a.status='VERIFIED' AND a.current_source_id=a.source_id AND k.active=1 AND f.active=1 AND u.active=1`,[...scopeArgs(context),partner.supplierId,hash]);
  return rows.length===1&&rows[0].supplierCode===line.supplierCode&&rows[0].description===line.description?rows[0]:null;
}
export async function savePlan(context,invoiceId,body){
  const id=entityId(invoiceId),input=validate.plan(body);
  return entityWrite(context,'purchasing.invoice.map','purchasing.invoice.map',{id,...input},async tx=>{
    const invoice=await readInvoice(tx,context,id,true);if(invoice.status!=='STAGED')throw fail('INVALID_STATE','Only a staged invoice can receive mapping changes.');if(invoice.revision!==input.expectedRevision)throw fail('STALE_MAPPING','Another mapping revision was saved. Refresh before editing.');
    const partner=await readPartner(tx,context,input.partnerId,true),old=await readPlan(tx,context,id,invoice.revision),all=await sourceLines(tx,context,id),byId=new Map(all.map(l=>[l.id,l]));
    if(input.orderId)await readDocument(tx,context,'orders',input.orderId);
    const samePartner=old?.partnerId===input.partnerId,sameOrder=old?.orderId===input.orderId;
    const current=new Map(old?(await mappings(tx,context,old.id)).map(m=>[m.invoiceLineId,{...m,...(!samePartner&&{basis:'MANUAL',aliasId:null}),...(!sameOrder&&{orderLineId:null})}]):[]);
    for(const update of input.updates){if(!byId.has(update.invoiceLineId))throw notFound();if(!update.skuId)current.delete(update.invoiceLineId);else current.set(update.invoiceLineId,{...update,basis:'MANUAL',aliasId:null});}
    if(input.autoMap){
      if(partner.countryCode!=='TR'||partner.taxIdentifier!==invoice.supplierTaxId)throw fail('SUPPLIER_IDENTITY','Verified aliases require the XML supplier identity to match the selected partner.');
      for(const line of all)if(!current.has(line.id)){const alias=await verifiedAlias(tx,context,partner,line);if(alias)current.set(line.id,{invoiceLineId:line.id,skuId:alias.skuId,orderLineId:null,unitConfirmed:false,freeReason:null,basis:'VERIFIED_ALIAS',aliasId:alias.id});}
    }
    await skuReferences(tx,context,[...current.values()].map(m=>m.skuId));
    const orderLines=input.orderId?await orderSources(tx,context,input.orderId):[],orderMap=new Map(orderLines.map(l=>[l.id,l]));
    for(const m of current.values()){
      if(m.orderLineId&&(!orderMap.has(m.orderLineId)||orderMap.get(m.orderLineId).skuId!==m.skuId))throw fail('ORDER_SOURCE_MISMATCH','Choose an order line with the mapped SKU from the selected order.');
      if(m.freeReason&&byId.get(m.invoiceLineId).unitPrice!=='0.000000')throw fail('FREE_REASON_NOT_ALLOWED','Free-goods reason is reserved for zero-price source lines.',422);
    }
    const planId=randomUUID(),revision=invoice.revision+1,scope=scopeArgs(context),rows=[...current.values()];
    await tx.query('INSERT INTO purchase_invoice_plans (id,tenant_id,legal_entity_id,invoice_id,revision,partner_id,order_id,line_count,reason,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',[planId,...scope,id,revision,input.partnerId,input.orderId,rows.length,input.reason,context.identity.userId]);
    await insertRows(tx,'purchase_invoice_mappings','id,tenant_id,legal_entity_id,plan_id,invoice_line_id,sku_id,order_line_id,unit_confirmed,free_reason,basis,alias_id',rows.map(m=>[randomUUID(),...scope,planId,m.invoiceLineId,m.skuId,m.orderLineId,m.unitConfirmed,m.freeReason,m.basis,m.aliasId]));
    await tx.query('UPDATE purchase_invoices SET revision=? WHERE tenant_id=? AND legal_entity_id=? AND id=?',[revision,...scope,id]);await audit(tx,context,'purchasing.invoice.mapped',id,{revision,partnerId:input.partnerId,orderId:input.orderId,mappedCount:rows.length,autoMap:input.autoMap,reason:input.reason});return {item:await readInvoice(tx,context,id),plan:await readPlan(tx,context,id,revision)};
  });
}
export async function act(context,invoiceId,action,body){
  const id=entityId(invoiceId),input=validate.reason(body);if(!['submit','approve','reject','cancel','reopen'].includes(action))throw notFound();
  return entityWrite(context,action==='submit'?'purchasing.invoice.map':'purchasing.invoice.review',`purchasing.invoice.${action}`,{id,...input},async tx=>{
    const item=await readInvoice(tx,context,id,true),scope=scopeArgs(context);
    const allowed={submit:['STAGED'],approve:['REQUESTED'],reject:['REQUESTED'],cancel:['STAGED','REQUESTED','READY'],reopen:['REQUESTED','READY','REJECTED']};
    if(!allowed[action].includes(item.status))throw fail('INVALID_STATE','Invoice matching is not awaiting this action.');
    if(['cancel','reopen'].includes(action)&&(await tx.query('SELECT id FROM purchase_receipts WHERE tenant_id=? AND legal_entity_id=? AND active_invoice_id=?',[...scope,id])).rows.length)throw fail('DEPENDENT_RECEIPT','Cancel the unposted receipt before changing invoice matching. A posted receipt retains its invoice approval.');
    // Append the complete prior review context before changing current workflow
    // fields. Any later validation failure rolls this decision back atomically.
    const sequence=(await tx.query('SELECT COALESCE(MAX(sequence_number),0)+1 AS n FROM purchase_invoice_decisions WHERE tenant_id=? AND legal_entity_id=? AND invoice_id=?',[...scope,id])).rows[0].n;
    await tx.query('INSERT INTO purchase_invoice_decisions (id,tenant_id,legal_entity_id,invoice_id,action,revision,sequence_number,actor_id,reason,context) VALUES (?,?,?,?,?,?,?,?,?,?)',[randomUUID(),...scope,id,action.toUpperCase(),item.revision,sequence,context.identity.userId,input.reason,JSON.stringify({previousStatus:item.status,submittedBy:item.submittedBy,submittedAt:item.submittedAt,reviewContext:item.reviewContext,reviewedBy:item.reviewedBy,reviewedAt:item.reviewedAt,reviewReason:item.reviewReason})]);
    if(action==='reopen'){
      if(!['REQUESTED','READY','REJECTED'].includes(item.status))throw fail('INVALID_STATE','Only pending, ready or rejected matching can return for mapping revision.');
      await tx.query("UPDATE purchase_invoices SET status='STAGED',submitted_by=NULL,submitted_at=NULL,review_context=NULL,reviewed_by=NULL,reviewed_at=NULL,review_reason=NULL WHERE tenant_id=? AND legal_entity_id=? AND id=?",[...scope,id]);
    }else
    if(action==='cancel'){
      if(!['STAGED','REQUESTED','READY'].includes(item.status))throw fail('INVALID_STATE','Only staged, pending or ready matching can be cancelled.');
      await tx.query("UPDATE purchase_invoices SET status='CANCELLED',cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP,cancel_reason=? WHERE tenant_id=? AND legal_entity_id=? AND id=?",[context.identity.userId,input.reason,...scope,id]);
    }else{
      if(item.status!==(action==='submit'?'STAGED':'REQUESTED'))throw fail('INVALID_STATE','Invoice matching is not awaiting this action.');
      const plan=await readPlan(tx,context,id,item.revision);
      if(action==='approve'&&[item.importedBy,item.submittedBy,plan?.createdBy].includes(context.identity.userId))throw fail('INDEPENDENT_REVIEW_REQUIRED','A person independent of importing, mapping and submission must approve.',403);
      if(action==='submit'||action==='approve'){
        const validation=await inspect(tx,context,item);if(validation.issues.length)throw fail('INVOICE_EXCEPTIONS','Resolve the invoice validation exceptions before submitting or approving.');
        if(action==='submit')await tx.query("UPDATE purchase_invoices SET status='REQUESTED',submitted_by=?,submitted_at=CURRENT_TIMESTAMP,review_context=? WHERE tenant_id=? AND legal_entity_id=? AND id=?",[context.identity.userId,JSON.stringify({hash:validation.reviewHash,reason:input.reason,planId:plan.id}),...scope,id]);
      }
      if(action!=='submit')await tx.query('UPDATE purchase_invoices SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE tenant_id=? AND legal_entity_id=? AND id=?',[action==='approve'?'READY':'REJECTED',context.identity.userId,input.reason,...scope,id]);
    }
    await audit(tx,context,`purchasing.invoice.${action}`,id,{reason:input.reason,revision:item.revision,previousStatus:item.status});return {item:await readInvoice(tx,context,id)};
  });
}
