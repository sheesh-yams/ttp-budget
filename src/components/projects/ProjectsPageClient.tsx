'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Plus, FolderOpen, LayoutGrid, List, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewProjectModal } from './NewProjectModal'
import { ProjectMetricsStrip } from './ProjectMetricsStrip'
import { ProjectStatusPills } from './ProjectStatusPills'
import { ProjectCard } from './ProjectCard'
import { ProjectsAttentionSidebar } from './ProjectsAttentionSidebar'
import { useState } from 'react'
import type {
  ProjectForCard,
  ProjectMetrics,
  AttentionItem,
  UpcomingShoot,
  StatusCounts,
  ViewMode,
  SortKey,
} from './projects-types'
import type { Client, BudgetTemplate } from '@prisma/client'

interface Props {
  projects:      ProjectForCard[]
  metrics:       ProjectMetrics
  attentionItems: AttentionItem[]
  upcomingShoots: UpcomingShoot[]
  statusCounts:  StatusCounts
  clients:       Pick<Client, 'id' | 'name'>[]
  templates:     Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
  initialStatus: string
  initialView:   ViewMode
  initialSort:   string
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently updated' },
  { key: 'name',   label: 'Name A–Z' },
  { key: 'shoot',  label: 'Shoot date' },
]

export function ProjectsPageClient({
  projects,
  metrics,
  attentionItems,
  upcomingShoots,
  statusCounts,
  clients,
  templates,
  initialStatus,
  initialView,
  initialSort,
}: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [modalOpen, setModalOpen] = useState(false)

  // ── URL-driven state ───────────────────────────────────────────────────────
  const status = initialStatus
  const view   = initialView
  const sort   = initialSort as SortKey

  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') params.delete(k)
        else params.set(k, v)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  function setView(v: ViewMode) {
    navigate({ view: v === 'grid' ? null : v })
  }
  function setSort(s: SortKey) {
    navigate({ sort: s === 'recent' ? null : s })
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = projects.filter(p => {
    if (!status || status === 'all') return p.status !== 'ARCHIVED'
    return p.status === status.toUpperCase()
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') {
      return a.name.localeCompare(b.name)
    }
    if (sort === 'shoot') {
      const da = a.shootStartDate ? new Date(a.shootStartDate).getTime() : Infinity
      const db = b.shootStartDate ? new Date(b.shootStartDate).getTime() : Infinity
      return da - db
    }
    // recent: by updatedAt desc (server already sent in this order, but re-sort client side for safety)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const showArchived = status === 'archived'

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {sorted.length} {sorted.length === 1 ? 'project' : 'projects'}
              {status && status !== 'all' ? ` · ${status.charAt(0).toUpperCase() + status.slice(1)}` : ''}
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        </div>

        {/* ── Metrics strip ────────────────────────────────────────────────── */}
        <ProjectMetricsStrip metrics={metrics} />

        {/* ── Filters + view toggle ─────────────────────────────────────────  */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <ProjectStatusPills statusCounts={statusCounts} current={status} />

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Sort picker */}
            <div className="relative">
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="appearance-none pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 cursor-pointer hover:border-gray-300 transition-colors focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setView('grid')}
                className={[
                  'p-1.5 rounded-md transition-colors',
                  view === 'grid'
                    ? 'text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700',
                ].join(' ')}
                style={view === 'grid' ? { background: 'var(--brand-primary)' } : undefined}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('list')}
                className={[
                  'p-1.5 rounded-md transition-colors',
                  view === 'list'
                    ? 'text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700',
                ].join(' ')}
                style={view === 'list' ? { background: 'var(--brand-primary)' } : undefined}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Main content + sidebar ────────────────────────────────────────── */}
        <div className="flex gap-6 items-start">

          {/* Left: project grid / list */}
          <div className="flex-1 min-w-0">
            {sorted.length === 0 ? (
              <EmptyState
                isArchived={showArchived}
                onNewProject={() => setModalOpen(true)}
              />
            ) : view === 'list' ? (
              <div className="flex flex-col gap-2">
                {sorted.map(p => (
                  <ProjectCard key={p.id} project={p} view="list" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sorted.map(p => (
                  <ProjectCard key={p.id} project={p} view="grid" />
                ))}
              </div>
            )}
          </div>

          {/* Right: attention sidebar (hidden below 1280px — shown as sticky panel) */}
          <div className="hidden xl:block w-80 flex-shrink-0 sticky top-6">
            <ProjectsAttentionSidebar
              attentionItems={attentionItems}
              upcomingShoots={upcomingShoots}
              metrics={metrics}
            />
          </div>
        </div>

        {/* ── Attention sidebar: mobile/tablet drawer (below xl) ─────────── */}
        {(attentionItems.length > 0 || upcomingShoots.length > 0) && (
          <div className="xl:hidden">
            <ProjectsAttentionSidebar
              attentionItems={attentionItems}
              upcomingShoots={upcomingShoots}
              metrics={metrics}
            />
          </div>
        )}

      </div>

      <NewProjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        clients={clients}
        templates={templates}
      />
    </div>
  )
}

// ── Empty states ────────────────────────────────────────────────────────────────

function EmptyState({
  isArchived,
  onNewProject,
}: {
  isArchived: boolean
  onNewProject: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-24 text-center bg-white">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--brand-primary-light)' }}
      >
        <FolderOpen className="w-8 h-8" style={{ color: 'var(--brand-primary)' }} />
      </div>
      {isArchived ? (
        <>
          <p className="text-base font-semibold text-gray-900">No archived projects</p>
          <p className="text-sm text-gray-500 mt-1">Projects you archive will appear here.</p>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-gray-900">No projects yet</p>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            Create your first project to start tracking proposals, invoices, and call sheets.
          </p>
          <Button className="mt-5" onClick={onNewProject}>
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        </>
      )}
    </div>
  )
}
