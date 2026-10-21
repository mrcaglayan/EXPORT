import { useState } from 'react'
import { apiClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Feedback, Table, Cell, Pager } from './accounting-ui'
import { useAccountingList, useAccountingMutation } from './useAccounting'

export default function RequestsPanel({ base, revision, onSaved, canPost }) {
  const requests = useAccountingList(base, 'posting-requests', revision)
  const action = useAccountingMutation(base, onSaved)
  const [outcome, setOutcome] = useState('')
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  return <>
    <p className="mt-5 text-sm leading-6 text-slate-500">Pending and failed requests have no posted accounting effect. A posted request links to its balanced journal.</p>
    <Feedback error={action.error || requests.error || error} message={outcome} />
    <Table columns={['Source', 'Status', 'Attempts', 'Result', 'Actions']} rows={requests.data.items} empty="No posting requests."
      render={row => <><Cell><span className="block">{row.sourceModule}</span><span className="break-all text-xs text-slate-500">{row.sourceId}</span></Cell>
        <Cell><span className={`rounded-full px-2 py-1 text-xs ${row.status === 'POSTED' ? 'bg-teal-50 text-teal-800' : row.status === 'FAILED' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>{row.status}</span></Cell>
        <Cell>{row.attempts}</Cell><Cell><span className="break-all text-xs">{row.journalId ? `Journal ${row.journalId}` : row.errorCode || 'Awaiting posting'}</span></Cell>
        <Cell><div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            setError(null)
            try { setDetail((await apiClient.get(`${base}/posting-requests/${row.id}`)).data.postingRequest) } catch (failure) { setError(failure) }
          }}>Details</Button>
          {canPost && row.status !== 'POSTED' && <Button disabled={action.busy} onClick={async () => {
            const result = await action.submit(`posting-requests/${row.id}/process`, {}, '')
            if (result) {
              if (detail?.id === row.id) setDetail(result.postingRequest)
              setOutcome(result.postingRequest.status === 'POSTED' ? 'Request posted successfully.' : `Request failed: ${result.postingRequest.errorCode}. Correct the cause, then retry.`)
            }
          }}>{row.status === 'FAILED' ? 'Retry posting' : 'Process request'}</Button>}
        </div></Cell></>} />
    <Pager {...requests} />
    {detail && <div className="mt-6 rounded-xl border border-slate-200 p-5">
      <div className="flex justify-between gap-3"><h2 className="font-semibold">{detail.payload.description}</h2><Button variant="outline" onClick={() => setDetail(null)}>Close details</Button></div>
      <p className="mt-3 text-sm">Document: {detail.payload.documentDate} · Posting: {detail.payload.postingDate} · {detail.payload.currency} · {detail.status}</p>
      <Table columns={['Account', 'Description', 'Debit', 'Credit']} rows={detail.payload.lines.map((line, i) => ({ ...line, id: i }))} render={line => <><Cell><span className="break-all text-xs">{line.accountId}</span></Cell><Cell>{line.description || '—'}</Cell><Cell>{line.debit}</Cell><Cell>{line.credit}</Cell></>} />
    </div>}
  </>
}
