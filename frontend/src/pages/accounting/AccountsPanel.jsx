import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, Pager, inputStyle } from './accounting-ui'
import { useAccountingList, useAccountingMutation } from './useAccounting'

export default function AccountsPanel({ base, revision, onSaved, canConfigure }) {
  const listing = useAccountingList(base, 'accounts', revision)
  const action = useAccountingMutation(base, onSaved)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('ASSET')
  async function create(event) {
    event.preventDefault()
    if (await action.submit('accounts', { code, name, accountType }, 'Account created.')) { setCode(''); setName('') }
  }
  return <>
    {canConfigure && <form onSubmit={create} className="mt-6 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Account code" value={code} onChange={e => setCode(e.target.value)} maxLength={40} required />
      <Field label="Account name" value={name} onChange={e => setName(e.target.value)} maxLength={160} required />
      <Field label="Account type"><select className={inputStyle} value={accountType} onChange={e => setAccountType(e.target.value)}>
        {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map(type => <option key={type}>{type}</option>)}
      </select></Field>
      <Button type="submit" disabled={action.busy}>Add account</Button>
    </form>}
    <Feedback error={action.error || listing.error} message={action.message} />
    {listing.loading && <p role="status" className="mt-6 text-sm text-slate-500">Loading accounts…</p>}
    <Table columns={['Code', 'Name', 'Type', 'Status', 'Actions']} rows={listing.data.items} empty="Add the accounts approved for your company. No balances have been imported."
      render={row => <><Cell>{row.code}</Cell><Cell>{row.name}</Cell><Cell>{row.accountType}</Cell><Cell>{row.active ? 'Active' : 'Inactive'}</Cell>
        <Cell>{canConfigure && <Button variant="outline" disabled={action.busy} onClick={() => action.submit(`accounts/${row.id}`, { name: row.name, active: !row.active }, 'Account updated.', 'patch')}>{row.active ? 'Deactivate' : 'Activate'}</Button>}</Cell></>} />
    <Pager {...listing} />
  </>
}
