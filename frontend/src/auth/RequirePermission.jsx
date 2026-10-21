import { useAuth } from './auth-context'
import { Card } from '@/components/ui/card'

export default function RequirePermission({ permission, children }) {
  const { can, profile } = useAuth()
  if (!profile?.activeEntity || !can(permission)) return (
    <Card className="max-w-xl p-8">
      <h1 className="text-xl font-semibold">Access unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Select an assigned legal entity from the sidebar, or contact your workspace administrator for access.
      </p>
    </Card>
  )
  return children
}
