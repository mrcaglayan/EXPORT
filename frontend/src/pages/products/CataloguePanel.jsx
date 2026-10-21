import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle, Table, Cell, Pager } from '@/pages/accounting/accounting-ui'
import { useProducts } from './useProducts'
import ProductForm from './ProductForm'
import ProductPicker from './ProductPicker'
import ProductDetails from './ProductDetails'

const labels = { units: 'unit', families: 'family', skus: 'SKU', suppliers: 'supplier', 'attribute-definitions': 'specification definition' }
export default function CataloguePanel({ base, resource, revision, onSaved, canManage, canReview }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState('')
  const [familyId, setFamilyId] = useState(null)
  const [offset, setOffset] = useState(0)
  const [editor, setEditor] = useState(null)
  const [detail, setDetail] = useState(null)
  const list = useProducts(base, resource, { q, offset, limit: 25, ...(active && { active }), ...(familyId && resource === 'skus' && { familyId }) }, revision)
  if (detail) return <ProductDetails base={base} item={detail} revision={revision} onSaved={onSaved} canManage={canManage} canReview={canReview} onBack={() => setDetail(null)} />
  return <>
    <div className="mt-6 grid items-end gap-4 sm:grid-cols-3">
      <Field label="Search catalogue" value={q} maxLength={160} placeholder="Code or name" onChange={e => { setQ(e.target.value); setOffset(0) }} />
      <Field label="Filter status"><select className={inputStyle} value={active} onChange={e => { setActive(e.target.value); setOffset(0) }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></Field>
      {canManage && <Button onClick={() => setEditor({})}>Add {labels[resource]}</Button>}
    </div>
    {resource === 'skus' && <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer">Filter by family{familyId ? ' (selected)' : ''}</summary><div className="mt-3 max-w-md"><ProductPicker base={base} resource="families" revision={revision} label="Filter family" value={familyId} onChange={value => { setFamilyId(value); setOffset(0) }} /></div></details>}
    {editor && <ProductForm key={editor.id ?? 'new'} base={base} resource={resource} revision={revision} initial={editor.id ? editor : null}
      onSaved={onSaved} onCancel={() => setEditor(null)} />}
    <Feedback error={list.error} />
    {list.loading && <p role="status" className="mt-6 text-sm">Loading catalogue…</p>}
    {list.data && <>
      <Table columns={['Code', 'Name', ...(resource === 'units' ? ['Symbol', 'Decimal places'] : resource === 'skus' ? ['Family', 'Base unit'] : resource === 'families' ? ['Parent'] : resource === 'attribute-definitions' ? ['Type / unit', 'Stock identity'] : []), 'Status', ...(canManage || resource === 'skus' ? ['Actions'] : [])]}
        rows={list.data.items} empty={q || active || familyId ? 'No matching records.' : 'Your catalogue starts empty. Add units and families, then create SKUs.'}
        render={row => <><Cell><span className="font-medium">{row.code}</span></Cell><Cell>{row.name}{resource === 'skus' && row.description && <p className="mt-1 max-w-sm break-words text-xs text-slate-500">{row.description}</p>}</Cell>
          {resource === 'units' && <><Cell>{row.symbol}</Cell><Cell>{row.quantityPrecision}</Cell></>}
          {resource === 'skus' && <><Cell>{row.familyCode}</Cell><Cell>{row.baseUnitCode}</Cell></>}
          {resource === 'families' && <Cell>{row.parentCode ?? '—'}</Cell>}
          {resource === 'attribute-definitions' && <><Cell>{row.dataType} {row.unitLabel}</Cell><Cell>{row.definesStock ? 'Defines goods' : 'Descriptive'}</Cell></>}
          <Cell>{row.active ? 'Active' : 'Inactive'}</Cell>{(canManage || resource === 'skus') && <Cell><div className="flex gap-2">{resource === 'skus' && <Button variant="outline" onClick={() => setDetail(row)} aria-label={`Details ${row.code}`}>Details</Button>}{canManage && <Button variant="outline" onClick={() => setEditor(row)} aria-label={`Edit ${row.code}`}>Edit</Button>}</div></Cell>}</>} />
      <Pager data={list.data} offset={offset} setOffset={setOffset} />
    </>}
  </>
}
