import { useState } from 'react'
import { Table, Cell } from '@/pages/accounting/accounting-ui'
import { useProducts } from './useProducts'
import { ProductLoadState, ProductPager } from './product-ui'

export default function ProductAudit({ base, revision }) {
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, 'audit-events', { offset, limit: 25 }, revision)
  return <><ProductLoadState result={list} label="audit trail" />
    {list.data && <><Table columns={['When', 'Action', 'Record', 'Changes']} rows={list.data.items} empty="No product changes yet." render={row => <>
      <Cell>{new Date(row.createdAt).toLocaleString()}</Cell><Cell>{row.action}</Cell><Cell>{row.details.after?.code ?? row.details.after?.gtipCode ?? row.details.after?.supplierCode ?? row.resourceId}</Cell>
      <Cell><details><summary className="cursor-pointer">View change</summary><pre className="mt-2 max-w-sm whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.details, null, 2)}</pre><p className="mt-2 text-xs">Actor: {row.actorId}<br />Reference: {row.requestId}</p></details></Cell>
    </>} /><ProductPager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </>
}
