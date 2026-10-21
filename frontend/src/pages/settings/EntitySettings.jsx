import { useState } from 'react'
import { useAuth } from '@/auth/auth-context'
import { apiClient } from '@/api/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function EntitySettings() {
  const { profile, can, refresh } = useAuth()
  const entity = profile.activeEntity
  const [name, setName] = useState(entity?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  if (!entity || !can('organizations.read')) return null
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await apiClient.patch(`/organizations/${entity.id}`, { name })
      await refresh()
      setMessage({ text: 'Company name saved.' })
    } catch (error) { setMessage({ text: error.message, error: true }) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Company details</h2>
      <p className="mt-2 text-sm text-slate-500">{profile.tenant.name} · {entity.code}</p>
      <form onSubmit={save} className="mt-5 space-y-4">
        <label className="block text-sm font-medium">Company name
          <input value={name} onChange={e => setName(e.target.value)} required maxLength={160}
            disabled={!can('organizations.update') || busy}
            className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm disabled:bg-slate-50" />
        </label>
        {can('organizations.update') && <Button type="submit" disabled={busy || name.trim() === entity.name}>{busy ? 'Saving…' : 'Save company name'}</Button>}
        {message && <p role={message.error ? 'alert' : 'status'} className="text-sm text-slate-600">{message.text}</p>}
      </form>
    </Card>
  )
}
