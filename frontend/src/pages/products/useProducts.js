import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'

export function useProducts(base, resource, params, revision, enabled = true) {
  const key = JSON.stringify([base, resource, params, revision])
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const [url, name, query] = JSON.parse(key)
    apiClient.get(`${url}/${name}`, { params: query, signal: controller.signal }).then(
      ({ data }) => { if (!controller.signal.aborted) setResult({ key, data }) },
      error => { if (!controller.signal.aborted) setResult({ key, error }) },
    )
    return () => controller.abort()
  }, [key, enabled])
  return { data: result?.key === key ? result.data : null, error: result?.key === key ? result.error : null,
    loading: enabled && result?.key !== key }
}
