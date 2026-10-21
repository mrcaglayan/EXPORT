import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, Pager, inputStyle } from './accounting-ui'
import { useAccountingList, useAccountingMutation } from './useAccounting'

export default function CalendarPanel({ base, revision, onSaved, canConfigure, canClose }) {
  const years = useAccountingList(base, 'fiscal-years', revision, 100)
  const periods = useAccountingList(base, 'periods', revision)
  const action = useAccountingMutation(base, onSaved)
  const [year, setYear] = useState({ code: '', startDate: '', endDate: '' })
  const [period, setPeriod] = useState({ code: '', startDate: '', endDate: '', fiscalYearId: '' })
  const [closing, setClosing] = useState(null)
  const [reason, setReason] = useState('')
  async function save(event, resource, input) { event.preventDefault(); await action.submit(resource, input, resource === 'fiscal-years' ? 'Fiscal year created.' : 'Period created.') }
  return <>
    {canConfigure && <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <form onSubmit={event => save(event, 'fiscal-years', year)} className="space-y-4 rounded-xl bg-slate-50 p-5">
        <h2 className="font-semibold">Add fiscal year</h2>
        <Field label="Fiscal year code" value={year.code} required onChange={e => setYear({ ...year, code: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Year start" type="date" value={year.startDate} required onChange={e => setYear({ ...year, startDate: e.target.value })} />
          <Field label="Year end" type="date" value={year.endDate} required onChange={e => setYear({ ...year, endDate: e.target.value })} />
        </div>
        <Button type="submit" disabled={action.busy}>Add fiscal year</Button>
      </form>
      <form onSubmit={event => save(event, 'periods', period)} className="space-y-4 rounded-xl bg-slate-50 p-5">
        <h2 className="font-semibold">Add accounting period</h2>
        <Field label="Fiscal year"><select className={inputStyle} required value={period.fiscalYearId} onChange={e => setPeriod({ ...period, fiscalYearId: e.target.value })}>
          <option value="">Choose a fiscal year</option>{years.data.items.map(y => <option key={y.id} value={y.id}>{y.code} · {y.startDate} – {y.endDate}</option>)}
        </select></Field>
        {years.data.total > 100 && <Pager {...years} />}
        <Field label="Period code" value={period.code} required onChange={e => setPeriod({ ...period, code: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Period start" type="date" value={period.startDate} required onChange={e => setPeriod({ ...period, startDate: e.target.value })} />
          <Field label="Period end" type="date" value={period.endDate} required onChange={e => setPeriod({ ...period, endDate: e.target.value })} />
        </div>
        <Button type="submit" disabled={action.busy}>Add period</Button>
      </form>
    </div>}
    <Feedback error={action.error || periods.error || years.error} message={action.message} />
    <Table columns={['Period', 'Dates', 'Status', 'Actions']} rows={periods.data.items} empty="Create a fiscal year, then add its accounting periods."
      render={row => <><Cell>{row.code}</Cell><Cell>{row.startDate} – {row.endDate}</Cell><Cell>{row.status}</Cell>
        <Cell>{canClose && row.status === 'OPEN' && <Button variant="outline" onClick={() => { setClosing(row); setReason('') }}>Close period</Button>}</Cell></>} />
    <Pager {...periods} />
    {closing && <form className="mt-6 space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5" onSubmit={async event => {
      event.preventDefault()
      if (await action.submit(`periods/${closing.id}/close`, { reason }, 'Period closed.')) setClosing(null)
    }}>
      <h2 className="font-semibold">Close {closing.code}</h2>
      <p className="text-sm text-slate-600">Closing prevents further postings. Resolve pending or failed requests first. Reopening is not available in this release.</p>
      <Field label="Closing reason" required maxLength={255} value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex gap-3"><Button type="submit" disabled={action.busy}>Confirm close</Button><Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button></div>
    </form>}
  </>
}
