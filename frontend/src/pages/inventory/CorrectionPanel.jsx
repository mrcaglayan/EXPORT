import { useState } from 'react'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from '@/pages/products/useProducts'
import { ProductFormShell as Form, ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

const NumberCell = ({ children }) => <Cell><span className="whitespace-nowrap">{children}</span></Cell>
export default function CorrectionPanel({ base, revision, onSaved }) {
  const { can } = useAuth()
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(null)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('')
  const list = useProducts(base, 'corrections', { limit: 25, offset, ...(status && { status }) }, revision)
  if (selected) return <CorrectionDetail key={selected} base={base} id={selected} revision={revision} onSaved={onSaved} onBack={() => setSelected(null)} />
  return <div className="mt-6 min-w-0 space-y-4">
    <p className="text-sm text-slate-600">Record physical counts, approved valuation changes or exact reversals against existing stock sources. Another authorized person must approve before posting. Source records and earlier close versions remain available.</p>
    {can('inventory.correction.request') && <div className="flex flex-wrap gap-2">{[['COUNT', 'New physical count'], ['REVALUATION', 'New revaluation'], ['REVERSAL', 'Reverse a movement']].map(([kind, label]) => <Button key={kind} variant="outline" onClick={() => setCreating(kind)}>{label}</Button>)}</div>}
    {creating && <CorrectionForm key={creating} kind={creating} base={base} revision={revision} onSaved={onSaved} onCancel={() => setCreating(null)} onCreated={id => { setCreating(null); setSelected(id) }} />}
    <div className="max-w-xs"><Field label="Correction status"><select className={inputStyle} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">All corrections</option>{['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'POSTED'].map(s => <option key={s}>{s}</option>)}</select></Field></div>
    <LoadState result={list} label="stock corrections" />
    {list.data && <><Table columns={['Reference', 'Kind', 'Posting date', 'Status', 'Details']} rows={list.data.items} empty="No stock corrections yet." render={r => <><Cell>{r.reference}</Cell><Cell>{r.kind}</Cell><NumberCell>{r.postingDate}</NumberCell><Cell>{r.status}</Cell><Cell><Button variant="outline" aria-label={`View correction ${r.reference}`} onClick={() => setSelected(r.id)}>View</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </div>
}
function CorrectionForm({ kind, base, revision, onSaved, onCancel, onCreated }) {
  const [form, setForm] = useState({ reference: '', postingDate: '', reason: '', evidence: '' })
  const [lines, setLines] = useState([])
  const [event, setEvent] = useState(null)
  const [offset, setOffset] = useState(0)
  const action = useAccountingMutation(base, onSaved)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  async function submit(e) {
    e.preventDefault()
    const body = { ...form, kind, ...(kind === 'REVERSAL' ? { originalEventId: event.eventId } : { lines: lines.map(l => ({ layerId: l.layerId, poolId: l.poolId, [kind === 'COUNT' ? 'observedQuantity' : 'targetValue']: l.target })) }) }
    const result = await action.submit('corrections', body, 'Correction submitted for independent review.')
    if (result) onCreated(result.correction.id)
  }
  const add = row => { setLines(current => current.some(l => l.id === row.id) ? current : [...current, { ...row, target: '' }]); setOffset(0) }
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h2 className="font-semibold">{kind === 'COUNT' ? 'Physical count' : kind === 'REVALUATION' ? 'Stock revaluation' : 'Exact movement reversal'}</h2>
    {kind === 'REVERSAL' ? <><p className="mt-2 text-sm">Select one original event. The request reverses every line of that event at its original value. Returned dispatch stock becomes available; it does not reopen an old reservation.</p><MovementBrowser base={base} revision={revision} onSelect={setEvent} />{event && <p role="status" className="mt-3 break-words text-sm">Selected event: {event.reference} · {event.eventKind} · {event.postingDate}</p>}</> : <><p className="mt-2 text-sm">{kind === 'COUNT' ? 'Enter the observed quantity for each selected source layer and pool. Variance is valued at remaining carrying cost; an empty source uses its original unit cost.' : 'Enter the approved total carrying value for each selected source layer and pool. Quantity stays unchanged; stock must be on hand.'} No GL or VAT journal is created.</p><StockChoices base={base} revision={revision} onAdd={add} selected={lines} /></>}
    <Form aria-label="Stock correction form" onSubmit={submit} className="mt-4">
      <fieldset disabled={action.busy} className="space-y-4">
        {kind !== 'REVERSAL' && <><Table columns={['Source / pool', 'Current quantity / value', kind === 'COUNT' ? 'Observed quantity' : 'Target value', 'Remove']} rows={lines.slice(offset, offset + 25)} empty="Choose source stock below or above to add correction lines." render={l => <><Cell><span className="inline-block min-w-40">{l.skuCode} · {l.poolCode}<br />{l.sourceId} / {l.sourceLineKey}</span></Cell><NumberCell>{l.quantity}<br />{l.value}</NumberCell><Cell><Field label={`${kind === 'COUNT' ? 'Observed quantity' : 'Target value'} ${l.sourceId} / ${l.sourceLineKey} / ${l.poolCode}`} required inputMode="decimal" value={l.target} onChange={e => setLines(rows => rows.map(r => r.id === l.id ? { ...r, target: e.target.value } : r))} /></Cell><Cell><Button type="button" variant="outline" aria-label={`Remove correction line ${l.id}`} onClick={() => { setLines(rows => rows.filter(r => r.id !== l.id)); setOffset(0) }}>Remove</Button></Cell></>} /><Pager data={{ total: lines.length, limit: 25 }} offset={offset} setOffset={setOffset} /></>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Correction reference" required maxLength={64} pattern="[A-Za-z0-9._:\-]+" value={form.reference} onChange={e => set('reference', e.target.value)} /><Field label="Correction posting date" required type="date" value={form.postingDate} onChange={e => set('postingDate', e.target.value)} /><Field label="Correction reason" required maxLength={255} value={form.reason} onChange={e => set('reason', e.target.value)} /><Field label="Evidence reference" required maxLength={255} value={form.evidence} onChange={e => set('evidence', e.target.value)} /></div>
        <p className="text-sm text-slate-600">A request does not reserve stock. If its source changes before approval or posting, cancel it and prepare a new request.</p>
        <Feedback error={action.error} /><div className="flex flex-wrap gap-2"><Button type="submit" disabled={kind === 'REVERSAL' ? !event : !lines.length || lines.some(l => !l.target.trim())}>Submit correction</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel correction form</Button></div>
      </fieldset>
    </Form>
  </section>
}
function StockChoices({ base, revision, selected, onAdd }) {
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({})
  const list = useProducts(base, 'pool-balances', { ...filters, limit: 25, offset }, revision)
  return <details open className="mt-4 min-w-0"><summary className="cursor-pointer text-sm font-semibold">Choose source stock</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{[['warehouses', 'warehouseId', 'Count warehouse'], ['skus', 'skuId', 'Count SKU'], ['pools', 'poolId', 'Count pool']].map(([resource, key, label]) => <ProductPicker key={key} base={base} resource={resource} label={label} value={filters[key]} revision={revision} activeOnly={false} onChange={v => { setFilters(f => { const next = { ...f }; if (v) next[key] = v; else delete next[key]; return next }); setOffset(0) }} />)}</div><LoadState result={list} label="source stock choices" />{list.data && <><Table columns={['Source / SKU', 'Warehouse / pool', 'Quantity / value', 'Select']} rows={list.data.items} empty="No source stock is available." render={r => <><Cell>{r.sourceId} / {r.sourceLineKey}<br />{r.skuCode}</Cell><Cell>{r.warehouseCode} / {r.poolCode}</Cell><NumberCell>{r.quantity}<br />{r.value}</NumberCell><Cell><Button variant="outline" aria-label={`Add source ${r.sourceId} / ${r.sourceLineKey} / ${r.poolCode}`} disabled={selected.some(l => l.id === r.id)} onClick={() => onAdd(r)}>Add</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</details>
}
function CorrectionDetail({ base, id, revision, onSaved, onBack }) {
  const { can, profile } = useAuth()
  const [reason, setReason] = useState('')
  const [offset, setOffset] = useState(0)
  const detail = useProducts(base, `corrections/${id}`, {}, revision)
  const list = useProducts(base, `corrections/${id}/lines`, { limit: 25, offset }, revision)
  const action = useAccountingMutation(base, onSaved)
  const c = detail.data?.correction, own = c?.requestedBy === profile.user.id
  const review = c?.status === 'REQUESTED' && can('inventory.correction.review')
  const cancel = own && ['REQUESTED', 'APPROVED'].includes(c?.status) && can('inventory.correction.request')
  const post = c?.status === 'APPROVED' && can('inventory.correction.post')
  const act = verb => action.submit(`corrections/${id}/${verb}`, { reason }, 'Correction updated.')
  return <div className="mt-6 min-w-0 space-y-4"><Button variant="outline" onClick={onBack}>Back to corrections</Button><LoadState result={detail} label="stock correction" />{c && <><h2 className="break-all text-lg font-semibold">Correction {c.reference}</h2><p className="text-sm">{c.kind} · {c.postingDate} · Status: <strong>{c.status}</strong></p><p className="break-words text-sm">Reason: {c.reason}<br />Evidence: {c.evidence}<br />Requested by: {c.requestedByName}</p>{c.originalEventId && <p className="break-all text-sm">Original event: {c.originalEventId}</p>}{c.eventId && <p className="break-all text-sm">Posted event: {c.eventId}</p>}{c.reviewedByName && <p className="text-sm">Review: {c.reviewReason} · {c.reviewedByName}</p>}{c.cancelReason && <p className="text-sm">Cancellation: {c.cancelReason}</p>}{review && own && <p className="text-sm text-amber-800">Another authorized person must approve this correction.</p>}{(review || cancel || post) && <><div className="max-w-xl"><Field label="Correction action reason" required maxLength={255} value={reason} onChange={e => setReason(e.target.value)} /></div><div className="flex flex-wrap gap-2">{review && <><Button disabled={own || action.busy || !reason.trim()} onClick={() => act('approve')}>Approve correction</Button><Button variant="outline" disabled={action.busy || !reason.trim()} onClick={() => act('reject')}>Reject correction</Button></>}{cancel && <Button variant="outline" disabled={action.busy || !reason.trim()} onClick={() => act('cancel')}>Cancel correction</Button>}{post && <Button disabled={action.busy || !reason.trim()} onClick={() => act('post')}>Post correction</Button>}</div></>}<Feedback error={action.error} message={action.message} /><LoadState result={list} label="retained correction lines" />{list.data && <><Table columns={['Line / source', 'SKU / warehouse / pool', 'Before quantity / value', 'Quantity / value change', 'Count / target value']} rows={list.data.items} empty="No retained source lines." render={l => <><Cell><span className="inline-block min-w-40">{l.lineNumber} · {l.sourceId} / {l.sourceLineKey}</span></Cell><Cell>{l.skuCode}<br />{l.warehouseCode} / {l.poolCode}</Cell><NumberCell>{l.beforeQuantity}<br />{l.beforeValue}</NumberCell><NumberCell>{l.quantity}<br />{l.value}</NumberCell><NumberCell>{l.observedQuantity ?? '—'}<br />{l.targetValue ?? '—'}</NumberCell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</>}</div>
}
export function MovementPanel({ base, revision }) {
  const integrity = useProducts(base, 'integrity', {}, revision)
  return <div className="mt-6 min-w-0 space-y-4"><LoadState result={integrity} label="stock integrity" />{integrity.data && <div className="rounded-lg border border-slate-200 p-4 text-sm"><h2 className="font-semibold">Stock integrity: {integrity.data.status}</h2><p className="mt-2">Physical stock, source layers, pool allocations and reservations are checked against their ledgers. GL comparison is available under Trial balance & close.</p><ul className="mt-2 space-y-1">{integrity.data.checks.map(c => <li key={c.grain}>{c.grain}: {c.checked} checked · {c.invalid} invalid</li>)}</ul></div>}<MovementBrowser base={base} revision={revision} /></div>
}
function MovementBrowser({ base, revision, onSelect }) {
  const [grain, setGrain] = useState('PHYSICAL')
  const [cursors, setCursors] = useState([null])
  const [filters, setFilters] = useState({})
  const cursor = cursors.at(-1)
  const list = useProducts(base, 'movements', { grain, ...filters, limit: 25, ...(cursor && { cursor }) }, revision)
  return <section className="mt-4 min-w-0 space-y-3"><div className="max-w-xs"><Field label="Movement stock view"><select className={inputStyle} value={grain} onChange={e => { setGrain(e.target.value); setCursors([null]) }}><option value="PHYSICAL">Physical stock</option><option value="POOL">Destination pools</option></select></Field></div><details><summary className="cursor-pointer text-sm">Filter movement history</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{[['warehouses', 'warehouseId', 'Movement warehouse'], ['skus', 'skuId', 'Movement SKU']].map(([resource, key, label]) => <ProductPicker key={key} base={base} resource={resource} label={label} revision={revision} value={filters[key]} activeOnly={false} onChange={v => { setFilters(f => { const next = { ...f }; if (v) next[key] = v; else delete next[key]; return next }); setCursors([null]) }} />)}</div></details><p className="text-sm text-slate-600">Newest recorded events first. Use the page controls to browse older movements; return to the first page for new events.</p><LoadState result={list} label="movement history" />{list.data && <><Table columns={['Posting date / reference', 'Event', 'SKU / warehouse / pool', 'Quantity / value', 'Lineage', ...(onSelect ? ['Select'] : [])]} rows={list.data.items} empty="No stock movements yet." render={r => <><Cell>{r.postingDate}<br />{r.reference}</Cell><Cell>{r.correctionKind ?? r.eventKind}</Cell><Cell>{r.skuCode}<br />{r.warehouseCode}{r.poolCode && ` / ${r.poolCode}`}</Cell><NumberCell>{r.quantity}<br />{r.value}</NumberCell><Cell>{r.reversesEventId ? <span className="inline-block min-w-40 break-all">Reverses {r.reversesEventId}</span> : r.reversedByEventId ? 'Reversed' : 'Original movement'}</Cell>{onSelect && <Cell><Button variant="outline" aria-label={`Select reversal event ${r.reference}`} disabled={!!r.reversedByEventId || r.correctionKind === 'REVERSAL'} onClick={() => onSelect(r)}>Select event</Button></Cell>}</>} /><div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Page {cursors.length}</span><div className="flex gap-2"><Button variant="outline" disabled={cursors.length === 1} onClick={() => setCursors([null])}>First page</Button><Button variant="outline" disabled={cursors.length === 1} onClick={() => setCursors(c => c.slice(0, -1))}>Newer movements</Button><Button variant="outline" disabled={!list.data.hasMore} onClick={() => setCursors(c => [...c, list.data.nextCursor])}>Older movements</Button></div></div></>}</section>
}
