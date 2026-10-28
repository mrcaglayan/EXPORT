import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Field,Feedback,inputStyle} from '@/pages/accounting/accounting-ui'
import {useAccountingMutation} from '@/pages/accounting/useAccounting'
import {useProducts} from '@/pages/products/useProducts'
import {ProductFormShell as Form,ProductLoadState as LoadState,ProductPager as Pager} from '@/pages/products/product-ui'
import {RecordSelect} from '@/pages/exports/compliance-ui'
import {ClaimSummary} from './vat-claim-ui'
const noop=()=>{}
const titles={SUBMISSION:'Filing receipts',WITHDRAWAL:'Accepted withdrawal',CASH:'Cash received',OFFSET:'Offset applied',REVERSAL:'Reverse a recorded settlement'}
const basePackage={refundIds:[],customs:[],units:[],otherDeductions:[],additionalInputs:[],formatEvidence:'',legalEvidence:'',completenessConfirmed:false}
const baseTracking={packageId:null,kind:'SUBMISSION',refundId:null,reversesId:null,eventDate:'',externalReference:'',amount:'0',counterparty:'',processingEvidence:'',externalAggregationVat:'0',periods:[],externalConfirmed:false}
export default function VatClaimForm({base,view,kind,revision,onSaved,onCreated,onCancel}){
 const [form,setForm]=useState({reference:'',reason:'',evidence:'',...(kind==='package'?basePackage:baseTracking)}),[selection,setSelection]=useState(null),[chosen,setChosen]=useState([]),[sources,setSources]=useState(null),[preview,setPreview]=useState(null)
 const action=useAccountingMutation(base,onSaved),check=useAccountingMutation(base,noop),detail=useProducts(base,`claim-packages/${form.packageId}`,{},revision,kind==='tracking'&&Boolean(form.packageId)),p=detail.data?.item
 const update=(key,value)=>setForm(f=>({...f,[key]:value})),body=kind==='package'?{...form,refundIds:chosen.map(r=>r.id).sort()}:form,signature=JSON.stringify(body),valid=preview?.signature===signature&&preview.revision===revision,busy=action.busy||check.busy
 const field=(key,label,type='text',required=true)=> <Field key={key} label={label} type={type} required={required} maxLength={key==='reference'?64:key==='externalReference'?128:255} value={form[key]} onChange={e=>update(key,e.target.value)}/>
 const checkbox=(key,label)=><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>
 async function loadSources(){const result=await check.submit('claim-packages/sources',{refundIds:chosen.map(x=>x.id)},'');if(result){setSources({data:result,ids:chosen.map(x=>x.id).sort().join(','),revision});setForm(f=>({...f,customs:result.declarations.map(d=>({declarationId:d.declarationId,registrationNumber:'',currency:d.currency,totalInvoiceAmount:'',documentType:'GCB',evidence:''})),units:result.units.map(sourceUnit=>({sourceUnit,customsUnit:'',evidence:''})),otherDeductions:result.returns.map(r=>({reconciliationId:r.id,nonDocumentVat:'0',evidence:''})),additionalInputs:[]}))}}
 const sourceValid=sources?.ids===chosen.map(x=>x.id).sort().join(',')&&sources?.revision===revision
 async function submit(e){e.preventDefault();if(e.nativeEvent.submitter?.value==='preview'){const result=await check.submit(`${view}/preview`,body,'');if(result)setPreview({signature,revision,plan:result.plan})}else if(valid){const result=await action.submit(view,body,'Requested for independent review.');if(result)onCreated(result.item.id)}}
 const selectKind=value=>setForm(f=>({...f,...baseTracking,packageId:f.packageId,kind:value}))
 return <Form aria-label="VAT claim form" onSubmit={submit}><fieldset disabled={busy} className="min-w-0 space-y-4"><h2 className="text-lg font-semibold">{kind==='package'?'New claim package':'Record an external event'}</h2>{field('reference','Claim reference')}
 {kind==='package'?<>
  <p className="text-sm text-slate-600">Combine approved requests while retaining separate monthly lists. Review customs values, unit codes and the complete deduction breakdown before requesting approval.</p>
  <RecordSelect base={base} resource="refund-requests" filters={{status:'APPROVED'}} label="Approved refund request to add" revision={revision} value={selection} onChange={setSelection} format={r=>`${r.reference} · ${r.period} · ${r.requestedVat} ${r.method}`}/>
  <Button type="button" variant="outline" disabled={!selection||chosen.some(r=>r.id===selection)} onClick={()=>{setChosen(c=>[...c,{id:selection}]);setSelection(null)}}>Add refund request</Button>
  <div className="space-y-2">{chosen.map((r,i)=><div key={r.id} className="flex items-center gap-3 text-sm"><span>Request {i+1}{sources?.data.requests.find(x=>x.id===r.id)?' · '+sources.data.requests.find(x=>x.id===r.id).reference:''}</span><Button type="button" variant="outline" onClick={()=>setChosen(c=>c.filter(x=>x.id!==r.id))} aria-label={`Remove selected request ${i+1}`}>Remove</Button></div>)}</div>
  <Button type="button" variant="outline" disabled={!chosen.length} onClick={loadSources}>Load package sources</Button>
  {sourceValid&&<>
   <Rows title="Customs declarations" value={form.customs} onChange={v=>update('customs',v)} label={r=>sources.data.declarations.find(x=>x.declarationId===r.declarationId)?.reference} fields={[
    ['registrationNumber','Formal GÇB / ETGB registration number'],['documentType','Customs document type',['GCB','ETGB']],['currency','Box 22 currency'],['totalInvoiceAmount','Box 22 total invoice amount'],['evidence','Customs document evidence']]}/>
   <Rows title="Customs unit mapping" value={form.units} onChange={v=>update('units',v)} label={r=>r.sourceUnit} fields={[
    ['customsUnit','Reviewed customs unit code'],['evidence','Unit mapping evidence']]}/>
   <Rows title="Other deductions by return" value={form.otherDeductions} onChange={v=>update('otherDeductions',v)} label={r=>{const x=sources.data.returns.find(x=>x.id===r.reconciliationId);return `${x.period} · Other deductions ${x.otherDeductions} TRY`}} fields={[
    ['nonDocumentVat','Non-document adjustments (TRY)'],['evidence','Breakdown evidence']]}/>
   <p className="text-sm">Supplementary invoices below plus the non-document adjustments must equal each return’s other deductions. These invoices complete the input list; they do not add refundable VAT.</p>
   {sources.data.returns.map(r=><Button key={r.id} type="button" variant="outline" onClick={()=>update('additionalInputs',[...form.additionalInputs,{reconciliationId:r.id,invoiceDate:'',series:'',number:'',sellerName:'',taxId:'',description:'',quantity:'',netTry:'',deductedVat:'',importNumber:'',inputType:'DOMESTIC',evidence:''}])}>Add supplementary invoice for {r.period}</Button>)}
   <Rows title="Supplementary input invoices" removable value={form.additionalInputs} onChange={v=>update('additionalInputs',v)} label={r=>sources.data.returns.find(x=>x.id===r.reconciliationId)?.period} fields={[
    ['invoiceDate','Invoice date','date'],['series','Series (blank for e-invoices)','optional'],['number','Full invoice number'],['sellerName','Seller name'],['taxId','VKN / TCKN'],['description','Goods or services'],['quantity','Invoice quantities'],['netTry','Full net amount (TRY)'],['deductedVat','Deducted VAT (TRY)'],['inputType','Input document type',['DOMESTIC','IMPORT','WITHHELD']],['importNumber','Import document number, if applicable','optional'],['evidence','Original invoice evidence']]}/>
   {field('formatEvidence','Current GİB template review evidence')}{field('legalEvidence','Legal and completeness review evidence')}{checkbox('completenessConfirmed','I checked all original invoices, accepted exports, customs declarations and the complete return deduction breakdown.')}
  </>}
 </>:<>
  <p className="text-sm text-slate-600">Record an event that has already occurred, with its external evidence. This form records filing, received money or an applied offset; it does not send a claim or execute a payment.</p>
  <RecordSelect base={base} resource="claim-packages" filters={{status:'APPROVED'}} label="Approved claim package" revision={revision} value={form.packageId} onChange={id=>setForm(f=>({...f,...baseTracking,packageId:id}))} format={r=>`${r.reference} · ${r.periodFrom} — ${r.periodTo} · ${r.requestedVat} TRY`}/>
  <Field label="External event"><select className={inputStyle} value={form.kind} onChange={e=>selectKind(e.target.value)}>{Object.entries(titles).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
  {form.packageId&&<LoadState result={detail} label="approved package"/>}
  <div className="grid gap-3 sm:grid-cols-2">{field('eventDate','Actual event date','date')}{field('externalReference','Unique external event reference')}</div>
  {p&&form.kind==='SUBMISSION'&&<><Button type="button" variant="outline" onClick={()=>update('periods',p.plan.returns.map(r=>({reconciliationId:r.id,filingDate:'',petitionReference:'',listReceiptReference:'',evidence:''})))}>Prepare monthly filing receipts</Button><Rows title="Actual filing receipts" value={form.periods} onChange={v=>update('periods',v)} label={r=>p.plan.returns.find(x=>x.id===r.reconciliationId)?.period} fields={[
   ['filingDate','Actual filing date','date'],['petitionReference','Refund petition receipt'],['listReceiptReference','Approved list submission receipt'],['evidence','External filing evidence']]}/></>}
  {p&&['CASH','OFFSET','REVERSAL'].includes(form.kind)&&<>
   {form.kind==='REVERSAL'?<Field label="Original approved settlement"><select className={inputStyle} required value={form.reversesId??''} onChange={e=>{const a=detail.data.tracking.events.find(x=>x.id===e.target.value);setForm(f=>({...f,reversesId:a?.id??null,refundId:a?.refundId??null,amount:a?.amount??'0'}))}}><option value="">Choose settlement</option>{detail.data.tracking.events.filter(a=>a.status==='APPROVED'&&['CASH','OFFSET'].includes(a.kind)&&!detail.data.tracking.events.some(x=>x.kind==='REVERSAL'&&x.reversesId===a.id)).map(a=><option key={a.id} value={a.id}>{a.externalReference} · {a.amount} TRY</option>)}</select></Field>:<><Field label="Original packaged refund request"><select className={inputStyle} required value={form.refundId??''} onChange={e=>update('refundId',e.target.value)}><option value="">Choose request</option>{detail.data.tracking.balances.filter(r=>r.method===form.kind).map(r=><option key={r.refundId} value={r.refundId}>{r.reference} · Available {r.remainingVat} TRY</option>)}</select></Field>{field('amount','Actually settled amount (TRY)')}</>}
   {form.kind==='REVERSAL'&&<p className="text-sm">Exact reversal: {form.amount} TRY. The balance is restored after independent approval.</p>}
   {field('counterparty',form.kind==='OFFSET'?'Offset debt and authority reference':form.kind==='CASH'?'Receiving bank/account reference':'Reversal bank/debt evidence')}
   {form.kind!=='REVERSAL'&&<>{field('externalAggregationVat','Other claims included in documented combined processing (TRY)')}{field('processingEvidence','Tax office processing / aggregation evidence')}</>}
  </>}
  {form.kind==='WITHDRAWAL'&&<p className="text-sm">Record accepted external withdrawal after pending events are resolved and received/offset amounts are reversed.</p>}
  {checkbox('externalConfirmed','I verified that this external event occurred and retained its original evidence.')}
 </>}
 {field('reason','Claim request reason')}{field('evidence','Claim supporting evidence')}<Feedback error={check.error??action.error}/>
 <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" value="preview" disabled={kind==='package'?!sourceValid||!form.completenessConfirmed:!p||!form.externalConfirmed}>Preview claim review</Button><Button type="submit" value="request" disabled={!valid}>Request claim review</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel claim form</Button></div>
 {valid&&<div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4"><h3 className="font-semibold">Claim review preview</h3><ClaimSummary kind={kind} item={preview.plan}/></div>}
 </fieldset></Form>
}
function Rows({title,value,onChange,fields,label,removable=false}){
 const [offset,setOffset]=useState(0),pageOffset=Math.min(offset,Math.max(0,Math.ceil(value.length/25)-1)*25)
 return <section className="min-w-0 space-y-3"><h3 className="font-semibold">{title}</h3>{value.slice(pageOffset,pageOffset+25).map((r,j)=>{const i=pageOffset+j;return <div key={i} className="space-y-3 rounded-lg border p-3"><p className="break-words text-sm font-medium">{i+1} · {label(r)}</p><div className="grid gap-3 sm:grid-cols-2">{fields.map(([k,text,type])=><Field key={k} label={`${text} ${i+1}`} {...(!Array.isArray(type)&&{type:type==='date'?'date':'text',required:type!=='optional',maxLength:['description','quantity'].includes(k)?2000:k==='series'?20:k==='number'?64:k==='taxId'?11:255,value:r[k],onChange:e=>onChange(value.map((x,n)=>n===i?{...x,[k]:e.target.value}:x))})}>{Array.isArray(type)?<select className={inputStyle} value={r[k]} onChange={e=>onChange(value.map((x,n)=>n===i?{...x,[k]:e.target.value}:x))}>{type.map(v=><option key={v}>{v}</option>)}</select>:null}</Field>)}</div>{removable&&<Button type="button" variant="outline" onClick={()=>onChange(value.filter((_,n)=>n!==i))}>Remove supplementary invoice {i+1}</Button>}</div>})}{value.length>25&&<Pager data={{total:value.length,limit:25}} offset={pageOffset} setOffset={setOffset}/>}</section>
}
