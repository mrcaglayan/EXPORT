import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Table, Cell } from '@/pages/accounting/accounting-ui'
import { useProducts as useStock, useDebouncedValue } from '@/pages/products/useProducts'
import { ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

const descriptions = {
  receipts: 'Posted goods receipts retain each source line and its cost. Purchase-invoice receipt entry will be connected in the purchasing stage.',
  layers: 'Receipt source layers in FIFO order. Each line keeps its original quantity and cost; current stock is shown in Stock balances.',
  balances: 'Current physical stock by warehouse, SKU and source layer. Pool allocations divide this stock without adding physical quantity.',
  'pool-balances': 'Current allocation by warehouse, SKU, source layer and destination pool.',
  'physical-ledger': 'Immutable physical stock entries. Receipt provenance is retained for every entry.',
  'pool-ledger': 'Immutable destination-pool entries. Quantities and values reconcile to the corresponding physical receipt.',
}
export default function StockPanel({ base, resource, revision }) {
  const [offset, setOffset] = useState(0)
  const [q, setQ] = useState('')
  const [warehouseId, setWarehouseId] = useState(null)
  const [poolId, setPoolId] = useState(null)
  const [skuId, setSkuId] = useState(null)
  const [selected, setSelected] = useState(null)
  const search = useDebouncedValue(q)
  const pool = resource.startsWith('pool-'), receipts = resource === 'receipts'
  const params = { offset, limit: 25, ...(receipts && search && { q: search }), ...(warehouseId && { warehouseId }), ...(poolId && { poolId }), ...(skuId && { skuId }) }
  const request = useStock(base, resource, params, revision)
  const list = search === q ? request : { ...request, data: null, loading: true }
  if (selected) return <ReceiptDetails base={base} id={selected} revision={revision} onBack={() => setSelected(null)} />
  function change(setter, value) { setter(value); setOffset(0) }
  return <div className="mt-6 min-w-0">
    <p className="text-sm text-slate-600">{descriptions[resource]}</p>
    {receipts && <div className="mt-4 max-w-md"><Field label="Search receipts" placeholder="Source reference or description" maxLength={128} value={q} onChange={event => change(setQ, event.target.value)} /></div>}
    <details className="mt-4"><summary className="cursor-pointer text-sm text-slate-700">Filter stock records</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <ProductPicker base={base} resource="warehouses" label="Warehouse filter" revision={revision} activeOnly={false} value={warehouseId} onChange={value => change(setWarehouseId, value)} />
      {pool && <ProductPicker base={base} resource="pools" label="Pool filter" revision={revision} activeOnly={false} value={poolId} onChange={value => change(setPoolId, value)} />}
    </div></details>
    {(q || warehouseId || poolId || skuId) && <Button variant="outline" className="mt-3" onClick={() => { setQ(''); setWarehouseId(null); setPoolId(null); setSkuId(null); setOffset(0) }}>Clear stock filters</Button>}
    {skuId && <p role="status" className="mt-2 text-sm text-slate-600">Showing the selected SKU.</p>}
    <LoadState result={list} label="stock records" />
    {list.data && <>
      <Table columns={receipts ? ['Source', 'Posting date', 'Description', 'Value', 'Status', 'Details'] : ['Warehouse', 'SKU / unit', ...(pool ? ['Pool'] : []), 'Quantity', ...(resource.endsWith('balances') ? ['Reserved', 'Available'] : []), 'Value', 'Received', ...(resource.endsWith('ledger') ? ['Movement'] : []), 'Source line']} rows={list.data.items}
        empty={q || warehouseId || poolId || skuId ? 'No matching stock records. Change or clear the filters.' : 'No posted stock records yet.'} render={row => receipts ? <>
          <Cell>{row.sourceId}</Cell><Cell>{row.postingDate}</Cell><Cell>{row.description}</Cell><Cell>{row.totalValue} {row.currency}</Cell><Cell>{row.status}</Cell><Cell><Button variant="outline" aria-label={`View receipt ${row.sourceId}`} onClick={() => setSelected(row.id)}>View</Button></Cell>
        </> : <>
          <Cell>{row.warehouseCode}</Cell><Cell><button type="button" className="text-teal-800 underline" aria-label={`Filter SKU ${row.skuCode}`} onClick={() => change(setSkuId, row.skuId)}>{row.skuCode}</button><br />{row.unitCode}</Cell>
          {pool && <Cell>{row.poolCode}</Cell>}<Cell>{row.quantity}</Cell>{resource.endsWith('balances') && <><Cell>{row.reservedQuantity}</Cell><Cell>{row.availableQuantity}</Cell></>}<Cell>{row.value} {row.currency}</Cell><Cell>{row.receivedDate}</Cell>
          {resource.endsWith('ledger') && <Cell>{row.eventKind}<br />{row.postingDate}{row.reallocationReference && <p>{row.reallocationReference}</p>}{row.issueReference && <p>{row.issueReference}</p>}{row.correctionReference && <p>{row.correctionReference}</p>}{row.reversesEventId && <p>Exact reversal</p>}</Cell>}
          <Cell><button type="button" className="text-teal-800 underline" aria-label={`View source ${row.sourceId} line ${row.sourceLineKey}`} onClick={() => setSelected(row.receiptId)}>{row.sourceId} / {row.sourceLineKey}</button><details className="mt-1 text-xs"><summary>Layer reference</summary><span className="break-all">{row.layerId}</span></details></Cell>
        </>} />
      <Pager data={list.data} offset={offset} setOffset={setOffset} />
    </>}
  </div>
}
function ReceiptDetails({ base, id, revision, onBack }) {
  const [offset, setOffset] = useState(0)
  const detail = useStock(base, `receipts/${id}`, {}, revision)
  const lines = useStock(base, `receipts/${id}/lines`, { limit: 25, offset }, revision)
  const receipt = detail.data?.receipt
  return <div className="mt-6 min-w-0">
    <Button variant="outline" onClick={onBack}>Back to stock records</Button>
    <LoadState result={detail} label="receipt" />
    {receipt && <>
      <h2 className="mt-4 break-all text-lg font-semibold">Receipt {receipt.sourceId}</h2>
      <p className="mt-2 text-sm text-slate-600">{receipt.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt>Document date</dt><dd>{receipt.documentDate}</dd></div><div><dt>Posting date</dt><dd>{receipt.postingDate}</dd></div><div><dt>Total value</dt><dd>{receipt.totalValue} {receipt.currency}</dd></div><div><dt>Status</dt><dd>{receipt.status}</dd></div></dl>
      <LoadState result={lines} label="receipt lines" />
      {lines.data && <><Table columns={['Line / SKU', 'Description', 'Quantity', 'Unit cost', 'Value', 'Pool allocations']} rows={lines.data.items} empty="No receipt lines." render={line => <>
        <Cell>{line.lineNumber} / {line.skuCode}<p className="mt-1 text-xs">Source line: {line.sourceLineKey}</p></Cell><Cell>{line.description || '—'}</Cell><Cell>{line.quantity} {line.unitCode}</Cell><Cell>{line.unitCost} {receipt.currency}</Cell><Cell>{line.value} {receipt.currency}</Cell>
        <Cell>{line.allocations.map(allocation => <p key={allocation.poolId} className="mb-2">{allocation.poolCode}: {allocation.quantity} {line.unitCode}<br /><span className="text-xs">{allocation.value} {receipt.currency}</span></p>)}</Cell>
      </>} /><Pager data={lines.data} offset={offset} setOffset={setOffset} /></>}
    </>}
  </div>
}
