import { useState } from 'react'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from '@/pages/products/useProducts'
import { ProductFormShell as Form, ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

const NumberCell = ({ children }) => <Cell><span className="whitespace-nowrap">{children}</span></Cell>
const blockerLabels = {
  TRY_BASE_CURRENCY_REQUIRED: 'Configure TRY as the company base currency.',
  GL_NOT_CONFIGURED: 'Select the inventory asset accounts to compare with stock.',
  GL_MISMATCH: 'Stock value and the selected GL account balances differ.',
  GL_ACCOUNT_UNAVAILABLE: 'A selected inventory asset account is inactive or unavailable.',
  INVALID_HISTORICAL_STOCK: 'Period-end stock or reservations contain an invalid quantity or value.',
  POOL_PHYSICAL_MISMATCH: 'Pool quantities or values do not reconcile to physical stock.',
  PROJECTION_MISMATCH: 'Current stock balances do not reconcile to the movement ledger.',
  RESERVATION_WITHOUT_STOCK: 'A reservation has no matching period-end stock.',
  UNPOSTED_REQUESTS: 'Resolve pending or failed accounting posting requests.',
  UNPOSTED_JOURNALS: 'Resolve unposted journals through this period.',
  INCOMPLETE_STOCK_EVENT: 'An incomplete stock operation needs investigation.',
}
export default function PeriodClosePanel({ base, revision, onSaved }) {
  const { can } = useAuth()
  const [periodId, setPeriodId] = useState(null)
  return <div className="mt-6 min-w-0 space-y-5">
    <div className="max-w-lg"><ProductPicker base={base} resource="periods" revision={revision} label="Report period" value={periodId} onChange={setPeriodId} activeOnly={false} /></div>
    {periodId ? <PeriodReport key={periodId} base={base} periodId={periodId} revision={revision} onSaved={onSaved} /> : <p className="text-sm text-slate-600">Choose an inventory period to review its stock trial balance and close history.</p>}
    {can('inventory.reconciliation.read') && <Mapping base={base} revision={revision} onSaved={onSaved} />}
  </div>
}
function PeriodReport({ base, periodId, revision, onSaved }) {
  const { can } = useAuth()
  const [snapshotId, setSnapshotId] = useState(null)
  const [grain, setGrain] = useState('PHYSICAL')
  const [groupBy, setGroupBy] = useState('layer')
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({})
  const [movement, setMovement] = useState(null)
  const status = useProducts(base, `periods/${periodId}/close-status`, {}, revision)
  const params = { periodId, grain, groupBy, limit: 25, offset, ...filters, ...(snapshotId && { snapshotId }) }
  const report = useProducts(base, 'trial-balance', params, revision)
  const financial = useProducts(base, 'reconciliation', { periodId, ...(snapshotId && { snapshotId }) }, revision, can('inventory.reconciliation.read'))
  const p = status.data?.period, data = report.data
  const chooseSnapshot = id => { setSnapshotId(id); setOffset(0); setMovement(null) }
  const setFilter = (key, value) => { setFilters(f => { const next = { ...f }; if (value) next[key] = value; else delete next[key]; return next }); setOffset(0); setMovement(null) }
  return <div className="min-w-0 space-y-5">
    <LoadState result={status} label="period status" />
    {p && <p className="text-sm">{p.code} · {p.startDate} → {p.endDate} · Inventory: <strong>{p.status}</strong> · Accounting: {p.accountingStatus}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Stock view"><select className={inputStyle} value={grain} onChange={e => { setGrain(e.target.value); setOffset(0); setMovement(null); if (e.target.value === 'PHYSICAL') { setGroupBy(g => g === 'pool' ? 'layer' : g); setFilters(current => { const next = { ...current }; delete next.poolId; return next }) } }}><option value="PHYSICAL">Physical stock</option><option value="POOL">Destination pools</option></select></Field>
      <Field label="Group stock by"><select className={inputStyle} value={groupBy} onChange={e => { setGroupBy(e.target.value); setOffset(0); setMovement(null) }}>{['layer', 'sku', 'family', 'warehouse', ...(grain === 'POOL' ? ['pool'] : [])].map(g => <option key={g} value={g}>{g === 'sku' ? 'SKU' : g === 'layer' ? 'Source layer' : g[0].toUpperCase() + g.slice(1)}</option>)}</select></Field>
      <div className="flex items-end"><Button variant="outline" onClick={() => { setFilters({}); setOffset(0); setMovement(null) }}>Clear report filters</Button></div>
    </div>
    <details><summary className="cursor-pointer text-sm font-medium">Filter warehouse, SKU or pool</summary><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
      <ProductPicker base={base} resource="warehouses" revision={revision} label="Report warehouse" value={filters.warehouseId} onChange={value => setFilter('warehouseId', value)} activeOnly={false} />
      <ProductPicker base={base} resource="skus" revision={revision} label="Report SKU" value={filters.skuId} onChange={value => setFilter('skuId', value)} activeOnly={false} />
      {grain === 'POOL' && <ProductPicker base={base} resource="pools" revision={revision} label="Report pool" value={filters.poolId} onChange={value => setFilter('poolId', value)} activeOnly={false} />}
    </div></details>
    <LoadState result={report} label="stock trial balance" />
    {data && <>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-semibold">{data.snapshot ? `${data.snapshot.watermark} · version ${data.snapshot.version}` : 'LIVE · not approved'}</p>
        <p className="mt-2">Closing stock value in this view: {data.filteredClosingValue} {data.summary.currency ?? '—'}</p>
        <p className="mt-2 text-slate-600">Opening + incoming − outgoing = closing. Quantities with different units stay separate. Reserved stock remains part of on-hand stock.</p>
        <p className="mt-2 text-slate-600">Reservations are shown at period end. Releases take effect at their recorded UTC time; dispatch uses its posting date.</p>
        {data.snapshot && <details className="mt-2"><summary className="cursor-pointer">Snapshot record</summary><p className="mt-2">Prepared: {new Date(data.snapshot.preparedAt).toLocaleString()}</p><p className="mt-1 break-all">Fingerprint: {data.snapshot.contentHash}</p></details>}
      </div>
      <Table columns={['Stock / unit', 'Opening qty / value', 'Incoming qty / value', 'Outgoing qty / value', 'Closing qty / value', 'Reserved', 'Available', 'Movements']} rows={data.items} empty="No stock movements or carried balances in this view." render={r => <>
        <Cell><span className="inline-block min-w-32">{groupBy === 'layer' ? `${r.skuCode} · ${r.warehouseCode}${r.poolCode ? ` · ${r.poolCode}` : ''}` : r[`${groupBy}Code`]}<br />{r.unitCode}{groupBy === 'layer' && <><br /><span className="text-xs text-slate-500">{r.sourceId} / {r.sourceLineKey}</span></>}</span></Cell>
        {['opening', 'incoming', 'outgoing', 'closing'].map(k => <NumberCell key={k}><span>{r[`${k}Quantity`]}</span><br /><span className="text-xs text-slate-500">{r[`${k}Value`]} {data.summary.currency}</span></NumberCell>)}
        {['reservedQuantity', 'availableQuantity'].map(k => <NumberCell key={k}>{r[k]}</NumberCell>)}
        <Cell><Button variant="outline" aria-label={`View movements ${r.id}`} onClick={() => setMovement({ ...filters, ...Object.fromEntries(['warehouseId', 'skuId', 'familyId', 'poolId', 'layerId'].filter(k => r[k]).map(k => [k, r[k]])) })}>View</Button></Cell>
      </>} /><Pager data={data} offset={offset} setOffset={setOffset} />
      {movement && <MovementDetail key={JSON.stringify([movement, snapshotId, grain])} base={base} revision={revision} params={{ periodId, grain, ...movement, ...(data.snapshot && { snapshotId: data.snapshot.id }) }} onBack={() => setMovement(null)} />}
    </>}
    {can('inventory.reconciliation.read') && <><LoadState result={financial} label="stock and GL comparison" />{financial.data && <Reconciliation summary={financial.data.summary} />}</>}
    {p && <CloseWorkflow base={base} period={p} snapshotId={snapshotId} revision={revision} onSaved={onSaved} onSelected={chooseSnapshot} financial={financial.data} />}
    <SnapshotHistory base={base} periodId={periodId} revision={revision} onSelected={chooseSnapshot} />
    {snapshotId && <Button variant="outline" onClick={() => chooseSnapshot(null)}>Show current report</Button>}
    <Reopens base={base} periodId={periodId} revision={revision} onSaved={onSaved} onReopened={() => chooseSnapshot(null)} />
  </div>
}
function Reconciliation({ summary }) {
  const f = summary.financial
  return <div className="rounded-lg border border-slate-200 p-4 text-sm">
    <h2 className="font-semibold">Stock and GL comparison: {f.status}</h2>
    <dl className="mt-3 grid gap-2 sm:grid-cols-3"><div><dt>Stock value</dt><dd>{f.stockValue} {summary.currency}</dd></div><div><dt>Selected GL accounts</dt><dd>{f.glValue} {summary.currency}</dd></div><div><dt>Difference</dt><dd>{f.difference} {summary.currency}</dd></div></dl>
    <p className="mt-3">Accounts: {f.accounts.map(a => a.code).join(', ') || 'Not configured'}</p>
    <p className="mt-2 text-slate-600">This compares existing posted journals with stock value. It does not create accounting entries or establish VAT eligibility.</p>
    {summary.blockers.length > 0 ? <ul className="mt-3 list-disc space-y-1 pl-5 text-rose-800">{summary.blockers.map(code => <li key={code}>{blockerLabels[code] ?? code}</li>)}</ul> : <p className="mt-3 text-teal-800">Stock and financial checks reconcile.</p>}
  </div>
}
function CloseWorkflow({ base, period: p, snapshotId, revision, onSaved, onSelected, financial }) {
  const { can, profile } = useAuth()
  const [reason, setReason] = useState('')
  const action = useAccountingMutation(base, onSaved)
  const reviewId = p.pendingSnapshotId
  const review = useProducts(base, `snapshots/${reviewId}`, {}, revision, !!reviewId && can('inventory.period.approve'))
  const own = review.data?.snapshot.preparedBy === profile.user.id
  const mayPrepare = can('inventory.period.prepare') && can('inventory.reconciliation.read') && p.status === 'OPEN'
  const mayReview = can('inventory.period.approve') && can('inventory.reconciliation.read') && p.status === 'IN_REVIEW'
  const mayReopen = can('inventory.period.reopen') && can('accounting.period.close') && p.status === 'CLOSED'
  if (!mayPrepare && !mayReview && !mayReopen) return null
  async function submit(event) {
    event.preventDefault()
    const kind = event.nativeEvent.submitter?.value
    const path = kind === 'prepare' ? `periods/${p.id}/prepare-close` : kind === 'reopen' ? `periods/${p.id}/reopens` : `snapshots/${reviewId}/${kind}`
    const result = await action.submit(path, { reason }, kind === 'prepare' ? 'Close snapshot prepared for independent review.' : kind === 'reopen' ? 'Reopen request saved for independent review.' : kind === 'approve' ? 'Stock period closed.' : 'Review rejected; stock period reopened.')
    if (result?.snapshot) onSelected(result.snapshot.status === 'REJECTED' ? null : result.snapshot.id)
  }
  return <Form aria-label="Stock close action" onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <fieldset disabled={action.busy} className="space-y-3"><Field label="Close or reopen reason" required maxLength={255} value={reason} onChange={e => setReason(e.target.value)} />
      {mayPrepare && <p className="text-sm text-slate-600">Preparing freezes a new review version and locks stock posting for this period. Earlier inventory periods must already be closed.</p>}
      {mayReview && <><LoadState result={review} label="review version" /><p className="text-sm">Pending review: version {review.data?.snapshot.version ?? '…'} · prepared by {review.data?.snapshot.preparedByName ?? '…'}.</p>{own && <p className="text-sm text-slate-600">Another authorized user must approve this close. You can reject the review to make corrections.</p>}{snapshotId !== reviewId && <Button type="button" variant="outline" onClick={() => onSelected(reviewId)}>Inspect pending snapshot</Button>}</>}
      {mayReopen && <p className="text-sm text-slate-600">Approval will reopen this period and later closed inventory periods, including their closed accounting calendars. Existing snapshots remain available; affected periods must be recalculated and approved in order.</p>}
      <Feedback error={action.error} message={action.message} />
      <div className="flex flex-wrap gap-2">
        {mayPrepare && <Button type="submit" value="prepare" disabled={!financial || financial.summary.blockers.length > 0 || !!snapshotId}>Prepare close</Button>}
        {mayReview && <><Button type="submit" value="approve" disabled={!review.data || own || snapshotId !== reviewId}>Approve close</Button><Button type="submit" variant="outline" value="reject">Reject close review</Button></>}
        {mayReopen && <Button type="submit" value="reopen">Request reopen</Button>}
      </div>
    </fieldset>
  </Form>
}
function SnapshotHistory({ base, periodId, revision, onSelected }) {
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, `periods/${periodId}/snapshots`, { limit: 25, offset }, revision)
  return <details open className="min-w-0"><summary className="cursor-pointer text-sm font-semibold">Close versions</summary><LoadState result={list} label="close versions" />{list.data && <><Table columns={['Version', 'Watermark', 'Prepared by', 'Reason', 'Report']} rows={list.data.items} empty="No close snapshots yet." render={s => <><Cell>{s.version}</Cell><Cell>{s.watermark}</Cell><Cell>{s.preparedByName}</Cell><Cell>{s.reason}</Cell><Cell><Button variant="outline" aria-label={`Inspect close version ${s.version}`} onClick={() => onSelected(s.id)}>Inspect</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</details>
}
function MovementDetail({ base, params, revision, onBack }) {
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, 'trial-balance/movements', { ...params, limit: 25, offset }, revision)
  return <section className="min-w-0 rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Period movements</h2><Button variant="outline" onClick={onBack}>Hide movements</Button></div><LoadState result={list} label="period movements" />{list.data && <><Table columns={['Posting date', 'Event', 'Reference', 'SKU / pool', 'Quantity', 'Value']} rows={list.data.items} empty="No movements in this period for the selected stock." render={r => <><NumberCell>{r.postingDate}</NumberCell><Cell>{r.kind}</Cell><Cell>{r.reference}</Cell><Cell>{r.skuCode}{r.poolCode && ` / ${r.poolCode}`}</Cell><NumberCell>{r.quantity}</NumberCell><NumberCell>{r.value}</NumberCell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</section>
}
function Reopens({ base, periodId, revision, onSaved, onReopened }) {
  const [selected, setSelected] = useState(null)
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, `periods/${periodId}/reopens`, { limit: 25, offset }, revision)
  return <details open className="min-w-0"><summary className="cursor-pointer text-sm font-semibold">Reopen requests</summary><LoadState result={list} label="reopen requests" />{list.data && <><Table columns={['Status', 'Reason', 'Requested', 'Review']} rows={list.data.items} empty="No reopen requests." render={r => <><Cell>{r.status}</Cell><Cell>{r.reason}</Cell><Cell>{new Date(r.requestedAt).toLocaleString()}</Cell><Cell><Button variant="outline" aria-label={`View reopen ${r.id}`} onClick={() => setSelected(r.id)}>View</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}{selected && <ReopenDetail key={selected} base={base} id={selected} revision={revision} onSaved={onSaved} onReopened={onReopened} onBack={() => setSelected(null)} />}</details>
}
function ReopenDetail({ base, id, revision, onSaved, onReopened, onBack }) {
  const { can, profile } = useAuth()
  const [reason, setReason] = useState('')
  const [offset, setOffset] = useState(0)
  const detail = useProducts(base, `reopens/${id}`, {}, revision)
  const list = useProducts(base, `reopens/${id}/periods`, { limit: 25, offset }, revision)
  const action = useAccountingMutation(base, onSaved)
  const r = detail.data?.reopen
  async function submit(event) {
    event.preventDefault()
    const kind = event.nativeEvent.submitter?.value
    const result = await action.submit(`reopens/${id}/${kind}`, { reason }, kind === 'approve' ? 'Affected periods reopened. Recalculate and close them in order.' : 'Reopen request rejected.')
    if (result && kind === 'approve') onReopened()
  }
  return <section className="mt-4 min-w-0 rounded-lg border border-slate-200 p-4"><Button variant="outline" onClick={onBack}>Hide reopen details</Button><LoadState result={detail} label="reopen request" />{r && <><h2 className="mt-3 font-semibold">Reopen review · {r.status}</h2><p className="mt-2 text-sm">{r.reason} · Requested by {r.requestedByName}</p><LoadState result={list} label="affected periods" />{list.data && <><Table columns={['Affected period', 'Dates', 'Accounting calendar']} rows={list.data.items} empty="No affected periods." render={p => <><Cell>{p.code}</Cell><NumberCell>{p.startDate} → {p.endDate}</NumberCell><Cell>{p.accountingClosed ? 'Will reopen' : 'Already open'}</Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}{r.status === 'REQUESTED' && can('inventory.period.approve') && can('accounting.period.close') && <Form aria-label="Reopen review form" onSubmit={submit} className="mt-4 space-y-3"><fieldset disabled={action.busy} className="space-y-3"><Field label="Reopen review reason" required maxLength={255} value={reason} onChange={e => setReason(e.target.value)} />{r.requestedBy === profile.user.id && <p className="text-sm text-slate-600">Another authorized user must approve this reopen.</p>}<div className="flex flex-wrap gap-2"><Button type="submit" value="approve" disabled={r.requestedBy === profile.user.id}>Approve reopen</Button><Button type="submit" variant="outline" value="reject">Reject reopen</Button></div></fieldset></Form>}<Feedback error={action.error} message={action.message} /></>}</section>
}
function Mapping({ base, revision, onSaved }) {
  const { can } = useAuth()
  const [editing, setEditing] = useState(false)
  const list = useProducts(base, 'reconciliation-accounts', {}, revision)
  return <details className="min-w-0"><summary className="cursor-pointer text-sm font-semibold">Inventory asset accounts</summary><LoadState result={list} label="inventory account mapping" />{list.data && <><p className="mt-3 text-sm">Selected accounts: {list.data.items.map(a => `${a.code} — ${a.name}`).join(', ') || 'None'}</p>{can('inventory.reconciliation.configure') && can('accounting.configure') && can('accounting.read') && <Button variant="outline" className="mt-3" onClick={() => setEditing(true)}>Edit inventory account mapping</Button>}{editing && <MappingForm key={revision} base={base} initial={list.data.items} revision={revision} onSaved={onSaved} onCancel={() => setEditing(false)} />}</>}</details>
}
function MappingForm({ base, initial, revision, onSaved, onCancel }) {
  const [selected, setSelected] = useState(initial)
  const [offset, setOffset] = useState(0)
  const [accountId, setAccountId] = useState('')
  const [reason, setReason] = useState('')
  const list = useProducts(base.replace(/\/inventory$/, '/accounting'), 'accounts', { limit: 25, offset }, revision)
  const action = useAccountingMutation(base, onSaved)
  async function submit(event) { event.preventDefault(); if (await action.submit('reconciliation-accounts', { accountIds: selected.map(a => a.id), reason }, 'Inventory asset accounts saved.')) onCancel() }
  return <Form aria-label="Inventory account mapping" onSubmit={submit} className="mt-4 rounded-lg border border-slate-200 p-4"><fieldset disabled={action.busy} className="space-y-3"><p className="text-sm text-slate-600">Select the asset accounts whose posted balances represent this inventory. Mapping changes require all stock closes to be reopened first.</p><LoadState result={list} label="asset account choices" />{list.data && <><Field label="Inventory asset account"><select className={inputStyle} value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Select an asset account</option>{list.data.items.filter(a => a.active && a.accountType === 'ASSET').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field><Button type="button" variant="outline" disabled={!list.data.items.some(a => a.id === accountId) || selected.some(a => a.id === accountId)} onClick={() => { const chosen = list.data.items.find(a => a.id === accountId); if (chosen) setSelected(s => [...s, chosen]); setAccountId('') }}>Add asset account</Button><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}<ul className="space-y-2 text-sm">{selected.map(a => <li key={a.id} className="flex flex-wrap items-center gap-3"><span>{a.code} — {a.name}</span><Button type="button" variant="outline" aria-label={`Remove mapped account ${a.code}`} onClick={() => setSelected(s => s.filter(x => x.id !== a.id))}>Remove</Button></li>)}</ul><Field label="Account mapping reason" required maxLength={255} value={reason} onChange={e => setReason(e.target.value)} /><Feedback error={action.error} /><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!selected.length}>Save asset accounts</Button><Button variant="outline" onClick={onCancel}>Cancel mapping</Button></div></fieldset></Form>
}
