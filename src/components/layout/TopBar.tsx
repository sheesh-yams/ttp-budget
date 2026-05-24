'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Search, Plus } from 'lucide-react'

function greeting(name: string) {
  const h = new Date().getHours()
  const salutation = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${salutation}, ${name}`
}

function monthYear() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const DASHBOARD_ROUTE = '/dashboard'

export function TopBar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { user } = useUser()

  const firstName = user?.firstName ?? user?.fullName?.split(' ')[0] ?? 'there'
  const isDashboard = pathname === DASHBOARD_ROUTE

  return (
    <header className="flex h-[52px] flex-shrink-0 items-center justify-between border-b px-6"
      style={{ borderColor: '#E8E0F0', background: '#F7F4FA' }}
    >
      {/* Left: greeting on dashboard, page breadcrumb elsewhere */}
      {isDashboard ? (
        <p className="text-[13px] font-medium" style={{ color: '#2C2C2A' }}>
          {greeting(firstName)}
          <span className="ml-2 font-normal" style={{ color: '#888780' }}>
            · {monthYear()}
          </span>
        </p>
      ) : (
        <div /> /* page title is in the page's own <h1> */
      )}

      {/* Right: search + new project */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md p-1.5 transition-colors hover:bg-black/[0.05]"
          style={{ color: '#888780' }}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
          style={{ background: '#04FFCC', color: '#003D31' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#00D9A8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#04FFCC')}
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </button>
      </div>
    </header>
  )
}
