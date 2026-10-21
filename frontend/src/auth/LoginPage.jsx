import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from './auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const inputClass = 'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
export default function LoginPage() {
  const { login, status } = useAuth()
  const location = useLocation()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tenantCode, setTenantCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const destination = location.state?.from
  if (status === 'ready') return <Navigate to={typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') && destination !== '/login' ? destination : '/'} replace />
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try { await login({ tenantCode, email, password }) } catch (failure) {
      setError(failure)
      setPassword('')
    } finally { setBusy(false) }
  }
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <Card className="w-full max-w-md p-7 sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-sm font-semibold text-slate-700">
          <span className="rounded-xl bg-[#142e35] p-3 text-teal-200"><ArrowUpRight size={24} /></span>
          Export Accounting
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Continue to your company’s workspace.</p>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block text-sm font-medium">Workspace code
            <input className={inputClass} autoComplete="organization" name="tenantCode" required maxLength={40}
              value={tenantCode} onChange={e => setTenantCode(e.target.value)} disabled={busy} autoCapitalize="characters" />
          </label>
          <label className="block text-sm font-medium">Email
            <input className={inputClass} autoComplete="username" name="email" type="email" required maxLength={254}
              value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          </label>
          <label className="block text-sm font-medium">Password
            <input className={inputClass} autoComplete="current-password" name="password" type="password" required
              value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
          </label>
          {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {error.message}{error.requestId && <p className="mt-2 break-all text-xs">Support reference: {error.requestId}</p>}
          </div>}
          <Button type="submit" className="w-full" disabled={busy || status === 'loading'}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <p className="mt-6 text-xs leading-5 text-slate-500">Need access? Contact the person managing your workspace.</p>
      </Card>
    </main>
  )
}
