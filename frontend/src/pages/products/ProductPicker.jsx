import { useState } from 'react'
import { Field, inputStyle } from '@/pages/accounting/accounting-ui'
import { useDebouncedValue, useProducts } from './useProducts'
import { ProductLoadState, ProductPager } from './product-ui'

export default function ProductPicker({ base, resource, revision, label, value, onChange, required = false, disabled = false, activeOnly = true }) {
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const query = useDebouncedValue(q)
  const selection = useProducts(base, `${resource}/${value}`, {}, revision, !!value)
  const selected = selection.data?.item
  const request = useProducts(base, resource, { q: query, offset, limit: 25, ...(activeOnly && { active: 'true' }) }, revision)
  const list = q === query ? request : { ...request, data: null, loading: true }
  const items = list.data?.items ?? []
  return <fieldset disabled={disabled} className="min-w-0 rounded-lg border border-slate-200 p-3">
    <legend className="px-1 text-sm font-medium text-slate-700">{label}</legend>
    <Field label={`Search ${label.toLowerCase()}`} value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} maxLength={160} />
    <Field label={label}><select className={inputStyle} value={value ?? ''} required={required}
      onChange={e => onChange(e.target.value || null)}>
      <option value="">{required ? 'Select a record' : 'None'}</option>
      {value && !items.some(item => item.id === value) && <option value={value}>{selected?.id === value ? `${selected.code} — ${selected.name}` : 'Current selection (retained)'}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}{item.active === false ? ' (inactive)' : ''}</option>)}
    </select></Field>
    <ProductLoadState result={list} label="choices" />
    {selection.error && <div className="mt-2"><p className="text-xs text-slate-600">The selected record could not be loaded. Your selection is retained.</p><ProductLoadState result={selection} label="selected record" /></div>}
    {list.data && <ProductPager data={list.data} offset={offset} setOffset={setOffset} />}
  </fieldset>
}
