import {listNames} from './vat-claim-data'
export function ClaimSummary({kind,item}){
 if(kind==='tracking')return <div className="text-sm"><p>{item.kind} · {item.eventDate} · {item.externalReference}</p><p>{item.amount} TRY</p></div>
 const plan=item.plan??item
 return <div className="space-y-2 text-sm"><p>{plan.periodFrom} — {plan.periodTo} · Requested VAT <strong>{plan.requestedVat} TRY</strong></p><p>{plan.processingStatus==='WAITING_AGGREGATION'?'Below the processing threshold: retain filing deadlines and documented combined processing.':'Tax office processing and procedure evidence still required.'}</p><div className="flex flex-wrap gap-x-5 gap-y-1">{Object.entries(listNames).map(([k,v])=><span key={k}>{v}: {plan.rows.filter(r=>r.listKind===k).length} rows</span>)}</div><p>Download files for accountant review. Check the current GİB template before external upload; approval here does not file the package.</p></div>
}
