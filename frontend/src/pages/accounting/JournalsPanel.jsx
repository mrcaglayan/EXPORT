import { useState } from 'react'
import { apiClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Feedback, Table, Cell, Pager } from './accounting-ui'
import { useAccountingList, useAccountingMutation } from './useAccounting'
import JournalEntryForm from './JournalEntryForm'

export default function JournalsPanel({ base, revision, onSaved, currency, canPost, canRequest }) {
  const journals = useAccountingList(base, 'journals', revision)
  const accounts = useAccountingList(base, 'accounts', revision, 100)
  const action = useAccountingMutation(base, onSaved)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  return <>
    {(canPost || canRequest) && <JournalEntryForm accounts={accounts} currency={currency} canPost={canPost} canRequest={canRequest} action={action} />}
    <Feedback error={action.error || journals.error || accounts.error || detailError} message={action.message} />
    <Table columns={['Posting date', 'Document date', 'Description', 'Debit', 'Credit', 'Details']} rows={journals.data.items} empty="No posted journals. Only balanced, successfully posted entries appear here."
      render={row => <><Cell>{row.postingDate}</Cell><Cell>{row.documentDate}</Cell><Cell>{row.description}</Cell><Cell>{row.totalDebit} {row.currency}</Cell><Cell>{row.totalCredit} {row.currency}</Cell>
        <Cell><Button variant="outline" onClick={async () => {
          setDetailError(null)
          try { setDetail((await apiClient.get(`${base}/journals/${row.id}`)).data.journal) } catch (error) { setDetailError(error) }
        }}>View lines</Button></Cell></>} />
    <Pager {...journals} />
    {detail && <div className="mt-6 rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{detail.description}</h2><Button variant="outline" onClick={() => setDetail(null)}>Close details</Button></div>
      <p className="mt-2 break-all text-xs text-slate-500">{detail.sourceModule} · {detail.sourceId} · {detail.status}</p>
      <Table columns={['Line', 'Account', 'Description', 'Debit', 'Credit']} rows={detail.lines.map(line => ({ ...line, id: line.lineNumber }))} render={line => <><Cell>{line.lineNumber}</Cell><Cell>{accounts.data.items.find(a => a.id === line.accountId)?.code ?? line.accountId}</Cell><Cell>{line.description || '—'}</Cell><Cell>{line.debit}</Cell><Cell>{line.credit}</Cell></>} />
    </div>}
  </>
}
