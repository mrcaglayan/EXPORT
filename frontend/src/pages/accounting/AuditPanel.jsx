import { Feedback, Table, Cell, Pager } from './accounting-ui'
import { useAccountingList } from './useAccounting'

export default function AuditPanel({ base, revision }) {
  const audit = useAccountingList(base, 'audit-events', revision)
  return <>
    <Feedback error={audit.error} />
    <Table columns={['Time', 'Action', 'Actor', 'Resource', 'Details']} rows={audit.data.items} empty="Accounting changes will appear here."
      render={row => <><Cell>{new Date(row.createdAt).toLocaleString()}</Cell><Cell>{row.action}</Cell><Cell><span className="break-all text-xs">{row.actorId}</span></Cell><Cell><span className="break-all text-xs">{row.resourceId}</span></Cell><Cell><details><summary className="cursor-pointer">View change</summary><pre className="mt-2 max-w-xs whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.details, null, 2)}</pre></details></Cell></>} />
    <Pager {...audit} />
  </>
}
