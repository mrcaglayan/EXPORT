import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/api/client'

export function useAccountingList(base, resource, revision, pageSize = 25) {
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ items: [], total: 0, limit: pageSize })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    apiClient.get(`${base}/${resource}`, { params: { offset, limit: pageSize }, signal: controller.signal })
      .then(({ data }) => { setData(data); setError(null); setLoading(false) }, failure => {
        if (!controller.signal.aborted) { setError(failure); setLoading(false) }
      })
    return () => controller.abort()
  }, [base, resource, offset, revision, pageSize])
  return { data, error, loading, offset, setOffset }
}
export function useAccountingMutation(base, onSaved) {
  const keys = useRef(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const clearFeedback = useCallback(() => { setError(null); setMessage('') }, [])
  const submit = useCallback(async (path, body, success, method = 'post') => {
    setBusy(true)
    setError(null)
    setMessage('')
    const signature = JSON.stringify([method, path, body])
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID())
    try {
      const { data } = await apiClient.request({ url: `${base}/${path}`, method, data: body,
        headers: { 'Idempotency-Key': keys.current.get(signature) } })
      keys.current.delete(signature)
      setMessage(success)
      onSaved()
      return data
    } catch (failure) {
      // A definite domain rejection did not commit. Unknown network/server
      // outcomes retain the key so an explicit retry cannot duplicate a write.
      if (failure.status && failure.status < 500) keys.current.delete(signature)
      setError(failure)
      return null
    } finally { setBusy(false) }
  }, [base, onSaved])
  return { busy, error, message, submit, clearFeedback }
}
