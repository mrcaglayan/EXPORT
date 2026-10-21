import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { Field, Feedback, inputStyle, Pager } from '@/pages/accounting/accounting-ui'
import { useProducts } from './useProducts'

export default function ProductPicker({ base, resource, revision, label, value, onChange, required = false, disabled = false, activeOnly = true }) {
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    if (!value) return
    const controller = new AbortController()
    apiClient.get(`${base}/${resource}/${value}`, { signal: controller.signal }).then(
      ({ data }) => { if (!controller.signal.aborted) setSelected(data.item) },
      () => { /* List errors remain visible; a selected ID is never silently replaced. */ },
    )
    return () => controller.abort()
  }, [base, resource, value, revision])
  const list = useProducts(base, resource, { q, offset, limit: 25, ...(activeOnly && { active: 'true' }) }, revision)
  const items = list.data?.items ?? []
  return <fieldset disabled={disabled} className="min-w-0 rounded-lg border border-slate-200 p-3">
    <legend className="px-1 text-sm font-medium text-slate-700">{label}</legend>
    <Field label={`Search ${label.toLowerCase()}`} value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} maxLength={160} />
    <Field label={label}><select className={inputStyle} value={value ?? ''} required={required}
      onChange={e => { setSelected(items.find(item => item.id === e.target.value)); onChange(e.target.value || null) }}>
      <option value="">{required ? 'Select a record' : 'None'}</option>
      {value && !items.some(item => item.id === value) && <option value={value}>{selected?.id === value ? `${selected.code} — ${selected.name}` : 'Current selection (retained)'}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
    </select></Field>
    {list.loading && <p role="status" className="mt-2 text-xs">Loading choices…</p>}
    <Feedback error={list.error} />
    {list.data && <Pager data={list.data} offset={offset} setOffset={setOffset} />}
  </fieldset>
}
