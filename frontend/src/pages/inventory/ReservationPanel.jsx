import { useState } from 'react'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from '@/pages/products/useProducts'
import { ProductFormShell as Form, ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

export default function ReservationPanel({ base, revision, onSaved }) {
  const { can } = useAuth()
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('ACTIVE')
  const list = useProducts(base, 'reservations', { limit: 25, offset, ...(status && { status }) }, revision)
  if (selected) return <ReservationDetail key={selected} base={base} id={selected} revision={revision} onSaved={onSaved} onBack={() => setSelected(null)} />
  return <div className="mt-6 min-w-0">
    <p className="text-sm text-slate-600">Reserve exact SKU quantities from the destination pool first, then GENERAL. Reserved stock stays on hand and cannot be transferred or reserved again. Borrowing from another country needs an approved transfer first.</p>
    {can('inventory.reservation.manage') && <Button className="mt-4" onClick={() => setCreating(true)}>New reservation</Button>}
    {creating && <ReservationForm base={base} revision={revision} onSaved={onSaved} onCancel={() => setCreating(false)} onCreated={id => { setCreating(false); setSelected(id) }} />}
    <div className="mt-4 max-w-xs"><Field label="Reservation status"><select className={inputStyle} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">All reservations</option>{['ACTIVE','CLOSED','CANCELLED'].map(s => <option key={s}>{s}</option>)}</select></Field></div>
    <LoadState result={list} label="reservations" />
    {list.data && <><Table columns={['Reference', 'Warehouse', 'Destination', 'Reserved on', 'Status', 'Details']} rows={list.data.items} empty="No matching reservations." render={r => <><Cell>{r.reference}</Cell><Cell>{r.warehouseCode}</Cell><Cell>{r.destinationPoolCode}</Cell><Cell>{r.reservationDate}</Cell><Cell>{r.status}</Cell><Cell><Button variant="outline" aria-label={`View reservation ${r.reference}`} onClick={() => setSelected(r.id)}>View</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </div>
}
function ReservationForm({ base, revision, onSaved, onCreated, onCancel }) {
  const [form, setForm] = useState({ reference: '', warehouseId: null, destinationPoolId: null, reservationDate: '', reason: '' })
  const [skuId, setSkuId] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [lines, setLines] = useState([])
  const [offset, setOffset] = useState(0)
  const sku = useProducts(base, `skus/${skuId}`, {}, revision, !!skuId)
  const action = useAccountingMutation(base, onSaved)
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  async function submit(event) {
    event.preventDefault()
    const result = await action.submit('reservations', { ...form, lines: lines.map(({ skuId, quantity }) => ({ skuId, quantity })) }, '')
    if (result) onCreated(result.reservation.id)
  }
  return <Form aria-label="Reservation form" onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <fieldset disabled={action.busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Field label="Reservation reference" required maxLength={64} pattern="[A-Za-z0-9._:\-]+" value={form.reference} onChange={e => set('reference', e.target.value)} />
      <Field label="Reservation date" required type="date" value={form.reservationDate} onChange={e => set('reservationDate', e.target.value)} />
      <ProductPicker base={base} resource="warehouses" revision={revision} label="Reservation warehouse" required value={form.warehouseId} onChange={v => set('warehouseId', v)} />
      <ProductPicker base={base} resource="pools" filters={{ kind: 'COUNTRY' }} revision={revision} label="Reservation destination" required value={form.destinationPoolId} onChange={v => set('destinationPoolId', v)} />
      <Field label="Reservation reason" required maxLength={255} value={form.reason} onChange={e => set('reason', e.target.value)} />
    </fieldset>
    <fieldset disabled={action.busy} className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
      <ProductPicker base={base} resource="skus" revision={revision} label="Reservation SKU" value={skuId} onChange={setSkuId} />
      <div className="space-y-3"><Field label="Line quantity" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} />
        <Button type="button" variant="outline" disabled={!skuId || !quantity.trim() || !sku.data?.item || action.busy} onClick={() => { setLines(current => [...current, { id: crypto.randomUUID(), skuId, code: sku.data.item.code, quantity }]); setOffset(Math.floor(lines.length / 25) * 25); setQuantity('') }}>Add reservation line</Button>
      </div>
    </fieldset>
    <Table columns={['Line', 'SKU', 'Quantity', 'Remove']} rows={lines.slice(offset, offset + 25)} empty="Add at least one SKU line." render={line => <><Cell>{lines.findIndex(l => l.id === line.id) + 1}</Cell><Cell>{line.code}</Cell><Cell><Field label={`Quantity for ${line.code} line ${lines.findIndex(l => l.id === line.id) + 1}`} required inputMode="decimal" value={line.quantity} disabled={action.busy} onChange={e => setLines(current => current.map(l => l.id === line.id ? { ...l, quantity: e.target.value } : l))} /></Cell><Cell><Button type="button" variant="outline" disabled={action.busy} aria-label={`Remove line ${lines.findIndex(l => l.id === line.id) + 1}`} onClick={() => { setLines(current => current.filter(l => l.id !== line.id)); if (offset >= lines.length - 1) setOffset(Math.max(0, offset - 25)) }}>Remove</Button></Cell></>} />
    <Pager data={{ total: lines.length, limit: 25 }} offset={offset} setOffset={setOffset} />
    <p className="mt-3 text-sm text-slate-600">Each line keeps its own SKU and source allocations. Lines are paged for editing; there is no document line-count limit.</p>
    <Feedback error={action.error} />
    <div className="mt-3 flex flex-wrap gap-2"><Button type="submit" disabled={action.busy || !lines.length}>{action.busy ? 'Reserving…' : 'Reserve stock'}</Button><Button variant="outline" disabled={action.busy} onClick={onCancel}>Cancel</Button></div>
  </Form>
}
function ReservationDetail({ base, id, revision, onSaved, onBack }) {
  const { can } = useAuth()
  const [offset, setOffset] = useState(0)
  const [allocationOffset, setAllocationOffset] = useState(0)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [quantities, setQuantities] = useState({})
  const [mode, setMode] = useState(can('inventory.issue.post') ? 'issue' : 'release')
  const [reason, setReason] = useState('')
  const [dispatch, setDispatch] = useState({ reference: '', dispatchDate: '', postingDate: '', movementTypeId: null })
  const [issued, setIssued] = useState(null)
  const detail = useProducts(base, `reservations/${id}`, {}, revision)
  const lines = useProducts(base, `reservations/${id}/lines`, { limit: 25, offset }, revision)
  const allocations = useProducts(base, `reservations/${id}/allocations`, { limit: 25, offset: allocationOffset }, revision)
  const history = useProducts(base, `reservations/${id}/releases`, { limit: 25, offset: historyOffset }, revision)
  const action = useAccountingMutation(base, onSaved)
  const r = detail.data?.reservation
  const writable = r?.status === 'ACTIVE' && (can('inventory.reservation.manage') || can('inventory.issue.post'))
  async function submit(event) {
    event.preventDefault()
    const selected = Object.entries(quantities).filter(([, quantity]) => quantity.trim()).map(([reservationLineId, quantity]) => ({ reservationLineId, quantity }))
    const body = mode === 'cancel' ? { reason } : mode === 'release' ? { reason, lines: selected } : { ...dispatch, description: reason, lines: selected }
    const result = await action.submit(`reservations/${id}/${mode === 'issue' ? 'issues' : mode}`, body, mode === 'issue' ? 'Dispatch posted.' : 'Reserved stock released.')
    if (result) { setQuantities({}); if (result.issue) setIssued(result.issue.id) }
  }
  if (issued) return <IssueDetail base={base} id={issued} revision={revision} onBack={() => setIssued(null)} />
  return <div className="mt-6 min-w-0">
    <Button variant="outline" disabled={action.busy} onClick={onBack}>Back to reservations</Button>
    <LoadState result={detail} label="reservation" />
    {r && <><h2 className="mt-4 break-all text-lg font-semibold">Reservation {r.reference}</h2>
      <p className="mt-2 text-sm">{r.warehouseCode} → {r.destinationPoolCode} · {r.reservationDate} · Status: <strong>{r.status}</strong></p>
      <p className="mt-2 break-words text-sm">{r.reason} · Created by {r.createdByName}</p>
      <LoadState result={lines} label="reservation lines" />
      {lines.data && <><Table columns={['Line / SKU', 'Requested', 'Reserved', 'Released', 'Issued', ...(writable ? ['Action quantity'] : [])]} rows={lines.data.items} empty="No reservation lines." render={l => <><Cell>{l.lineNumber} / {l.skuCode}<br />{l.unitCode}</Cell><Cell>{l.quantity}</Cell><Cell>{l.reservedQuantity}</Cell><Cell>{l.releasedQuantity}</Cell><Cell>{l.issuedQuantity}</Cell>{writable && <Cell><Field label={`Action quantity line ${l.lineNumber}`} inputMode="decimal" disabled={action.busy || l.reservedQuantity === '0.000000' || mode === 'cancel'} value={quantities[l.id] ?? ''} onChange={e => setQuantities(q => ({ ...q, [l.id]: e.target.value }))} /><Button className="mt-2" variant="outline" disabled={action.busy || l.reservedQuantity === '0.000000' || mode === 'cancel'} aria-label={`Use remaining line ${l.lineNumber}`} onClick={() => setQuantities(q => ({ ...q, [l.id]: l.reservedQuantity }))}>Use remaining</Button></Cell>}</>} /><Pager data={lines.data} offset={offset} setOffset={setOffset} /></>}
      {writable && <Form aria-label="Reservation action form" onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <fieldset disabled={action.busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Field label="Reservation action"><select className={inputStyle} value={mode} onChange={e => { setMode(e.target.value); action.clearFeedback() }}>{can('inventory.issue.post') && <option value="issue">Dispatch selected quantities</option>}{can('inventory.reservation.manage') && <><option value="release">Release selected quantities</option><option value="cancel">Cancel all remaining quantities</option></>}</select></Field>
          <Field label={mode === 'issue' ? 'Dispatch description' : 'Release reason'} required maxLength={255} value={reason} onChange={e => setReason(e.target.value)} />
          {mode === 'issue' && <><Field label="Dispatch reference" required maxLength={64} pattern="[A-Za-z0-9._:\-]+" value={dispatch.reference} onChange={e => setDispatch(d => ({ ...d, reference: e.target.value }))} /><Field label="Physical dispatch date" required type="date" value={dispatch.dispatchDate} onChange={e => setDispatch(d => ({ ...d, dispatchDate: e.target.value }))} /><Field label="Dispatch posting date" required type="date" value={dispatch.postingDate} onChange={e => setDispatch(d => ({ ...d, postingDate: e.target.value }))} /><ProductPicker base={base} resource="movement-types" revision={revision} label="Issue movement type" required value={dispatch.movementTypeId} onChange={movementTypeId => setDispatch(d => ({ ...d, movementTypeId }))} /></>}
        </fieldset>
        <p className="mt-3 text-sm text-slate-600">{mode === 'issue' ? 'Choose a movement type with the Issue effect. Dispatch reduces physical and pool stock using the reserved source layers. Financial posting, ownership transfer and customs clearance are separate events.' : mode === 'cancel' ? 'Release all unissued quantities. Earlier dispatches and release history are retained.' : 'Set quantities on the lines above. Later source allocations are released first, retaining earlier FIFO stock.'}</p>
        {mode !== 'cancel' && <p className="mt-2 text-sm">{Object.values(quantities).filter(q => q.trim()).length} lines selected across all pages.</p>}
        <Feedback error={action.error} message={action.message} />
        <Button type="submit" className="mt-3" disabled={action.busy || (mode !== 'cancel' && !Object.values(quantities).some(q => q.trim()))}>{action.busy ? 'Saving…' : mode === 'issue' ? 'Post dispatch' : mode === 'cancel' ? 'Cancel remaining reservation' : 'Release selected quantities'}</Button>
      </Form>}
      {!writable && <Feedback error={action.error} message={action.message} />}
      <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">Reserved source layers</summary><LoadState result={allocations} label="source allocations" />{allocations.data && <><Table columns={['Line', 'Pool', 'Receipt / source line', 'Layer', 'Reserved', 'Released', 'Issued']} rows={allocations.data.items} empty="No allocations." render={a => <><Cell>{a.lineNumber}</Cell><Cell>{a.poolCode}</Cell><Cell>{a.sourceId} / {a.sourceLineKey}<br />{a.receivedDate}</Cell><Cell><span className="inline-block min-w-64 max-w-80 break-all">{a.layerId}</span></Cell><Cell>{a.reservedQuantity}</Cell><Cell>{a.releasedQuantity}</Cell><Cell>{a.issuedQuantity}</Cell></>} /><Pager data={allocations.data} offset={allocationOffset} setOffset={setAllocationOffset} /></>}</details>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Release history</summary><LoadState result={history} label="release history" />{history.data && <><Table columns={['Action', 'Reason', 'By', 'Date']} rows={history.data.items} empty="No releases." render={h => <><Cell>{h.kind}</Cell><Cell>{h.reason}</Cell><Cell>{h.createdByName}</Cell><Cell>{new Date(h.createdAt).toLocaleString()}</Cell></>} /><Pager data={history.data} offset={historyOffset} setOffset={setHistoryOffset} /></>}</details>
    </>}
  </div>
}
export function IssuesPanel({ base, revision }) {
  const [selected, setSelected] = useState(null)
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, 'issues', { limit: 25, offset }, revision)
  if (selected) return <IssueDetail base={base} id={selected} revision={revision} onBack={() => setSelected(null)} />
  return <div className="mt-6 min-w-0"><p className="text-sm text-slate-600">Posted physical dispatches and their exact receipt source consumption. Create a dispatch from an active reservation.</p><LoadState result={list} label="dispatches" />{list.data && <><Table columns={['Reference', 'Reservation', 'Dispatched', 'Posting date', 'Stock cost', 'Details']} rows={list.data.items} empty="No posted dispatches yet." render={r => <><Cell>{r.reference}</Cell><Cell>{r.reservationReference}</Cell><Cell>{r.dispatchDate}</Cell><Cell>{r.postingDate}</Cell><Cell>{r.totalValue} {r.currency}</Cell><Cell><Button variant="outline" aria-label={`View dispatch ${r.reference}`} onClick={() => setSelected(r.id)}>View</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</div>
}
function IssueDetail({ base, id, revision, onBack }) {
  const [offset, setOffset] = useState(0)
  const detail = useProducts(base, `issues/${id}`, {}, revision)
  const lines = useProducts(base, `issues/${id}/lines`, { limit: 25, offset }, revision)
  const r = detail.data?.issue
  return <div className="mt-6 min-w-0"><Button variant="outline" onClick={onBack}>Back from dispatch</Button><LoadState result={detail} label="dispatch" />{r && <><h2 className="mt-4 break-all text-lg font-semibold">Dispatch {r.reference}</h2><p className="mt-2 text-sm">{r.status} · Reservation {r.reservationReference}</p><p className="mt-2 text-sm">Dispatched: {r.dispatchDate} · Posted: {r.postingDate}</p><p className="mt-2 text-sm">Stock cost consumed: {r.totalValue} {r.currency}</p><p className="mt-2 break-words text-sm">{r.description} · Posted by {r.createdByName}</p><LoadState result={lines} label="consumed source layers" />{lines.data && <><Table columns={['Line / SKU', 'Pool', 'Quantity', 'Stock cost', 'Receipt / source line', 'Layer']} rows={lines.data.items} empty="No consumption lines." render={l => <><Cell>{l.lineNumber} / {l.skuCode}</Cell><Cell>{l.poolCode}</Cell><Cell>{l.quantity}</Cell><Cell>{l.value} {r.currency}</Cell><Cell>{l.sourceId} / {l.sourceLineKey}</Cell><Cell><span className="inline-block min-w-64 max-w-80 break-all">{l.layerId}</span></Cell></>} /><Pager data={lines.data} offset={offset} setOffset={setOffset} /></>}</>}</div>
}
