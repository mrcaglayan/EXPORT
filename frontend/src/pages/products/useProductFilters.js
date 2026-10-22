import { useSearchParams } from 'react-router-dom'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const states = ['PENDING', 'REVIEWED', 'VERIFIED', 'REJECTED', 'RETIRED']

// View state belongs to the URL so reload/back and SKU drill-down retain filters.
// Malformed URL values never become arbitrary API parameters.
export function useProductFilters(resource) {
  const [params, setParams] = useSearchParams()
  const read = key => params.get(`${resource}.${key}`) ?? ''
  const filters = {
    q: [...read('q')].filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').slice(0, 160),
    active: ['true', 'false'].includes(read('active')) ? read('active') : '',
    status: states.includes(read('status')) ? read('status') : '',
    offset: /^\d{1,7}$/.test(read('offset')) ? Math.min(Number(read('offset')), 1000000) : 0,
  }
  for (const key of ['familyId', 'supplierId', 'skuId']) filters[key] = uuid.test(read(key)) ? read(key) : null
  function change(values) {
    setParams(current => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries({ offset: 0, ...values })) {
        if (value) next.set(`${resource}.${key}`, String(value))
        else next.delete(`${resource}.${key}`)
      }
      return next
    }, { replace: true })
  }
  function clear() {
    setParams(current => {
      const next = new URLSearchParams(current)
      for (const key of [...next.keys()]) if (key.startsWith(`${resource}.`)) next.delete(key)
      return next
    }, { replace: true })
  }
  return { ...filters, change, clear }
}
