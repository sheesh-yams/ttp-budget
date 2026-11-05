'use client'

// /projects — Ramp-style table (approved mockup docs/mockups/projects-table).
// Tabs, stats, search + filters, sortable columns, group by phase, in-place
// phase changes. Table state lives in the URL via history.replaceState (no
// server round trip); column choice in localStorage.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Columns3, Download, Plus, Rows3, Search, X } from 'lucide-react'
import type { BudgetTemplate, Client } from '@prisma/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SL } from '@/components/shot-list/styles'
import { formatMoney } from '@/lib/money'
import { PHASES, phaseLabel, statusForPhase, type PhaseKey } from '@/lib/project-phase'
import {
  EMPTY_FILTERS, TABS, defaultDir, inTab, isSortKey, isTab, matches, sortRows,
  type Filters, type ProjectRow, type SortDir, type SortKey, type TabKey,
} from '@/lib/projects-table'
import { archiveProject, setProjectPhase, unarchiveProject, wrapProject } from '@/server/actions/projects'
import { NewProjectModal } from '../NewProjectModal'
import { EditTeamModal } from '../EditTeamModal'
import { COLUMNS, ProjectsPhoneList, ProjectsTable, type ColumnKey, type Group, type RowActions } from './ProjectsTable'
import { SHOOT_TYPE_OPTIONS, shootTypeLabel } from './labels'

export interface ProjectStats {
  showMoney:           boolean
  pipelineCents:       number
  pipelineCount:       number
  outstandingCents:    number
  overdueCount:        number
  wonThisQuarterCents: number
  wonLastQuarterCents: number
  upcomingShoots:      number
}

interface Props {
  rows:      ProjectRow[]
  stats:     ProjectStats
  canManageProjects: boolean
  clients:   Pick<Client, 'id' | 'name'>[]
  templates: Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
}

const COLS_KEY = 'slatesuite.projects.columns'
const ALL_COLS: ColumnKey[] = COLUMNS.map(c => c.key)
const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

export function ProjectsTableClient({ rows: serverRows, stats, canManageProjects, clients, templates }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()
  const { confirm, ConfirmDialog } = useConfirm()

  // ── Optimistic phase / status overrides until the refresh lands ───────────
  const [overrides, setOverrides] = useState<Record<string, { phase: PhaseKey; status: string }>>({})
  useEffect(() => { setOverrides({}) }, [serverRows])
  const rows = useMemo(
    () => serverRows.map(r => (overrides[r.id] ? { ...r, ...overrides[r.id], suggested: null } : r)),
    [serverRows, overrides],
  )

  // ── URL-backed state ─────────────────────────────────────────────────────
  const urlTab = params.get('tab')
  const defaultTab: TabKey = rows.some(r => r.status === 'ACTIVE') ? 'progress' : 'all'
  const [tab, setTab]   = useState<TabKey>(isTab(urlTab) ? urlTab : defaultTab)
  const [filters, setFilters] = useState<Filters>({
    q:       params.get('q') ?? '',
    phases:  list(params.get('phase')),
    clients: list(params.get('client')),
    types:   list(params.get('type')),
    lead:    params.get('lead'),
  })
  const urlSort = params.get('sort')
  const [sort, setSort] = useState<SortKey>(isSortKey(urlSort) ? urlSort : 'shoot')
  const [dir, setDir]   = useState<SortDir>(params.get('dir') === 'desc' ? 'desc' : params.get('dir') === 'asc' ? 'asc' : defaultDir(isSortKey(urlSort) ? urlSort : 'shoot'))
  const [grouped, setGrouped] = useState(params.get('group') === 'phase')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const p = new URLSearchParams()
    if (tab !== defaultTab) p.set('tab', tab)
    if (filters.q.trim()) p.set('q', filters.q.trim())
    if (filters.phases.length) p.set('phase', filters.phases.join(','))
    if (filters.clients.length) p.set('client', filters.clients.join(','))
    if (filters.types.length) p.set('type', filters.types.join(','))
    if (filters.lead) p.set('lead', filters.lead)
    if (sort !== 'shoot') p.set('sort', sort)
    if (dir !== defaultDir(sort)) p.set('dir', dir)
    if (grouped) p.set('group', 'phase')
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }, [tab, filters, sort, dir, grouped, pathname, defaultTab])

  // ── Columns (per browser) ────────────────────────────────────────────────
  const [columns, setColumns] = useState<ColumnKey[]>(ALL_COLS)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null')
      if (Array.isArray(saved)) setColumns(ALL_COLS.filter(c => saved.includes(c)))
    } catch { /* private mode etc. */ }
  }, [])
  const toggleColumn = (k: ColumnKey) => setColumns(prev => {
    const next = prev.includes(k) ? prev.filter(c => c !== k) : ALL_COLS.filter(c => c === k || prev.includes(c))
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  const shownColumns = columns.filter(c => stats.showMoney || c !== 'budget')

  // ── ?new=1 opens the new-project modal (top bar, mobile "+") ─────────────
  const [newOpen, setNewOpen] = useState(false)
  useEffect(() => {
    if (params.get('new') !== '1') return
    if (canManageProjects) setNewOpen(true)
    const p = new URLSearchParams(window.location.search)
    p.delete('new')
    window.history.replaceState(null, '', p.size ? `${pathname}?${p}` : pathname)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // ── Derived lists ────────────────────────────────────────────────────────
  const filtered = useMemo(() => rows.filter(r => matches(r, filters)), [rows, filters])
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, filtered.filter(r => inTab(r, t.key)).length])) as Record<TabKey, number>, [filtered])
  const visible = useMemo(() => sortRows(filtered.filter(r => inTab(r, tab)), sort, dir), [filtered, tab, sort, dir])
  const groups: Group[] | null = useMemo(() => {
    if (!grouped) return null
    return PHASES.map(p => {
      const g = visible.filter(r => r.phase === p.key)
      const total = g.reduce((s, r) => s + (r.money?.valueCents ?? 0), 0)
      return { key: p.key, label: p.label, rows: g, totalLabel: stats.showMoney && total > 0 ? formatMoney(total) : null }
    }).filter(g => g.rows.length > 0)
  }, [grouped, visible, stats.showMoney])

  const filterCount = filters.phases.length + filters.clients.length + filters.types.length + (filters.lead ? 1 : 0)
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) m.set(r.client.id, r.client.name)
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])
  const peopleOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) for (const t of r.team) m.set(t.userId, t.name ?? t.email)
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const onSort = (k: SortKey) => {
    if (k === sort) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSort(k); setDir(defaultDir(k)) }
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null)
  const [teamFor, setTeamFor] = useState<ProjectRow | null>(null)
  const todayKey = new Date().toISOString().slice(0, 10)

  const onPhase = useCallback(async (row: ProjectRow, phase: PhaseKey) => {
    setError(null)
    setOverrides(o => ({ ...o, [row.id]: { phase, status: statusForPhase(phase, row.status) } }))
    const res = await setProjectPhase(row.id, phase)
    if (!res.success) {
      setOverrides(o => { const n = { ...o }; delete n[row.id]; return n })
      setError((res as { success: false; error: string }).error)
      return
    }
    router.refresh()
  }, [router])

  const actions: RowActions = {
    canManageProjects,
    onPhase,
    onTeam: row => setTeamFor(row),
    onWrap: async row => {
      const ok = await confirm(`"${row.name}" moves to Wrapped. You can reopen it by picking a phase.`, { title: 'Wrap project?', confirmLabel: 'Wrap project', key: 'project-wrap' })
      if (!ok) return
      setOverrides(o => ({ ...o, [row.id]: { phase: row.phase, status: 'WRAPPED' } }))
      const res = await wrapProject(row.id)
      if (!res.success) {
        setOverrides(o => { const n = { ...o }; delete n[row.id]; return n })
        setError((res as { success: false; error: string }).error)
      } else router.refresh()
    },
    onArchive: async row => {
      const ok = await confirm(`"${row.name}" will be archived and hidden from your projects. You can restore it at any time.`, { title: 'Archive project?', confirmLabel: 'Archive', key: 'project-archive' })
      if (!ok) return
      const res = await archiveProject(row.id)
      if (!res.success) setError((res as { success: false; error: string }).error)
      else router.refresh()
    },
    onRestore: async row => {
      const res = await unarchiveProject(row.id)
      if (!res.success) setError((res as { success: false; error: string }).error)
      else router.refresh()
    },
  }

  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const head = ['Project', 'Client', 'Type', 'Phase', 'Status', 'Next step', 'Shoot start', 'Shoot end', ...(stats.showMoney ? ['Value', 'Collected'] : [])]
    const lines = visible.map(r => [
      r.name, r.client.name, shootTypeLabel(r.shootType), phaseLabel(r.phase),
      r.status === 'LEAD' ? 'Lead' : r.status === 'ACTIVE' ? 'Active' : r.status === 'WRAPPED' ? 'Wrapped' : 'Archived',
      r.step.label, r.shootStart ?? '', r.shootEnd ?? '',
      ...(stats.showMoney ? [r.money ? (r.money.valueCents / 100).toFixed(2) : '', r.money ? (r.money.collectedCents / 100).toFixed(2) : ''] : []),
    ].map(esc).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `projects-${todayKey}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const wonDelta = stats.wonLastQuarterCents > 0
    ? Math.round(((stats.wonThisQuarterCents - stats.wonLastQuarterCents) / stats.wonLastQuarterCents) * 100)
    : null
  const anyProjects = rows.length > 0

  return (
    // Flush white page, Ramp-style: escape the content padding (p-4 / md:p-6).
    <div className="-mx-4 min-h-[calc(100vh-52px)] bg-white pb-24 text-[#1A1A1A] md:-m-6 md:pb-10">
      {ConfirmDialog}

      {/* Header */}
      <div className="px-4 pt-6 md:px-10 md:pt-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="mr-auto text-[34px] font-medium leading-tight tracking-[-0.035em] md:text-[44px]">Projects</h1>
          {anyProjects && (
            <button type="button" onClick={exportCsv} className={`${SL.btn} hidden sm:inline-flex`}><Download className="h-4 w-4" /> Export CSV</button>
          )}
          {canManageProjects && (
            <button type="button" onClick={() => setNewOpen(true)} className={SL.btnPrimary}><Plus className="h-4 w-4" /> New project</button>
          )}
        </div>

        {anyProjects && (
          <div className="mt-5 flex gap-7 overflow-x-auto border-b border-[#EEEDEA]" role="tablist">
            {TABS.map(t => (
              <button
                key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-0.5 pb-3 pt-2 text-[15px] ${tab === t.key ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'}`}
              >
                {t.label}
                <span className={`rounded-full px-2 text-xs ${tab === t.key || (t.key === 'attention' && counts.attention > 0) ? 'bg-accent font-medium text-accent-foreground' : 'bg-[#F0EFEC] text-[#6B6B6B]'}`}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {anyProjects && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-4 py-6 md:flex md:flex-wrap md:gap-x-14 md:px-10 md:py-7">
          {stats.showMoney && (
            <>
              <Stat label="Pipeline"><span className="text-primary">{formatMoney(stats.pipelineCents)}</span><Sub>{stats.pipelineCount} {stats.pipelineCount === 1 ? 'proposal' : 'proposals'} out</Sub></Stat>
              <Stat label="Outstanding">{formatMoney(stats.outstandingCents)}{stats.overdueCount > 0 && <Sub className="text-[#B42318]">{stats.overdueCount} overdue</Sub>}</Stat>
              <Stat label="Won this quarter">{formatMoney(stats.wonThisQuarterCents)}{wonDelta !== null && <Sub className={wonDelta >= 0 ? 'text-[#027A48]' : 'text-[#B42318]'}>{wonDelta >= 0 ? '+' : ''}{wonDelta}% vs last</Sub>}</Stat>
            </>
          )}
          <Stat label="Shoots next 30 days">{stats.upcomingShoots}</Stat>
        </div>
      )}

      {/* Toolbar */}
      {anyProjects && (
        <div className={`flex flex-wrap items-center gap-2 border-y border-[#EEEDEA] ${SL.band} px-4 py-3 md:px-10`}>
          <label className="flex w-full items-center gap-2 rounded-full border border-[#E2E0DC] bg-white px-4 py-2 sm:w-64">
            <Search className={`h-4 w-4 flex-none ${SL.mut}`} />
            <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="Search projects or clients…" className="w-full bg-transparent text-sm placeholder:text-[#9A9A9A] focus:outline-none" />
          </label>
          <FilterChip label="Phase" options={PHASES.map(p => ({ value: p.key, label: p.label }))} selected={filters.phases} onChange={v => setFilters(f => ({ ...f, phases: v }))} />
          <FilterChip label="Client" options={clientOptions} selected={filters.clients} onChange={v => setFilters(f => ({ ...f, clients: v }))} searchable />
          <FilterChip label="Type" options={SHOOT_TYPE_OPTIONS} selected={filters.types} onChange={v => setFilters(f => ({ ...f, types: v }))} />
          {peopleOptions.length > 0 && (
            <FilterChip label="Team" single options={peopleOptions} selected={filters.lead ? [filters.lead] : []} onChange={v => setFilters(f => ({ ...f, lead: v[0] ?? null }))} />
          )}
          {filterCount > 0 && (
            <button type="button" onClick={() => setFilters(f => ({ ...EMPTY_FILTERS, q: f.q }))} className={`text-[13px] ${SL.t2} hover:text-[#1A1A1A]`}>Clear</button>
          )}
          <div className="ml-auto hidden gap-2 md:flex">
            <button type="button" title="Group by phase" aria-pressed={grouped} onClick={() => setGrouped(g => !g)} className={`${SL.iconBtn} ${grouped ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-[#E2E0DC] text-[#6B6B6B]'}`}><Rows3 className="h-4 w-4" /></button>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" title="Columns" className={`${SL.iconBtn} border-[#E2E0DC] text-[#6B6B6B]`}><Columns3 className="h-4 w-4" /></button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 rounded-[4px] p-1.5">
                <p className={`px-2 pb-1.5 pt-1 text-xs ${SL.mut}`}>Columns</p>
                {COLUMNS.filter(c => stats.showMoney || !c.money).map(c => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-sm hover:bg-[#FAF9F7]">
                    <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} className="accent-[var(--brand-primary,#5D00A4)]" />
                    {c.label}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {error && <p className="flex items-center gap-2 border-b border-[#EEEDEA] bg-amber-50 px-4 py-2 text-sm text-amber-800 md:px-10" role="alert">{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="ml-auto"><X className="h-4 w-4" /></button></p>}

      {/* Body */}
      {!anyProjects ? (
        <div className="px-4 py-20 text-center md:px-10">
          <p className="text-lg font-medium">No projects yet</p>
          <p className={`mt-1 text-sm ${SL.t2}`}>Create one to start a budget, proposal and invoices.</p>
          {canManageProjects && <button type="button" onClick={() => setNewOpen(true)} className={`${SL.btnPrimary} mt-5`}><Plus className="h-4 w-4" /> New project</button>}
        </div>
      ) : visible.length === 0 ? (
        <p className={`px-4 py-14 text-center text-sm md:px-10 ${SL.t2}`}>
          {filters.q || filterCount ? 'No projects match.' : tab === 'attention' ? 'Nothing needs attention.' : 'Nothing here.'}
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <ProjectsTable
              rows={visible} groups={groups} columns={shownColumns} sort={sort} dir={dir} onSort={onSort}
              actions={actions} todayKey={todayKey} collapsed={collapsed}
              onToggleGroup={k => setCollapsed(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
            />
          </div>
          <div className="md:hidden"><ProjectsPhoneList rows={visible} /></div>
        </>
      )}

      {canManageProjects && anyProjects && (
        <div className="hidden px-10 py-4 md:block">
          <button type="button" onClick={() => setNewOpen(true)} className="text-sm text-primary hover:underline">+ New project</button>
        </div>
      )}

      <NewProjectModal open={newOpen} onOpenChange={setNewOpen} clients={clients} templates={templates} />
      {teamFor && typeof document !== 'undefined' && createPortal(
        <EditTeamModal projectId={teamFor.id} projectName={teamFor.name} onClose={() => { setTeamFor(null); router.refresh() }} />,
        document.body,
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={`text-[13.5px] ${SL.t2}`}>{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[24px] font-medium leading-tight tracking-[-0.03em] md:text-[32px]">{children}</div>
    </div>
  )
}

function Sub({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[13px] font-normal tracking-normal md:text-[15px] ${className || SL.mut}`}>{children}</span>
}

function FilterChip({ label, options, selected, onChange, single = false, searchable = false }: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
  single?: boolean
  searchable?: boolean
}) {
  const [q, setQ] = useState('')
  const on = selected.length > 0
  const first = options.find(o => o.value === selected[0])?.label
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`${SL.chip} ${on ? SL.chipOn : SL.chipOff}`}>
          {on ? <>{label}: <b className="font-medium">{selected.length === 1 ? first : `${selected.length}`}</b></> : label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 rounded-[4px] p-1.5">
        {searchable && options.length > 8 && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}s…`} className={`${SL.input} mb-1.5`} />
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.map(o => {
            const checked = selected.includes(o.value)
            return (
              <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-sm hover:bg-[#FAF9F7]">
                <input
                  type={single ? 'radio' : 'checkbox'} name={single ? `f-${label}` : undefined} checked={checked}
                  onChange={() => onChange(single ? (checked ? [] : [o.value]) : checked ? selected.filter(v => v !== o.value) : [...selected, o.value])}
                  className="accent-[var(--brand-primary,#5D00A4)]"
                />
                <span className="truncate">{o.label}</span>
              </label>
            )
          })}
          {shown.length === 0 && <p className={`px-2 py-2 text-sm ${SL.mut}`}>No matches</p>}
        </div>
        {on && (
          <button type="button" onClick={() => onChange([])} className={`mt-1 w-full rounded-[3px] px-2 py-1.5 text-left text-[13px] ${SL.t2} hover:bg-[#FAF9F7]`}>Clear {label.toLowerCase()}</button>
        )}
      </PopoverContent>
    </Popover>
  )
}
