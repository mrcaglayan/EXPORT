import {scopeArgs,notFound} from './entity-context.js';
import {own,fail,serialize} from './purchasing-context.js';
import {read as readRefund} from './vat-refund-records.js';
import {readInvoice,sourceLines} from './invoice-records.js';
import {fingerprint} from '../shared/idempotency.js';
import {sum,less,zero,rounded,today,deadline} from './vat-refund-math.js';
import {read as readCost} from './vat-cost-records.js';
import {convertVat} from './vat-amounts.js';
import {read,active,members,trackingState} from './vat-claim-records.js';

export async function sourceContext(tx,c,ids){
 const refunds=[],reconciliations=new Map();
 for(const id of ids){const r=await readRefund(tx,c,'refund',id);if(r.status!=='APPROVED')throw fail('VAT_PACKAGE_REQUEST','Only independently approved refund requests can enter a claim package.');refunds.push(r);if(!reconciliations.has(r.reconciliationId)){const m=await readRefund(tx,c,'reconciliation',r.reconciliationId);if(m.status!=='APPROVED'||m.contextHash!==r.plan.reconciliationHash)throw fail('VAT_PACKAGE_RETURN','Retain the approved original KDV1 reconciliation.');reconciliations.set(m.id,m);}}
 const exits=[];
 for(const r of reconciliations.values()){
  const rows=(await tx.query(`SELECT c.id,c.quantity,e.event_date AS exitDate,e.context_hash AS exitHash,e.transaction_type AS transactionType,d.document_id AS declarationId,g.reference AS declarationReference,g.context_hash AS declarationHash,g.event_date AS registrationDate,d.declared_gtip AS gtip,i.id AS invoiceId,i.invoice_number AS invoiceNumber,i.issue_date AS invoiceDate,i.xml_hash AS invoiceHash,i.currency,i.parsed_header AS invoiceHeader,l.id AS invoiceLineId,l.description,l.quantity AS invoiceQuantity,l.unit_code AS unitCode,l.net_amount AS netAmount
   FROM export_customs_lines c JOIN export_customs_documents e ON e.id=c.document_id JOIN export_customs_lines d ON d.id=c.declaration_line_id JOIN export_customs_documents g ON g.id=d.document_id JOIN export_sales_allocations a ON a.id=d.sales_allocation_id JOIN export_sales_invoice_lines l ON l.id=a.invoice_line_id JOIN export_sales_invoices i ON i.id=l.invoice_id
   WHERE ${own('e')} AND e.kind='CLEARANCE' AND e.status='APPROVED' AND g.status='APPROVED' AND i.status='APPROVED' AND e.transaction_type IN ('STANDARD_EXPORT','FREE_OF_CHARGE') AND l.vat_amount=0 AND DATE_FORMAT(e.event_date,'%Y-%m')=? ORDER BY c.id`,[...scopeArgs(c),r.period])).rows.map(serialize);
  exits.push(...rows.map(x=>({...x,period:r.period,reconciliationId:r.id})));
 }
 const declarations=[...new Map(exits.map(x=>[x.declarationId,{declarationId:x.declarationId,reference:x.declarationReference,registrationDate:x.registrationDate,currency:x.currency}])).values()].sort((a,b)=>a.declarationId.localeCompare(b.declarationId));
 return {refunds,reconciliations:[...reconciliations.values()].sort((a,b)=>a.period.localeCompare(b.period)),exits,declarations,units:[...new Set(exits.map(x=>x.unitCode))].sort()};
}
const docKey=r=>r.taxId+'|'+r.series+'|'+r.number;
async function invoiceFacts(tx,c,id,rate,cache){
 const key=id+':'+rate;if(cache.has(key))return cache.get(key);
 const i=await readInvoice(tx,c,id,true),ls=await sourceLines(tx,c,id);
 const data={invoiceDate:i.issueDate,series:'',number:i.invoiceNumber,sellerName:i.supplierName,taxId:i.supplierTaxId,description:ls.map(l=>l.description).join(', '),quantity:ls.map(l=>l.quantity+' '+l.unitCode).join(', '),netTry:convertVat(i.netTotal,rate),importNumber:'',inputType:'DOMESTIC'};
 const result={data,snapshot:{invoiceId:i.id,invoiceUuid:i.uuid,xmlHash:i.xmlHash,currency:i.currency,exchangeRate:rate,nativeNet:i.netTotal,nativeVat:i.vatTotal,originalLines:ls}};cache.set(key,result);return result;
}
async function deductionInvoice(tx,c,id,period,cache){
 const rows=(await tx.query(`SELECT d.id,d.deducted_vat AS deductedVat,d.context_hash AS contextHash,d.plan FROM vat_deductions d WHERE ${own('d')} AND d.period=? AND d.status='APPROVED' AND JSON_UNQUOTE(JSON_EXTRACT(d.plan,'$.snapshot.invoiceId'))=? ORDER BY d.id`,[...scopeArgs(c),period,id])).rows;
 if(!rows.length)throw fail('VAT_PACKAGE_DEDUCTION','Original invoice deduction is unavailable.');
 const rates=[...new Set(rows.map(d=>d.plan.snapshot.exchangeRate))];if(rates.length!==1)throw fail('VAT_PACKAGE_FX','One invoice has different deduction exchange rates; reconcile its document basis before packaging.');
 const facts=await invoiceFacts(tx,c,id,rates[0],cache);return {data:{...facts.data,deductedVat:sum(rows.map(d=>d.deductedVat)),deductionPeriod:period.replace('-','')},snapshot:{...facts.snapshot,deductions:rows.map(d=>({id:d.id,contextHash:d.contextHash,deductedVat:d.deductedVat}))}};
}
function exactKeys(actual,expected,message){if(actual.length!==expected.length||actual.some(x=>!expected.includes(x)))throw fail('VAT_PACKAGE_COMPLETENESS',message);}
export async function packagePlan(tx,c,input,exclude=''){
 const source=await sourceContext(tx,c,input.refundIds),cache=new Map(),rows=[],add=(kind,period,key,data,snapshot)=>rows.push({listKind:kind,period,sourceKey:fingerprint(key),data,snapshot});
 for(const r of source.refunds)if((await tx.query(`SELECT p.id FROM vat_claim_package_requests l JOIN vat_claim_packages p ON p.id=l.package_id WHERE l.refund_id=? AND p.id<>? AND p.status IN ${active}`,[r.id,exclude])).rows.length)throw fail('VAT_ALREADY_PACKAGED','An original refund request already belongs to a pending or approved package.');
 exactKeys(input.customs.map(x=>x.declarationId),source.declarations.map(x=>x.declarationId),'Supply the reviewed customs facts for every declaration in these export months.');
 exactKeys(input.units.map(x=>x.sourceUnit),source.units,'Supply the reviewed customs unit mapping for every source unit.');
 exactKeys(input.otherDeductions.map(x=>x.reconciliationId),source.reconciliations.map(x=>x.id),'Review the other-deduction breakdown for every return.');
 if(input.additionalInputs.some(x=>!source.reconciliations.some(r=>r.id===x.reconciliationId)))throw notFound();
 const deductionCache=new Map(),getDocument=async(id,period)=>{const key=id+':'+period;if(!deductionCache.has(key))deductionCache.set(key,await deductionInvoice(tx,c,id,period,cache));return deductionCache.get(key);};
 for(const r of source.reconciliations){
  const docs=new Map();for(const line of r.plan.lines){const original=line.snapshot.plan.snapshot,key=original.invoiceId;if(!docs.has(key))docs.set(key,await getDocument(key,r.period));}
  const registered=rounded(sum([...docs.values()].map(x=>x.data.deductedVat)));if(registered!==rounded(r.registeredVat))throw fail('VAT_PACKAGE_INPUT_TOTAL','Original invoice deductions differ from the reconciled month.');
  const nonDocument=input.otherDeductions.find(x=>x.reconciliationId===r.id),extra=input.additionalInputs.filter(x=>x.reconciliationId===r.id),seen=new Set([...docs.values()].map(x=>docKey(x.data)));
  if(sum([nonDocument.nonDocumentVat,rounded(sum(extra.map(x=>x.deductedVat)))])!==r.otherDeductions)throw fail('VAT_PACKAGE_OTHER_INPUT','Supplementary document VAT plus evidenced non-document adjustments must equal other deductions on KDV1.');
  for(const [id,doc]of docs)add('INPUT',r.period,id,doc.data,doc.snapshot);
  for(const x of extra){const key=docKey(x);if(seen.has(key))throw fail('VAT_PACKAGE_DUPLICATE_INPUT','An input invoice cannot appear twice in the same period.');seen.add(key);if(x.invoiceDate.slice(0,7)>r.period||Number(r.period.slice(0,4))>Number(x.invoiceDate.slice(0,4))+1||x.inputType==='IMPORT'&&!x.importNumber)throw fail('VAT_PACKAGE_EXTRA_INPUT','Supplementary inputs need valid dates and import-document evidence where applicable.');const {reconciliationId,evidence,...data}=x;add('INPUT',r.period,key,{...data,deductionPeriod:r.period.replace('-','')},{supplementary:true,reconciliationId,evidence});}
 }
 const loaded=new Map();
 for(const request of source.refunds){
  const claimLines=(await tx.query(`SELECT l.id,l.deduction_id AS deductionId,l.claimed_vat AS claimedVat,l.snapshot,d.plan AS deductionPlan,d.period AS deductionPeriod,d.context_hash AS deductionHash FROM vat_refund_lines l JOIN vat_deductions d ON d.id=l.deduction_id WHERE ${own('l')} AND l.refund_id=? ORDER BY l.line_number`,[...scopeArgs(c),request.id])).rows;
  for(const l of claimLines){const original=l.deductionPlan.snapshot,category=l.snapshot.category,loadType=['GOODS','DIRECT_CHARGE'].includes(category)?'1':category==='OVERHEAD'?'2':'3',key=[request.period,original.invoiceId,l.deductionPeriod,loadType].join(':'),doc=await getDocument(original.invoiceId,l.deductionPeriod);let group=loaded.get(key);if(!group){group={period:request.period,data:{...doc.data,loadedVat:zero,transactionCode:'301',loadType},snapshot:{...doc.snapshot,claimLines:[]}};loaded.set(key,group);}group.data.loadedVat=sum([group.data.loadedVat,l.claimedVat]);group.snapshot.claimLines.push({id:l.id,refundId:request.id,refundHash:request.contextHash,deductionId:l.deductionId,deductionHash:l.deductionHash,claimedVat:l.claimedVat,source:l.snapshot});}
 }
 for(const [key,g]of loaded)add('LOADED',g.period,key,g.data,g.snapshot);
 const saleGroups=new Map(),customs=new Map(input.customs.map(x=>[x.declarationId,x])),units=new Map(input.units.map(x=>[x.sourceUnit,x]));
 for(const x of source.exits){const declaration=customs.get(x.declarationId),unit=units.get(x.unitCode),key=[x.period,x.declarationId,x.invoiceId,x.gtip,unit.customsUnit].join(':');let group=saleGroups.get(key);if(!group){group={period:x.period,data:{registrationNumber:declaration.registrationNumber,gtip:x.gtip,quantity:zero,unitCode:unit.customsUnit,invoiceDate:x.invoiceDate,series:'',number:x.invoiceNumber,buyerName:x.invoiceHeader.customer.name,documentType:declaration.documentType},snapshot:{declarationId:x.declarationId,declarationReference:x.declarationReference,declarationHash:x.declarationHash,invoiceId:x.invoiceId,invoiceHash:x.invoiceHash,unitEvidence:unit,exits:[]}};saleGroups.set(key,group);}group.data.quantity=sum([group.data.quantity,x.quantity]);group.snapshot.exits.push({id:x.id,quantity:x.quantity,date:x.exitDate,hash:x.exitHash,invoiceLineId:x.invoiceLineId,transactionType:x.transactionType});}
 for(const [key,g]of saleGroups)add('SALES',g.period,key,g.data,g.snapshot);
 for(const r of source.reconciliations){const ids=[...new Set(source.exits.filter(x=>x.period===r.period).map(x=>x.declarationId))].sort();if(!ids.length)throw fail('VAT_PACKAGE_EXPORTS','The export month has no accepted standard goods-export evidence.');for(const id of ids){const x=customs.get(id),{declarationId,evidence,...data}=x;add('CUSTOMS',r.period,id,data,{declarationId,reference:source.declarations.find(d=>d.declarationId===id).reference,evidence});}}
 rows.sort((a,b)=>[a.period,a.listKind,a.sourceKey].join(':').localeCompare([b.period,b.listKind,b.sourceKey].join(':')));
 const requestedVat=sum(source.refunds.map(x=>x.requestedVat));if(sum(rows.filter(x=>x.listKind==='LOADED').map(x=>x.data.loadedVat))!==requestedVat)throw fail('VAT_PACKAGE_LOADED_TOTAL','Loaded VAT must equal the packaged original requests exactly.');
 return {baseCurrency:'TRY',periodFrom:source.reconciliations[0].period,periodTo:source.reconciliations.at(-1).period,requestedVat,formatVersion:'TR-301-REVIEW-2026-10-28',processingStatus:less(requestedVat,'10000.000000')?'WAITING_AGGREGATION':'DOCUMENT_REVIEW_REQUIRED',formatNote:'Accountant review workbook and exact-source CSV/JSON. Verify and map to the current GİB template before external upload.',returns:source.reconciliations.map(r=>({id:r.id,period:r.period,contextHash:r.contextHash,filingReference:r.input.filingReference,declaredExportRefund:r.exportRefundVat,otherRefundVat:r.otherRefundVat,registeredVat:r.registeredVat,otherDeductions:r.otherDeductions,nonDocument:input.otherDeductions.find(x=>x.reconciliationId===r.id),returnEvidence:r.input.returnEvidence})),requests:source.refunds.map(r=>({refundId:r.id,requestedVat:r.requestedVat,snapshot:{reference:r.reference,period:r.period,method:r.method,assurance:r.assurance,contextHash:r.contextHash,reconciliationId:r.reconciliationId,plan:r.plan}})),rows};
}
export async function trackingPlan(tx,c,input,exclude=''){
 const p=await read(tx,c,'package',input.packageId);if(p.status!=='APPROVED')throw fail('VAT_PACKAGE_NOT_APPROVED','Tracking requires an independently approved package.');
 const state=await trackingState(tx,c,p.id),events=state.events.filter(x=>x.id!==exclude),date=today();
 if(input.eventDate>date||input.eventDate<p.reviewedAt.slice(0,10)&&input.kind==='SUBMISSION')throw fail('VAT_EVENT_DATE','Record actual events no later than today; filing cannot precede package approval.');
 if((await tx.query(`SELECT id FROM vat_claim_actions WHERE tenant_id=? AND legal_entity_id=? AND external_reference=? AND id<>? AND status IN ('REQUESTED','APPROVED')`,[...scopeArgs(c),input.externalReference,exclude])).rows.length)throw fail('VAT_EXTERNAL_DUPLICATE','This external event reference is already reserved or recorded.');
 if(['SUBMISSION','WITHDRAWAL'].includes(input.kind)&&events.some(a=>a.kind===input.kind))throw fail('VAT_TRACKING_DUPLICATE','This package already has that pending or accepted external event.');
 if(input.kind!=='SUBMISSION'&&(!state.submission||input.eventDate<state.submission.eventDate))throw fail('VAT_SUBMISSION_REQUIRED','Record and independently approve actual filing before payments or withdrawal.');
 if(input.kind!=='WITHDRAWAL'&&events.some(a=>a.kind==='WITHDRAWAL'))throw fail('VAT_WITHDRAWAL_PENDING','Withdrawal prevents further external events for this package.');
 let source=null;
 if(input.kind==='SUBMISSION'){
  if(input.amount!==zero||input.externalAggregationVat!==zero)throw fail('VAT_EVENT_AMOUNT','Submission records evidence, not a payment.');
  exactKeys(input.periods.map(x=>x.reconciliationId),p.plan.returns.map(x=>x.id),'Record the petition and list receipt for every packaged period.');
  const receiptKeys=new Set();for(const filed of input.periods){const r=p.plan.returns.find(x=>x.id===filed.reconciliationId);if(filed.filingDate.slice(0,7)<=r.period||filed.filingDate>date||filed.filingDate>deadline(r.period)||filed.filingDate>input.eventDate||filed.filingDate<p.reviewedAt.slice(0,10))throw fail('VAT_FILING_DATE','Every actual filing must follow its return month, meet its deadline and precede this recorded event.');const key=filed.petitionReference+'|'+filed.listReceiptReference;if(receiptKeys.has(key))throw fail('VAT_FILING_RECEIPT','Keep distinct filing/list receipts for each period.');receiptKeys.add(key);}
  // Cash limits remain period based; bundling does not reset them.
  for(const member of p.plan.requests){const r=await readRefund(tx,c,'refund',member.refundId),returnRow=await readRefund(tx,c,'reconciliation',r.reconciliationId),all=(await tx.query(`SELECT requested_vat AS amount,method FROM vat_refund_requests WHERE reconciliation_id=? AND status IN ${active}`,[r.reconciliationId])).rows;const basis=await readCost(tx,c,'basis',returnRow.basisId),periodClaims=sum([returnRow.externalClaimedVat,...all.map(x=>x.amount)]);if(less(basis.ordinaryCeiling,periodClaims)&&r.assurance!=='TAX_REVIEW')throw fail('VAT_TAX_REVIEW_REQUIRED','Current period claims exceed the ordinary ceiling; revise the reviewed procedure before filing.');const cash=sum([returnRow.externalCashVat,...all.filter(x=>x.method==='CASH').map(x=>x.amount)]);if(r.method==='CASH'&&less('50000.000000',cash)&&r.assurance==='NONE')throw fail('VAT_CASH_ASSURANCE','The current aggregate cash requests require a revised reviewed procedure before filing.');}
 }else if(input.kind==='WITHDRAWAL'){
  if(input.amount!==zero||input.externalAggregationVat!==zero||events.some(a=>a.status==='REQUESTED')||events.some(a=>['CASH','OFFSET'].includes(a.kind)&&a.status==='APPROVED'&&!events.some(x=>x.kind==='REVERSAL'&&x.status==='APPROVED'&&x.reversesId===a.id)))throw fail('VAT_SETTLEMENT_DEPENDENCY','Resolve pending events and reverse received/offset amounts before recording accepted withdrawal.');
 }else{
  const membership=(await members(tx,c,p.id)).find(m=>m.refundId===input.refundId);if(!membership)throw notFound();
  if(input.kind==='REVERSAL'){
   if(input.externalAggregationVat!==zero||input.amount===zero)throw fail('VAT_EVENT_AMOUNT','An exact reversal has a positive original amount and no new aggregation.');
   source=events.find(a=>a.id===input.reversesId);if(!source||source.status!=='APPROVED'||!['CASH','OFFSET'].includes(source.kind)||source.refundId!==input.refundId||source.amount!==input.amount||source.eventDate>input.eventDate||events.some(a=>a.kind==='REVERSAL'&&a.reversesId===source.id))throw fail('VAT_SETTLEMENT_REVERSAL','Reverse one exact approved settlement once, retaining its original request and amount.');
  }else{
   if(membership.snapshot.method!==input.kind||input.amount===zero)throw fail('VAT_SETTLEMENT_METHOD','Use the original request method and a positive settlement amount.');
   const used=events.filter(a=>a.refundId===input.refundId&&['CASH','OFFSET'].includes(a.kind)&&!events.some(x=>x.kind==='REVERSAL'&&x.status==='APPROVED'&&x.reversesId===a.id));
   if(less(membership.requestedVat,sum([input.amount,...used.map(a=>a.amount)])))throw fail('VAT_SETTLEMENT_EXCEEDED','Pending and received payments already consume the available request balance.');
   if(less(sum([p.requestedVat,input.externalAggregationVat]),'10000.000000'))throw fail('VAT_PROCESSING_THRESHOLD','A smaller package needs evidenced external aggregation before recording an executed payment or offset.');
  }
 }
 return {baseCurrency:'TRY',packageId:p.id,packageHash:p.contextHash,kind:input.kind,refundId:input.refundId,reversesId:input.reversesId,eventDate:input.eventDate,externalReference:input.externalReference,amount:input.amount,sourceHash:source?.contextHash??null,periods:input.periods};
}
export async function dependencies(tx,c,kind,item){
 if(kind==='tracking')return;
 const state=await trackingState(tx,c,item.id);if(state.events.some(x=>x.status==='REQUESTED')||state.submission&&!state.withdrawal)throw fail('VAT_PACKAGE_FILED','Resolve pending tracking and independently record accepted external withdrawal before releasing this package.');
}
