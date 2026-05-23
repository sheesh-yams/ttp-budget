'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, FolderOpen, FileText,
  Receipt, List, LayoutGrid, Settings,
} from 'lucide-react'

const navItems = [
  {
    section: null,
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'Work',
    items: [
      { label: 'Clients',   href: '/clients',   icon: Users },
      { label: 'Projects',  href: '/projects',  icon: FolderOpen },
      { label: 'Proposals', href: '/proposals', icon: FileText },
      { label: 'Invoices',  href: '/invoices',  icon: Receipt },
    ],
  },
  {
    section: 'Configure',
    items: [
      { label: 'Rate cards', href: '/rates',     icon: List },
      { label: 'Templates',  href: '/templates', icon: LayoutGrid },
      { label: 'Settings',   href: '/settings',  icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-[200px] flex-shrink-0 flex-col bg-ink">

      {/* Logo */}
      <div className="border-b border-white/[0.08] px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-mint-300 text-xs font-medium text-mint-950">
            T
          </div>
          <span className="text-[11px] tracking-[0.05em] text-white/60">
            THE THIRD PLACE
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        {navItems.map((group) => (
          <div key={group.section ?? 'main'}>
            {group.section && (
              <p className="px-4 pb-1 pt-4 text-[10px] font-medium uppercase tracking-[0.07em] text-white/25">
                {group.section}
              </p>
            )}
            {group.items.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 border-l-2 px-4 py-2.5 text-[13px] transition-colors',
                    active
                      ? 'border-mint-300 bg-mint-300/[0.06] text-white'
                      : 'border-transparent text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-white/[0.08] p-4">
        <UserFooter />
      </div>
    </aside>
  )
}

// Lazy import to avoid loading Clerk on every page
function UserFooter() {
  // In real build: import { useUser } from '@clerk/nextjs'
  // Stubbed here for scaffold — replace with real Clerk hook
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-medium text-white">
        S
      </div>
      <div>
        <p className="text-[12px] font-medium text-white/80">Sheesh</p>
        <p className="text-[11px] text-white/40">Owner</p>
      </div>
    </div>
  )
}
