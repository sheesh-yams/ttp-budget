'use client'

import { usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients':   'Clients',
  '/projects':  'Projects',
  '/proposals': 'Proposals',
  '/invoices':  'Invoices',
  '/rates':     'Rate cards',
  '/templates': 'Templates',
  '/settings':  'Settings',
}

function getTitle(pathname: string): string {
  // Exact match first
  if (pageTitles[pathname]) return pageTitles[pathname]
  // Prefix match
  const match = Object.keys(pageTitles).find(
    (key) => key !== '/dashboard' && pathname.startsWith(key)
  )
  return match ? pageTitles[match] : ''
}

export function TopBar() {
  const pathname = usePathname()
  const title = getTitle(pathname)

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-[15px] font-medium text-foreground">{title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
