import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { navigation } from '@/lib/navigation'

export default function ModulePlaceholder({ path }) {
  const { title, icon: Icon } = navigation.find(item => item.path === path)
  return (
    <Card className="flex min-h-96 flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-6 rounded-2xl bg-teal-50 p-5 text-teal-800"><Icon size={32} strokeWidth={1.4} /></span>
      <Badge>Coming soon</Badge>
      <h1 className="mt-5 text-xl font-semibold">A home for your {title.toLowerCase()}</h1>
      <p className="mb-7 mt-3 max-w-md text-sm leading-7 text-slate-500">This space is being prepared. It is a navigation preview; records and operational tools are not available yet.</p>
      <Button asChild variant="outline"><Link to="/"><ArrowLeft size={16} />Back to dashboard</Link></Button>
    </Card>
  )
}
