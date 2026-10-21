import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle, Table, Cell, Pager } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from './useProducts'
import ProductPicker from './ProductPicker'
import ReviewForm from './ReviewForm'

const blank = () => ({ supplierId: null, supplierCode: '', supplierDescription: '', skuId: null, sourceReference: '' })
function SourceFields({ base, revision, form, set }) {
  return <>
    <ProductPicker base={base} resource="suppliers" revision={revision} label="Supplier" required value={form.supplierId} onChange={id => set('supplierId', id)} />
    <div className="space-y-4"><Field label="Supplier item code" maxLength={120} value={form.supplierCode} onChange={e => set('supplierCode', e.target.value)} />
      <Field label="Original supplier description"><textarea className={inputStyle} required maxLength={1000} rows={3} value={form.supplierDescription} onChange={e => set('supplierDescription', e.target.value)} /></Field></div>
  </>
}
function AliasMatch({ base, revision }) {
  const [form, setForm] = useState(blank)
  const [result, setResult] = useState(null)
  const set = (key, value) => { setForm(current => ({ ...current, [key]: value })); setResult(null) }
  const action = useAccountingMutation(base, () => {})
  return <details className="mt-6 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">Check an exact supplier match</summary>
    <form aria-label="Check supplier match" className="mt-4" onSubmit={async e => {
      e.preventDefault(); setResult(null)
      const data = await action.submit('alias-matches', { supplierId: form.supplierId, supplierCode: form.supplierCode, supplierDescription: form.supplierDescription }, '')
      if (data) setResult({ ...data, revision })
    }}><fieldset disabled={action.busy} className="grid min-w-0 gap-4 sm:grid-cols-2"><SourceFields base={base} revision={revision} form={form} set={set} /></fieldset>
      <Button type="submit" className="mt-4" disabled={action.busy}>Check match</Button><Feedback error={action.error} />
      {result?.revision === revision && <p role="status" className="mt-3 text-sm text-teal-800">{result.match ? `Verified match: ${result.match.skuCode} (revision ${result.match.revision})` : 'No verified exact match. Review a mapping before use.'}</p>}
    </form>
  </details>
}
export default function AliasPanel({ base, revision, onSaved, canManage, canReview }) {
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [review, setReview] = useState(null)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const list = useProducts(base, 'aliases', { q, offset, limit: 25, ...(status && { status }) }, revision)
  const action = useAccountingMutation(base, onSaved)
  return <div className="mt-6">
    <p className="text-sm text-slate-600">Preserve the supplier’s exact code and description. Only verified mappings to active SKUs can be reused automatically.</p>
    <div className="mt-4 grid items-end gap-4 sm:grid-cols-3"><Field label="Search aliases" maxLength={160} value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} />
      <Field label="Filter alias status"><select className={inputStyle} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">All statuses</option>{['PENDING', 'REVIEWED', 'VERIFIED', 'REJECTED', 'RETIRED'].map(value => <option key={value}>{value}</option>)}</select></Field>
      {canManage && <Button onClick={() => { setShowForm(true); action.clearFeedback() }}>Propose alias</Button>}
    </div>
    {showForm && <form aria-label="New supplier alias" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={async e => {
      e.preventDefault()
      if (await action.submit('aliases', form, 'Alias proposed for review.')) { setShowForm(false); setForm(blank()) }
    }}><fieldset disabled={action.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <SourceFields base={base} revision={revision} form={form} set={set} />
      <ProductPicker base={base} resource="skus" revision={revision} label="Candidate SKU" required value={form.skuId} onChange={id => set('skuId', id)} />
      <Field label="Alias source reference" required maxLength={1000} value={form.sourceReference} onChange={e => set('sourceReference', e.target.value)} />
    </fieldset><div className="mt-4 flex gap-2"><Button type="submit" disabled={action.busy}>Save alias proposal</Button><Button variant="outline" disabled={action.busy} onClick={() => setShowForm(false)}>Cancel alias</Button></div></form>}
    {review && <ReviewForm key={`${review.id}-${review.status}`} base={base} item={review} kind="alias" onSaved={onSaved} onCancel={() => setReview(null)} />}
    <Feedback error={action.error || list.error} message={action.message} />
    {list.loading && <p role="status" className="mt-4 text-sm">Loading aliases…</p>}
    {list.data && <><Table columns={['Supplier', 'Original item', 'SKU / revision', 'Status', 'Evidence', ...(canReview ? ['Actions'] : [])]} rows={list.data.items} empty="No supplier aliases recorded." render={row => <>
      <Cell>{row.supplierReferenceCode}<p className="mt-1 text-xs text-slate-500">{row.supplierName}</p></Cell><Cell><span className="whitespace-pre-wrap">{row.supplierCode || '—'}</span><p className="mt-2 max-w-xs whitespace-pre-wrap break-words text-xs">{row.supplierDescription}</p></Cell>
      <Cell>{row.skuCode}<p className="mt-1 text-xs">Revision {row.revision}</p></Cell><Cell>{row.status}</Cell><Cell><details><summary className="cursor-pointer">View source</summary><p className="mt-2 max-w-xs break-words">{row.sourceReference}</p></details></Cell>
      {canReview && <Cell>{['PENDING', 'REVIEWED', 'VERIFIED'].includes(row.status) && <Button variant="outline" onClick={() => setReview(row)} aria-label={`Review alias ${row.supplierCode || 'item'} revision ${row.revision}`}>Review</Button>}</Cell>}
    </>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
    <AliasMatch base={base} revision={revision} />
  </div>
}
