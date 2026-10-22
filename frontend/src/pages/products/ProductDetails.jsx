import { Button } from '@/components/ui/button'
import AttributePanel from './AttributePanel'
import GtipPanel from './GtipPanel'
import { useProducts } from './useProducts'
import { ProductLoadState } from './product-ui'

export default function ProductDetails({ skuId, onBack, ...props }) {
  const result = useProducts(props.base, `skus/${encodeURIComponent(skuId)}`, {}, props.revision)
  const item = result.error ? null : (result.data ?? result.previousData)?.item
  return <div className="mt-6 space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>{item && <><h2 className="font-semibold">{item.code} — {item.name}</h2><p className="mt-1 text-sm text-slate-500">{item.familyCode} · {item.baseUnitCode} · {item.active ? 'Active' : 'Inactive'}</p>{item.description && <p className="mt-2 max-w-2xl break-words text-sm text-slate-600">{item.description}</p>}</>}</div><Button variant="outline" onClick={onBack}>Back to SKUs</Button></div>
    <ProductLoadState result={result} label="SKU details" />
    {item && <>
      {!item.active && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This SKU is inactive. Its history remains available; reactivate it in the catalogue before adding specifications or GTİP proposals.</p>}
      <AttributePanel {...props} canManage={props.canManage && item.active} skuId={item.id} />
      <GtipPanel {...props} canManage={props.canManage && item.active} skuId={item.id} />
    </>}
  </div>
}
