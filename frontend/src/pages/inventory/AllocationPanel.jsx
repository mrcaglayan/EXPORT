import { useState } from 'react'
import { apiClient } from '@/api/client'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from '@/pages/products/useProducts'
import { ProductFormShell as Form, ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

export default function AllocationPanel({ base, revision, onSaved }) {
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('')
  const list = useProducts(base, 'reallocations', { offset, limit: 25, ...(status && { status }) }, revision)
  if (selected) return <RequestDetails key={selected} base={base} id={selected} revision={revision} onSaved={onSaved} onBack={() => setSelected(null)} />
  return <div className="mt-6 min-w-0">
    <p className="text-sm text-slate-600">Check unreserved destination stock, then GENERAL stock. Borrowing from another country requires a request reviewed by another authorized person. Transfers preserve physical stock and total inventory value.</p>
    <Button className="mt-4" variant="outline" onClick={() => setCreating(value => !value)}>{creating ? 'Close allocation planner' : 'Check allocation'}</Button>
    {creating && <Planner base={base} revision={revision} onSaved={onSaved} onCreated={id => { setCreating(false); setSelected(id) }} />}
    <div className="mt-5 max-w-xs"><Field label="Request status"><select className={inputStyle} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">All requests</option>{['REQUESTED','APPROVED','REJECTED','CANCELLED','EXECUTED'].map(s => <option key={s}>{s}</option>)}</select></Field></div>
    <LoadState result={list} label="allocation requests" />
    {list.data && <><Table columns={['Reference', 'Warehouse / SKU', 'Transfer', 'Quantity', 'Posting date', 'Status', 'Details']} rows={list.data.items} empty="No allocation requests yet." render={r => <>
      <Cell>{r.reference}</Cell><Cell>{r.warehouseCode} / {r.skuCode}</Cell><Cell>{r.fromPoolCode} → {r.toPoolCode}</Cell><Cell>{r.quantity}</Cell><Cell>{r.postingDate}</Cell><Cell>{r.status}</Cell><Cell><Button variant="outline" aria-label={`View request ${r.reference}`} onClick={() => setSelected(r.id)}>View</Button></Cell>
    </>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </div>
}

function Planner({ base, revision, onSaved, onCreated }) {
  const { can } = useAuth()
  const [form, setForm] = useState({ warehouseId: null, skuId: null, toPoolId: null, quantity: '', postingDate: '', reference: '', fromPoolId: null, movementTypeId: null, reason: '' })
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [checking, setChecking] = useState(false)
  const action = useAccountingMutation(base, onSaved)
  const set = (field, value) => { setForm(f => ({ ...f, [field]: value })); if (['warehouseId','skuId','toPoolId','quantity','postingDate'].includes(field)) setPreview(null); setPreviewError(null); action.clearFeedback() }
  async function check(event) {
    event.preventDefault(); setChecking(true); setPreview(null); setPreviewError(null)
    try {
      const { warehouseId, skuId, toPoolId, quantity, postingDate } = form
      const { data } = await apiClient.get(`${base}/allocation-preview`, { params: { warehouseId, skuId, toPoolId, quantity, postingDate } })
      setPreview(data)
    } catch (error) { setPreviewError(error) } finally { setChecking(false) }
  }
  async function submit(event) {
    event.preventDefault()
    const { reference, warehouseId, skuId, fromPoolId, toPoolId, postingDate, movementTypeId, reason } = form
    const result = await action.submit('reallocations', { reference, warehouseId, skuId, fromPoolId, toPoolId, postingDate, movementTypeId, reason, quantity: form.transferQuantity ?? '' }, 'Request submitted.')
    if (result) onCreated(result.reallocation.id)
  }
  // Keep transfer quantity separate from the total demand used by the preview.
  const transferQuantity = form.transferQuantity ?? ''
  return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <Form onSubmit={check} aria-label="Allocation preview form">
      <fieldset disabled={checking || action.busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <ProductPicker base={base} resource="warehouses" label="Allocation warehouse" revision={revision} required value={form.warehouseId} onChange={v => set('warehouseId', v)} />
        <ProductPicker base={base} resource="skus" label="Allocation SKU" revision={revision} required value={form.skuId} onChange={v => set('skuId', v)} />
        <ProductPicker base={base} resource="pools" filters={{ kind: 'COUNTRY' }} label="Destination pool" revision={revision} required value={form.toPoolId} onChange={v => set('toPoolId', v)} />
        <div className="space-y-3"><Field label="Total quantity needed" required inputMode="decimal" value={form.quantity} onChange={e => set('quantity', e.target.value)} /><Field label="Allocation posting date" required type="date" value={form.postingDate} onChange={e => set('postingDate', e.target.value)} /></div>
      </fieldset>
      <Feedback error={previewError} />
      <Button type="submit" className="mt-3" disabled={checking || action.busy}>{checking ? 'Checking…' : 'Preview availability'}</Button>
    </Form>
    {preview && <div role="status" className="mt-4 rounded-lg bg-white p-4 text-sm"><p>Destination: {preview.destinationQuantity}</p><p>GENERAL: {preview.generalQuantity}</p><p>Shortfall: {preview.shortfall}</p><p className="mt-2 text-slate-600">This preview does not reserve stock. Choose an explicit source for any transfer. Pending requests also leave stock available; execution checks the approved layers again.</p></div>}
    {preview && can('inventory.reallocation.request') && <Form onSubmit={submit} aria-label="Reallocation request form" className="mt-4">
      <h2 className="font-semibold">Request a pool transfer</h2>
      <fieldset disabled={action.busy} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label="Request reference" required maxLength={64} pattern="[A-Za-z0-9._:\-]+" value={form.reference} onChange={e => set('reference', e.target.value)} />
        <Field label="Quantity to transfer" required inputMode="decimal" value={transferQuantity} onChange={e => set('transferQuantity', e.target.value)} />
        <ProductPicker base={base} resource="pools" label="Source pool" revision={revision} required value={form.fromPoolId} onChange={v => set('fromPoolId', v)} />
        <ProductPicker base={base} resource="movement-types" label="Reallocation movement type" revision={revision} required value={form.movementTypeId} onChange={v => set('movementTypeId', v)} />
        <Field label="Request reason" required maxLength={255} value={form.reason} onChange={e => set('reason', e.target.value)} />
      </fieldset>
      <p className="mt-3 text-sm text-slate-600">Source layers are selected in FIFO order and fixed for review. Cost is determined from their remaining pool value at execution. Choose a movement type with the Reallocation effect.</p>
      <Feedback error={action.error} />
      <Button className="mt-3" type="submit" disabled={action.busy}>{action.busy ? 'Submitting…' : 'Submit transfer request'}</Button>
    </Form>}
  </div>
}

function RequestDetails({ base, id, revision, onSaved, onBack }) {
  const { can, profile } = useAuth()
  const [offset, setOffset] = useState(0)
  const [reason, setReason] = useState('')
  const detail = useProducts(base, `reallocations/${id}`, {}, revision)
  const lines = useProducts(base, `reallocations/${id}/lines`, { limit: 25, offset }, revision)
  const action = useAccountingMutation(base, onSaved)
  const r = detail.data?.reallocation
  const own = r?.requestedBy === profile.user.id
  const canReview = r?.status === 'REQUESTED' && can('inventory.reallocation.review') && (!r.requiresIndependent || !own)
  const canCancel = own && can('inventory.reallocation.request') && ['REQUESTED','APPROVED'].includes(r?.status)
  async function act(verb) { await action.submit(`reallocations/${id}/${verb}`, verb === 'execute' ? {} : { reason }, 'Request updated.') }
  return <div className="mt-6 min-w-0">
    <Button variant="outline" disabled={action.busy} onClick={onBack}>Back to allocation requests</Button>
    <LoadState result={detail} label="allocation request" />
    {r && <>
      <h2 className="mt-4 break-all text-lg font-semibold">Request {r.reference}</h2>
      <p className="mt-2 text-sm">{r.warehouseCode} / {r.skuCode} · {r.fromPoolCode} → {r.toPoolCode} · {r.quantity} · {r.postingDate}</p>
      <p className="mt-2 text-sm">Status: <strong>{r.status}</strong></p><p className="mt-2 break-words text-sm">Reason: {r.reason}</p>
      <p className="mt-2 text-sm">Requested by: {r.requestedByName}</p>
      {r.requiresIndependent && r.status === 'REQUESTED' && <p className="mt-3 text-sm text-amber-800">Another authorized person must review this country borrowing request.</p>}
      {r.reviewedBy && <p className="mt-3 break-words text-sm">Review: {r.reviewReason}<br />Reviewed by {r.reviewedByName} · {new Date(r.reviewedAt).toLocaleString(undefined, { timeZoneName: 'short' })}</p>}
      {r.cancelReason && <p className="mt-3 text-sm">Cancellation: {r.cancelReason}</p>}
      {r.totalValue !== null && <p className="mt-3 text-sm">Transferred value: {r.totalValue} (company currency)</p>}
      {r.executedByName && <p className="mt-2 text-sm">Executed by: {r.executedByName}</p>}
      {(canReview || canCancel) && <div className="mt-4 max-w-xl"><Field label="Review or cancellation reason" required maxLength={255} value={reason} disabled={action.busy} onChange={e => setReason(e.target.value)} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {canReview && <><Button disabled={action.busy || !reason.trim()} onClick={() => act('approve')}>Approve request</Button><Button variant="outline" disabled={action.busy || !reason.trim()} onClick={() => act('reject')}>Reject request</Button></>}
        {canCancel && <Button variant="outline" disabled={action.busy || !reason.trim()} onClick={() => act('cancel')}>Cancel request</Button>}
        {r.status === 'APPROVED' && can('inventory.reallocation.execute') && <Button disabled={action.busy} onClick={() => act('execute')}>Execute transfer</Button>}
      </div>
      <Feedback error={action.error} message={action.message} />
      <LoadState result={lines} label="planned source layers" />
      {lines.data && <><Table columns={['Line', 'Receipt / received', 'Layer', 'Quantity', 'Transferred value']} rows={lines.data.items} empty="No planned source layers." render={l => <><Cell>{l.lineNumber}</Cell><Cell>{l.sourceId}<br />{l.receivedDate}</Cell><Cell><span className="break-all">{l.layerId}</span></Cell><Cell>{l.quantity}</Cell><Cell>{l.value === null ? 'At execution' : `${l.value} ${l.currency}`}</Cell></>} /><Pager data={lines.data} offset={offset} setOffset={setOffset} /></>}
    </>}
  </div>
}
