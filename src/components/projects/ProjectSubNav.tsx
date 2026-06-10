'use client'

import type { ElementType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, LayoutDashboard, DollarSign, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: ElementType
  // exact = only active when the path matches exactly (not on sub-routes)
  exact?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

interface Props {
  projectId: string
  projectName: string
  clientName: string
}

export function ProjectSubNav({ projectId, projectName, clientName }: Props) {
  const pathname = usePathname()

  const sections: NavSection[] = [
    {
      title: 'SALES',
      items: [
        {
          label: 'Overview',
          href: `/projects/${projectId}`,
          icon: LayoutDashboard,
          exact: true,
        },
        {
          label: 'Actuals',
          href: `/projects/${projectId}/actuals`,
          icon: DollarSign,
        },
      ],
    },
    {
      title: 'PRE-PROD',
      items: [
        {
          label: 'Call Sheets',
          href: `/projects/${projectId}/call-sheets`,
          icon: FileText,
        },
      ],
    },
  ]

  function isActive(item: NavItem): boolean {
    if (item.exact) {
      return pathname === item.href
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Back link */}
      <div className="px-3 pt-4 pb-3 border-b border-black/8">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All projects
        </Link>
      </div>

      {/* Project identity */}
      <div className="px-3 py-3 border-b border-black/8">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-0.5">
          {clientName}
        </p>
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {projectName}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary/12 text-primary font-medium'
                          : 'text-foreground/70 hover:bg-black/6 hover:text-foreground'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-3.5 w-3.5 flex-shrink-0',
                          active ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
