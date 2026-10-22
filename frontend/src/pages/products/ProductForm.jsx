import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import ProductPicker from './ProductPicker'
import { useDebouncedValue, useProducts } from './useProducts'
import { ProductFormShell } from './product-ui'

const names = { units: 'unit', families: 'family', skus: 'SKU', suppliers: 'supplier', 'attribute-definitions': 'specification definition' }
export default function ProductForm({ base, resource, revision, initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial ?? { code: '', name: '', symbol: '', quantityPrecision: 0,
    parentId: null, familyId: '', baseUnitId: '', description: '', active: true, dataType: 'TEXT', unitLabel: '', definesStock: false })
  const action = useAccountingMutation(base, onSaved)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const name = names[resource]
  const code = useDebouncedValue(form.code.trim().toUpperCase())
  const duplicates = useProducts(base, resource, { q: code, limit: 100 }, revision, !initial && /^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(code))
  const duplicate = code === form.code.trim().toUpperCase() && duplicates.data?.items.find(item => item.code.toUpperCase() === code)
  async function submit(event) {
    event.preventDefault()
    const body = { name: form.name, ...(initial ? { active: form.active } : { code: form.code }),
      ...(resource === 'suppliers' ? {} : resource === 'attribute-definitions' ? (!initial ? { dataType: form.dataType, unitLabel: form.unitLabel, definesStock: form.definesStock } : {}) : resource === 'units' ? { symbol: form.symbol, ...(!initial && { quantityPrecision: Number(form.quantityPrecision) }) }
        : resource === 'families' ? { parentId: form.parentId }
          : { description: form.description, familyId: form.familyId, ...(!initial && { baseUnitId: form.baseUnitId }) }) }
    const saved = await action.submit(`${resource}${initial ? `/${initial.id}` : ''}`, body, `${name} saved.`, initial ? 'patch' : 'post')
    if (saved) onCancel()
  }
  return <ProductFormShell onSubmit={submit} className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
    <h2 className="font-semibold">{initial ? 'Edit' : 'Add'} {name}</h2>
    <fieldset disabled={action.busy} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="Code" required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" title="Start with a letter or number; use letters, numbers, underscores or hyphens." value={form.code} disabled={!!initial} onChange={e => set('code', e.target.value)} />
      <Field label="Name" required maxLength={160} value={form.name} onChange={e => set('name', e.target.value)} />
      {resource === 'units' && <>
        <Field label="Symbol" required maxLength={16} value={form.symbol} onChange={e => set('symbol', e.target.value)} />
        <Field label="Quantity decimal places" type="number" required min={0} max={6} step={1} disabled={!!initial} value={form.quantityPrecision} onChange={e => set('quantityPrecision', e.target.value)} />
      </>}
      {resource === 'families' && <ProductPicker base={base} resource="families" revision={revision} label="Parent family" value={form.parentId} onChange={value => set('parentId', value)} />}
      {resource === 'attribute-definitions' && <>
        <Field label="Value type"><select className={inputStyle} value={form.dataType} disabled={!!initial} onChange={e => set('dataType', e.target.value)}><option value="TEXT">Text</option><option value="DECIMAL">Decimal</option><option value="BOOLEAN">Yes / No</option></select></Field>
        <Field label="Unit label" maxLength={16} value={form.unitLabel} disabled={!!initial} onChange={e => set('unitLabel', e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.definesStock} disabled={!!initial} onChange={e => set('definesStock', e.target.checked)} />Defines stock identity</label>
      </>}
      {resource === 'skus' && <>
        <ProductPicker base={base} resource="families" revision={revision} label="Product family" required value={form.familyId} onChange={value => set('familyId', value)} />
        <ProductPicker base={base} resource="units" revision={revision} label="Base unit" required disabled={!!initial} value={form.baseUnitId} onChange={value => set('baseUnitId', value)} />
        <Field label="Description" maxLength={1000} value={form.description} onChange={e => set('description', e.target.value)} />
      </>}
      {initial && <Field label="Status"><select className={inputStyle} value={String(form.active)} onChange={e => set('active', e.target.value === 'true')}><option value="true">Active</option><option value="false">Inactive</option></select></Field>}
    </fieldset>
    <p className="mt-3 text-xs text-slate-500">Codes{resource === 'units' ? ' and quantity precision' : resource === 'skus' ? ' and base units' : resource === 'attribute-definitions' ? ', value type, unit label and stock identity choice' : ''} are fixed after creation.</p>
    {duplicate && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Code {duplicate.code} already exists ({duplicate.active ? 'active' : 'inactive'}). Choose another code or edit the existing record.</p>}
    <Feedback error={action.error} />
    <div className="mt-4 flex gap-2"><Button type="submit" disabled={action.busy}>{action.busy ? 'Saving…' : `Save ${name}`}</Button><Button variant="outline" type="button" disabled={action.busy} onClick={onCancel}>Cancel</Button></div>
  </ProductFormShell>
}
