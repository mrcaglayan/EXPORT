import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'

const choices = { PENDING: ['REVIEWED', 'REJECTED'], REVIEWED: ['VERIFIED', 'REJECTED'], VERIFIED: ['RETIRED'] }
export default function ReviewForm({ base, item, kind, onSaved, onCancel }) {
  const available = choices[item.status] ?? []
  const [form, setForm] = useState({ decision: available[0], reason: '', brokerName: '', verificationReference: '', verifiedOn: '' })
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const action = useAccountingMutation(base, onSaved)
  const evidence = kind === 'gtip' && form.decision === 'VERIFIED'
  return <form aria-label="Review record" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={async e => {
    e.preventDefault()
    const body = { decision: form.decision, reason: form.reason, ...(evidence && { brokerName: form.brokerName, verificationReference: form.verificationReference, verifiedOn: form.verifiedOn }) }
    if (await action.submit(`${kind === 'gtip' ? 'gtip-history' : 'aliases'}/${item.id}/review`, body, 'Review recorded.')) onCancel()
  }}><h3 className="font-semibold">Review {kind === 'gtip' ? item.gtipCode : `${item.supplierCode || 'supplier item'} · revision ${item.revision}`}</h3>
    <fieldset disabled={action.busy} className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field label="Decision"><select className={inputStyle} value={form.decision} onChange={e => set('decision', e.target.value)}>{available.map(value => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Review reason" required maxLength={1000} value={form.reason} onChange={e => set('reason', e.target.value)} />
      {evidence && <><Field label="Broker name" required maxLength={160} value={form.brokerName} onChange={e => set('brokerName', e.target.value)} />
        <Field label="Verification reference" required maxLength={1000} value={form.verificationReference} onChange={e => set('verificationReference', e.target.value)} />
        <Field label="Broker verification date" type="date" required value={form.verifiedOn} onChange={e => set('verifiedOn', e.target.value)} /></>}
    </fieldset>
    {evidence && <p className="mt-3 text-xs text-slate-600">Record the broker’s actual verification and evidence. The application does not determine the correct classification.</p>}
    {form.decision === 'RETIRED' && <p className="mt-3 text-xs text-slate-600">Retirement withdraws this entry from automatic use.{kind === 'gtip' && ' It applies to all dates. Use Set end date when a valid classification is changing from a later date.'} The history remains available.</p>}
    <Feedback error={action.error} />
    <div className="mt-4 flex gap-2"><Button type="submit" disabled={action.busy}>Record review</Button><Button variant="outline" disabled={action.busy} onClick={onCancel}>Cancel review</Button></div>
  </form>
}
