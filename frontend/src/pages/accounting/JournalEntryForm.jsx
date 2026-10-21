import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Pager, inputStyle } from './accounting-ui'
import { analyzeJournalLines, displayAmount } from './journal-entry'

const blankLine = () => ({ id: crypto.randomUUID(), accountId: '', accountLabel: '', description: '', debit: '', credit: '' })
const pageSize = 25

export default function JournalEntryForm({ accounts, currency, canPost, canRequest, action }) {
  const [form, setForm] = useState({ documentDate: '', postingDate: '', description: '' })
  const [lines, setLines] = useState(() => [blankLine(), blankLine()])
  const [linePage, setLinePage] = useState(0)
  const [sourceId, setSourceId] = useState(() => crypto.randomUUID())
  const [mode, setMode] = useState(canPost ? 'journals' : 'posting-requests')
  const summary = analyzeJournalLines(lines)
  const ready = summary.valid && form.documentDate && form.postingDate && form.description.trim()
  const options = accounts.data.items.filter(account => account.active)
  const lastPage = Math.floor((lines.length - 1) / pageSize)
  const currentPage = Math.min(linePage, lastPage)
  const start = currentPage * pageSize
  function field(name) { return { value: form[name], onChange: event => setForm(current => ({ ...current, [name]: event.target.value })) } }
  function edit(id, patch) { setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line)) }
  async function submit(event) {
    event.preventDefault()
    if (!ready || action.busy) return
    const input = { ...form, currency, sourceModule: 'MANUAL', sourceId, lines: summary.lines }
    if (await action.submit(mode, input, mode === 'journals' ? 'Journal posted.' : 'Posting request queued. It has not been posted yet.')) {
      setSourceId(crypto.randomUUID())
      setForm(current => ({ ...current, description: '' }))
      setLines([blankLine(), blankLine()])
      setLinePage(0)
    }
  }
  return <form onSubmit={submit} onChange={action.clearFeedback} aria-label="New journal" aria-busy={action.busy} className="mt-6 rounded-xl bg-slate-50 p-4 sm:p-5">
    <fieldset disabled={action.busy} className="min-w-0 space-y-5">
      <legend className="mb-4 font-semibold">New journal</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Document date" type="date" required {...field('documentDate')} />
        <Field label="Posting date" type="date" required {...field('postingDate')} />
        <div className="sm:col-span-2"><Field label="Journal description" maxLength={255} required {...field('description')} /></div>
      </div>
      <section aria-label="Journal lines" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Journal lines</h2>
          <span className="text-xs text-slate-500">{lines.length} lines</span>
        </div>
        <p className="text-xs leading-5 text-slate-500">Add a row for each account entry. Use a dot for decimals and no thousands separators: 50000.00. VAT amounts are entered manually.</p>
        {lines.slice(start, start + pageSize).map((line, localIndex) => {
          const index = start + localIndex
          return <fieldset key={line.id} aria-label={`Journal line ${index + 1}`}
          aria-describedby={summary.errors[index] && (line.accountId || line.description || line.debit || line.credit) ? `line-error-${line.id}` : undefined}
          className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <legend className="sr-only">Line {index + 1}</legend>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-500">Line {index + 1}</span>
            <Button variant="ghost" aria-label={`Remove line ${index + 1}`} disabled={lines.length <= 2} onClick={() => { action.clearFeedback(); setLines(current => current.filter(item => item.id !== line.id)) }}>Remove</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Account"><select aria-label={`Account ${index + 1}`} className={inputStyle} required value={line.accountId} onChange={event => {
              const account = options.find(item => item.id === event.target.value)
              edit(line.id, { accountId: account?.id ?? '', accountLabel: account ? `${account.code} · ${account.name}` : '' })
            }}>
              <option value="">Choose an account</option>
              {line.accountId && !options.some(account => account.id === line.accountId) && <option value={line.accountId}>{line.accountLabel}</option>}
              {options.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
            </select></Field>
            <Field label="Line description" aria-label={`Description ${index + 1}`} maxLength={255} value={line.description} onChange={event => edit(line.id, { description: event.target.value })} />
            <Field label="Debit (Borç)" aria-label={`Debit ${index + 1}`} inputMode="decimal" placeholder="0.00" value={line.debit} onChange={event => edit(line.id, { debit: event.target.value })} />
            <Field label="Credit (Alacak)" aria-label={`Credit ${index + 1}`} inputMode="decimal" placeholder="0.00" value={line.credit} onChange={event => edit(line.id, { credit: event.target.value })} />
          </div>
          {summary.errors[index] && (line.accountId || line.description || line.debit || line.credit) && <p id={`line-error-${line.id}`} className="mt-3 text-xs text-rose-700">{summary.errors[index]}</p>}
        </fieldset>})}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => { action.clearFeedback(); setLinePage(Math.floor(lines.length / pageSize)); setLines(current => [...current, blankLine()]) }}>Add line</Button>
          {lines.length > pageSize && <div aria-label="Journal line pages" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Lines {start + 1}–{Math.min(start + pageSize, lines.length)} of {lines.length}</span>
            <Button variant="outline" disabled={!currentPage} onClick={() => setLinePage(0)}>First lines</Button>
            <Button variant="outline" disabled={!currentPage} onClick={() => setLinePage(currentPage - 1)}>Previous lines</Button>
            <Button variant="outline" disabled={currentPage === lastPage} onClick={() => setLinePage(currentPage + 1)}>Next lines</Button>
            <Button variant="outline" disabled={currentPage === lastPage} onClick={() => setLinePage(lastPage)}>Last lines</Button>
          </div>}
        </div>
        {accounts.data.total > 100 && <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Browse accounts for the selectors. Existing selections are retained across pages.</p><Pager {...accounts} />
        </div>}
      </section>
      <div aria-label="Journal totals" className="rounded-xl border border-slate-200 bg-white p-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[['Total debit', summary.debit], ['Total credit', summary.credit], ['Difference (debit − credit)', summary.difference]].map(([label, value]) => <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-all text-sm font-semibold tabular-nums">{displayAmount(value)} {currency}</dd>
          </div>)}
        </dl>
        <p className="mt-3 text-xs text-slate-500">Totals include all {lines.length} lines.</p>
        <p role="status" className={`mt-3 text-xs ${summary.valid ? 'text-teal-700' : 'text-slate-600'}`}>
          {summary.totalError || (summary.valid ? 'Balanced — journal lines are ready.' : summary.balanced ? 'Amounts balance. Complete all accounts and line amounts.' : 'Complete each line and make total debits equal total credits.')}
        </p>
        {summary.errors.some(Boolean) && lines.length > pageSize && <Button variant="ghost" onClick={() => setLinePage(Math.floor(summary.errors.findIndex(Boolean) / pageSize))}>Go to first incomplete line</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Posting action"><select className={inputStyle} value={mode} onChange={event => setMode(event.target.value)}>
          {canPost && <option value="journals">Post balanced journal now</option>}
          {canRequest && <option value="posting-requests">Queue for posting</option>}
        </select></Field>
        <Button type="submit" disabled={!ready || action.busy}>{mode === 'journals' ? 'Post journal' : 'Queue request'}</Button>
      </div>
    </fieldset>
  </form>
}
