import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import InventoryPanel from './InventoryPanel'
import StockPanel from './StockPanel'

const stockTabs = [['receipts', 'Receipts'], ['balances', 'Stock balances'], ['pool-balances', 'Pool balances'], ['layers', 'Source layers'], ['physical-ledger', 'Physical ledger'], ['pool-ledger', 'Pool ledger']]

export default function InventoryPage() {
  const { profile, can } = useAuth()
  const base = `/entities/${profile.activeEntity.id}/inventory`
  const [tab, setTab] = useState('warehouses')
  const [revision, setRevision] = useState(0)
  const tabList = useRef(null)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const tabs = [['warehouses', 'Warehouses'], ['pools', 'Destination pools'], ['periods', 'Inventory periods'], ['movement-types', 'Movement types'], ...stockTabs, ...(can('inventory.audit.read') ? [['audit-events', 'Audit trail']] : [])]
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
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Inventory setup</h1><Button variant="outline" onClick={refresh}>Refresh</Button></div>
    <div ref={tabList} role="tablist" aria-label="Inventory views" className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
      {tabs.map(([key, label], index) => <button type="button" key={key} role="tab" id={`inventory-tab-${key}`} aria-controls="inventory-panel" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={event => { setTab(key); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
          if (next !== null) { event.preventDefault(); setTab(tabs[next][0]); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus() }
        }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === key ? 'bg-[#142e35] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id="inventory-panel" aria-labelledby={`inventory-tab-${tab}`}>
      {stockTabs.some(([key]) => key === tab) ? <StockPanel key={tab} base={base} resource={tab} revision={revision} /> : <InventoryPanel key={tab} base={base} resource={tab} revision={revision} onSaved={refresh} canConfigure={can('inventory.configure')} />}
    </div>
  </Card>
}
