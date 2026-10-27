import {useState} from 'react'
import {useAuth} from '@/auth/auth-context'
import {Button} from '@/components/ui/button'
import {Field,Feedback,Table,Cell,inputStyle} from '@/pages/accounting/accounting-ui'
import {useAccountingMutation} from '@/pages/accounting/useAccounting'
import {useProducts,useDebouncedValue} from '@/pages/products/useProducts'
import {ProductFormShell as Form,ProductLoadState as LoadState,ProductPager as Pager} from '@/pages/products/product-ui'
import InvoiceDetail from './InvoiceDetail'
import PurchasePostingSettings from './PurchasePostingSettings'

export default function InvoicePanel({base,revision,onSaved,selected,onSelect}){
  const {can}=useAuth(),[importing,setImporting]=useState(false),[q,setQ]=useState(''),[status,setStatus]=useState(''),[offset,setOffset]=useState(0)
  const search=useDebouncedValue(q),list=useProducts(base,'invoices',{q:search,offset,limit:25,...(status&&{status})},revision,!selected)
  if(selected)return <InvoiceDetail key={selected} base={base} id={selected} revision={revision} onSaved={onSaved} onBack={()=>onSelect(null)}/>
  if(importing)return <ImportForm base={base} onSaved={onSaved} onCreated={onSelect} onCancel={()=>setImporting(false)}/>
  return <div className="space-y-4"><p className="text-sm text-slate-600">Import a purchase Invoice XML export, preserve its original lines and match them to an approved order. Validation and independent review prepare matching for the goods-receipt step.</p>
    <RecipientSettings base={base} revision={revision} onSaved={onSaved}/>
    <PurchasePostingSettings base={base} revision={revision} onSaved={onSaved}/>
    {can('purchasing.invoice.import')&&<Button onClick={()=>setImporting(true)}>Import invoice XML</Button>}
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2"><Field label="Search invoices" maxLength={160} value={q} onChange={e=>{setQ(e.target.value);setOffset(0)}}/><Field label="Invoice status"><select className={inputStyle} value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}><option value="">All statuses</option>{['STAGED','REQUESTED','READY','REJECTED','CANCELLED'].map(s=><option key={s}>{s}</option>)}</select></Field></div>
    <LoadState result={list} label="purchase invoices"/>{list.data&&<><Table columns={['Invoice / date','Supplier','Net / VAT / payable','Status','Details']} rows={list.data.items} empty="No imported invoices yet." render={r=><><Cell>{r.invoiceNumber}<br/>{r.issueDate}</Cell><Cell>{r.supplierName}<br/>{r.supplierTaxId}</Cell><Cell>{r.netTotal} / {r.vatTotal}<br/>{r.payableTotal} {r.currency}</Cell><Cell>{r.status}</Cell><Cell><Button variant="outline" aria-label={`View invoice ${r.invoiceNumber}`} onClick={()=>onSelect(r.id)}>View</Button></Cell></>}/><Pager data={list.data} offset={offset} setOffset={setOffset}/></>}
  </div>
}
function RecipientSettings({base,revision,onSaved}){
  const {can}=useAuth(),setting=useProducts(base,'invoice-settings',{},revision),[editing,setEditing]=useState(false)
  return <section className="rounded-xl border border-slate-200 p-4 text-sm"><h2 className="font-medium">Company invoice recipient</h2><LoadState result={setting} label="recipient identity"/>{setting.data&&<p className="mt-2">{setting.data.item?`${setting.data.item.receiverScheme}: ${setting.data.item.receiverTaxId}`:'Receiving VKN/TCKN has not been configured. XML can be staged; matching submission waits for this identity.'}</p>}{can('purchasing.invoice.configure')&&<>{editing?<RecipientForm key={revision} base={base} item={setting.data?.item} onSaved={onSaved} onClose={()=>setEditing(false)}/>:<Button className="mt-3" variant="outline" onClick={()=>setEditing(true)}>Configure recipient identity</Button>}</>}</section>
}
function RecipientForm({base,item,onSaved,onClose}){
  const [scheme,setScheme]=useState(item?.receiverScheme??'VKN'),[taxId,setTaxId]=useState(item?.receiverTaxId??''),[reason,setReason]=useState(''),action=useAccountingMutation(base,onSaved)
  async function submit(e){e.preventDefault();if(await action.submit('invoice-settings',{receiverScheme:scheme,receiverTaxId:taxId,reason},'Recipient saved.'))onClose()}
  return <Form aria-label="Invoice recipient form" onSubmit={submit}><fieldset disabled={action.busy} className="mt-4 min-w-0 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Recipient identity type"><select className={inputStyle} value={scheme} onChange={e=>setScheme(e.target.value)}><option>VKN</option><option>TCKN</option></select></Field><Field label="Receiving tax identifier" required inputMode="numeric" pattern={scheme==='VKN'?'[0-9]{10}':'[0-9]{11}'} maxLength={11} value={taxId} onChange={e=>setTaxId(e.target.value)}/></div><Field label="Recipient configuration reason" required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/><Feedback error={action.error}/><div className="flex flex-wrap gap-2"><Button type="submit">Save recipient identity</Button><Button type="button" variant="outline" onClick={onClose}>Cancel recipient form</Button></div></fieldset></Form>
}
function ImportForm({base,onSaved,onCreated,onCancel}){
  const [file,setFile]=useState(null),[xml,setXml]=useState(''),[evidence,setEvidence]=useState(''),[error,setError]=useState(null),action=useAccountingMutation(base,onSaved)
  async function choose(e){setFile(null);setXml('');setError(null);const selected=e.target.files?.[0];if(!selected)return;try{if(selected.size>750000)throw Error('Choose an XML file up to 750,000 bytes.');const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await selected.arrayBuffer());setFile(selected);setXml(content)}catch(failure){setError({message:failure.message})}}
  async function submit(e){e.preventDefault();const result=await action.submit('invoices',{xml,fileName:file.name,evidence},'Invoice XML staged.');if(result)onCreated(result.item.id)}
  return <Form aria-label="Invoice XML import form" onSubmit={submit}><h2 className="text-lg font-semibold">Import purchase invoice XML</h2><p className="mt-2 text-sm text-slate-600">Choose a UTF-8 UBL Invoice export from İZİBİZİ. Basic, commercial and e-Arşiv SATIS/ISTISNA documents are checked. The original XML and every line are retained; unsupported adjustments remain validation exceptions. Signature authentication and supplier acceptance are separate from this import.</p><fieldset disabled={action.busy} className="mt-5 min-w-0 space-y-4"><Field label="Invoice XML file" type="file" accept=".xml,application/xml,text/xml" required onChange={choose}/>{file&&<p className="break-words text-sm">{file.name} · {file.size.toLocaleString()} bytes</p>}<Field label="Import evidence reference" required maxLength={1000} value={evidence} onChange={e=>setEvidence(e.target.value)}/><Feedback error={error??action.error}/><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!file||!xml}>Stage invoice XML</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel XML import</Button></div></fieldset></Form>
}
