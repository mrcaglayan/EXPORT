import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts as useMetadata } from '@/pages/products/useProducts'
import { ProductFormShell as Form, ProductLoadState as LoadState } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

const labels = { warehouses: 'warehouse', pools: 'pool', periods: 'inventory period', 'movement-types': 'movement type' }
const effects = { RECEIPT: 'Receipt — incoming stock', ISSUE: 'Issue — outgoing stock', REALLOCATION: 'Reallocation — pool allocation only', ADJUSTMENT_IN: 'Adjustment — increase stock', ADJUSTMENT_OUT: 'Adjustment — decrease stock', REVALUATION: 'Revaluation — value only' }
export default function InventoryForm({ base, resource, revision, initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial ?? { code: '', name: '', location: '', active: true, kind: 'GENERAL', countryCode: '', effect: 'RECEIPT', accountingPeriodId: null })
  const action = useAccountingMutation(base, onSaved)
  const countries = useMetadata(base, 'countries', {}, 0, resource === 'pools' && !initial && form.kind === 'COUNTRY')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault()
    const body = resource === 'periods' ? { accountingPeriodId: form.accountingPeriodId } : {
      name: form.name, ...(initial ? { active: form.active } : resource === 'pools' ? { kind: form.kind, countryCode: form.kind === 'COUNTRY' ? form.countryCode : null } : { code: form.code }),
      ...(resource === 'warehouses' ? { location: form.location } : resource === 'movement-types' && !initial ? { effect: form.effect } : {}),
    }
    if (await action.submit(`${resource}${initial ? `/${initial.id}` : ''}`, body, '', initial ? 'patch' : 'post')) onCancel()
  }
  return <Form onSubmit={submit} aria-label="Inventory setup form" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
    <h2 className="font-semibold">{initial ? 'Edit' : 'Add'} {labels[resource]}</h2>
    <fieldset disabled={action.busy} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      {resource === 'periods' ? <ProductPicker base={base} resource="accounting-periods" revision={revision} label="Accounting period" activeOnly={false} required value={form.accountingPeriodId} onChange={value => set('accountingPeriodId', value)} /> : <>
        {resource !== 'pools' && <Field label="Code" required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" title="Use letters, numbers, underscores or hyphens." disabled={!!initial} value={form.code} onChange={e => set('code', e.target.value)} />}
        <Field label="Name" required maxLength={160} value={form.name} onChange={e => set('name', e.target.value)} />
        {resource === 'warehouses' && <Field label="Location" maxLength={500} value={form.location} onChange={e => set('location', e.target.value)} />}
        {resource === 'pools' && <>
          <Field label="Pool kind"><select className={inputStyle} disabled={!!initial} value={form.kind} onChange={e => set('kind', e.target.value)}><option value="GENERAL">GENERAL — unallocated</option><option value="COUNTRY">COUNTRY — destination allocation</option></select></Field>
          {form.kind === 'COUNTRY' && (initial ? <Field label="Country" disabled value={form.countryCode} /> : <div><Field label="Country"><select className={inputStyle} required value={form.countryCode} onChange={e => set('countryCode', e.target.value)}><option value="">Select a country</option>{countries.data?.items.map(country => <option key={country.code} value={country.code}>{country.code} — {country.name}</option>)}</select></Field><LoadState result={countries} label="countries" /></div>)}
        </>}
        {resource === 'movement-types' && <Field label="Movement effect"><select className={inputStyle} disabled={!!initial} value={form.effect} onChange={e => set('effect', e.target.value)}>{Object.entries(effects).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>}
        {initial && <Field label="Status"><select className={inputStyle} value={String(form.active)} onChange={e => set('active', e.target.value === 'true')}><option value="true">Active</option><option value="false">Inactive</option></select></Field>}
      </>}
    </fieldset>
    <p className="mt-3 text-xs text-slate-500">{resource === 'pools' ? 'One GENERAL pool and one pool per country in this company. Codes are GENERAL or the country code; identity stays fixed after creation.' : resource === 'periods' ? 'Choose an open accounting period. Its code and dates are reused. This creates no stock or financial posting.' : 'Codes and movement effects stay fixed after creation. Deactivate unused records to retain their history.'}</p>
    <Feedback error={action.error} />
    <div className="mt-4 flex gap-2"><Button type="submit" disabled={action.busy}>{action.busy ? 'Saving…' : `Save ${labels[resource]}`}</Button><Button variant="outline" disabled={action.busy} onClick={onCancel}>Cancel</Button></div>
  </Form>
}
