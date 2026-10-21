import { Slot } from 'radix-ui'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-teal-800 text-white hover:bg-teal-900',
        outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        ghost: 'text-slate-600 hover:bg-slate-100',
      },
      size: { default: 'px-4 py-2.5', icon: 'size-10' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({ asChild = false, variant, size, className, type = 'button', ...props }) {
  const Component = asChild ? Slot.Root : 'button'
  return <Component {...(!asChild && { type })} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
