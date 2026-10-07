'use client'

import type { ElementType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, LayoutDashboard, DollarSign, FileText, Users, Receipt, ScanLine, Globe, Package, FileSpreadsheet, Clapperboard, ScrollText, Handshake } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavItem {
  label: string
  href: string
  icon: ElementType
  // exact = only active when the path matches exactly (not on sub-routes)
  exact?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/** Which tabs the viewer may open — computed by the layout from their
 *  project permissions; the pages refuse the same people. */
export type ProjectTabKey =
  | 'budget' | 'contract' | 'actuals' | 'receipts' | 'invoices'
  | 'crew' | 'dealMemos' | 'schedule' | 'callSheets' | 'delivery'

interface Props {
  projectId: string
  projectName: string
  clientName: string
  tabs: Record<ProjectTabKey, boolean>
}

function tabKey(projectId: string, href: string): ProjectTabKey | null {
  const rest = href.slice(`/projects/${projectId}`.length).replace(/^\//, '')
  if (!rest) return null // Overview — always shown
  if (rest.startsWith('delivery/')) return 'delivery'
  const map: Record<string, ProjectTabKey> = {
    budget: 'budget', contract: 'contract', actuals: 'actuals', receipts: 'receipts',
    invoices: 'invoices', crew: 'crew', 'deal-memos': 'dealMemos', schedule: 'schedule',
    'call-sheets': 'callSheets',
  }
  return map[rest] ?? null
}

/** The project's sections and tabs this viewer may open — shared by the
 *  desktop side column and the phone tab bar (ProjectMobileNav). */
export function projectNavSections(projectId: string, tabs: Record<ProjectTabKey, boolean>): NavSection[] {
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
          label: 'Budget',
          href: `/projects/${projectId}/budget`,
          icon: FileSpreadsheet,
        },
        {
          label: 'Contract',
          href: `/projects/${projectId}/contract`,
          icon: ScrollText,
        },
        {
          label: 'Actuals',
          href: `/projects/${projectId}/actuals`,
          icon: DollarSign,
        },
        {
          label: 'Receipts',
          href: `/projects/${projectId}/receipts`,
          icon: ScanLine,
        },
        {
          label: 'Invoices',
          href: `/projects/${projectId}/invoices`,
          icon: Receipt,
        },
      ],
    },
    {
      title: 'PRE-PROD',
      items: [
        {
          label: 'Crew',
          href: `/projects/${projectId}/crew`,
          icon: Users,
        },
        ...(tabs.dealMemos
          ? [{ label: 'Deal Memos', href: `/projects/${projectId}/deal-memos`, icon: Handshake }]
          : []),
        {
          label: 'Schedule',
          href: `/projects/${projectId}/schedule`,
          icon: Clapperboard,
        },
        {
          label: 'Call Sheets',
          href: `/projects/${projectId}/call-sheets`,
          icon: FileText,
        },
      ],
    },
    {
      title: 'DELIVERY',
      items: [
        {
          label: 'Client Page',
          href: `/projects/${projectId}/delivery/page`,
          icon: Globe,
        },
        {
          label: 'Deliverables',
          href: `/projects/${projectId}/delivery/deliverables`,
          icon: Package,
        },
      ],
    },
  ]

  return sections
    .map(sec => ({
      ...sec,
      items: sec.items.filter(item => {
        const key = tabKey(projectId, item.href)
        return key === null || tabs[key]
      }),
    }))
    .filter(sec => sec.items.length > 0)
}

export function isProjectNavActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

export function ProjectSubNav({ projectId, projectName, clientName, tabs }: Props) {
  const pathname = usePathname()
  const visibleSections = projectNavSections(projectId, tabs)
  const isActive = (item: NavItem) => isProjectNavActive(pathname, item)

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
        {visibleSections.map((section) => (
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
