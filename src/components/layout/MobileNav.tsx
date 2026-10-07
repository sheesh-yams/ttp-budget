'use client'

// Phone shell (below md / 768px): a slim top bar with the workspace switcher,
// and a bottom tab bar — Home · Projects · + · Money · More. "+" opens a
// create sheet; More slides the rest of the sidebar's links up from the bar.
// The desktop Sidebar + TopBar are hidden at this size (see (auth)/layout).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, FolderOpen, Plus, DollarSign, Menu, Handshake, FileText, ScanLine, Receipt, FolderPlus, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { WorkspaceSwitcher, UserFooter, visibleNavGroups, type SidebarAccess } from '@/components/layout/Sidebar'
import { readLastProject, type LastProject } from '@/lib/last-project'

const NIGHT = '#0A0612'

// ─── Top bar ─────────────────────────────────────────────────────────────────

export function MobileTopBar({ workspaceName, logoUrl }: { workspaceName: string; logoUrl?: string | null }) {
  return (
    <header
      className="md:hidden flex-shrink-0"
      style={{ background: NIGHT, paddingTop: 'env(safe-area-inset-top)' }}
    >
      <WorkspaceSwitcher fallbackName={workspaceName} logoUrl={logoUrl} />
    </header>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

export function MobileTabBar({ workspaceId, areas, canCreateProject, canCreateInvoice }: {
  workspaceId:      string
  areas:            SidebarAccess
  canCreateProject: boolean
  /** May start an invoice from /invoices (Invoices edit, or a new project from an invoice). */
  canCreateInvoice: boolean
}) {
  const pathname = usePathname()
  const [sheet, setSheet] = useState<null | 'create' | 'more'>(null)

  // Any navigation closes an open sheet.
  useEffect(() => { setSheet(null) }, [pathname])

  const moneyHref = areas.invoices ? '/invoices' : areas.proposals ? '/proposals' : null
  const isMoney   = pathname.startsWith('/invoices') || pathname.startsWith('/proposals')
  const isMore    = !['/dashboard', '/projects', '/invoices', '/proposals'].some(p => pathname === p || pathname.startsWith(`${p}/`))

  return (
    <>
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ borderColor: '#E8E0F0', paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Main"
      >
        <div className={cn('grid items-end px-1.5 pt-1.5 pb-1', moneyHref ? 'grid-cols-5' : 'grid-cols-4')}>
          <TabLink href="/dashboard" label="Home" icon={Home} active={pathname === '/dashboard'} />
          <TabLink href="/projects" label="Projects" icon={FolderOpen} active={pathname === '/projects' || pathname.startsWith('/projects/')} />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setSheet('create')}
              aria-label="Create"
              className="-mt-5 mb-1 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg transition-transform active:scale-95"
              style={{ background: 'var(--brand-primary,#5D00A4)', boxShadow: '0 10px 20px -8px rgba(93,0,164,.6)' }}
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {moneyHref && <TabLink href={moneyHref} label="Money" icon={DollarSign} active={isMoney} />}
          <TabButton label="More" icon={Menu} active={sheet === 'more' || (isMore && sheet === null)} onClick={() => setSheet(s => (s === 'more' ? null : 'more'))} />
        </div>
      </nav>

      <CreateSheet
        open={sheet === 'create'} onOpenChange={o => setSheet(o ? 'create' : null)}
        workspaceId={workspaceId} canInvoice={canCreateInvoice} canCreateProject={canCreateProject}
      />
      <MoreSheet open={sheet === 'more'} onOpenChange={o => setSheet(o ? 'more' : null)} areas={areas} pathname={pathname} />
    </>
  )
}

function TabLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold"
      style={{ color: active ? 'var(--brand-primary,#5D00A4)' : '#8A8597' }}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  )
}

function TabButton({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Home; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold"
      style={{ color: active ? 'var(--brand-primary,#5D00A4)' : '#8A8597' }}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

/** Close the sheet when any link inside it is tapped — a link to the page
 *  you're on (or one that only adds ?new=1) doesn't change the pathname. */
function closeOnLink(close: () => void) {
  return (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('a')) close() }
}

const SHEET_CLASS = cn(
  'md:hidden rounded-t-3xl border-0 text-white px-0 pt-2 max-h-[85dvh] overflow-y-auto',
  '[&>button]:text-white/60 [&>button]:top-5',
)

function Grab() {
  return <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/20" />
}

function CreateSheet({ open, onOpenChange, workspaceId, canInvoice, canCreateProject }: {
  open: boolean; onOpenChange: (o: boolean) => void
  workspaceId: string; canInvoice: boolean; canCreateProject: boolean
}) {
  // Read on open — the project page records itself when visited.
  const [last, setLast] = useState<LastProject | null>(null)
  useEffect(() => { if (open) setLast(readLastProject(workspaceId)) }, [open, workspaceId])

  // Without a remembered project these go to the project list to pick one;
  // with one, only what this person may create there is offered.
  const onProject = (path: string) => (last ? `/projects/${last.id}/${path}` : '/projects')
  const offer = (key: keyof LastProject['can']) => !last || last.can[key]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={SHEET_CLASS} onOpenAutoFocus={e => e.preventDefault()} onClickCapture={closeOnLink(() => onOpenChange(false))} style={{ background: NIGHT, paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
        <Grab />
        <div className="px-5 pb-2">
          <SheetTitle className="text-[17px] font-semibold text-white">Create</SheetTitle>
          <p className="mt-0.5 text-[12px] text-white/50">
            {last
              ? <>On <span className="font-medium text-white/80">{last.name}</span> · <Link href="/projects" className="font-semibold" style={{ color: 'var(--brand-accent,#04FFCC)' }}>change</Link></>
              : 'Deal memos, call sheets and receipts go on a project — pick one first.'}
          </p>
        </div>
        <div className="px-3">
          {offer('dealMemos') && <CreateRow href={onProject('deal-memos')} icon={Handshake} title="Deal memo" hint="Hire crew or a vendor" />}
          {offer('callSheets') && <CreateRow href={onProject('call-sheets')} icon={FileText} title="Call sheet" hint="For a shoot day" />}
          {offer('receipts') && <CreateRow href={onProject('receipts')} icon={ScanLine} title="Receipt" hint="Snap and log a cost" />}
          {canInvoice && <CreateRow href="/invoices?new=1" icon={Receipt} title="Invoice" hint="New project or existing" />}
          {canCreateProject && <CreateRow href="/projects?new=1" icon={FolderPlus} title="Project" hint="Start from a template" accent />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CreateRow({ href, icon: Icon, title, hint, accent }: { href: string; icon: typeof Home; title: string; hint: string; accent?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-white/[0.06]">
      <span
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px]"
        style={accent
          ? { background: 'color-mix(in srgb, var(--brand-accent,#04FFCC) 18%, transparent)', color: 'var(--brand-accent,#04FFCC)' }
          : { background: 'rgba(255,255,255,0.07)', color: '#fff' }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-white">{title}</span>
        <span className="block text-[12px] text-white/45">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-white/30" />
    </Link>
  )
}

function MoreSheet({ open, onOpenChange, areas, pathname }: {
  open: boolean; onOpenChange: (o: boolean) => void; areas: SidebarAccess; pathname: string
}) {
  // Everything not on the tab bar: Home, Projects, Invoices and Proposals
  // already have a tab (Proposals stays here when Money opens Invoices).
  const onTabBar = new Set(['/dashboard', '/projects', areas.invoices ? '/invoices' : areas.proposals ? '/proposals' : ''])
  const groups = visibleNavGroups(areas)
    .map(g => ({ ...g, items: g.items.filter(i => !onTabBar.has(i.href)) }))
    .filter(g => g.items.length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={SHEET_CLASS} onOpenAutoFocus={e => e.preventDefault()} onClickCapture={closeOnLink(() => onOpenChange(false))} style={{ background: NIGHT, paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
        <Grab />
        <SheetTitle className="sr-only">More</SheetTitle>
        <nav className="px-2">
          {groups.map(group => (
            <div key={group.section ?? 'main'} className="pb-1">
              {group.section && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">{group.section}</p>
              )}
              {group.items.map(({ label, href, icon: Icon, exact }) => {
                const active = pathname === href || (!exact && pathname.startsWith(`${href}/`))
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium',
                      active ? 'text-white' : 'text-white/70 active:bg-white/[0.06]',
                    )}
                    style={active ? { background: 'color-mix(in srgb, var(--brand-accent,#04FFCC) 12%, transparent)' } : undefined}
                  >
                    <Icon className="h-[18px] w-[18px]" style={{ color: active ? 'var(--brand-accent,#04FFCC)' : undefined }} />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="mt-1 border-t border-white/[0.08]">
          <UserFooter />
        </div>
      </SheetContent>
    </Sheet>
  )
}
