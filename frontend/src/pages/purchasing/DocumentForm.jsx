import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, Table, Cell, inputStyle } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from '@/pages/products/useProducts'
import { ProductFormShell as Form, ProductLoadState as LoadState, ProductPager as Pager } from '@/pages/products/product-ui'
import ProductPicker from '@/pages/products/ProductPicker'

const titles = { contracts: 'contract', requests: 'purchase request', orders: 'purchase order' }
const decimal = value => /^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(value) ? BigInt(value.replace('.', '').padEnd(value.includes('.') ? value.length - 1 + 6 - value.split('.')[1].length : value.length + 6, '0')) : null
function previewNet(lines) {
  let total = 0n
  for (const line of lines) { const q = decimal(line.quantity), p = decimal(line.unitPrice); if (q === null || p === null) return 'Enter valid quantities and prices'; total += (q * p + 500000n) / 1000000n }
  return `${total / 1000000n}.${String(total % 1000000n).padStart(6, '0')}`
}
export default function DocumentForm({ base, resource, revision, onSaved, onCreated, onCancel }) {
  const [form, setForm] = useState({ reference: '', documentDate: '', purpose: '', terms: '', ebysReference: '', partnerId: null, currency: 'TRY', validFrom: '', validTo: '', requiredBy: '', requestId: null, contractId: null })
  const [lines, setLines] = useState([]), [offset, setOffset] = useState(0), [skuId, setSkuId] = useState(null)
  const sequence = useRef(0)
  const sku = useProducts(base, `skus/${skuId}`, {}, revision, !!skuId)
  const action = useAccountingMutation(base, onSaved)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setLine = (id, key, value) => setLines(current => current.map(l => l.id === id ? { ...l, [key]: value } : l))
  const addSku = () => {
    const item = sku.data?.item
    if (!item?.active) return
    const lineKey = `line-${++sequence.current}`
    setLines(current => [...current, { id: crypto.randomUUID(), lineKey, skuId: item.id, skuCode: item.code, skuName: item.name, unitCode: item.unitCode, quantity: '', description: '' }]); setOffset(Math.floor(lines.length / 25) * 25)
  }
  const addSource = line => { setLines(current => current.some(l => l.requestLineId === line.id) ? current : [...current, { id: crypto.randomUUID(), requestLineId: line.id, lineKey: line.lineKey, skuCode: line.skuSnapshot.code, skuName: line.skuSnapshot.name, unitCode: line.skuSnapshot.unitCode, description: line.description, availableQuantity: line.availableQuantity, quantity: line.availableQuantity, unitPrice: '', freeReason: '' }]); setOffset(Math.floor(lines.length / 25) * 25) }
  const ready = resource === 'contracts' || lines.length > 0 && lines.every(l => decimal(l.quantity) > 0n && (resource === 'requests' || decimal(l.unitPrice) !== null && (decimal(l.unitPrice) !== 0n || l.freeReason.trim())))
  async function submit(e) {
    e.preventDefault()
    const { reference, documentDate, purpose, terms, ebysReference, partnerId, currency, validFrom, validTo, requiredBy, requestId, contractId } = form
    const body = { reference, documentDate, purpose, terms, ebysReference, ...(resource === 'contracts' ? { partnerId, currency, validFrom, validTo } : resource === 'requests' ? { requiredBy, lines: lines.map(({ lineKey, skuId, quantity, description }) => ({ lineKey, skuId, quantity, description })) } : { partnerId, currency, requiredBy, requestId, contractId, lines: lines.map(({ requestLineId, quantity, unitPrice, freeReason }) => ({ requestLineId, quantity, unitPrice, ...(decimal(unitPrice) === 0n && { freeReason }) })) }) }
    const result = await action.submit(resource, body, 'Document submitted for independent review.')
    if (result) onCreated(result.item.id)
  }
  return <Form aria-label={`${titles[resource]} form`} onSubmit={submit}>
    <h2 className="text-lg font-semibold">New {titles[resource]}</h2><p className="mt-2 text-sm text-slate-600">Submitted details and source lines are retained. To change them, cancel the document and submit a replacement. An EBYS reference records your document reference; no external document is sent or fetched.</p>
    <fieldset disabled={action.busy} className="mt-5 min-w-0 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Document reference" required maxLength={64} pattern="[A-Za-z0-9._:\-]+" value={form.reference} onChange={e => set('reference', e.target.value)} /><Field label="Document date" type="date" required value={form.documentDate} onChange={e => set('documentDate', e.target.value)} /><Field label="EBYS reference" required maxLength={160} value={form.ebysReference} onChange={e => set('ebysReference', e.target.value)} />{resource !== 'contracts' && <Field label="Required delivery date" type="date" required min={form.documentDate} value={form.requiredBy} onChange={e => set('requiredBy', e.target.value)} />}</div>
      <Field label="Purchase purpose" required maxLength={1000} value={form.purpose} onChange={e => set('purpose', e.target.value)} />
      {resource !== 'requests' && <div className="grid gap-3 sm:grid-cols-2"><ProductPicker base={base} resource="partners" label="Supplier partner" required revision={revision} filters={{ kind: 'SUPPLIER' }} value={form.partnerId} onChange={v => setForm(f => ({ ...f, partnerId: v, contractId: null }))} /><Field label="Currency"><select className={inputStyle} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value, contractId: null }))}>{['TRY', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}</select></Field></div>}
      {resource === 'contracts' && <div className="grid gap-3 sm:grid-cols-2"><Field label="Valid from" required type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} /><Field label="Valid to" required type="date" min={form.validFrom} value={form.validTo} onChange={e => set('validTo', e.target.value)} /></div>}
      {resource === 'orders' && <><div className="grid gap-3 sm:grid-cols-2"><ProductPicker base={base} resource="requests" label="Approved purchase request" required activeOnly={false} filters={{ status: 'APPROVED' }} revision={revision} value={form.requestId} onChange={v => { set('requestId', v); setLines([]); setOffset(0) }} /><ProductPicker base={base} resource="contracts" label="Approved contract (optional)" activeOnly={false} disabled={!form.partnerId} filters={{ status: 'APPROVED', ...(form.partnerId && { partnerId: form.partnerId }) }} revision={revision} value={form.contractId} onChange={v => set('contractId', v)} /></div>{form.requestId && <RequestSources key={form.requestId} base={base} id={form.requestId} revision={revision} lines={lines} onAdd={addSource} />}</>}
      {resource === 'requests' && <div className="space-y-3"><ProductPicker base={base} resource="skus" label="Requested SKU" revision={revision} value={skuId} onChange={setSkuId} /><LoadState result={sku} label="selected SKU" /><Button type="button" variant="outline" disabled={!sku.data?.item?.active} onClick={addSku}>Add request line</Button></div>}
      {resource !== 'contracts' && <><Table columns={resource === 'requests' ? ['Source line / SKU', 'Description', 'Quantity / unit', 'Remove'] : ['Request line / SKU', 'Quantity / unit', 'Unit price', 'Free-goods reason', 'Remove']} rows={lines.slice(offset, offset + 25)} empty={resource === 'requests' ? 'Choose a SKU and add a request line.' : 'Choose an approved request and add its source lines.'} render={l => <><Cell><span className="inline-block min-w-40">{l.lineKey}<br />{l.skuCode} — {l.skuName}</span></Cell>{resource === 'requests' && <Cell><Field label={`Description ${l.lineKey}`} maxLength={255} value={l.description} onChange={e => setLine(l.id, 'description', e.target.value)} /></Cell>}<Cell><div className="min-w-36"><Field label={`Quantity ${l.lineKey}`} required inputMode="decimal" value={l.quantity} onChange={e => setLine(l.id, 'quantity', e.target.value)} /><p className="mt-1 text-xs">{l.unitCode}{resource === 'orders' && ` · Available: ${l.availableQuantity}`}</p></div></Cell>{resource === 'orders' && <><Cell><div className="min-w-36"><Field label={`Unit price ${l.lineKey}`} required inputMode="decimal" value={l.unitPrice} onChange={e => setLine(l.id, 'unitPrice', e.target.value)} /></div></Cell><Cell><div className="min-w-40"><Field label={`Free-goods reason ${l.lineKey}`} required={decimal(l.unitPrice) === 0n} disabled={decimal(l.unitPrice) !== 0n} maxLength={255} value={l.freeReason} onChange={e => setLine(l.id, 'freeReason', e.target.value)} /></div></Cell></>}<Cell><Button type="button" variant="outline" aria-label={`Remove ${l.lineKey}`} onClick={() => { setLines(current => current.filter(row => row.id !== l.id)); setOffset(0) }}>Remove</Button></Cell></>} /><Pager data={{ total: lines.length, limit: 25 }} offset={offset} setOffset={setOffset} /><p className="text-sm text-slate-600">{lines.length} lines retained. Quantities use each SKU’s base unit.</p></>}
      {resource === 'orders' && <p role="status" className="text-sm font-medium">Order net preview: {previewNet(lines)} {form.currency}. Excludes invoice VAT and currency conversion.</p>}
      <Field label="Commercial terms"><textarea className={inputStyle} rows={3} required={resource === 'contracts'} maxLength={2000} value={form.terms} onChange={e => set('terms', e.target.value)} /></Field>
      <Feedback error={action.error} /><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!ready}>Submit {titles[resource]}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel document form</Button></div>
    </fieldset>
  </Form>
}
function RequestSources({ base, id, revision, lines, onAdd }) {
  const [offset, setOffset] = useState(0)
  const list = useProducts(base, `requests/${id}/lines`, { limit: 25, offset }, revision)
  return <section className="min-w-0"><h3 className="font-medium">Approved request lines</h3><LoadState result={list} label="approved request lines" />{list.data && <><Table columns={['Line / SKU', 'Requested', 'Committed / available', 'Select']} rows={list.data.items} empty="No request lines available." render={l => <><Cell>{l.lineKey}<br />{l.skuSnapshot.code}</Cell><Cell>{l.quantity} {l.skuSnapshot.unitCode}</Cell><Cell>{l.committedQuantity} / {l.availableQuantity}</Cell><Cell><Button type="button" variant="outline" aria-label={`Add order line ${l.lineKey}`} disabled={lines.some(row => row.requestLineId === l.id) || decimal(l.availableQuantity) <= 0n} onClick={() => onAdd(l)}>Add</Button></Cell></>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}</section>
}
