'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, FolderOpen, FileText,
  Receipt, List, LayoutGrid, Settings,
} from 'lucide-react'

const navGroups = [
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
    <aside
      className="flex w-[200px] flex-shrink-0 flex-col"
      style={{ background: '#0A0612' }}
    >
      {/* ── Logo ── */}
      <div className="border-b border-white/[0.08] px-4 py-[18px]">
        <div className="flex items-center gap-2.5">
          {/* Mint "T" mark */}
          <div
            className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] text-[13px] font-black"
            style={{ background: '#04FFCC', color: '#003D31' }}
          >
            T
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 leading-none">
              The Third Place
            </p>
            <p className="text-[9px] font-medium tracking-[0.08em] text-white/35 mt-[3px] leading-none">
              Creative
            </p>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 py-3">
        {navGroups.map((group) => (
          <div key={group.section ?? 'main'}>
            {group.section && (
              <p className="px-4 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/25">
                {group.section}
              </p>
            )}
            {group.items.map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== '/dashboard' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 border-l-2 px-3.5 py-[9px] text-[12.5px] font-medium transition-colors',
                    active
                      ? 'border-[#04FFCC] text-white'
                      : 'border-transparent text-white/45 hover:bg-white/[0.035] hover:text-white/75'
                  )}
                  style={active ? { background: 'rgba(4,255,204,0.07)' } : undefined}
                >
                  <Icon
                    className="h-[15px] w-[15px] flex-shrink-0"
                    style={{ color: active ? '#04FFCC' : undefined }}
                  />
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── User footer ── */}
      <div className="border-t border-white/[0.08] p-4">
        <UserFooter />
      </div>
    </aside>
  )
}

function UserFooter() {
  const { user } = useUser()

  const name      = user?.fullName ?? user?.firstName ?? 'You'
  const initials  = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const role      = (user?.publicMetadata?.role as string) ?? 'Owner'
  const avatarUrl = user?.imageUrl

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: '#5D00A4' }}
        >
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-white/85">{name}</p>
        <p className="text-[10px] text-white/35">{role}</p>
      </div>
    </div>
  )
}
