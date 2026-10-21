import { CircleCheck, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useReadiness } from '@/hooks/useReadiness'
import EntitySettings from './EntitySettings'

export default function SettingsPage() {
  const { status, error, retry } = useReadiness()
  const loading = status === 'loading'

  return (
    <div className="space-y-6">
    <Card className="max-w-2xl p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Workspace connection</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Check whether your workspace is available.</p>
      <div className="my-7 rounded-xl bg-slate-50 p-5">
        {loading && (
          <p role="status" className="flex items-center gap-3 text-sm text-slate-600">
            <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />Checking your workspace…
          </p>
        )}
        {status === 'ready' && (
          <p role="status" className="flex items-center gap-3 text-sm text-teal-800">
            <CircleCheck size={20} aria-hidden="true" />Your workspace is connected.
          </p>
        )}
        {status === 'error' && (
          <div role="alert">
            <p className="flex items-center gap-3 text-sm font-medium text-amber-900">
              <CircleAlert size={20} aria-hidden="true" />
              {error.code === 'SCHEMA_NOT_READY' ? 'Workspace setup is still in progress.' : 'Your workspace is currently unavailable.'}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">Please try again. If this continues, contact the person managing your workspace.</p>
            {error.requestId && <p className="mt-3 break-all text-xs text-slate-500">Support reference: {error.requestId}</p>}
          </div>
        )}
      </div>
      <Button variant="outline" onClick={retry} disabled={loading}>
        <RefreshCw size={16} aria-hidden="true" />{loading ? 'Checking…' : 'Check again'}
      </Button>
      <p className="mt-5 text-xs leading-6 text-slate-500">Business modules remain in preview. Choose your legal entity and manage your session in the sidebar.</p>
    </Card>
    <EntitySettings />
    </div>
  )
}
