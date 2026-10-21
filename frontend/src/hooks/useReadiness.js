import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'

export function useReadiness() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading', error: null })

  useEffect(() => {
    const controller = new AbortController()
    apiClient.get('/ready', { signal: controller.signal }).then(
      () => setState({ status: 'ready', error: null }),
      error => {
        if (!controller.signal.aborted) setState({ status: 'error', error })
      },
    )
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setState({ status: 'loading', error: null })
    setAttempt(value => value + 1)
  }

  return { ...state, retry }
}
