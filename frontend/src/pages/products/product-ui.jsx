import { Button } from '@/components/ui/button'
import { Feedback, Pager } from '@/pages/accounting/accounting-ui'

export function ProductLoadState({ result, label, retry }) {
  return <>
    {result.loading && <p role="status" className="mt-4 text-sm">Loading {label}…</p>}
    <Feedback error={result.error} />
    {result.error && <Button variant="outline" onClick={retry ?? result.retry}>Try again</Button>}
  </>
}

export function ProductPager({ data, offset, setOffset }) {
  if (offset && offset >= data.total) return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
    <span>This page has no records. The results may have changed.</span>
    <Button variant="outline" onClick={() => setOffset(0)}>Back to first page</Button>
  </div>
  return <Pager data={data} offset={offset} setOffset={setOffset} />
}

// Validate required wording without trimming or changing original supplier text.
// Native constraints handle codes, decimal formats, dates and field lengths.
export function ProductFormShell({ onSubmit, children, ...props }) {
  return <form {...props} onInputCapture={event => event.target.setCustomValidity?.('')} onSubmit={event => {
    for (const field of event.currentTarget.elements) {
      if (field.required && !field.disabled && ['text', 'textarea'].includes(field.type) && !field.value.trim()) {
        event.preventDefault()
        field.setCustomValidity('Enter text; spaces alone are not enough.')
        field.reportValidity()
        return
      }
    }
    onSubmit(event)
  }}>{children}</form>
}
