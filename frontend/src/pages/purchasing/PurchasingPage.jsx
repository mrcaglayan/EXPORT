import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Table, Cell, inputStyle } from '@/pages/accounting/accounting-ui'
import { useProducts, useDebouncedValue } from '@/pages/products/useProducts'
import { ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import PartnerPanel from './PartnerPanel'
import DocumentForm from './DocumentForm'
import DocumentDetail from './DocumentDetail'
import InvoicePanel from './InvoicePanel'

const documentNames = { requests: 'Purchase request', orders: 'Purchase order', contracts: 'Contract' }
export default function PurchasingPage() {
  const { profile, can } = useAuth()
  const base = `/entities/${profile.activeEntity.id}/purchasing`
  const [params, setParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const tabList = useRef(null)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const tabs = [['requests', 'Purchase requests'], ['orders', 'Purchase orders'], ['invoices', 'Invoice imports'], ['contracts', 'Contracts'], ['partners', 'Trading partners'], ...(can('purchasing.audit.read') ? [['audit-events', 'Audit trail']] : [])]
  const tab = tabs.some(([key]) => key === params.get('view')) ? params.get('view') : 'requests'
  const select = id => setParams({ view: tab, ...(id && { id }) })
  useEffect(() => {
    const element = tabList.current
    const showSelected = () => {
      const selected = element?.querySelector('[aria-selected="true"]')
      if (!selected) return
      const box = selected.getBoundingClientRect(), container = element.getBoundingClientRect()
      if (box.left < container.left) element.scrollLeft -= container.left - box.left
      else if (box.right > container.right) element.scrollLeft += box.right - container.right
    }
    showSelected()
    const observer = new ResizeObserver(showSelected)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tab])
  return <Card className="min-w-0 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Purchasing</h1><Button variant="outline" onClick={refresh}>Refresh</Button></div>
    <div ref={tabList} role="tablist" aria-label="Purchasing views" className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">{tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`purchase-tab-${key}`} aria-controls="purchase-panel" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setParams({ view: key })} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
      if (next !== null) { event.preventDefault(); setParams({ view: tabs[next][0] }); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus() }
    }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === key ? 'bg-[#142e35] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}</div>
    <div role="tabpanel" id="purchase-panel" aria-labelledby={`purchase-tab-${tab}`} className="mt-6 min-w-0">
      {tab === 'invoices' ? <InvoicePanel key={params.get('id') ?? 'invoices'} base={base} revision={revision} onSaved={refresh} selected={params.get('id')} onSelect={select} /> : tab === 'partners' ? <PartnerPanel key={params.get('id') ?? 'partners'} base={base} revision={revision} onSaved={refresh} selected={params.get('id')} onSelect={select} /> : tab === 'audit-events' ? <AuditPanel base={base} revision={revision} /> : <DocumentPanel key={`${tab}:${params.get('id') ?? ''}`} base={base} resource={tab} revision={revision} onSaved={refresh} selected={params.get('id')} onSelect={select} />}
    </div>
  </Card>
}
function DocumentPanel({ base, resource, revision, onSaved, selected, onSelect }) {
  const { can } = useAuth()
  const [creating, setCreating] = useState(false), [offset, setOffset] = useState(0), [q, setQ] = useState(''), [status, setStatus] = useState('')
  const search = useDebouncedValue(q)
  const list = useProducts(base, resource, { limit: 25, offset, q: search, ...(status && { status }) }, revision, !selected)
  const label = documentNames[resource]
  if (selected) return <DocumentDetail base={base} resource={resource} id={selected} revision={revision} onSaved={onSaved} onBack={() => onSelect(null)} />
  if (creating) return <DocumentForm base={base} resource={resource} revision={revision} onSaved={onSaved} onCreated={onSelect} onCancel={() => setCreating(false)} />
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">{resource === 'requests' ? 'List the goods and quantities needed. Another authorized person reviews the request before orders can use its lines.' : resource === 'orders' ? 'Order against approved request lines. Pending and approved orders use the remaining requested quantity. Approval records an internal decision; it does not send an order to a supplier.' : 'Record supplier terms and the EBYS reference for independent approval. An order using a contract must match its supplier, currency and validity dates.'}</p>
    {can('purchasing.manage') && <Button onClick={() => setCreating(true)}>New {label.toLowerCase()}</Button>}
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2"><Field label={`Search ${label.toLowerCase()}s`} value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} maxLength={160} /><Field label="Document status"><select className={inputStyle} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">All statuses</option>{['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'].map(s => <option key={s}>{s}</option>)}</select></Field></div>
    <LoadState result={list} label={resource} />
    {list.data && <><Table columns={['Reference / date', 'Purpose / EBYS', 'Supplier', 'Status', 'Details']} rows={list.data.items} empty={`No ${label.toLowerCase()}s yet.`} render={r => <><Cell>{r.reference}<br />{r.documentDate}</Cell><Cell>{r.purpose}<br /><span className="text-xs text-slate-500">{r.ebysReference}</span></Cell><Cell>{r.partnerSnapshot?.name ?? 'Selected when ordering'}</Cell><Cell>{r.status}</Cell><Cell><Button variant="outline" aria-label={`View ${r.reference}`} onClick={() => onSelect(r.id)}>View</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </div>
}
function AuditPanel({ base, revision }) {
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, 'audit-events', { limit: 25, offset }, revision)
  return <><LoadState result={list} label="purchasing audit" />{list.data && <><Table columns={['Action / time', 'Actor', 'Resource', 'Evidence']} rows={list.data.items} empty="No purchasing audit events yet." render={r => <><Cell>{r.action}<br />{r.createdAt}</Cell><Cell>{r.actorName}</Cell><Cell><span className="inline-block max-w-52 break-all">{r.resourceId}</span></Cell><Cell><details><summary className="cursor-pointer">View evidence</summary><pre className="max-w-md whitespace-pre-wrap break-all text-xs">{JSON.stringify(r.details, null, 2)}</pre></details></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</>
}
