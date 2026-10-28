import {randomUUID} from 'node:crypto';
import {query} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/vat.validators.js';
import {authorize,entityWrite,audit,scopeArgs,notFound} from './entity-context.js';
import {own,fail,pageRows,pattern,serialize,insertRows} from './purchasing-context.js';
import {fingerprint} from '../shared/idempotency.js';
import {amount} from '../shared/money.js';
import {convertVat,zero} from './vat-amounts.js';

export const sourceFields=`s.id,s.purchase_receipt_line_id AS purchaseReceiptLineId,s.invoice_line_id AS invoiceLineId,s.layer_id AS layerId,s.sku_id AS skuId,s.vat_journal_line_id AS vatJournalLineId,
 s.quantity,s.native_vat AS nativeVat,s.converted_vat AS convertedVat,s.deductible_vat AS deductibleVat,s.capitalized_vat AS capitalizedVat,s.currency,s.base_currency AS baseCurrency,s.vat_treatment AS vatTreatment,s.snapshot,s.source_hash AS sourceHash,s.reason,s.evidence,s.registered_by AS registeredBy,s.registered_at AS registeredAt`;
const purchaseFrom=`purchase_receipt_lines l JOIN purchase_receipts p ON p.id=l.receipt_id AND p.tenant_id=l.tenant_id AND p.legal_entity_id=l.legal_entity_id
 JOIN purchase_invoices i ON i.id=p.invoice_id JOIN purchase_invoice_lines il ON il.id=l.invoice_line_id
 LEFT JOIN stock_receipts r ON r.id=p.stock_receipt_id LEFT JOIN stock_receipt_lines sl ON sl.receipt_id=r.id AND sl.source_line_key=l.invoice_line_id
 LEFT JOIN inventory_layers x ON x.receipt_line_id=sl.id JOIN product_skus k ON k.id=l.sku_id JOIN unit_of_measure u ON u.id=k.base_unit_id
 LEFT JOIN journals j ON j.id=p.journal_id LEFT JOIN journal_lines jl ON jl.journal_id=p.journal_id AND jl.line_number=CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.vatJournalLine')),'null') AS UNSIGNED)`;
const purchaseFields=`l.id AS purchaseReceiptLineId,l.receipt_id AS purchaseReceiptId,l.invoice_line_id AS invoiceLineId,l.line_number AS lineNumber,l.sku_id AS skuId,l.quantity,l.value AS inventoryValue,l.details,
 p.reference AS receiptReference,p.status AS receiptStatus,p.evidence AS receiptEvidence,p.journal_id AS journalId,p.posted_at AS postedAt,
 JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.payable')) AS payable,JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.baseCurrency')) AS baseCurrency,JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.input.exchangeRate')) AS exchangeRate,
 JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.input.exchangeDate')) AS exchangeDate,JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.input.exchangeEvidence')) AS exchangeEvidence,
 JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.input.postingDate')) AS postingDate,
 i.id AS invoiceId,i.uuid AS invoiceUuid,i.invoice_number AS invoiceNumber,i.xml_hash AS xmlHash,i.issue_date AS invoiceDate,i.currency,i.supplier_name AS supplierName,i.supplier_tax_id AS supplierTaxId,
 il.line_key AS invoiceLineKey,il.vat_amount AS originalNativeVat,il.quantity AS invoiceQuantity,
 r.id AS stockReceiptId,r.status AS stockStatus,r.source_kind AS stockSourceKind,r.source_id AS stockSourceId,sl.id AS stockReceiptLineId,sl.quantity AS stockQuantity,sl.sku_id AS stockSkuId,
 x.id AS layerId,x.quantity AS layerQuantity,x.value AS layerOriginalValue,u.code AS unitCode,u.quantity_precision AS quantityPrecision,
 j.status AS journalStatus,j.source_module AS journalSourceModule,j.source_id AS journalSourceId,
 jl.id AS vatJournalLineId,jl.account_id AS vatAccountId,jl.debit AS vatDebit,jl.credit AS vatCredit`;

export async function purchaseSnapshot(tx,c,id){
 const row=(await tx.query(`SELECT ${purchaseFields} FROM ${purchaseFrom} WHERE ${own('l')} AND l.id=?`,[...scopeArgs(c),id])).rows[0];
 if(!row)throw notFound();
 const r=serialize(row),d=r.details;
 if(r.receiptStatus!=='POSTED'||r.stockStatus!=='POSTED'||r.stockSourceKind!=='PURCHASE_INVOICE'||r.stockSourceId!==r.purchaseReceiptId||!r.layerId
  ||r.quantity!==r.invoiceQuantity||r.quantity!==r.stockQuantity||r.quantity!==r.layerQuantity||r.skuId!==r.stockSkuId||r.inventoryValue!==r.layerOriginalValue)
  throw fail('VAT_SOURCE_NOT_POSTED','Register only complete posted purchase lines with their original stock layers.');
 if(amount(d.nativeVat)!==r.originalNativeVat||d.quantity!==r.quantity||!['DEDUCTIBLE','CAPITALIZE','NONE'].includes(d.vatTreatment))throw fail('VAT_SOURCE_MISMATCH','Retained purchase VAT facts do not match their original invoice line.');
 const nativeVat=amount(d.nativeVat),convertedVat=convertVat(nativeVat,r.exchangeRate),deductibleVat=amount(d.deductibleVat),capitalizedVat=d.vatTreatment==='CAPITALIZE'?convertedVat:zero;
 if(deductibleVat!==(d.vatTreatment==='DEDUCTIBLE'?convertedVat:zero)||d.vatTreatment==='NONE'&&nativeVat!==zero)throw fail('VAT_SOURCE_MISMATCH','Retained VAT treatment and currency conversion do not reconcile.');
 if(r.journalId&&(r.journalStatus!=='POSTED'||r.journalSourceModule!=='PURCHASE_INVOICE'||r.journalSourceId!==r.invoiceId))throw fail('VAT_JOURNAL_MISMATCH','The source purchase journal must be posted for this invoice.');
 if(deductibleVat!==zero&&(!r.vatJournalLineId||r.vatDebit!==deductibleVat||r.vatCredit!==zero||r.vatAccountId!==d.vatAccountId))throw fail('VAT_JOURNAL_MISMATCH','Deductible VAT must match its exact posted journal line.');
 if(!r.journalId&&(r.inventoryValue!==zero||deductibleVat!==zero||r.payable!==zero))throw fail('VAT_JOURNAL_MISMATCH','A valued purchase source requires its posted journal.');
 const snapshot={version:1,purchaseReceiptLineId:r.purchaseReceiptLineId,purchaseReceiptId:r.purchaseReceiptId,receiptReference:r.receiptReference,receiptEvidence:r.receiptEvidence,
  invoiceId:r.invoiceId,invoiceUuid:r.invoiceUuid,invoiceNumber:r.invoiceNumber,invoiceLineId:r.invoiceLineId,invoiceLineKey:r.invoiceLineKey,xmlHash:r.xmlHash,invoiceDate:r.invoiceDate,supplierName:r.supplierName,supplierTaxId:r.supplierTaxId,
  skuId:r.skuId,skuCode:d.skuCode,skuName:d.skuName,unitCode:r.unitCode,quantityPrecision:r.quantityPrecision,quantity:r.quantity,nativeNet:d.nativeNet,nativeVat,convertedVat,deductibleVat,capitalizedVat,
  vatRate:d.vatRate,vatTreatment:d.vatTreatment,vatReason:d.vatReason,inventoryValue:r.inventoryValue,currency:r.currency,baseCurrency:r.baseCurrency,exchangeRate:r.exchangeRate,exchangeDate:r.exchangeDate,exchangeEvidence:r.exchangeEvidence,
  postingDate:r.postingDate,postedAt:r.postedAt,journalId:r.journalId,goodsJournalLine:d.goodsJournalLine,vatJournalLineId:r.vatJournalLineId,vatJournalLine:d.vatJournalLine,vatAccountId:d.vatAccountId,
  stockReceiptId:r.stockReceiptId,stockReceiptLineId:r.stockReceiptLineId,layerId:r.layerId,orderLineId:d.orderLineId};
 return {...snapshot,snapshot,sourceHash:fingerprint(snapshot)};
}

export async function readSource(tx,c,id){const r=(await tx.query(`SELECT ${sourceFields} FROM vat_input_sources s WHERE ${own('s')} AND s.id=?`,[...scopeArgs(c),id])).rows[0];if(!r)throw notFound();return serialize(r);}
export async function available(c,input){
 await authorize(c,'vat.read');const p=v.listing(input),args=scopeArgs(c);let where=own('l')+" AND p.status='POSTED'";
 if(p.q){where+=" AND (i.invoice_number LIKE ? ESCAPE '!' OR p.reference LIKE ? ESCAPE '!')";args.push(pattern(p.q),pattern(p.q));}
 if(p.status==='AVAILABLE')where+=' AND vs.id IS NULL';else if(p.status==='REGISTERED')where+=' AND vs.id IS NOT NULL';
 return pageRows(`l.id,l.id AS purchaseReceiptLineId,p.id AS purchaseReceiptId,p.reference AS receiptReference,i.invoice_number AS invoiceNumber,i.issue_date AS invoiceDate,l.line_number AS lineNumber,l.quantity,l.value AS inventoryValue,l.details,i.currency,JSON_UNQUOTE(JSON_EXTRACT(p.plan,'$.baseCurrency')) AS baseCurrency,x.id AS layerId,vs.id AS registeredSourceId`,
  purchaseFrom+' LEFT JOIN vat_input_sources vs ON vs.purchase_receipt_line_id=l.id',where,args,p,'i.issue_date DESC,i.id,l.line_number');
}
export async function enroll(c,body){
 const input=v.enrollment(body);return entityWrite(c,'vat.source.register','vat.source.register',input,async tx=>{
  const items=[],fresh=[];for(const id of input.purchaseReceiptLineIds){const source=await purchaseSnapshot(tx,c,id),old=(await tx.query(`SELECT id,source_hash AS sourceHash FROM vat_input_sources WHERE tenant_id=? AND legal_entity_id=? AND purchase_receipt_line_id=?`,[...scopeArgs(c),id])).rows[0];
   if(old){if(old.sourceHash!==source.sourceHash)throw fail('VAT_SOURCE_CHANGED','Registered source facts differ from the retained purchase.');items.push({id:old.id,purchaseReceiptLineId:id,duplicate:true});continue;}
   const sourceId=randomUUID();fresh.push([sourceId,...scopeArgs(c),id,source.invoiceLineId,source.layerId,source.skuId,source.vatJournalLineId,source.quantity,source.nativeVat,source.convertedVat,source.deductibleVat,source.capitalizedVat,source.currency,source.baseCurrency,source.vatTreatment,JSON.stringify(source.snapshot),source.sourceHash,input.reason,input.evidence,c.identity.userId]);items.push({id:sourceId,purchaseReceiptLineId:id,duplicate:false});}
  await insertRows(tx,'vat_input_sources','id,tenant_id,legal_entity_id,purchase_receipt_line_id,invoice_line_id,layer_id,sku_id,vat_journal_line_id,quantity,native_vat,converted_vat,deductible_vat,capitalized_vat,currency,base_currency,vat_treatment,snapshot,source_hash,reason,evidence,registered_by',fresh);
  await audit(tx,c,'vat.source.registered',c.entityId,{sourceIds:items.map(i=>i.id),added:fresh.length,reason:input.reason,evidence:input.evidence});return {items,added:fresh.length};
 });
}
const totalsJoin=`LEFT JOIN (SELECT l.source_id,SUM(l.quantity) AS committedQuantity,SUM(l.deductible_vat) AS committedDeductibleVat,
 SUM(IF(a.status IN ('APPROVED','VOID_REQUESTED'),l.quantity,0)) AS acceptedQuantity,SUM(IF(a.status IN ('APPROVED','VOID_REQUESTED'),l.candidate_vat,0)) AS acceptedCandidateVat
 FROM vat_attribution_lines l JOIN vat_attributions a ON a.id=l.attribution_id WHERE a.status IN ('REQUESTED','APPROVED','VOID_REQUESTED') GROUP BY l.source_id) t ON t.source_id=s.id`;
const balanceFields=`COALESCE(t.committedQuantity,0) AS committedQuantity,COALESCE(t.acceptedQuantity,0) AS acceptedQuantity,COALESCE(t.acceptedCandidateVat,0) AS acceptedCandidateVat,
 s.quantity-COALESCE(t.committedQuantity,0) AS remainingQuantity,s.deductible_vat-COALESCE(t.committedDeductibleVat,0) AS remainingDeductibleVat`;
export async function list(c,input){await authorize(c,'vat.read');const p=v.listing(input),args=scopeArgs(c);let where=own('s');if(p.q){where+=" AND (JSON_UNQUOTE(JSON_EXTRACT(s.snapshot,'$.invoiceNumber')) LIKE ? ESCAPE '!' OR JSON_UNQUOTE(JSON_EXTRACT(s.snapshot,'$.skuCode')) LIKE ? ESCAPE '!')";args.push(pattern(p.q),pattern(p.q));}if(p.status){where+=' AND s.vat_treatment=?';args.push(p.status);}return pageRows(sourceFields+','+balanceFields,'vat_input_sources s '+totalsJoin,where,args,p,'s.registered_at DESC,s.id');}
export async function get(c,id){entityId(id);await authorize(c,'vat.read');const r=(await query(`SELECT ${sourceFields},${balanceFields} FROM vat_input_sources s ${totalsJoin} WHERE ${own('s')} AND s.id=?`,[...scopeArgs(c),id])).rows[0];if(!r)throw notFound();return {item:serialize(r)};}
export async function history(c,id,input){entityId(id);await authorize(c,'vat.read');await readSource({query},c,id);return pageRows('l.id,l.attribution_id AS attributionId,a.reference,a.status,a.treatment,l.quantity,l.native_vat AS nativeVat,l.deductible_vat AS deductibleVat,l.candidate_vat AS candidateVat,l.clearance_line_id AS clearanceLineId,a.requested_at AS requestedAt','vat_attribution_lines l JOIN vat_attributions a ON a.id=l.attribution_id',`${own('l')} AND l.source_id=?`,[...scopeArgs(c),id],v.listing(input),'a.requested_at DESC,a.id,l.line_number');}
