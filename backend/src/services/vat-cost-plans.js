import {scopeArgs,notFound} from './entity-context.js';
import {settings as accountingSettings} from './accounting-context.js';
import {settings,readInvoice,lineFields} from './invoice-records.js';
import {own,fail,serialize} from './purchasing-context.js';
import {active,read} from './vat-cost-records.js';
import {convertVat} from './vat-amounts.js';
import * as math from './vat-cost-math.js';
const {zero,less,sum,subtract,floorSubtract,minimum}=math;
const committed=(tx,c,where,args)=>tx.query(`SELECT a.id,a.reference,a.status,a.source_id AS sourceId,a.basis_id AS basisId,a.category,a.period,a.treatment,a.basis_vat AS basisVat,a.allocated_vat AS allocatedVat,a.candidate_vat AS candidateVat,a.asset_eligible_value AS assetEligibleValue,a.asset_total_value AS assetTotalValue FROM vat_cost_allocations a WHERE ${own('a')} AND a.status IN ${active} AND ${where} ORDER BY a.period,a.id`,[...scopeArgs(c),...args]).then(r=>r.rows);
export async function sourcePlan(tx,c,input,exclude=''){
 const l=(await tx.query(`SELECT ${lineFields} FROM purchase_invoice_lines l WHERE ${own('l')} AND l.id=?`,[...scopeArgs(c),input.invoiceLineId])).rows[0];if(!l)throw notFound();
 const invoice=await readInvoice(tx,c,l.invoiceId,true),config=await settings(tx,c),{baseCurrency}=await accountingSettings(tx,c);
 if(invoice.status==='CANCELLED'||invoice.parsedHeader.issues.length)throw fail('VAT_COST_INVOICE_EXCEPTIONS','Use a retained invoice without unresolved source parsing or arithmetic exceptions.');
 if(!config||config.receiverScheme!==invoice.receiverScheme||config.receiverTaxId!==invoice.receiverTaxId)throw fail('VAT_COST_RECIPIENT','The invoice recipient must match the configured company identity.');
 if((await tx.query('SELECT id FROM purchase_receipts WHERE tenant_id=? AND legal_entity_id=? AND active_invoice_id=?',[...scopeArgs(c),invoice.id])).rows.length||(await tx.query('SELECT id FROM vat_input_sources WHERE invoice_line_id=?',[l.id])).rows.length)throw fail('VAT_COST_GOODS_COLLISION','This invoice already supplies stock. Use the original goods VAT source.');
 const j=serialize((await tx.query(`SELECT jl.id,jl.journal_id AS journalId,jl.line_number AS lineNumber,jl.account_id AS accountId,jl.debit,jl.credit,j.currency,j.source_module AS sourceModule,j.source_id AS sourceId,j.posting_date AS postingDate,j.document_date AS documentDate,j.status,a.account_type AS accountType FROM journal_lines jl JOIN journals j ON j.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id WHERE ${own('jl')} AND jl.id=?`,[...scopeArgs(c),input.vatJournalLineId])).rows[0]??{});
 if(j.status!=='POSTED'||j.sourceModule!=='VAT_COST_INVOICE'||j.sourceId!==invoice.uuid||j.currency!==baseCurrency||j.credit!==zero||!less(zero,j.debit)||j.accountType!=='ASSET'||j.postingDate<invoice.issueDate)throw fail('VAT_COST_JOURNAL','Select the posted VAT debit for this invoice UUID, with source module VAT_COST_INVOICE, in the company base currency.');
 if(invoice.currency===baseCurrency&&input.exchangeRate!=='1.000000'||input.exchangeDate>j.postingDate)throw fail('VAT_COST_EXCHANGE','Same-currency invoices require rate 1; the evidenced rate date cannot follow posting.');
 const convertedVat=convertVat(l.vatAmount,input.exchangeRate);
 if(less(convertedVat,input.deductibleVat)||less(input.deductibleVat,input.availableVat)||input.category!=='ATIK'&&input.availableVat!==input.deductibleVat)throw fail('VAT_COST_AMOUNT','Deductible VAT must fit the original converted tax; only ATİK can use a smaller reviewed unrecovered basis.');
 if(input.category==='ATIK'&&input.firstUseDate<invoice.issueDate)throw fail('VAT_COST_ASSET_DATE','First use cannot precede the retained acquisition invoice.');
 const used=(await tx.query(`SELECT s.id,s.invoice_line_id AS invoiceLineId,s.deductible_vat AS deductibleVat,s.asset_reference AS assetReference,s.category,s.vat_journal_line_id AS journalLineId FROM vat_cost_sources s WHERE ${own('s')} AND s.id<>? AND s.status IN ${active} AND (s.invoice_line_id=? OR s.vat_journal_line_id=? OR (s.category='ATIK' AND s.asset_reference=?))`,[...scopeArgs(c),exclude,l.id,j.id,input.assetReference])).rows;
 if(used.some(s=>s.invoiceLineId===l.id||input.category==='ATIK'&&s.category==='ATIK'&&s.assetReference?.toLocaleLowerCase()===input.assetReference.toLocaleLowerCase()))throw fail('VAT_COST_DUPLICATE','The original invoice line or asset already has a committed VAT source.');
 if(less(j.debit,sum([input.deductibleVat,...used.filter(s=>s.journalLineId===j.id).map(s=>s.deductibleVat)])))throw fail('VAT_COST_DEBIT_EXCEEDED','Registered deductible VAT exceeds the original posted VAT debit.');
 return {baseCurrency,invoiceLineId:l.id,vatJournalLineId:j.id,category:input.category,nativeVat:l.vatAmount,convertedVat,deductibleVat:input.deductibleVat,availableVat:input.availableVat,assetReference:input.assetReference,firstUseDate:input.firstUseDate,
 snapshot:{invoiceId:invoice.id,invoiceUuid:invoice.uuid,invoiceNumber:invoice.invoiceNumber,xmlHash:invoice.xmlHash,invoiceDate:invoice.issueDate,currency:invoice.currency,supplierName:invoice.supplierName,supplierTaxId:invoice.supplierTaxId,receiverScheme:invoice.receiverScheme,receiverTaxId:invoice.receiverTaxId,line:l,journal:j,exchangeRate:input.exchangeRate,exchangeDate:input.exchangeDate,exchangeEvidence:input.exchangeEvidence,deductionEvidence:input.deductionEvidence}};
}
export async function basisPlan(tx,c,input,exclude=''){
 const {baseCurrency}=await accountingSettings(tx,c);math.ratio('1',input.eligibleValue,input.totalValue);const ordinaryCeiling=math.ceiling(input.eligibleValue,input.vatFreeValue,input.generalRate);
 if((await tx.query(`SELECT id FROM vat_allocation_bases WHERE tenant_id=? AND legal_entity_id=? AND period=? AND id<>? AND status IN ${active}`,[...scopeArgs(c),input.period,exclude])).rows.length)throw fail('VAT_COST_PERIOD_COMMITTED','This month already has a pending or approved allocation basis.');
 const headers=(await tx.query(`SELECT a.id,a.status,a.base_currency AS baseCurrency FROM vat_attributions a JOIN export_customs_documents d ON d.id=a.clearance_id WHERE ${own('a')} AND a.treatment='CANDIDATE' AND a.status IN ${active} AND DATE_FORMAT(d.event_date,'%Y-%m')=?`,[...scopeArgs(c),input.period])).rows;
 if(headers.some(a=>a.status!=='APPROVED'))throw fail('VAT_COST_GOODS_PENDING','Finish pending goods attribution reviews and corrections before freezing this month.');
 if(!headers.length)throw fail('VAT_COST_GOODS_REQUIRED','This month needs at least one approved candidate goods attribution.');
 if(headers.some(a=>a.baseCurrency!==baseCurrency))throw fail('VAT_COST_CURRENCY','All goods sources must share the allocation base currency.');
 const lines=(await tx.query(`SELECT l.id AS attributionLineId,l.candidate_vat AS candidateVat,l.quantity,l.snapshot,a.reference AS attributionReference,a.context_hash AS attributionHash FROM vat_attribution_lines l JOIN vat_attributions a ON a.id=l.attribution_id JOIN export_customs_documents d ON d.id=a.clearance_id WHERE ${own('a')} AND a.treatment='CANDIDATE' AND a.status='APPROVED' AND DATE_FORMAT(d.event_date,'%Y-%m')=? ORDER BY l.id`,[...scopeArgs(c),input.period])).rows.map(l=>({attributionLineId:l.attributionLineId,candidateVat:l.candidateVat,snapshot:{quantity:l.quantity,attributionReference:l.attributionReference,attributionHash:l.attributionHash,goods:l.snapshot}}));
 return {baseCurrency,period:input.period,eligibleValue:input.eligibleValue,totalValue:input.totalValue,vatFreeValue:input.vatFreeValue,generalRate:input.generalRate,ordinaryCeiling,goodsVat:sum(lines.map(l=>l.candidateVat)),lines};
}
export async function dependencies(tx,c,item){
 const other=await committed(tx,c,'a.id<>? AND (a.basis_id=? OR a.source_id=?)',[item.id??'',item.basisId,item.sourceId]);
 const rank={DIRECT_CHARGE:1,OVERHEAD:2,ATIK:3};
 if(item.treatment==='CANDIDATE'&&other.some(a=>a.basisId===item.basisId&&a.treatment==='CANDIDATE'&&rank[a.category]>rank[item.category]))throw fail('VAT_COST_PRIORITY','Release later-priority candidate allocations before changing this category.');
 if(item.category==='ATIK'&&other.some(a=>a.sourceId===item.sourceId&&a.period>item.period))throw fail('VAT_COST_ASSET_ORDER','Correct later asset periods first.');
 return other;
}
export async function allocationPlan(tx,c,input){
 const source=await read(tx,c,'source',input.sourceId),basis=await read(tx,c,'basis',input.basisId);
 if(source.status!=='APPROVED'||basis.status!=='APPROVED'||source.baseCurrency!==basis.baseCurrency)throw fail('VAT_COST_NOT_APPROVED','Choose an approved source and monthly basis in the same base currency.');
 if(source.plan.snapshot.journal.postingDate.slice(0,7)>basis.period)throw fail('VAT_COST_POSTING_PERIOD','A cost cannot be allocated before its original journal posting month.');
 const other=await dependencies(tx,c,{...input,category:source.category,period:basis.period});
 if(other.some(a=>a.sourceId===source.id&&a.basisId===basis.id))throw fail('VAT_COST_ALREADY_ALLOCATED','This source already has a committed allocation in this monthly basis.');
 if(source.category!=='DIRECT_CHARGE'&&!input.earlierCategoriesComplete)throw fail('VAT_COST_PRIORITY_CONFIRMATION','Confirm the earlier categories are complete before overhead or ATİK allocation.');
 const used=other.filter(a=>a.sourceId===source.id),remaining=subtract(source.availableVat,sum(used.map(a=>a.basisVat))),priorPeriodCandidate=sum(other.filter(a=>a.basisId===basis.id).map(a=>a.candidateVat));
 const headroom=floorSubtract(basis.ordinaryCeiling,sum([basis.goodsVat,priorPeriodCandidate]));
 let basisVat=input.basisVat,calculatedVat,allocatedVat,nonExportVat=zero,assetHistory=null;
 if(source.category==='ATIK'){
  if(!input.useEvidence||source.firstUseDate.slice(0,7)>basis.period||used.some(a=>a.status!=='APPROVED'||a.period>=basis.period))throw fail('VAT_COST_ASSET_HISTORY','Provide cumulative use evidence from first use, after all earlier asset allocations are approved.');
  const prior=used.at(-1);math.ratio(source.availableVat,input.assetEligibleValue,input.assetTotalValue);
  if(prior&&(less(input.assetEligibleValue,prior.assetEligibleValue)||less(input.assetTotalValue,prior.assetTotalValue)||less(subtract(input.assetTotalValue,prior.assetTotalValue),subtract(input.assetEligibleValue,prior.assetEligibleValue))))throw fail('VAT_COST_ASSET_CUMULATIVE','Cumulative eligible and total use cannot decrease; added eligible use must fit added total use.');
  const previousAllocated=sum(used.map(a=>a.allocatedVat));calculatedVat=math.assetShare(source.availableVat,input.assetEligibleValue,input.assetTotalValue,previousAllocated);allocatedVat=minimum(calculatedVat,remaining,headroom);basisVat=allocatedVat;
  assetHistory={firstUseDate:source.firstUseDate,priorAllocations:used.map(a=>({id:a.id,period:a.period,allocatedVat:a.allocatedVat,eligibleValue:a.assetEligibleValue,totalValue:a.assetTotalValue})),previousAllocated,cumulativeEligibleValue:input.assetEligibleValue,cumulativeTotalValue:input.assetTotalValue,useEvidence:input.useEvidence};
 }else{
  if(input.assetEligibleValue!==zero||input.assetTotalValue!==zero||!less(zero,basisVat)||less(remaining,basisVat))throw fail('VAT_COST_SOURCE_EXCEEDED','The positive allocation basis must fit the remaining source VAT. Asset use values are reserved for ATİK.');
  calculatedVat=source.category==='DIRECT_CHARGE'?basisVat:math.ratio(basisVat,basis.eligibleValue,basis.totalValue);allocatedVat=source.category==='DIRECT_CHARGE'?calculatedVat:minimum(calculatedVat,headroom);nonExportVat=subtract(basisVat,calculatedVat);
 }
 const available=(await tx.query(`SELECT id,attribution_line_id AS attributionLineId,snapshot FROM vat_allocation_basis_lines WHERE tenant_id=? AND legal_entity_id=? AND basis_id=?`,[...scopeArgs(c),basis.id])).rows,byId=new Map(available.map(l=>[l.id,l]));if(input.lines.some(l=>!byId.has(l.basisLineId)))throw notFound();
 const distribution=math.weighted(allocatedVat,input.lines),candidateVat=input.treatment==='CANDIDATE'?allocatedVat:zero;
 const lines=input.lines.map(l=>({...l,allocatedVat:distribution.get(l.basisLineId),candidateVat:input.treatment==='CANDIDATE'?distribution.get(l.basisLineId):zero,snapshot:byId.get(l.basisLineId)}));
 return {baseCurrency:source.baseCurrency,sourceId:source.id,basisId:basis.id,sourceHash:source.contextHash,basisHash:basis.contextHash,category:source.category,period:basis.period,treatment:input.treatment,basisVat,calculatedVat,allocatedVat,candidateVat,nonExportVat,limitedVat:subtract(calculatedVat,allocatedVat),assetEligibleValue:input.assetEligibleValue,assetTotalValue:input.assetTotalValue,headroomBefore:headroom,ordinaryCeiling:basis.ordinaryCeiling,goodsVat:basis.goodsVat,priorPeriodCandidate,exceedsOrdinaryCeiling:less(headroom,candidateVat),assetHistory,lines};
}
export const builders={source:sourcePlan,basis:basisPlan,allocation:allocationPlan};
