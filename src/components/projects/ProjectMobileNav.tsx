'use client'

// Phone project navigation (below md), replacing the side column:
//   • a dark header strip under the app top bar — back to Projects + the name
//   • a bottom bar: Overview · Pre-prod · + · Money · Delivery. The group tabs
//     slide their sections up in a sheet; "+" creates on this project.
// The global MobileTabBar steps aside on /projects/[id]/* (see MobileNav).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, LayoutDashboard, Clapperboard, DollarSign, Package, Plus, Handshake, FileText, ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { NIGHT, SHEET_CLASS, Grab, TabLink, TabButton, CreateRow, closeOnLink } from '@/components/layout/MobileNav'
import { projectNavSections, isProjectNavActive, type NavItem, type ProjectTabKey } from '@/components/projects/ProjectSubNav'

type Group = 'preprod' | 'money' | 'delivery'

const GROUP_META: Record<Group, { label: string; icon: typeof Plus; title: string }> = {
  preprod:  { label: 'Pre-prod', icon: Clapperboard, title: 'Pre-production' },
  money:    { label: 'Money',    icon: DollarSign,   title: 'Money' },
  delivery: { label: 'Delivery', icon: Package,      title: 'Delivery' },
}

export function ProjectMobileHeader({ projectName, clientName }: { projectName: string; clientName: string }) {
  return (
    // Escapes the content column's p-4 to run full-bleed under the app top bar.
    <div className="md:hidden -mx-4 -mt-4 mb-4 px-4 pb-4 pt-1 text-white" style={{ background: NIGHT }}>
      <Link href="/projects" className="inline-flex items-center gap-1 py-1 text-[12px] text-white/55">
        <ChevronLeft className="h-3.5 w-3.5" />
        Projects
      </Link>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{clientName}</p>
      <h1 className="text-[19px] font-semibold leading-tight">{projectName}</h1>
    </div>
  )
}

export function ProjectMobileNav({ projectId, tabs, can }: {
  projectId: string
  tabs:      Record<ProjectTabKey, boolean>
  /** What this person may create on this project (Edit). */
  can:       { dealMemos: boolean; callSheets: boolean; receipts: boolean }
}) {
  const pathname = usePathname()
  const [sheet, setSheet] = useState<null | Group | 'create'>(null)
  useEffect(() => { setSheet(null) }, [pathname])

  const sections = projectNavSections(projectId, tabs)
  const overview = sections.flatMap(s => s.items).find(i => i.href === `/projects/${projectId}`)!
  const groups: Record<Group, NavItem[]> = {
    money:    sections.find(s => s.title === 'SALES')?.items.filter(i => i !== overview) ?? [],
    preprod:  sections.find(s => s.title === 'PRE-PROD')?.items ?? [],
    delivery: sections.find(s => s.title === 'DELIVERY')?.items ?? [],
  }
  const order: Group[] = ['preprod', 'money', 'delivery']
  const activeGroup = order.find(g => groups[g].some(i => isProjectNavActive(pathname, i))) ?? null
  const canCreate = can.dealMemos || can.callSheets || can.receipts

  // Overview, then Pre-prod, "+", Money, Delivery — absent groups drop out.
  const slots = [
    <TabLink key="overview" href={overview.href} label="Overview" icon={LayoutDashboard} active={isProjectNavActive(pathname, overview)} />,
    ...(groups.preprod.length ? [groupTab('preprod')] : []),
    ...(canCreate ? [
      <div key="plus" className="flex justify-center">
        <button
          type="button"
          onClick={() => setSheet('create')}
          aria-label="Create on this project"
          className="-mt-5 mb-1 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg transition-transform active:scale-95"
          style={{ background: 'var(--brand-primary,#5D00A4)', boxShadow: '0 10px 20px -8px rgba(93,0,164,.6)' }}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>,
    ] : []),
    ...(groups.money.length ? [groupTab('money')] : []),
    ...(groups.delivery.length ? [groupTab('delivery')] : []),
  ]

  function groupTab(g: Group) {
    const meta = GROUP_META[g]
    return (
      <TabButton
        key={g} label={meta.label} icon={meta.icon}
        active={sheet === g || (sheet === null && activeGroup === g)}
        onClick={() => setSheet(s => (s === g ? null : g))}
      />
    )
  }

  const base = `/projects/${projectId}`
  return (
    <>
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ borderColor: '#E8E0F0', paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Project"
      >
        <div className="grid items-end px-1.5 pt-1.5 pb-1" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
          {slots}
        </div>
      </nav>

      {order.map(g => (
        <Sheet key={g} open={sheet === g} onOpenChange={o => setSheet(o ? g : null)}>
          <SheetContent
            side="bottom" className={SHEET_CLASS}
            onOpenAutoFocus={e => e.preventDefault()} onClickCapture={closeOnLink(() => setSheet(null))}
            style={{ background: NIGHT, paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <Grab />
            <SheetTitle className="px-5 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">{GROUP_META[g].title}</SheetTitle>
            <nav className="px-2">
              {groups[g].map(item => {
                const active = isProjectNavActive(pathname, item)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium', active ? 'text-white' : 'text-white/70 active:bg-white/[0.06]')}
                    style={active ? { background: 'color-mix(in srgb, var(--brand-accent,#04FFCC) 12%, transparent)' } : undefined}
                  >
                    <Icon className="h-[18px] w-[18px]" style={{ color: active ? 'var(--brand-accent,#04FFCC)' : undefined }} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>
      ))}

      <Sheet open={sheet === 'create'} onOpenChange={o => setSheet(o ? 'create' : null)}>
        <SheetContent
          side="bottom" className={SHEET_CLASS}
          onOpenAutoFocus={e => e.preventDefault()} onClickCapture={closeOnLink(() => setSheet(null))}
          style={{ background: NIGHT, paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          <Grab />
          <SheetTitle className="px-5 pb-2 text-[17px] font-semibold text-white">Create on this project</SheetTitle>
          <div className="px-3">
            {can.dealMemos && <CreateRow href={`${base}/deal-memos`} icon={Handshake} title="Deal memo" hint="Hire crew or a vendor" />}
            {can.callSheets && <CreateRow href={`${base}/call-sheets`} icon={FileText} title="Call sheet" hint="For a shoot day" />}
            {can.receipts && <CreateRow href={`${base}/receipts`} icon={ScanLine} title="Receipt" hint="Snap and log a cost" />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
