import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
})

// Fetch the current session-bound token before every mutation. The token remains
// in memory; both session and CSRF cookies are HttpOnly.
apiClient.interceptors.request.use(async config => {
  if (['post', 'patch', 'put', 'delete'].includes(config.method?.toLowerCase())) {
    const { data } = await apiClient.get('/auth/csrf')
    config.headers['X-CSRF-Token'] = data.csrfToken
  }
  return config
})

// UI callers receive one Error shape for HTTP, network and timeout failures.
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (axios.isCancel(error)) return Promise.reject(error)
    const data = error.response?.data
    const serverMessage = data?.error?.message ?? data?.message
    const fallback = error.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : error.response
        ? 'The request could not be completed.'
        : 'Unable to reach the server. Check your connection and try again.'
    const normalized = new Error(
      typeof serverMessage === 'string' ? serverMessage : fallback,
      { cause: error },
    )
    normalized.name = 'ApiError'
    normalized.status = error.response?.status ?? null
    normalized.code = data?.error?.code ?? error.code ?? 'REQUEST_FAILED'
    normalized.requestId = data?.requestId ?? error.response?.headers?.['x-request-id'] ?? null
    if (normalized.code === 'UNAUTHENTICATED' && !error.config?.url?.endsWith('/me')) {
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(normalized)
  },
)
