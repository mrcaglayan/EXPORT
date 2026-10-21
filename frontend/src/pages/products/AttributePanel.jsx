import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Feedback, inputStyle, Table, Cell, Pager } from '@/pages/accounting/accounting-ui'
import { useAccountingMutation } from '@/pages/accounting/useAccounting'
import { useProducts } from './useProducts'
import ProductPicker from './ProductPicker'

export default function AttributePanel({ base, skuId, revision, onSaved, canManage }) {
  const [offset, setOffset] = useState(0)
  const [definitionId, setDefinitionId] = useState(null)
  const [value, setValue] = useState('')
  const list = useProducts(base, `skus/${skuId}/attributes`, { offset, limit: 25 }, revision)
  const selected = useProducts(base, `attribute-definitions/${definitionId}`, {}, revision, !!definitionId)
  const action = useAccountingMutation(base, onSaved)
  const definition = selected.data?.item
  return <section aria-label="SKU specifications">
    <h3 className="font-semibold">Specifications</h3>
    {canManage && <form aria-label="SKU specification" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={async e => {
      e.preventDefault()
      if (!definition || action.busy) return
      if (await action.submit(`skus/${skuId}/attributes`, { definitionId, value: definition.dataType === 'BOOLEAN' ? value === 'true' : value }, 'Specification saved.')) { setDefinitionId(null); setValue('') }
    }}><fieldset disabled={action.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <ProductPicker base={base} resource="attribute-definitions" revision={revision} label="Specification" required value={definitionId} onChange={id => { setDefinitionId(id); setValue(''); action.clearFeedback() }} />
      <div className="space-y-4">{definition && <>
        {definition.dataType === 'BOOLEAN' ? <Field label="Specification value"><select className={inputStyle} value={value || 'false'} onChange={e => setValue(e.target.value)}><option value="false">No</option><option value="true">Yes</option></select></Field>
          : <Field label="Specification value" required maxLength={1000} inputMode={definition.dataType === 'DECIMAL' ? 'decimal' : 'text'} value={value} onChange={e => setValue(e.target.value)} />}
        <p className="text-xs text-slate-600">{definition.dataType} {definition.unitLabel}. {definition.definesStock ? 'This value identifies the goods and is fixed once saved. Use another SKU for different goods.' : 'Descriptive values can be updated with an audit record.'}</p>
      </>}<Button type="submit" disabled={!definition || action.busy}>Save specification</Button></div>
    </fieldset></form>}
    <Feedback error={action.error || selected.error || list.error} message={action.message} />
    {list.loading && <p role="status" className="mt-4 text-sm">Loading specifications…</p>}
    {list.data && <><Table columns={['Specification', 'Value', 'Purpose', ...(canManage ? ['Actions'] : [])]} rows={list.data.items} empty="No specifications recorded." render={row => <>
      <Cell>{row.code} — {row.name}{!row.definitionActive && <p className="text-xs">Inactive definition</p>}</Cell><Cell>{typeof row.value === 'boolean' ? row.value ? 'Yes' : 'No' : row.value} {row.unitLabel}</Cell><Cell>{row.definesStock ? 'Stock identity' : 'Descriptive'}</Cell>
      {canManage && <Cell><Button variant="outline" disabled={!row.definitionActive} onClick={() => { setDefinitionId(row.definitionId); setValue(String(row.value)); action.clearFeedback() }} aria-label={`Set ${row.code}`}>Set value</Button></Cell>}
    </>} /><Pager data={list.data} offset={offset} setOffset={setOffset} /></>}
  </section>
}
