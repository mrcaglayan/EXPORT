import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle, Table, Cell } from '@/pages/accounting/accounting-ui'
import { useDebouncedValue, useProducts } from './useProducts'
import { useProductFilters } from './useProductFilters'
import { ProductLoadState, ProductPager } from './product-ui'
import ProductForm from './ProductForm'
import ProductPicker from './ProductPicker'
import ProductDetails from './ProductDetails'

const labels = { units: 'unit', families: 'family', skus: 'SKU', suppliers: 'supplier', 'attribute-definitions': 'specification definition' }
const empty = { units: 'No units yet. Add a unit of measure before creating SKUs.', families: 'No families yet. Add a family to group related SKUs.', skus: 'No SKUs yet. Create units and families first, then add your stockable items.', suppliers: 'No suppliers yet. Add a supplier reference before proposing item aliases.', 'attribute-definitions': 'No specification definitions yet. Define the properties you want to record for SKUs.' }
export default function CataloguePanel({ base, resource, revision, onSaved, canManage, canReview, skuId, openSku, openFamily }) {
  const { q, active, familyId, offset, change, clear } = useProductFilters(resource)
  const query = useDebouncedValue(q)
  const [editor, setEditor] = useState(null)
  const [message, setMessage] = useState('')
  const request = useProducts(base, resource, { q: query, offset, limit: 25, ...(active && { active }), ...(familyId && resource === 'skus' && { familyId }) }, revision, !skuId)
  const list = q === query ? request : { ...request, data: null, loading: true }
  const filtered = q || active || (resource === 'skus' && familyId)
  if (skuId) return <ProductDetails key={skuId} base={base} skuId={skuId} revision={revision} onSaved={onSaved} canManage={canManage} canReview={canReview} onBack={() => openSku(null)} />
  return <>
    <div className="mt-6 grid items-end gap-4 sm:grid-cols-3">
      <Field label="Search catalogue" value={q} maxLength={160} placeholder="Code or name" onChange={e => change({ q: e.target.value })} />
      <Field label="Filter status"><select className={inputStyle} value={active} onChange={e => change({ active: e.target.value })}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></Field>
      {canManage && <Button onClick={() => { setEditor({}); setMessage('') }}>Add {labels[resource]}</Button>}
    </div>
    {resource === 'skus' && <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer">Filter by family{familyId ? ' (selected)' : ''}</summary><div className="mt-3 max-w-md"><ProductPicker base={base} resource="families" revision={revision} activeOnly={false} label="Filter family" value={familyId} onChange={value => change({ familyId: value })} /></div></details>}
    {filtered && <Button variant="outline" className="mt-3" onClick={clear}>Clear filters</Button>}
    <Feedback message={message} />
    {editor && <ProductForm key={editor.id ?? 'new'} base={base} resource={resource} revision={revision} initial={editor.id ? editor : null}
      onSaved={() => { setMessage(`${labels[resource]} saved.`); onSaved() }} onCancel={() => setEditor(null)} />}
    <ProductLoadState result={list} label="catalogue" />
    {list.data && <>
      <Table columns={['Code', 'Name', ...(resource === 'units' ? ['Symbol', 'Decimal places'] : resource === 'skus' ? ['Family', 'Base unit'] : resource === 'families' ? ['Parent'] : resource === 'attribute-definitions' ? ['Type / unit', 'Stock identity'] : []), 'Status', ...(canManage || ['skus', 'families'].includes(resource) ? ['Actions'] : [])]}
        rows={list.data.items} empty={filtered ? 'No matching records. Change or clear the filters.' : empty[resource]}
        render={row => <><Cell><span className="font-medium">{row.code}</span></Cell><Cell>{row.name}{resource === 'skus' && row.description && <p className="mt-1 max-w-sm break-words text-xs text-slate-500">{row.description}</p>}</Cell>
          {resource === 'units' && <><Cell>{row.symbol}</Cell><Cell>{row.quantityPrecision}</Cell></>}
          {resource === 'skus' && <><Cell>{row.familyCode}</Cell><Cell>{row.baseUnitCode}</Cell></>}
          {resource === 'families' && <Cell>{row.parentCode ?? '—'}</Cell>}
          {resource === 'attribute-definitions' && <><Cell>{row.dataType} {row.unitLabel}</Cell><Cell>{row.definesStock ? 'Defines goods' : 'Descriptive'}</Cell></>}
          <Cell>{row.active ? 'Active' : 'Inactive'}</Cell>{(canManage || ['skus', 'families'].includes(resource)) && <Cell><div className="flex gap-2">{resource === 'skus' && <Button variant="outline" onClick={() => openSku(row.id)} aria-label={`Details ${row.code}`}>Details</Button>}{resource === 'families' && <Button variant="outline" onClick={() => openFamily(row.id)} aria-label={`SKUs in ${row.code}`}>View SKUs</Button>}{canManage && <Button variant="outline" onClick={() => { setEditor(row); setMessage('') }} aria-label={`Edit ${row.code}`}>Edit</Button>}</div></Cell>}</>} />
      <ProductPager data={list.data} offset={offset} setOffset={value => change({ offset: value })} />
    </>}
  </>
}
