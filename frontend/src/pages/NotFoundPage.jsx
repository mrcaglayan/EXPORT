import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
export default function NotFoundPage() {
  return <div className="py-16"><p className="text-sm text-teal-700">404</p><h1 className="mb-4 mt-3 text-3xl font-semibold">Page not found</h1><p className="mb-6 text-slate-500">This page is not part of the workspace.</p><Button asChild><Link to="/">Back to dashboard</Link></Button></div>
}
