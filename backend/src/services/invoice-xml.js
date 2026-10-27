import sax from 'sax';
import Decimal from 'decimal.js';
import {createHash} from 'node:crypto';
import {AppError} from '../shared/AppError.js';
import {amount,sumAmounts} from '../shared/money.js';
import {date,currency} from '../validators/accounting.validators.js';

const D=Decimal.clone({precision:50,rounding:Decimal.ROUND_HALF_UP});
const NS={invoice:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',cbc:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',cac:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'};
const invalid=message=>new AppError(422,'INVALID_INVOICE_XML',message);
const all=(node,name,namespace='cac')=>(node?.children??[]).filter(n=>n.uri===NS[namespace]&&n.name===name);
function one(node,name,namespace='cbc',required=true){const found=all(node,name,namespace);if(found.length>1||required&&!found.length)throw invalid(`Expected one ${name} element.`);return found[0]??null;}
function value(node,max=1000,required=true,trim=true){if(!node){if(required)throw invalid('Required invoice value is missing.');return '';}
  if(node.children.length)throw invalid('A scalar invoice value cannot contain elements.');const result=trim?node.text.trim():node.text;
  if(result.length>max||required&&!result.trim())throw invalid('An invoice value is missing or exceeds its supported length.');return result;
}
const field=(node,name,max=1000,required=true,trim=true)=>value(one(node,name,'cbc',required),max,required,trim);
const optional=(node,name,max=1000)=>field(node,name,max,false);
function money(node,name,documentCurrency,required=true){const n=one(node,name,'cbc',required);if(!n)return '0.000000';if(n.attributes.currencyID!==documentCurrency)throw invalid('Every monetary amount must use the document currency.');return amount(value(n,40));}
function price(node,documentCurrency){const n=one(node,'PriceAmount');if(n.attributes.currencyID!==documentCurrency)throw invalid('Price currency must match the invoice.');const raw=value(n,40);if(!/^(0|[1-9]\d{0,13})(\.\d{1,18})?$/.test(raw))throw invalid('Source prices must be nonnegative decimal strings with up to 18 fractional digits.');const decimal=new D(raw);return decimal.toFixed(Math.max(6,decimal.decimalPlaces()));}
function tree(xml){
  if(typeof xml!=='string'||!xml.trim()||Buffer.byteLength(xml,'utf8')>750000)throw invalid('Choose one UTF-8 Invoice XML file up to 750,000 bytes.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/u.test(xml))throw invalid('XML contains unsupported characters.');
  const parser=sax.parser(true,{xmlns:true,strictEntities:true,trim:false,normalize:false}),stack=[];let root=null,nodes=0;
  parser.onerror=()=>{throw invalid('Malformed XML. Check the original exported file.');};
  parser.ondoctype=parser.onsgmldeclaration=()=>{throw invalid('DTD and entity declarations are not supported.');};
  parser.onprocessinginstruction=instruction=>{if(instruction.name.toLowerCase()==='xml'){
    if(!/\bversion\s*=\s*['"]1\.0['"]/.test(instruction.body)||/\bencoding\s*=\s*['"](?!utf-8['"])/i.test(instruction.body))throw invalid('Only XML 1.0 with UTF-8 encoding is supported.');
  }};
  parser.onopentag=node=>{
    if(stack.length>=64||++nodes>100000)throw invalid('XML exceeds the supported structural resource budget.');
    const attributes=Object.fromEntries(Object.values(node.attributes).filter(a=>!a.uri).map(a=>[a.local,a.value]));
    const item={name:node.local,uri:node.uri,attributes,text:'',children:[]};
    if(stack.length)stack.at(-1).children.push(item);else {if(root)throw invalid('Choose a single Invoice XML document.');root=item;}stack.push(item);
  };
  const text=content=>{if(stack.length)stack.at(-1).text+=content;else if(content.trim())throw invalid('Unexpected content outside the invoice.');};
  parser.ontext=text;parser.oncdata=text;parser.onclosetag=()=>stack.pop();parser.write(xml).close();
  if(root?.uri!==NS.invoice||root.name!=='Invoice')throw invalid('Choose a UBL Invoice document, without a ZIP, SOAP or envelope wrapper.');
  return root;
}
function party(root,role){
  const holder=one(root,role,'cac'),p=one(holder,'Party','cac');
  const identities=all(p,'PartyIdentification').map(n=>one(n,'ID')).filter(n=>['VKN','TCKN'].includes(n.attributes.schemeID));
  if(identities.length!==1)throw invalid('Supplier and customer each require one VKN or TCKN identity.');
  const taxScheme=identities[0].attributes.schemeID,taxId=value(identities[0],11);
  if(!(taxScheme==='VKN'?/^\d{10}$/:/^\d{11}$/).test(taxId))throw invalid('VKN/TCKN identity length is invalid.');
  const name=optional(one(p,'PartyName','cac',false),'Name',160)||optional(one(p,'PartyLegalEntity','cac',false),'RegistrationName',160);
  return {taxScheme,taxId,name};
}
function taxes(node,documentCurrency,addIssue,lineKey){
  const totals=all(node,'TaxTotal');
  if(totals.length!==1){addIssue('VAT_STRUCTURE','Exactly one tax total is required for this import contract.',lineKey);return {taxAmount:'0.000000',subtotals:[]};}
  const total=totals[0],taxAmount=money(total,'TaxAmount',documentCurrency);
  if(money(total,'RoundingAmount',documentCurrency,false)!=='0.000000')addIssue('TAX_ROUNDING','Nonzero explicit tax rounding needs a later adapter.',lineKey);
  const subtotals=all(total,'TaxSubtotal').map(sub=>{
    const category=one(sub,'TaxCategory','cac'),scheme=one(category,'TaxScheme','cac');
    return {taxableAmount:money(sub,'TaxableAmount',documentCurrency),taxAmount:money(sub,'TaxAmount',documentCurrency),
      percent:amount(field(sub,'Percent',40)),taxCode:field(scheme,'TaxTypeCode',20),exemptionCode:optional(category,'TaxExemptionReasonCode',40),exemptionReason:optional(category,'TaxExemptionReason',1000)};
  });
  if(!subtotals.length||sumAmounts(subtotals.map(s=>s.taxAmount))!==taxAmount)addIssue('TAX_SUBTOTAL_SUM','Tax subtotals must sum to their tax total.',lineKey);
  for(const sub of subtotals){
    if(sub.taxCode!=='0015'||new D(sub.percent).gt(100))addIssue('UNSUPPORTED_TAX','Only explicit 0015 VAT at a numeric rate from 0 to 100 is supported.',lineKey);
    const expected=amount(new D(sub.taxableAmount).times(sub.percent).div(100).toFixed(2));
    if(lineKey!==null&&expected!==sub.taxAmount)addIssue('VAT_ARITHMETIC','VAT differs from taxable amount × rate, rounded half up to two places.',lineKey);
    if(sub.percent==='0.000000'&&(!sub.exemptionCode||!sub.exemptionReason))addIssue('VAT_EXEMPTION','Zero-rate VAT requires the original exemption code and reason.',lineKey);
  }
  return {taxAmount,subtotals};
}
export function parseInvoice(xml){
  const root=tree(xml),issues=[],addIssue=(code,message,lineKey=null)=>issues.push({code,message,lineKey});
  const uuid=field(root,'UUID',36).toLowerCase();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid))throw invalid('A valid invoice UUID is required.');
  const invoiceNumber=field(root,'ID',64),issueDate=date(field(root,'IssueDate',10)),documentCurrency=currency(field(root,'DocumentCurrencyCode',3));
  const profile=field(root,'ProfileID',40),invoiceType=field(root,'InvoiceTypeCode',40),customization=field(root,'CustomizationID',40);
  if(field(root,'UBLVersionID',10)!=='2.1'||customization!=='TR1.2')addIssue('UNSUPPORTED_VERSION','This import contract supports UBL 2.1 / TR1.2.');
  if(!['TEMELFATURA','TICARIFATURA','EARSIVFATURA'].includes(profile)||!['SATIS','ISTISNA'].includes(invoiceType))addIssue('UNSUPPORTED_INVOICE_TYPE','This stage supports basic/commercial/e-Archive SATIS or ISTISNA purchase invoices.');
  const copy=optional(root,'CopyIndicator',5);if(copy&&copy!=='false'&&copy!=='0')addIssue('COPY_INVOICE','A copy-marked invoice cannot be released for matching.');
  for(const name of ['AllowanceCharge','WithholdingTaxTotal'])if(all(root,name).some(n=>n.children.length||n.text.trim()))addIssue('UNSUPPORTED_ADJUSTMENT',`${name} is retained in XML and requires an additional import adapter.`);
  for(const name of ['TaxExchangeRate','PricingExchangeRate','PaymentExchangeRate','PaymentAlternativeExchangeRate'])for(const exchange of all(root,name)){
    if(!exchange.children.length&&!exchange.text.trim())continue;
    if(optional(exchange,'SourceCurrencyCode',3)!==documentCurrency||optional(exchange,'TargetCurrencyCode',3)!==documentCurrency||optional(exchange,'CalculationRate',40)===''||amount(field(exchange,'CalculationRate',40))!=='1.000000')addIssue('UNSUPPORTED_EXCHANGE',`${name} requires a currency-conversion adapter.`);
  }
  const supplier=party(root,'AccountingSupplierParty'),customer=party(root,'AccountingCustomerParty'),keys=new Set();
  const lines=all(root,'InvoiceLine').map((node,index)=>{
    const lineKey=field(node,'ID',64);if(keys.has(lineKey))throw invalid('Invoice source line IDs must be unique.');keys.add(lineKey);
    const qtyNode=one(node,'InvoicedQuantity'),quantity=amount(value(qtyNode,40)),unitCode=qtyNode.attributes.unitCode;
    if(quantity==='0.000000'||!unitCode||unitCode.length>16)throw invalid('Each line needs a positive quantity and source unit code.');
    const item=one(node,'Item','cac'),seller=one(item,'SellersItemIdentification','cac',false);
    const supplierCode=value(one(seller,'ID','cbc',false),120,false,false),description=field(item,'Name',1000,true,false);
    const priceNode=one(node,'Price','cac'),unitPrice=price(priceNode,documentCurrency),base=one(priceNode,'BaseQuantity','cbc',false);
    if(new D(unitPrice).decimalPlaces()>6)addIssue('SOURCE_PRICE_PRECISION','Source price has more than six meaningful fractional digits; a pricing adapter is required before matching.',lineKey);
    const priceBaseQuantity=base?amount(value(base,40)):'1.000000';if(priceBaseQuantity==='0.000000')throw invalid('Price base quantity must be positive.');
    if(base&&base.attributes.unitCode&&base.attributes.unitCode!==unitCode)addIssue('PRICE_BASE_UNIT','Price base and invoiced units must match.',lineKey);
    for(const holder of [node,priceNode]){
      for(const adjustment of all(holder,'AllowanceCharge')){
        if(money(adjustment,'Amount',documentCurrency)!=='0.000000')addIssue('UNSUPPORTED_ADJUSTMENT','Nonzero line discounts/charges require an additional pricing adapter.',lineKey);
      }
      if(all(holder,'WithholdingTaxTotal').some(n=>n.children.length||n.text.trim()))addIssue('UNSUPPORTED_ADJUSTMENT','Line withholding requires an additional tax adapter.',lineKey);
    }
    const netAmount=money(node,'LineExtensionAmount',documentCurrency),amountScale=(value(one(node,'LineExtensionAmount'),40).split('.')[1]??'').length,expected=amount(new D(quantity).times(unitPrice).div(priceBaseQuantity).toFixed(amountScale));
    if(netAmount!==expected)addIssue('LINE_NET_ARITHMETIC','Net differs from quantity × price / base quantity.',lineKey);
    const tax=taxes(node,documentCurrency,addIssue,lineKey);
    if(tax.subtotals.length!==1)addIssue('LINE_VAT_STRUCTURE','One VAT treatment per source line is required; split treatments need a later adapter.',lineKey);
    for(const t of tax.subtotals)if(t.taxableAmount!==netAmount)addIssue('VAT_BASE','Line VAT base differs from its net amount.',lineKey);
    return {lineNumber:index+1,lineKey,supplierCode,description,quantity,unitCode,unitPrice,priceBaseQuantity,amountScale,netAmount,vatAmount:tax.taxAmount,taxes:tax.subtotals,source:node};
  });
  if(!lines.length)throw invalid('Invoice has no source lines.');
  const count=optional(root,'LineCountNumeric',12);if(count&&count!==String(lines.length))addIssue('LINE_COUNT','Declared line count differs from retained source lines.');
  const tax=taxes(root,documentCurrency,addIssue,null),totals=one(root,'LegalMonetaryTotal','cac');
  const lineExtensionTotal=money(totals,'LineExtensionAmount',documentCurrency),netTotal=money(totals,'TaxExclusiveAmount',documentCurrency),grossTotal=money(totals,'TaxInclusiveAmount',documentCurrency),payableTotal=money(totals,'PayableAmount',documentCurrency);
  for(const name of ['AllowanceTotalAmount','ChargeTotalAmount','PrepaidAmount','PayableRoundingAmount'])if(money(totals,name,documentCurrency,false)!=='0.000000')addIssue('UNSUPPORTED_TOTAL_ADJUSTMENT',`${name} must be zero in this import contract.`);
  if(sumAmounts(lines.map(l=>l.netAmount))!==lineExtensionTotal||lineExtensionTotal!==netTotal)addIssue('NET_TOTAL','Declared line extension, line amounts and tax-exclusive total differ; review document discounts/charges.');
  if(sumAmounts(lines.map(l=>l.vatAmount))!==tax.taxAmount)addIssue('VAT_TOTAL','Line VAT totals do not reconcile to document VAT.');
  if(sumAmounts([netTotal,tax.taxAmount])!==grossTotal||grossTotal!==payableTotal)addIssue('PAYABLE_TOTAL','Net plus VAT must equal gross and payable without unhandled adjustments.');
  const group=entries=>{const groups=new Map();for(const t of entries){const key=JSON.stringify([t.taxCode,t.percent,t.exemptionCode]);const g=groups.get(key)??{base:[],tax:[]};g.base.push(t.taxableAmount);g.tax.push(t.taxAmount);groups.set(key,g);}return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,g])=>[key,sumAmounts(g.base),sumAmounts(g.tax)]);};
  if(JSON.stringify(group(lines.flatMap(l=>l.taxes)))!==JSON.stringify(group(tax.subtotals)))addIssue('VAT_GROUPS','Document VAT groups differ from the retained line treatments.');
  const orderReferences=all(root,'OrderReference').map(n=>field(n,'ID',64));
  return {contractVersion:'UBLTR-STAGING-1',uuid,invoiceNumber,issueDate,currency:documentCurrency,profile,invoiceType,supplier,customer,lineExtensionTotal,netTotal,vatTotal:tax.taxAmount,grossTotal,payableTotal,orderReferences,issues,lines,
    sha256:createHash('sha256').update(xml,'utf8').digest('hex')};
}

export const normalizedUnitPrice=line=>amount(new D(line.unitPrice).div(line.priceBaseQuantity).toFixed(6));

// A narrow, explicit commercial adapter. Source XML and its original validation
// issues remain immutable. Only an approved resolution may accept this variant.
export function discountEvidence(xml){
  const root=tree(xml),parsed=parseInvoice(xml),total=one(root,'LegalMonetaryTotal','cac');
  const allowances=all(root,'AllowanceCharge');
  const declared=money(total,'AllowanceTotalAmount',parsed.currency,false);
  const lines=parsed.lines.map(l=>({...l,beforeDiscount:amount(new D(l.quantity).times(l.unitPrice).div(l.priceBaseQuantity).toFixed(l.amountScale))}));
  const discounts=lines.map(l=>({lineKey:l.lineKey,beforeDiscount:l.beforeDiscount,netAmount:l.netAmount,discount:new D(l.beforeDiscount).minus(l.netAmount).toFixed(6)}));
  const supported=allowances.length>0&&allowances.every(n=>['false','0'].includes(field(n,'ChargeIndicator',5)))
    &&sumAmounts(allowances.map(n=>money(n,'Amount',parsed.currency)))===declared
    &&new D(declared).gt(0)&&discounts.every(l=>new D(l.discount).gte(0))
    &&sumAmounts(discounts.map(l=>l.discount))===declared
    &&sumAmounts(lines.map(l=>l.beforeDiscount))===parsed.lineExtensionTotal
    &&sumAmounts(lines.map(l=>l.netAmount))===parsed.netTotal
    &&!all(root,'InvoiceLine').some(n=>[n,one(n,'Price','cac')].some(h=>all(h,'AllowanceCharge').some(a=>money(a,'Amount',parsed.currency)!=='0.000000')))
    &&money(total,'ChargeTotalAmount',parsed.currency,false)==='0.000000';
  return {supported,declaredDiscount:declared,lines:discounts,allowances:allowances.map(n=>({amount:money(n,'Amount',parsed.currency),baseAmount:optional(n,'BaseAmount',40),factor:optional(n,'MultiplierFactorNumeric',40),reason:optional(n,'AllowanceChargeReason',1000)}))};
}
