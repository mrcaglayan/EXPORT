import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'
import { Button } from '@/components/ui/button'

export default function RequireAuth() {
  const { status, error, refresh } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <p role="status" className="p-10 text-slate-600">Opening your workspace…</p>
  if (status === 'error') return (
    <div className="m-8 max-w-lg rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold">Unable to open your workspace</h1>
      <p role="alert" className="my-4 text-sm text-slate-600">{error.message}</p>
      <Button onClick={refresh}>Try again</Button>
    </div>
  )
  if (status !== 'ready') return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <Outlet />
}
