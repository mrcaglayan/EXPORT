import {randomUUID} from 'node:crypto';
import Decimal from 'decimal.js';
import {query,withTransaction} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import * as v from '../validators/purchase-receipts.validators.js';
import {allocateValue} from '../validators/receipts.validators.js';
import {amount,sumAmounts} from '../shared/money.js';
import {fingerprint} from '../shared/idempotency.js';
import {authorize,entityWrite,audit,scopeArgs,notFound} from './entity-context.js';
import {settings as accountingSettings} from './accounting-context.js';
import {fail,own,pageRows,insertRows,serialize,skuReferences,checkPrecision} from './purchasing-context.js';
import {readInvoice} from './invoice-records.js';
import {inspect} from './invoice-validation.js';
import {postPurchaseInTransaction} from './inventory-receipts.service.js';
import {postInTransaction as postJournal,validatePosting} from './journal.service.js';
import {retainCostInvoice} from './vat-cost-guards.js';
const D=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP});
const zero='0.000000';
const money=x=>amount(new D(x).toFixed(6));
async function policy(tx,context){return (await tx.query('SELECT policy FROM purchase_posting_settings WHERE tenant_id=? AND legal_entity_id=?',scopeArgs(context))).rows[0]?.policy??null;}
async function accounts(tx,context,p){
 const expected=[[p.inventoryAccountId,'ASSET'],[p.payableAccountId,'LIABILITY'],...p.vatAccounts.map(r=>[r.accountId,'ASSET']),...(p.roundingAccountId?[[p.roundingAccountId,null]]:[])];
 const ids=[...new Set(expected.map(([id])=>id))].sort(),rows=[];
 for(let offset=0;offset<ids.length;offset+=250){const batch=ids.slice(offset,offset+250);rows.push(...(await tx.query(`SELECT id,code,name,account_type AS accountType,active FROM accounts WHERE tenant_id=? AND legal_entity_id=? AND id IN (${batch.map(()=>'?').join(',')}) ORDER BY id`,[...scopeArgs(context),...batch])).rows);}
 const map=new Map(rows.map(r=>[r.id,r]));
 for(const [id,type]of expected){const a=map.get(id);if(!a?.active||type&&a.accountType!==type)throw fail('POSTING_ACCOUNT_UNAVAILABLE','Posting accounts must be active, belong to this company and use asset/liability types appropriate to their role.',422);}
 if(p.inventoryAccountId===p.payableAccountId||p.vatAccounts.some(r=>[p.inventoryAccountId,p.payableAccountId,p.roundingAccountId].includes(r.accountId))||p.roundingAccountId&&[p.inventoryAccountId,p.payableAccountId].includes(p.roundingAccountId))throw fail('POSTING_ACCOUNT_ROLES','Choose separate stock, deductible VAT, payable and conversion-rounding accounts.',422);
 return rows;
}
export async function getSettings(context){await authorize(context,'purchasing.read');return {policy:await policy({query},context)};}
export async function saveSettings(context,body){const input=v.policy(body);return entityWrite(context,'purchasing.receipt.configure','purchasing.receipt.configure',input,async tx=>{
 const {reason,...p}=input;await accounts(tx,context,p);await tx.query(`INSERT INTO purchase_posting_settings (tenant_id,legal_entity_id,policy,updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE policy=VALUES(policy),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`,[...scopeArgs(context),JSON.stringify(p),context.identity.userId]);await audit(tx,context,'purchasing.receipt.configured',context.entityId,{reason,policy:p});return {policy:p};
});}
async function references(tx,context,input,lines){
 const read=async(table,id)=>{const row=(await tx.query(`SELECT * FROM ${table} WHERE tenant_id=? AND legal_entity_id=? AND id=?`,[...scopeArgs(context),id])).rows[0];if(!row?.active)throw fail('INACTIVE_REFERENCE','Select active receipt references in this company.');return serialize(row);};
 const warehouse=await read('warehouses',input.warehouseId),movement=await read('inventory_movement_types',input.movementTypeId);
 if(movement.effect!=='RECEIPT')throw fail('MOVEMENT_EFFECT_MISMATCH','Choose a receipt movement type.');
 const pools=[];for(const id of [...new Set(input.lines.flatMap(l=>l.allocations.map(a=>a.poolId)))].sort())pools.push(await read('inventory_pools',id));
 const skus=await skuReferences(tx,context,lines.map(l=>l.skuId));
 for(const l of lines){const sku=skus.get(l.skuId);l.skuCode=sku.code;l.skuName=sku.name;for(const a of l.allocations)checkPrecision(a.quantity,sku);}
 const periods=(await tx.query(`SELECT i.id,i.status,a.status AS accountingStatus FROM inventory_periods i JOIN accounting_periods a ON a.id=i.accounting_period_id AND a.tenant_id=i.tenant_id AND a.legal_entity_id=i.legal_entity_id WHERE ${own('i')} AND ? BETWEEN a.start_date AND a.end_date`,[...scopeArgs(context),input.postingDate])).rows;
 if(periods.length!==1)throw fail('PERIOD_NOT_FOUND','Configure one inventory period for the posting date.',422);
 if(periods[0].status!=='OPEN'||periods[0].accountingStatus!=='OPEN')throw fail('PERIOD_CLOSED','Both inventory and accounting periods must be open.');
 return {warehouse,movement,pools};
}
async function build(tx,context,invoice,input){
 await retainCostInvoice(tx,context,invoice);
 if(invoice.status!=='READY')throw fail('INVOICE_NOT_READY','Independently approve invoice matching before receiving goods.');
 const checked=await inspect(tx,context,invoice);if(!checked.canSubmit)throw fail('INVOICE_EXCEPTIONS','Resolve invoice matching exceptions and renew any stale approval.');
 const p=await policy(tx,context);if(!p)throw fail('POSTING_NOT_CONFIGURED','Configure stock, deductible VAT and supplier payable accounts.');
 const accountRows=await accounts(tx,context,p),base=(await accountingSettings(tx,context)).baseCurrency;
 if(input.postingDate<invoice.issueDate)throw fail('POSTING_BEFORE_INVOICE','Posting date cannot precede the source invoice.',422);
 if(input.exchangeDate>input.postingDate)throw fail('EXCHANGE_DATE','Exchange-rate evidence cannot be dated after posting.',422);
 if(invoice.currency===base&&input.exchangeRate!=='1.000000')throw fail('EXCHANGE_RATE','Use rate 1 when invoice and base currencies match.',422);
 const requested=new Map(input.lines.map(l=>[l.invoiceLineId,l])),mapped=new Map(checked.mappings.map(m=>[m.invoiceLineId,m]));
 if(requested.size!==checked.lines.length||checked.lines.some(l=>!requested.has(l.id)))throw fail('COMPLETE_RECEIPT_REQUIRED','This step receives the complete invoice once. Every invoice line needs its full quantity and pool allocation.',422);
 const journalLines=[],lines=checked.lines.map(l=>{
  const r=requested.get(l.id),m=mapped.get(l.id);
  if(sumAmounts(r.allocations.map(a=>a.quantity))!==l.quantity)throw fail('ALLOCATION_MISMATCH','Received pool quantities must equal each complete invoiced line quantity.',422);
  if(l.vatAmount===zero&&r.vatTreatment!=='NONE'||l.vatAmount!==zero&&r.vatTreatment==='NONE')throw fail('VAT_TREATMENT','Choose no VAT only for a source line with zero VAT.',422);
  if(l.vatAmount!==zero&&!r.vatReason.trim())throw fail('VAT_EVIDENCE','Record the accounting basis for deducting or capitalizing each taxed line’s VAT.',422);
  const inventoryValue=money(new D(l.netAmount).plus(r.vatTreatment==='CAPITALIZE'?l.vatAmount:0).times(input.exchangeRate));
  const deductibleVat=r.vatTreatment==='DEDUCTIBLE'?money(new D(l.vatAmount).times(input.exchangeRate)):zero;
  const vatAccount=r.vatTreatment==='DEDUCTIBLE'?p.vatAccounts.find(a=>a.rate===l.taxes[0].percent)?.accountId:null;
  if(r.vatTreatment==='DEDUCTIBLE'&&!vatAccount)throw fail('VAT_ACCOUNT_MISSING','Configure an explicit deductible VAT account for each source VAT rate.',422);
  const goodsJournalLine=inventoryValue!==zero?journalLines.push({accountId:p.inventoryAccountId,description:`Invoice line ${l.lineKey}: goods`,debit:inventoryValue,credit:zero}):null;
  const vatJournalLine=deductibleVat!==zero?journalLines.push({accountId:vatAccount,description:`Invoice line ${l.lineKey}: deductible VAT`,debit:deductibleVat,credit:zero}):null;
  return {invoiceLineId:l.id,lineNumber:l.lineNumber,lineKey:l.lineKey,skuId:m.skuId,orderLineId:m.orderLineId,quantity:l.quantity,description:l.description.slice(0,255),nativeNet:l.netAmount,nativeVat:l.vatAmount,vatRate:l.taxes[0].percent,vatTreatment:r.vatTreatment,vatReason:r.vatReason,inventoryValue,deductibleVat,inventoryAccountId:p.inventoryAccountId,vatAccountId:vatAccount,unitCost:money(new D(inventoryValue).div(l.quantity)),goodsJournalLine,vatJournalLine,allocations:allocateValue(r.allocations,l.quantity,inventoryValue)};
 });
 const payable=money(new D(invoice.payableTotal).times(input.exchangeRate)),debit=sumAmounts(journalLines.map(l=>l.debit)),rounding=new D(payable).minus(debit);
 if(!rounding.isZero()){
  // Only conversion rounding is accepted here, never an unexplained source gap.
  if(rounding.abs().gt(new D(lines.length*2+1).times('0.000001')))throw fail('JOURNAL_MISMATCH','Source costs and VAT do not reconcile to the invoice payable.');
  if(!p.roundingAccountId)throw fail('ROUNDING_ACCOUNT_MISSING','Configure a conversion-rounding account for the previewed base-currency difference.');
  journalLines.push({accountId:p.roundingAccountId,description:'Base currency conversion rounding',debit:rounding.gt(0)?money(rounding):zero,credit:rounding.lt(0)?money(rounding.abs()):zero});
 }
 const payableJournalLine=payable!==zero?journalLines.push({accountId:p.payableAccountId,description:`Supplier invoice ${invoice.invoiceNumber}`,debit:zero,credit:payable}):null;
 const accountLabels=new Map(accountRows.map(a=>[a.id,a]));for(const line of journalLines){line.accountCode=accountLabels.get(line.accountId).code;line.accountName=accountLabels.get(line.accountId).name;}
 const journal={documentDate:invoice.issueDate,postingDate:input.postingDate,currency:base,description:`Purchase ${invoice.invoiceNumber}`.slice(0,255),sourceModule:'PURCHASE_INVOICE',sourceId:invoice.id,lines:journalLines};
 if(journalLines.length)await validatePosting(tx,context,journal);
 const refs=await references(tx,context,input,lines);
 const contextHash=fingerprint({invoiceReview:checked.reviewHash,policy:p,accounts:accountRows,refs});
 return {input,contextHash,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,invoiceReviewHash:checked.reviewHash,commercialResolutionId:checked.resolution?.id??null,currency:invoice.currency,baseCurrency:base,payable,nativePayable:invoice.payableTotal,totalValue:sumAmounts(lines.map(l=>l.inventoryValue)),conversionRounding:rounding.toFixed(6),payableAccountId:p.payableAccountId,payableJournalLine,lines,journal,journalHash:fingerprint(journal)};
}
export async function preview(context,id,body){entityId(id);const input=v.request(body);await authorize(context,'purchasing.read');return withTransaction(async tx=>({plan:await build(tx,context,await readInvoice(tx,context,id,true),input)}));}
async function read(tx,context,id,full=false){
 const row=(await tx.query(`SELECT p.id,p.invoice_id AS invoiceId,p.reference,p.status,p.context_hash AS contextHash,p.plan,p.reason,p.evidence,p.stock_receipt_id AS stockReceiptId,p.journal_id AS journalId,p.requested_by AS requestedBy,p.requested_at AS requestedAt,p.reviewed_by AS reviewedBy,p.reviewed_at AS reviewedAt,p.review_reason AS reviewReason,p.posted_by AS postedBy,p.posted_at AS postedAt,p.cancel_reason AS cancelReason FROM purchase_receipts p WHERE ${own('p')} AND p.id=?`,[...scopeArgs(context),id])).rows[0];if(!row)throw notFound();
 const item=serialize(row);if(!full){const {lines,journal,...summary}=item.plan;item.plan={...summary,lineCount:lines.length,journal:{...journal,lines:undefined}};}return item;
}
export async function get(context,id){entityId(id);await authorize(context,'purchasing.read');return {item:await read({query},context,id)};}
export async function list(context,invoiceId,input){entityId(invoiceId);const p=v.listing(input);await authorize(context,'purchasing.read');await readInvoice({query},context,invoiceId);return pageRows('p.id,p.reference,p.status,p.stock_receipt_id AS stockReceiptId,p.journal_id AS journalId,p.requested_by AS requestedBy,p.requested_at AS requestedAt,p.reviewed_by AS reviewedBy,p.reviewed_at AS reviewedAt,p.review_reason AS reviewReason,p.reason,p.evidence','purchase_receipts p',`${own('p')} AND p.invoice_id=?`,[...scopeArgs(context),invoiceId],p,'p.requested_at DESC,p.id DESC');}
export async function lines(context,id,input){entityId(id);const p=v.listing(input);await authorize(context,'purchasing.read');await read({query},context,id);return pageRows('l.id,l.invoice_line_id AS invoiceLineId,l.line_number AS lineNumber,l.sku_id AS skuId,l.quantity,l.value,l.details,s.id AS stockReceiptLineId,x.id AS layerId','purchase_receipt_lines l JOIN purchase_receipts p ON p.id=l.receipt_id AND p.tenant_id=l.tenant_id AND p.legal_entity_id=l.legal_entity_id LEFT JOIN stock_receipt_lines s ON s.receipt_id=p.stock_receipt_id AND s.source_line_key=l.invoice_line_id AND s.tenant_id=l.tenant_id AND s.legal_entity_id=l.legal_entity_id LEFT JOIN inventory_layers x ON x.receipt_line_id=s.id AND x.tenant_id=s.tenant_id AND x.legal_entity_id=s.legal_entity_id',`${own('l')} AND l.receipt_id=?`,[...scopeArgs(context),id],p,'l.line_number');}
export async function journalPreview(context,id){entityId(id);await authorize(context,'purchasing.read');const item=await read({query},context,id,true);return {journal:item.plan.journal,payableJournalLine:item.plan.payableJournalLine};}
export async function request(context,id,body){entityId(id);const input=v.request(body);return entityWrite(context,'purchasing.receipt.request','purchasing.receipt.request',{id,...input},async tx=>{
 if((await tx.query('SELECT id FROM purchase_receipts WHERE tenant_id=? AND legal_entity_id=? AND active_invoice_id=?',[...scopeArgs(context),id])).rows.length)throw fail('INVOICE_ALREADY_RECEIVED','This invoice already has an active or posted receipt.');
 const invoice=await readInvoice(tx,context,id,true),plan=await build(tx,context,invoice,input),receiptId=randomUUID();
 await tx.query(`INSERT INTO purchase_receipts (id,tenant_id,legal_entity_id,invoice_id,active_invoice_id,reference,context_hash,plan,reason,evidence,requested_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[receiptId,...scopeArgs(context),id,id,input.reference,plan.contextHash,JSON.stringify(plan),input.reason,input.evidence,context.identity.userId]);
 await insertRows(tx,'purchase_receipt_lines','id,tenant_id,legal_entity_id,receipt_id,invoice_line_id,line_number,sku_id,quantity,value,details',plan.lines.map(l=>[randomUUID(),...scopeArgs(context),receiptId,l.invoiceLineId,l.lineNumber,l.skuId,l.quantity,l.inventoryValue,JSON.stringify(l)]));
 await tx.query("UPDATE purchase_receipts SET status='REQUESTED' WHERE id=?",[receiptId]);await audit(tx,context,'purchasing.receipt.requested',receiptId,{invoiceId:id,lineCount:plan.lines.length,totalValue:plan.totalValue,payable:plan.payable});return {item:await read(tx,context,receiptId)};
});}
async function current(tx,context,item){const invoice=await readInvoice(tx,context,item.invoiceId,true),plan=await build(tx,context,invoice,item.plan.input);if(fingerprint(plan)!==fingerprint(item.plan))throw fail('STALE_RECEIPT','Referenced accounting or purchasing details changed. Cancel this unposted request and create a fresh receipt.');return plan;}
export async function act(context,id,action,body){entityId(id);if(!['approve','reject','cancel','post'].includes(action))throw notFound();const input=v.reason(body),permission=action==='post'?'purchasing.receipt.post':action==='cancel'?'purchasing.receipt.request':'purchasing.receipt.review';
 return entityWrite(context,permission,'purchasing.receipt.'+action,{id,...input},async tx=>{
  if(action==='post'){await authorize(context,'inventory.receipt.post',tx);await authorize(context,'accounting.post',tx);}
  const item=await read(tx,context,id,true),scope=scopeArgs(context);
  if(action==='post'&&item.status==='POSTED')return {item:await read(tx,context,id)};
  const allowed=action==='cancel'?['REQUESTED','APPROVED']:action==='post'?['APPROVED']:['REQUESTED'];if(!allowed.includes(item.status))throw fail('INVALID_STATE','This receipt action does not match its current status.');
  if(action==='approve'||action==='reject'){
   if(item.requestedBy===context.identity.userId)throw fail('INDEPENDENT_REVIEW_REQUIRED','A different person must review the goods receipt.');
   if(action==='approve')await current(tx,context,item);
   await tx.query('UPDATE purchase_receipts SET status=?,active_invoice_id=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE id=?',[action==='approve'?'APPROVED':'REJECTED',action==='approve'?item.invoiceId:null,context.identity.userId,input.reason,id]);
  }else if(action==='cancel')await tx.query("UPDATE purchase_receipts SET status='CANCELLED',active_invoice_id=NULL,cancel_reason=? WHERE id=?",[input.reason,id]);
  else{
   const plan=await current(tx,context,item);await tx.query("UPDATE purchase_receipts SET status='POSTING' WHERE id=?",[id]);
   const stock=await postPurchaseInTransaction(tx,context,{sourceId:id,documentDate:plan.journal.documentDate,postingDate:plan.input.postingDate,warehouseId:plan.input.warehouseId,movementTypeId:plan.input.movementTypeId,currency:plan.baseCurrency,description:plan.journal.description,totalValue:plan.totalValue,lines:plan.lines.map(l=>({sourceLineKey:l.invoiceLineId,skuId:l.skuId,description:l.description,quantity:l.quantity,unitCost:l.unitCost,value:l.inventoryValue,allocations:l.allocations}))});
   const journal=plan.journal.lines.length?(await postJournal(tx,context,plan.journal)).journal:null;
   await tx.query("UPDATE purchase_receipts SET status='POSTED',stock_receipt_id=?,journal_id=?,posted_by=?,posted_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND legal_entity_id=? AND id=?",[stock.receipt.id,journal?.id??null,context.identity.userId,...scope,id]);
  }
  await audit(tx,context,'purchasing.receipt.'+action,id,{invoiceId:item.invoiceId,reason:input.reason});return {item:await read(tx,context,id)};
 });
}
