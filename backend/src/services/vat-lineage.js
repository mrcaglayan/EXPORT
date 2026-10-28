import {scopeArgs,notFound} from './entity-context.js';
import {own,fail,serialize} from './purchasing-context.js';
import {readSource,purchaseSnapshot} from './vat-sources.service.js';
import {fingerprint} from '../shared/idempotency.js';
import {zero} from './vat-amounts.js';

export const exitFrom=`export_customs_lines c JOIN export_customs_documents e ON e.id=c.document_id
 JOIN export_customs_lines d ON d.id=c.declaration_line_id JOIN export_customs_documents g ON g.id=d.document_id
 JOIN inventory_issue_lines il ON il.id=d.issue_line_id JOIN inventory_layers x ON x.id=il.layer_id
 JOIN stock_receipt_lines sl ON sl.id=x.receipt_line_id JOIN stock_receipts sr ON sr.id=sl.receipt_id
 JOIN export_sales_allocations a ON a.id=d.sales_allocation_id JOIN export_sales_plans p ON p.id=a.plan_id
 JOIN export_sales_invoices i ON i.id=p.invoice_id JOIN export_sales_invoice_lines oi ON oi.id=a.invoice_line_id
 LEFT JOIN vat_input_sources vs ON vs.layer_id=il.layer_id`;
export const exitFields=`c.id,c.line_number AS lineNumber,c.document_id AS clearanceId,c.declaration_line_id AS declarationLineId,c.quantity,c.snapshot,
 e.reference AS clearanceReference,e.event_date AS clearanceDate,e.closing_date AS closingDate,e.is_final AS final,e.status AS clearanceStatus,e.kind,e.context_hash AS clearanceHash,e.transaction_type AS transactionType,e.reviewed_by AS clearanceReviewer,e.reviewed_at AS clearanceReviewedAt,
 g.id AS declarationId,g.reference AS declarationReference,g.event_date AS registrationDate,g.status AS declarationStatus,g.context_hash AS declarationHash,
 il.id AS issueLineId,il.layer_id AS layerId,il.sku_id AS skuId,il.quantity AS issueQuantity,
 sr.source_kind AS stockSourceKind,sr.source_id AS stockSourceId,sl.id AS stockReceiptLineId,vs.id AS sourceId,
 i.id AS outgoingInvoiceId,i.invoice_number AS outgoingInvoiceNumber,i.xml_hash AS outgoingXmlHash,i.profile AS outgoingProfile,i.invoice_type AS outgoingType,oi.id AS outgoingInvoiceLineId,oi.vat_amount AS outgoingVat`;

export async function acceptedExit(tx,c,id){const r=(await tx.query(`SELECT ${exitFields} FROM ${exitFrom} WHERE ${own('c')} AND c.id=?`,[...scopeArgs(c),id])).rows[0];if(!r)throw notFound();return serialize(r);}
export async function traceExit(tx,c,exit,treatment,cache=new Map()){
 if(exit.kind!=='CLEARANCE'||exit.clearanceStatus!=='APPROVED'||exit.declarationStatus!=='APPROVED')throw fail('VAT_EXIT_NOT_ACCEPTED','Attribution requires independently accepted customs exit quantities.');
 if(exit.stockSourceKind!=='PURCHASE_INVOICE')throw fail('VAT_PURCHASE_PROVENANCE','This issue layer has no supported posted purchase-invoice VAT source.');
 if(!exit.sourceId)throw fail('VAT_SOURCE_NOT_REGISTERED','Register the posted purchase line for this exact stock layer first.');
 let source=cache.get(exit.sourceId);if(!source){source=await readSource(tx,c,exit.sourceId);const original=await purchaseSnapshot(tx,c,source.purchaseReceiptLineId);if(original.sourceHash!==source.sourceHash||fingerprint(source.snapshot)!==source.sourceHash)throw fail('VAT_SOURCE_CHANGED','Retained purchase VAT evidence changed.');cache.set(source.id,source);}
 if(source.layerId!==exit.layerId||source.skuId!==exit.skuId||source.snapshot.stockReceiptLineId!==exit.stockReceiptLineId)throw fail('VAT_LINEAGE_MISMATCH','The accepted exit must resolve to its exact original purchase layer.');
 if(treatment==='CANDIDATE'&&['TEMPORARY_EXPORT','RETURN_EXPORT'].includes(exit.transactionType))throw fail('VAT_TRANSACTION_REVIEW','Temporary and return export sources must stay held or excluded until their dedicated treatment is implemented.');
 if(treatment==='CANDIDATE'&&exit.outgoingVat!==zero)throw fail('VAT_TAXED_OUTGOING','An outgoing line carrying VAT must stay held or excluded; this stage does not resolve its export tax treatment.');
 const snapshot={version:1,clearance:{id:exit.clearanceId,reference:exit.clearanceReference,date:exit.clearanceDate,closingDate:exit.closingDate,final:Boolean(exit.final),hash:exit.clearanceHash,reviewedBy:exit.clearanceReviewer,reviewedAt:exit.clearanceReviewedAt},
  declaration:{id:exit.declarationId,reference:exit.declarationReference,registrationDate:exit.registrationDate,hash:exit.declarationHash},
  clearanceLine:{id:exit.id,quantity:exit.quantity,declarationLineId:exit.declarationLineId},transactionType:exit.transactionType,
  issue:{id:exit.issueLineId,layerId:exit.layerId,skuId:exit.skuId,quantity:exit.issueQuantity,stockReceiptLineId:exit.stockReceiptLineId},
  outgoing:{id:exit.outgoingInvoiceId,number:exit.outgoingInvoiceNumber,invoiceLineId:exit.outgoingInvoiceLineId,xmlHash:exit.outgoingXmlHash,profile:exit.outgoingProfile,type:exit.outgoingType,vat:exit.outgoingVat},
  source:{id:source.id,sourceHash:source.sourceHash,baseCurrency:source.baseCurrency,currency:source.currency,purchase:source.snapshot},acceptedExportEvidence:exit.snapshot};
 return {source,snapshot};
}
