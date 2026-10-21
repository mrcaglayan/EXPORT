import { cn } from '@/lib/utils'
export function Badge({ className, ...props }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium tracking-wide text-slate-500', className)} {...props} />
}
