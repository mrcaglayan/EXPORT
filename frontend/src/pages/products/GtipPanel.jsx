import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle, Table, Cell, Pager } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from './useProducts'
import ReviewForm from './ReviewForm'

function EndDateForm({ base, item, onSaved, onCancel }) {
  const [effectiveTo, setEffectiveTo] = useState(item.effectiveTo ?? '')
  const [reason, setReason] = useState('')
  const action = useAccountingMutation(base, onSaved)
  return <form aria-label="End GTİP date range" className="mt-4 rounded-xl bg-slate-50 p-4" onSubmit={async e => {
    e.preventDefault()
    if (await action.submit(`gtip-history/${item.id}/end-date`, { effectiveTo, reason }, 'Date range updated.')) onCancel()
  }}><fieldset disabled={action.busy} className="grid gap-4 sm:grid-cols-2">
    <Field label="Last effective date" type="date" required min={item.effectiveFrom} max={item.effectiveTo ?? undefined} value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} />
    <Field label="Date change reason" required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
  </fieldset><Feedback error={action.error} /><div className="mt-4 flex gap-2"><Button type="submit" disabled={action.busy}>Save end date</Button><Button variant="outline" disabled={action.busy} onClick={onCancel}>Cancel date change</Button></div></form>
}
export default function GtipPanel({ base, skuId, revision, onSaved, canManage, canReview }) {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ gtipCode: '', effectiveFrom: '', effectiveTo: '', sourceReference: '' })
  const [review, setReview] = useState(null)
  const [ending, setEnding] = useState(null)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const list = useProducts(base, `skus/${skuId}/gtip-history`, { offset, limit: 25, ...(status && { status }) }, revision)
  const action = useAccountingMutation(base, onSaved)
  return <section aria-label="SKU GTİP history" className="border-t border-slate-200 pt-6">
    <h3 className="font-semibold">GTİP history</h3><p className="mt-2 text-sm text-slate-600">Date ranges include both endpoints. Review an entry, then record broker verification before using it.</p>
    {canManage && <form aria-label="New GTİP entry" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={async e => {
      e.preventDefault()
      if (await action.submit(`skus/${skuId}/gtip-history`, { ...form, effectiveTo: form.effectiveTo || null }, 'GTİP entry awaiting review.')) setForm({ gtipCode: '', effectiveFrom: '', effectiveTo: '', sourceReference: '' })
    }}><fieldset disabled={action.busy} className="grid gap-4 sm:grid-cols-2">
      <Field label="GTİP code" required pattern="[0-9]{12}" maxLength={12} inputMode="numeric" value={form.gtipCode} onChange={e => set('gtipCode', e.target.value)} />
      <Field label="Classification source" required maxLength={1000} value={form.sourceReference} onChange={e => set('sourceReference', e.target.value)} />
      <Field label="Effective from" type="date" required value={form.effectiveFrom} onChange={e => set('effectiveFrom', e.target.value)} />
      <Field label="Effective to (optional)" type="date" value={form.effectiveTo} onChange={e => set('effectiveTo', e.target.value)} />
    </fieldset><Button type="submit" className="mt-4" disabled={action.busy}>Add GTİP entry</Button></form>}
    {review && <ReviewForm key={`${review.id}-${review.status}`} base={base} item={review} kind="gtip" onSaved={onSaved} onCancel={() => setReview(null)} />}
    {ending && <EndDateForm key={ending.id} base={base} item={ending} onSaved={onSaved} onCancel={() => setEnding(null)} />}
    <Feedback error={action.error || list.error} message={action.message} />
    <div className="mt-4 max-w-xs"><Field label="Filter GTİP status"><select className={inputStyle} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">All statuses</option>{['PENDING', 'REVIEWED', 'VERIFIED', 'REJECTED', 'RETIRED'].map(value => <option key={value}>{value}</option>)}</select></Field></div>
    {list.loading && <p role="status" className="mt-4 text-sm">Loading GTİP history…</p>}
    {list.data && <><Table columns={['GTİP', 'Effective dates', 'Status', 'Evidence', ...(canReview ? ['Actions'] : [])]} rows={list.data.items} empty="No GTİP history recorded." render={row => <>
      <Cell>{row.gtipCode}</Cell><Cell>{row.effectiveFrom} → {row.effectiveTo ?? 'Open-ended'}</Cell><Cell>{row.status}</Cell>
      <Cell><details><summary className="cursor-pointer">View evidence</summary><p className="mt-2 max-w-xs break-words">{row.sourceReference}</p>{row.brokerName && <p className="mt-2 max-w-xs break-words">{row.brokerName} · {row.verifiedOn}<br />{row.verificationReference}</p>}</details></Cell>
      {canReview && <Cell><div className="flex flex-wrap gap-2">{['PENDING', 'REVIEWED', 'VERIFIED'].includes(row.status) && <Button variant="outline" onClick={() => { setReview(row); setEnding(null) }} aria-label={`Review GTİP ${row.gtipCode}`}>Review</Button>}{row.status === 'VERIFIED' && <Button variant="outline" onClick={() => { setEnding(row); setReview(null) }}>Set end date</Button>}</div></Cell>}
    </>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </section>
}
