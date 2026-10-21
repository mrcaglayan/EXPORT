import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Dialog } from 'radix-ui'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigation } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/auth-context'
import SidebarAccount from '@/auth/SidebarAccount'

const appName = import.meta.env.VITE_APP_NAME || 'Export Accounting'

function Sidebar({ onNavigate }) {
  const { can } = useAuth()
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#142e35] px-5 py-7 text-white">
      <NavLink to="/" onClick={onNavigate} className="flex items-center gap-3 px-2" aria-label={`${appName} home`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-300 text-[#142e35]"><ArrowUpRight size={24} /></span>
        <span className="text-base font-semibold leading-tight">Export<span className="block text-sm font-normal text-slate-300">Accounting</span></span>
      </NavLink>
      <div className="mb-3 mt-8 px-3 text-[10px] font-medium tracking-[0.18em] text-slate-400">WORKSPACE</div>
      <nav aria-label="Main navigation" className="mb-6 space-y-1.5">
        {navigation.filter(item => can(item.permission)).map(({ path, title, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/'} onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors',
              isActive ? 'bg-white/10 text-teal-200' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              path === '/settings' && 'mt-7 border-t border-white/10 pt-5',
            )}>
            <Icon size={18} strokeWidth={1.7} />{title}
          </NavLink>
        ))}
      </nav>
      <SidebarAccount />
    </div>
  )
}

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { profile, switching } = useAuth()

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="sr-only z-50 rounded bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block"><Sidebar /></aside>
      <div className="lg:pl-60">
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger asChild>
            <Button className="fixed bottom-5 left-5 z-30 rounded-full bg-[#142e35] px-4 py-3 shadow-lg hover:bg-[#23454d] lg:hidden" aria-label="Open navigation">
              <Menu size={18} />Menu
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/40" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]">
              <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
              <Dialog.Description className="sr-only">Choose a workspace page.</Dialog.Description>
              <Sidebar onNavigate={() => setMenuOpen(false)} />
              <Dialog.Close asChild><Button size="icon" variant="ghost" className="absolute right-2 top-2 text-white hover:bg-white/10" aria-label="Close navigation"><X size={18} /></Button></Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-5 pt-9 pb-24 outline-none sm:px-9 lg:px-12 lg:py-11">
          {switching ? <p role="status">Switching legal entity…</p> : <Outlet key={profile?.activeEntity?.id ?? 'none'} />}
          <footer className="mt-12 border-t border-slate-200 pt-5 text-xs text-slate-500">{appName} <span className="mx-2 text-slate-300">/</span> Trading operations, connected.</footer>
        </main>
      </div>
    </div>
  )
}
