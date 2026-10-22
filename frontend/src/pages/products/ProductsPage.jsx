import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CataloguePanel from './CataloguePanel'
import ProductAudit from './ProductAudit'
import AliasPanel from './AliasPanel'

export default function ProductsPage() {
  const { profile, can } = useAuth()
  const base = `/entities/${profile.activeEntity.id}/products`
  const [params, setParams] = useSearchParams()
  const tabList = useRef(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const tabs = [['skus', 'SKUs'], ['families', 'Product families'], ['units', 'Units of measure'], ['attribute-definitions', 'Specification definitions'], ['suppliers', 'Suppliers'], ['aliases', 'Supplier aliases'], ...(can('products.audit.read') ? [['audit', 'Audit trail']] : [])]
  const tab = tabs.some(([key]) => key === params.get('view')) ? params.get('view') : 'skus'
  const skuId = tab === 'skus' ? params.get('sku') : null
  function navigate(values) {
    setParams(current => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    })
  }
  const setTab = view => navigate({ view, sku: null })
  const openSku = id => navigate({ view: 'skus', sku: id })
  const openFamily = id => navigate({ view: 'skus', sku: null, 'skus.familyId': id, 'skus.q': null, 'skus.active': null, 'skus.offset': null })
  useEffect(() => {
    const element = tabList.current
    const showSelected = () => {
      const selected = element?.querySelector('[aria-selected="true"]')
      if (!selected) return
      const box = selected.getBoundingClientRect()
      const container = element.getBoundingClientRect()
      if (box.left < container.left) element.scrollLeft -= container.left - box.left
      else if (box.right > container.right) element.scrollLeft += box.right - container.right
    }
    showSelected()
    const observer = new ResizeObserver(showSelected)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tab])
  return <Card className="min-w-0 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Product catalogue</h1><Button variant="outline" onClick={refresh}>Refresh</Button></div>
    <div ref={tabList} role="tablist" aria-label="Product views" className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
      {tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`product-tab-${key}`} aria-controls="product-panel" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
          if (next !== null) { event.preventDefault(); setTab(tabs[next][0]); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus() }
        }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === key ? 'bg-[#142e35] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id="product-panel" aria-labelledby={`product-tab-${tab}`}>
      {tab === 'audit' ? <ProductAudit base={base} revision={revision} /> : tab === 'aliases' ? <AliasPanel base={base} revision={revision} onSaved={refresh} openSku={openSku} canManage={can('products.manage')} canReview={can('products.review')} /> : <CataloguePanel key={tab} base={base} resource={tab} revision={revision} onSaved={refresh} skuId={skuId} openSku={openSku} openFamily={openFamily} canManage={can('products.manage')} canReview={can('products.review')} />}
    </div>
  </Card>
}
