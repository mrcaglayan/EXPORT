import { useState } from 'react'
import { useAuth } from './auth-context'

export default function SidebarAccount() {
  const { profile, selectEntity, logout, switching } = useAuth()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function perform(action) {
    setError(null)
    setBusy(true)
    try { await action() } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return (
    <div className="mt-auto border-t border-white/10 pt-5">
      <label className="block text-xs text-slate-300">Legal entity
        <select aria-label="Legal entity" value={profile?.activeEntity?.id ?? ''} disabled={busy || switching}
          onChange={event => perform(() => selectEntity(event.target.value))}
          className="mt-2 w-full rounded-lg border border-white/20 bg-[#142e35] p-2 text-sm text-white focus:outline-2 focus:outline-teal-300">
          {!profile?.activeEntity && <option value="">Select an entity</option>}
          {profile?.entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
        </select>
      </label>
      <p className="mt-4 break-words text-sm text-white">{profile?.user.displayName}</p>
      <p className="mt-1 break-all text-xs text-slate-400">{profile?.user.email}</p>
      {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
      <button onClick={() => perform(logout)} disabled={busy || switching} className="mt-3 rounded-lg py-2 text-sm text-teal-200 hover:text-white disabled:opacity-50">Sign out</button>
    </div>
  )
}
