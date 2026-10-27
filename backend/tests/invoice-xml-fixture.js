import {randomUUID} from 'node:crypto';
import {amount,sumAmounts,multiplyAmounts} from '../src/shared/money.js';
import Decimal from 'decimal.js';
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function invoiceXml(options={}){
  const uuid=options.uuid??randomUUID(),number=options.number??'SYN'+uuid.replaceAll('-','').slice(0,13),currency=options.currency??'TRY';
  const lines=(options.lines??[{code:'SUP-A4',name:' Supplier A4 ',quantity:'2',price:'100',rate:'10'},{code:'SUP-A3',name:'Supplier A3',quantity:'3',price:'200',rate:'20'}]).map((l,i)=>{
    const net=multiplyAmounts(l.quantity,l.price),vat=amount(new Decimal(net).times(l.rate??'20').div(100).toFixed(2));return {...l,key:l.key??String(i+1),net,vat,rate:amount(l.rate??'20')};
  });
  const money=(tag,n)=>`<cbc:${tag} currencyID="${currency}">${n}</cbc:${tag}>`;
  const taxSubtotal=(base,tax,rate)=>`<cac:TaxSubtotal>${money('TaxableAmount',base)}${money('TaxAmount',tax)}<cbc:Percent>${rate}</cbc:Percent><cac:TaxCategory>${rate==='0.000000'?'<cbc:TaxExemptionReasonCode>351</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Synthetic exemption</cbc:TaxExemptionReason>':''}<cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`;
  const groups=new Map();for(const l of lines){const list=groups.get(l.rate)??[];list.push(l);groups.set(l.rate,list);}
  const net=sumAmounts(lines.map(l=>l.net)),vat=sumAmounts(lines.map(l=>l.vat)),gross=sumAmounts([net,vat]);
  const party=(role,taxId,name)=>`<cac:${role}><cac:Party><cac:PartyIdentification><cbc:ID schemeID="VKN">${taxId}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${name}</cbc:Name></cac:PartyName></cac:Party></cac:${role}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>TR1.2</cbc:CustomizationID><cbc:ProfileID>${options.profile??'EARSIVFATURA'}</cbc:ProfileID><cbc:ID>${number}</cbc:ID><cbc:CopyIndicator>false</cbc:CopyIndicator><cbc:UUID>${uuid}</cbc:UUID><cbc:IssueDate>${options.date??'2026-10-27'}</cbc:IssueDate><cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>
${options.orderReference?`<cac:OrderReference><cbc:ID>${esc(options.orderReference)}</cbc:ID></cac:OrderReference>`:''}
${party('AccountingSupplierParty',options.supplierTax??'1111111111','Synthetic supplier')}${party('AccountingCustomerParty',options.receiverTax??'2222222222','Synthetic receiver')}
<cac:PricingExchangeRate><cbc:SourceCurrencyCode>${currency}</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>${currency}</cbc:TargetCurrencyCode><cbc:CalculationRate>1.0000</cbc:CalculationRate></cac:PricingExchangeRate>
<cac:TaxTotal>${money('TaxAmount',vat)}${[...groups].map(([rate,list])=>taxSubtotal(sumAmounts(list.map(l=>l.net)),sumAmounts(list.map(l=>l.vat)),rate)).join('')}</cac:TaxTotal>
<cac:LegalMonetaryTotal>${money('LineExtensionAmount',net)}${money('TaxExclusiveAmount',net)}${money('TaxInclusiveAmount',gross)}${money('PayableAmount',gross)}</cac:LegalMonetaryTotal>
${lines.map(l=>`<cac:InvoiceLine><cbc:ID>${esc(l.key)}</cbc:ID><cbc:InvoicedQuantity unitCode="${l.unit??'C62'}">${l.quantity}</cbc:InvoicedQuantity>${money('LineExtensionAmount',l.net)}<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>${money('Amount','0.00')}${money('BaseAmount',l.net)}</cac:AllowanceCharge><cac:TaxTotal>${money('TaxAmount',l.vat)}${taxSubtotal(l.net,l.vat,l.rate)}</cac:TaxTotal><cac:Item><cbc:Name>${esc(l.name)}</cbc:Name><cac:SellersItemIdentification><cbc:ID>${esc(l.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price>${money('PriceAmount',l.price)}</cac:Price></cac:InvoiceLine>`).join('\n')}
</Invoice>`;
}
