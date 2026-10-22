import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/api/client'

export function useProducts(base, resource, params, revision, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  const key = JSON.stringify([base, resource, params, revision, attempt])
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const [url, name, query] = JSON.parse(key)
    apiClient.get(`${url}/${name}`, { params: query, signal: controller.signal }).then(
      ({ data }) => { if (!controller.signal.aborted) setResult({ key, base: url, resource: name, data }) },
      error => { if (!controller.signal.aborted) setResult({ key, error }) },
    )
    return () => controller.abort()
  }, [key, enabled])
  return { data: enabled && result?.key === key ? result.data : null, error: enabled && result?.key === key ? result.error : null,
    previousData: enabled && result?.base === base && result?.resource === resource ? result.data : null,
    loading: enabled && result?.key !== key, retry }
}

export function useDebouncedValue(value, delay = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
