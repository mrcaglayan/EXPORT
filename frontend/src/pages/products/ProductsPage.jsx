import { useCallback, useState } from 'react'
import { useAuth } from '@/auth/auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CataloguePanel from './CataloguePanel'
import ProductAudit from './ProductAudit'
import AliasPanel from './AliasPanel'

export default function ProductsPage() {
  const { profile, can } = useAuth()
  const base = `/entities/${profile.activeEntity.id}/products`
  const [tab, setTab] = useState('skus')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const tabs = [['skus', 'SKUs'], ['families', 'Product families'], ['units', 'Units of measure'], ['attribute-definitions', 'Specification definitions'], ['suppliers', 'Suppliers'], ['aliases', 'Supplier aliases'], ...(can('products.audit.read') ? [['audit', 'Audit trail']] : [])]
  return <Card className="min-w-0 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Product catalogue</h1><Button variant="outline" onClick={refresh}>Refresh</Button></div>
    <div role="tablist" aria-label="Product views" className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
      {tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`product-tab-${key}`} aria-controls="product-panel" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
          if (next !== null) { event.preventDefault(); setTab(tabs[next][0]); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus() }
        }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === key ? 'bg-[#142e35] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id="product-panel" aria-labelledby={`product-tab-${tab}`}>
      {tab === 'audit' ? <ProductAudit base={base} revision={revision} /> : tab === 'aliases' ? <AliasPanel base={base} revision={revision} onSaved={refresh} canManage={can('products.manage')} canReview={can('products.review')} /> : <CataloguePanel key={tab} base={base} resource={tab} revision={revision} onSaved={refresh} canManage={can('products.manage')} canReview={can('products.review')} />}
    </div>
  </Card>
}
