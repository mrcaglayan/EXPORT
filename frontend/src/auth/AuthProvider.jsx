import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/api/client'
import { AuthContext } from './auth-context'

export default function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [switching, setSwitching] = useState(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    try {
      const { data } = await apiClient.get('/me')
      if (current !== generation.current) return
      setProfile(data)
      setError(null)
      setStatus('ready')
    } catch (failure) {
      if (current !== generation.current) return
      setProfile(null)
      setError(failure.status === 401 ? null : failure)
      setStatus(failure.status === 401 ? 'anonymous' : 'error')
    }
  }, [])
  useEffect(() => {
    let mounted = true
    queueMicrotask(() => { if (mounted) refresh() })
    const expired = () => {
      generation.current++
      setProfile(null)
      setError(null)
      setStatus('anonymous')
    }
    const focused = () => { refresh() }
    window.addEventListener('auth:expired', expired)
    window.addEventListener('focus', focused)
    return () => {
      mounted = false
      window.removeEventListener('auth:expired', expired)
      window.removeEventListener('focus', focused)
    }
  }, [refresh])
  async function login(credentials) {
    generation.current++
    const { data } = await apiClient.post('/auth/login', credentials)
    setProfile(data)
    setError(null)
    setStatus('ready')
  }
  async function logout() {
    try { await apiClient.post('/auth/logout', {}) } catch (failure) {
      if (failure.status !== 401) throw failure
    }
    generation.current++
    setProfile(null)
    setStatus('anonymous')
  }
  async function selectEntity(legalEntityId) {
    generation.current++
    setSwitching(true)
    try {
      const { data } = await apiClient.post('/auth/context', { legalEntityId })
      setProfile(data)
    } finally { setSwitching(false) }
  }
  return (
    <AuthContext.Provider value={{ profile, status, error, switching, refresh, login, logout, selectEntity,
      can: permission => profile?.permissions.includes(permission) ?? false }}>
      {children}
    </AuthContext.Provider>
  )
}
