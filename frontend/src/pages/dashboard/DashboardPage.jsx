import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Compass } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { navigation } from '@/lib/navigation'

export default function DashboardPage() {
  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-[#e2efec] px-6 py-8 sm:px-9 sm:py-10">
        <div className="relative z-10 max-w-xl">
          <span className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-teal-900"><Compass size={16} /> A new beginning</span>
          <h1 className="max-w-md text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Every export starts with<br className="hidden sm:block" /> a clear picture.</h1>
          <p className="mb-6 mt-4 max-w-md text-sm leading-7 text-[#45645e]">Your products, stock and export records will come together here. Explore the workspace as we prepare your next steps.</p>
          <Button asChild><Link to="/products">Explore products <ArrowRight size={16} /></Link></Button>
        </div>
        <div aria-hidden="true" className="absolute -right-12 top-2 hidden size-80 rounded-full border border-teal-700/15 sm:block">
          <div className="absolute inset-9 rounded-full border border-teal-700/15" />
          <div className="absolute inset-18 flex items-center justify-center rounded-full border border-teal-700/15"><ArrowUpRight size={72} strokeWidth={0.8} className="text-teal-800/25" /></div>
        </div>
      </section>
      <div className="mb-5 mt-9 flex items-center justify-between"><h2 className="text-base font-semibold">Explore your workspace</h2><span className="text-xs text-slate-500">5 connected modules</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {navigation.filter(item => !['/', '/settings'].includes(item.path)).map(({ path, title, icon: Icon, description }) => (
          <Link key={path} to={path} className="group rounded-xl">
            <Card className="h-full p-5 transition-colors group-hover:border-teal-400">
              <div className="mb-5 flex items-center justify-between"><span className="rounded-lg bg-slate-50 p-2.5 text-teal-800"><Icon size={20} strokeWidth={1.6} /></span><ArrowUpRight size={17} className="text-slate-400 group-hover:text-teal-700" /></div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mb-5 mt-2 min-h-10 text-sm leading-6 text-slate-500">{description}</p>
              <Badge>Coming soon</Badge>
            </Card>
          </Link>
        ))}
        <Card className="flex flex-col justify-center border-dashed bg-transparent p-6">
          <p className="text-sm font-medium">Room to grow</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">This preview introduces the workspace. Records and operational tools will arrive in future releases.</p>
        </Card>
      </div>
    </>
  )
}
