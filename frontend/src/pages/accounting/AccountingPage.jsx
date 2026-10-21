import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { useAuth } from '@/auth/auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle } from './accounting-ui'
import { useAccountingMutation } from './useAccounting'
import AccountsPanel from './AccountsPanel'
import CalendarPanel from './CalendarPanel'
import JournalsPanel from './JournalsPanel'
import RequestsPanel from './RequestsPanel'
import AuditPanel from './AuditPanel'

const tabs = ['Chart of accounts', 'Fiscal calendar', 'Journals', 'Posting requests', 'Audit trail']
export default function AccountingPage() {
  const { profile, can } = useAuth()
  const base = `/entities/${profile.activeEntity.id}/accounting`
  const [tab, setTab] = useState('Chart of accounts')
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ loading: true, settings: null, error: null })
  const [currency, setCurrency] = useState('TRY')
  const onSaved = useCallback(() => setRevision(value => value + 1), [])
  const action = useAccountingMutation(base, onSaved)
  useEffect(() => {
    const controller = new AbortController()
    apiClient.get(`${base}/settings`, { signal: controller.signal }).then(
      ({ data }) => setState({ loading: false, settings: data.settings, error: null }),
      error => { if (!controller.signal.aborted) setState({ loading: false, settings: null, error }) },
    )
    return () => controller.abort()
  }, [base, revision])
  const props = { base, revision, onSaved, canConfigure: can('accounting.configure'), canClose: can('accounting.period.close'),
    canPost: can('accounting.post'), canRequest: can('accounting.request'), currency: state.settings?.baseCurrency }
  return (
    <Card className="min-w-0 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{tab}</h1>
        <div className="flex items-center gap-3">
          {state.settings && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">{state.settings.baseCurrency}</span>}
          <Button variant="outline" onClick={onSaved}>Refresh</Button>
        </div>
      </div>
      <Feedback error={state.error || action.error} />
      {state.loading && <p role="status" className="mt-6 text-sm text-slate-500">Loading accounting setup…</p>}
      {!state.loading && !state.error && !state.settings && <div className="mt-6 max-w-lg rounded-xl bg-slate-50 p-6">
        <h2 className="font-semibold">Set your base currency</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Choose the currency your accounts will use. This choice is fixed after setup. Accounts and opening balances start empty.</p>
        {can('accounting.configure') ? <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); action.submit('settings', { baseCurrency: currency }, 'Accounting configured.') }}>
          <Field label="Base currency"><select className={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>{['TRY', 'USD', 'EUR', 'GBP'].map(code => <option key={code}>{code}</option>)}</select></Field>
          <Button type="submit" disabled={action.busy}>Set base currency</Button>
        </form> : <p className="mt-4 text-sm text-slate-600">Your administrator can configure accounting for this entity.</p>}
      </div>}
      {state.settings && <>
        <div role="tablist" aria-label="Accounting views" className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
          {tabs.filter(name => name !== 'Audit trail' || can('accounting.audit.read')).map(name => <button type="button" role="tab" aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1} key={name} onClick={() => setTab(name)} onKeyDown={event => {
              const available = tabs.filter(item => item !== 'Audit trail' || can('accounting.audit.read'))
              const index = available.indexOf(name)
              const next = event.key === 'ArrowRight' ? (index + 1) % available.length
                : event.key === 'ArrowLeft' ? (index + available.length - 1) % available.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : null
              if (next !== null) {
                event.preventDefault()
                setTab(available[next])
                event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
              }
            }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === name ? 'bg-[#142e35] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{name}</button>)}
        </div>
        <div role="tabpanel" aria-label={tab}>
          {tab === 'Chart of accounts' && <AccountsPanel {...props} />}
          {tab === 'Fiscal calendar' && <CalendarPanel {...props} />}
          {tab === 'Journals' && <JournalsPanel {...props} />}
          {tab === 'Posting requests' && <RequestsPanel {...props} />}
          {tab === 'Audit trail' && <AuditPanel {...props} />}
        </div>
      </>}
    </Card>
  )
}
