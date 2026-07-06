'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { label: 'General',   href: '/settings' },
  { label: 'Payments',  href: '/settings/payments' },
  { label: 'Contracts', href: '/settings/contracts' },
]

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {tabs.map(({ label, href }) => {
        const active =
          href === '/settings'
            ? pathname === '/settings'
            : pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
