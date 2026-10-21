import { Button } from '@/components/ui/button'
import AttributePanel from './AttributePanel'
import GtipPanel from './GtipPanel'

export default function ProductDetails({ item, onBack, ...props }) {
  return <div className="mt-6 space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{item.code} — {item.name}</h2><p className="mt-1 text-sm text-slate-500">{item.familyCode} · {item.baseUnitCode} · {item.active ? 'Active' : 'Inactive'}</p></div><Button variant="outline" onClick={onBack}>Back to SKUs</Button></div>
    <AttributePanel {...props} skuId={item.id} />
    <GtipPanel {...props} skuId={item.id} />
  </div>
}
