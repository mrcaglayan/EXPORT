import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle, Table, Cell } from '@/pages/accounting/accounting-ui'
import { useDebouncedValue, useProducts as useMetadata } from '@/pages/products/useProducts'
import { ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import InventoryForm from './InventoryForm'

const labels = { warehouses: 'warehouse', pools: 'pool', periods: 'inventory period', 'movement-types': 'movement type' }
const descriptions = {
  warehouses: 'Physical storage locations. Create one warehouse for one physical site.',
  pools: 'GENERAL and country pools are virtual allocations within your warehouses. Creating a pool creates no stock, value or journal.',
  periods: 'Inventory periods use your accounting calendar. Configure fiscal years and periods in Accounting first. Inventory closing and reconciliation will be available in a later step.',
  'movement-types': 'Define names and intended effects for future stock movements. This setup does not post movements or journals.',
};
export default function InventoryPanel({ base, resource, revision, onSaved, canConfigure }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [kind, setKind] = useState('')
  const [offset, setOffset] = useState(0)
  const [editor, setEditor] = useState(null)
  const [message, setMessage] = useState('')
  const search = useDebouncedValue(q)
  const isAudit = resource === 'audit-events'
  const isPeriod = resource === 'periods'
  const request = useMetadata(base, resource, { offset, limit: 25, ...(!isAudit && { q: search }), ...(filter && { [isPeriod ? 'status' : 'active']: filter }), ...(kind && { kind }) }, revision)
  const list = search === q ? request : { ...request, loading: true, data: null }
  return <div className="mt-6">
    {!isAudit && <>
      <p className="text-sm text-slate-600">{descriptions[resource]}</p>
      <div className="mt-4 grid items-end gap-4 sm:grid-cols-3">
        <Field label="Search inventory setup" placeholder="Code or name" maxLength={160} value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} />
        <Field label="Filter status"><select className={inputStyle} value={filter} onChange={e => { setFilter(e.target.value); setOffset(0) }}><option value="">All statuses</option>{isPeriod ? ['OPEN', 'IN_REVIEW', 'CLOSED'].map(value => <option key={value}>{value}</option>) : <><option value="true">Active</option><option value="false">Inactive</option></>}</select></Field>
        {canConfigure && <Button onClick={() => { setEditor({}); setMessage('') }}>Add {labels[resource]}</Button>}
      </div>
      {resource === 'pools' && <div className="mt-4 max-w-xs"><Field label="Filter pool kind"><select className={inputStyle} value={kind} onChange={e => { setKind(e.target.value); setOffset(0) }}><option value="">All kinds</option><option>GENERAL</option><option>COUNTRY</option></select></Field></div>}
      {(q || filter || kind) && <Button variant="outline" className="mt-3" onClick={() => { setQ(''); setFilter(''); setKind(''); setOffset(0) }}>Clear filters</Button>}
    </>}
    {editor && <InventoryForm key={editor.id ?? 'new'} base={base} resource={resource} revision={revision} initial={editor.id ? editor : null} onSaved={() => { setMessage(`${labels[resource]} saved.`); onSaved() }} onCancel={() => setEditor(null)} />}
    <Feedback message={message} />
    <LoadState result={list} label="inventory setup" />
    {list.data && <>
      {isAudit ? <Table columns={['When', 'Action', 'Record', 'Changes']} rows={list.data.items} empty="No inventory setup changes yet." render={row => <>
        <Cell>{new Date(row.createdAt).toLocaleString()}</Cell><Cell>{row.action}</Cell><Cell>{row.details.after?.code ?? row.resourceId}</Cell><Cell><details><summary className="cursor-pointer">View change</summary><pre className="mt-2 max-w-sm whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.details, null, 2)}</pre><p className="mt-2 text-xs">Actor: {row.actorId}<br />Reference: {row.requestId}</p></details></Cell>
      </>} /> : <Table columns={['Code', ...(isPeriod ? ['Dates', 'Inventory status', 'Accounting status'] : ['Name', ...(resource === 'warehouses' ? ['Location'] : resource === 'pools' ? ['Kind', 'Country'] : ['Effect']), 'Status', ...(canConfigure ? ['Actions'] : [])])]} rows={list.data.items}
        empty={q || filter || kind ? 'No matching records. Change or clear the filters.' : `No ${resource.replaceAll('-', ' ')} configured yet.`} render={row => <>
          <Cell><span className="font-medium">{row.code}</span></Cell>
          {isPeriod ? <><Cell>{row.startDate} → {row.endDate}</Cell><Cell>{row.status}</Cell><Cell>{row.accountingStatus}</Cell></> : <>
            <Cell>{row.name}</Cell>{resource === 'warehouses' ? <Cell>{row.location || '—'}</Cell> : resource === 'pools' ? <><Cell>{row.kind}</Cell><Cell>{row.countryCode ?? '—'}</Cell></> : <Cell>{row.effect}</Cell>}
            <Cell>{row.active ? 'Active' : 'Inactive'}</Cell>{canConfigure && <Cell><Button variant="outline" aria-label={`Edit ${row.code}`} onClick={() => { setEditor(row); setMessage('') }}>Edit</Button></Cell>}
          </>}
        </>} />}
      <Pager data={list.data} offset={offset} setOffset={setOffset} />
    </>}
  </div>
}
