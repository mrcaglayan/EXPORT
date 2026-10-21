import { cloneElement, useId } from 'react'
import { Button } from '@/components/ui/button'

export const inputStyle = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50'
export function Field({ label, children, ...props }) {
  const id = useId()
  return <div className="text-sm font-medium text-slate-700">
    <label htmlFor={id} className="block">{label}</label>
    {children ? cloneElement(children, { id }) : <input className={inputStyle} {...props} id={id} />}
  </div>
}
export function Feedback({ error, message }) {
  return <>
    {error && <div role="alert" className="my-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error.message}
      {error.requestId && <p className="mt-1 break-all text-xs">Support reference: {error.requestId}</p>}
    </div>}
    {message && <p role="status" className="my-4 text-sm text-teal-800">{message}</p>}
  </>
}
export function Pager({ data, offset, setOffset }) {
  return <div className="mt-5 flex items-center justify-between gap-2 text-xs text-slate-500">
    <span>{data.total ? `${offset + 1}–${Math.min(offset + data.limit, data.total)} of ${data.total}` : 'No records yet'}</span>
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous</Button>
      <Button type="button" variant="outline" disabled={offset + data.limit >= data.total} onClick={() => setOffset(offset + data.limit)}>Next</Button>
    </div>
  </div>
}
export function Table({ columns, rows, render, empty }) {
  return <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-500"><tr>{columns.map(c => <th key={c} className="whitespace-nowrap px-4 py-3 font-medium">{c}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}>{render(row)}</tr>)}</tbody>
    </table>
    {!rows.length && <p className="px-4 py-8 text-sm text-slate-500">{empty}</p>}
  </div>
}
export function Cell({ children }) { return <td className="px-4 py-3 align-top">{children}</td> }
