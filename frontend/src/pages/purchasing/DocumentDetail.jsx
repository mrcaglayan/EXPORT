import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from '@/pages/products/useProducts'
import { ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'

export default function DocumentDetail({ base, resource, id, revision, onSaved, onBack }) {
  const { can, profile } = useAuth()
  const [offset, setOffset] = useState(0), [reason, setReason] = useState('')
  const detail = useProducts(base, `${resource}/${id}`, {}, revision)
  const lines = useProducts(base, `${resource}/${id}/lines`, { limit: 25, offset }, revision, resource !== 'contracts')
  const action = useAccountingMutation(base, onSaved)
  const d = detail.data?.item, own = d?.createdBy === profile.user.id
  const review = d?.status === 'REQUESTED' && can('purchasing.approve')
  const cancel = own && can('purchasing.manage') && ['REQUESTED', 'APPROVED'].includes(d?.status)
  const act = verb => action.submit(`${resource}/${id}/${verb}`, { reason }, 'Purchasing document updated.')
  return <div className="space-y-4"><Button variant="outline" onClick={onBack}>Back to {resource}</Button><LoadState result={detail} label="purchasing document" />{d && <>
    <h2 className="break-all text-lg font-semibold">{d.reference}</h2><p className="text-sm">{d.kind} · {d.documentDate} · Status: <strong>{d.status}</strong></p>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Purpose', d.purpose], ['EBYS reference', d.ebysReference], ['Required delivery', d.requiredBy], ['Validity', d.validFrom && `${d.validFrom} → ${d.validTo}`], ['Currency', d.currency], ['Requested by', d.createdByName]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0"><dt className="font-medium">{label}</dt><dd className="mt-1 break-words text-slate-600">{value}</dd></div>)}</dl>
    {d.partnerSnapshot && <section className="rounded-xl border border-slate-200 p-4 text-sm"><h3 className="font-medium">Supplier details at submission</h3><p className="mt-2 break-words">{d.partnerSnapshot.code} — {d.partnerSnapshot.name}<br />{d.partnerSnapshot.countryCode} · Tax ID: {d.partnerSnapshot.taxIdentifier ?? 'Not recorded'}</p><p className="mt-2 whitespace-pre-wrap break-words">{d.partnerSnapshot.address}</p><p className="mt-2 break-words">{[d.partnerSnapshot.email, d.partnerSnapshot.phone].filter(Boolean).join(' · ')}</p></section>}
    {d.terms && <div className="text-sm"><h3 className="font-medium">Commercial terms</h3><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{d.terms}</p></div>}
    <div className="flex flex-wrap gap-4 text-sm text-teal-800">{d.requestId && <Link className="underline" to={`?view=requests&id=${d.requestId}`}>Source purchase request</Link>}{d.contractId && <Link className="underline" to={`?view=contracts&id=${d.contractId}`}>Source contract</Link>}</div>
    {d.reviewedByName && <p className="break-words text-sm">Review: {d.reviewReason} · {d.reviewedByName} · {d.reviewedAt}</p>}{d.cancelReason && <p className="break-words text-sm">Cancellation: {d.cancelReason} · {d.cancelledAt}</p>}
    {review && own && <p className="text-sm text-amber-800">Another authorized person must approve this document.</p>}
    {(review || cancel) && <><div className="max-w-xl"><Field label="Purchasing action reason" required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></div><div className="flex flex-wrap gap-2">{review && <><Button disabled={own || action.busy || !reason.trim()} onClick={() => act('approve')}>Approve document</Button><Button variant="outline" disabled={action.busy || !reason.trim()} onClick={() => act('reject')}>Reject document</Button></>}{cancel && <Button variant="outline" disabled={action.busy || !reason.trim()} onClick={() => act('cancel')}>Cancel document</Button>}</div></>}
    <Feedback error={action.error} message={action.message} />
    {resource !== 'contracts' && <><LoadState result={lines} label="retained purchasing lines" />{lines.data && <><Table columns={resource === 'requests' ? ['Line / SKU', 'Description', 'Requested / unit', 'Committed', 'Available'] : ['Line / source', 'SKU / description', 'Quantity / unit', 'Unit price / net', 'Free-goods reason']} rows={lines.data.items} empty="No retained lines." render={l => resource === 'requests' ? <><Cell>{l.lineKey}<br />{l.skuSnapshot.code}</Cell><Cell>{l.description || l.skuSnapshot.name}</Cell><Cell>{l.quantity} {l.skuSnapshot.unitCode}</Cell><Cell>{l.committedQuantity}</Cell><Cell>{l.availableQuantity}</Cell></> : <><Cell>{l.lineNumber} / {l.requestLineKey}</Cell><Cell>{l.skuSnapshot.code}<br />{l.description || l.skuSnapshot.name}</Cell><Cell>{l.quantity} {l.skuSnapshot.unitCode}</Cell><Cell>{l.unitPrice}<br />{l.netAmount} {d.currency}</Cell><Cell>{l.freeReason ?? '—'}</Cell></>} /><Pager data={lines.data} offset={offset} setOffset={setOffset} /></>}</>}
    {resource === 'orders' && <p className="text-sm font-medium">Order net total: {d.netTotal} {d.currency}. No invoice, stock or journal has been posted by this order.</p>}
  </>}</div>
}
