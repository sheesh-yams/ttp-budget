'use client'

// /proposals — what you're bidding for (approved mockup docs/mockups/proposals/v4.html).
// Square stat boxes, segmented tabs, the grey toolbar strip with filters and
// a List / Board toggle. Table state lives in the URL via replaceState.

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Download, Kanban, List, Plus, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SL } from '@/components/shot-list/styles'
import { FilterChip } from '@/components/projects/table/FilterChip'
import { ClientLogo } from '@/components/projects/table/ProjectsTable'
import { formatMoney } from '@/lib/money'
import {
  EMPTY_FILTERS, STATUS_LABEL, TABS, effectiveStatus, inTab, isTab, lastActivity, matches, sortDeals, stage, summarize,
  type BandKey, type DealRow, type Filters, type TabKey,
} from '@/lib/proposals-board'
import { deleteProposal, markProposalLost, markProposalWon } from '@/server/actions/proposals'
import { ReopenProposalDialog } from '../ReopenProposalDialog'
import { ProposalsList } from './ProposalsList'
import { ProposalsBoard } from './ProposalsBoard'
import type { DealActions } from './parts'

interface Props {
  rows: DealRow[]
  /** False for margin-blind roles: rows carry no money and the money stats hide. */
  showMoney: boolean
  canManageProjects: boolean
}

type View = 'list' | 'board'
const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])
const STATUS_OPTIONS = ['NONE', 'DRAFT', 'SENT', 'VIEWED', 'CHANGES_NEEDED', 'APPROVED', 'DECLINED', 'EXPIRED', 'LOST'].map(s => ({ value: s, label: STATUS_LABEL[s] }))

export function ProposalsPageClient({ rows: serverRows, showMoney, canManageProjects }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()
  const { confirm, ConfirmDialog } = useConfirm()
  // One clock per render pass, so every derived label agrees.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { setNow(new Date()) }, [serverRows])

  // Optimistic status until the refresh lands.
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  useEffect(() => { setOverrides({}) }, [serverRows])
  const rows = useMemo(
    () => serverRows.map(r => (r.proposal && overrides[r.key] ? { ...r, proposal: { ...r.proposal, status: overrides[r.key] } } : r)),
    [serverRows, overrides],
  )

  // ── URL-backed state ─────────────────────────────────────────────────────
  const [view, setView] = useState<View>(params.get('view') === 'board' ? 'board' : 'list')
  const defaultTab: TabKey = view === 'board' ? 'all' : 'open'
  const urlTab = params.get('tab')
  const [tab, setTab] = useState<TabKey>(isTab(urlTab) ? urlTab : defaultTab)
  const [filters, setFilters] = useState<Filters>({
    q:        params.get('q') ?? '',
    owners:   list(params.get('owner')),
    clients:  list(params.get('client')),
    statuses: list(params.get('status')),
  })
  useEffect(() => {
    const p = new URLSearchParams()
    if (view === 'board') p.set('view', 'board')
    if (tab !== defaultTab) p.set('tab', tab)
    if (filters.q.trim()) p.set('q', filters.q.trim())
    if (filters.owners.length) p.set('owner', filters.owners.join(','))
    if (filters.clients.length) p.set('client', filters.clients.join(','))
    if (filters.statuses.length) p.set('status', filters.statuses.join(','))
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }, [view, tab, filters, pathname, defaultTab])

  // Board shows every stage; the list opens on what's still in play.
  const switchView = (v: View) => { setView(v); setTab(v === 'board' ? 'all' : 'open') }

  // ── Derived ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => sortDeals(rows.filter(r => matches(r, filters, now))), [rows, filters, now])
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, filtered.filter(r => inTab(r, t.key, now)).length])) as Record<TabKey, number>, [filtered, now])
  const visible = useMemo(() => filtered.filter(r => inTab(r, tab, now)), [filtered, tab, now])
  const s = useMemo(() => summarize(filtered, now), [filtered, now])
  const [collapsed, setCollapsed] = useState<Set<BandKey>>(new Set())

  const ownerOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.owner) m.set(r.owner.userId, r.owner.name ?? r.owner.email)
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) m.set(r.client.id, r.client.name)
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])
  const filterCount = filters.owners.length + filters.clients.length + filters.statuses.length
  // Leads someone here can start a proposal for.
  const draftable = useMemo(() => rows.filter(r => r.canEdit && stage(r, now) === 'ns'), [rows, now])

  // ── Actions ──────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [reopen, setReopen] = useState<DealRow | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  async function setStatus(r: DealRow, status: 'APPROVED' | 'LOST') {
    setError(null)
    setOverrides(o => ({ ...o, [r.key]: status }))
    setPendingKey(r.key)
    const res = await (status === 'APPROVED' ? markProposalWon : markProposalLost)(r.proposal!.id)
    setPendingKey(null)
    if (!res.success) {
      setOverrides(o => { const n = { ...o }; delete n[r.key]; return n })
      setError((res as { success: false; error: string }).error)
    } else router.refresh()
  }

  const actions: DealActions = {
    now, copiedKey, pendingKey,
    copyLink: r => {
      if (!r.proposal) return
      navigator.clipboard?.writeText(`${window.location.origin}/p/${r.proposal.token}`).then(
        () => { setCopiedKey(r.key); setTimeout(() => setCopiedKey(k => (k === r.key ? null : k)), 1500) },
        () => setError('Couldn’t copy the link — open it from the menu instead.'),
      )
    },
    draft: r => {
      if (r.proposal) router.push(`/projects/${r.project.id}`)
      else router.push(r.hasBudget ? `/projects/${r.project.id}?proposal=new` : `/projects/${r.project.id}/budget`)
    },
    reopen: r => { setNote(null); setReopen(r) },
    markWon: async r => {
      const ok = await confirm(`"${r.project.name}" moves to Won, and the project becomes active (Pre-prod).`, { title: 'Mark as won?', confirmLabel: 'Mark won' })
      if (ok) await setStatus(r, 'APPROVED')
    },
    markLost: async r => {
      const ok = await confirm(`"${r.project.name}" moves to Lost & expired. If nothing else on the project was won, it goes back to a lead.`, { title: 'Mark as lost?', confirmLabel: 'Mark lost' })
      if (ok) await setStatus(r, 'LOST')
    },
    deleteDraft: async r => {
      const ok = await confirm(`Delete draft v${r.proposal!.version} of "${r.project.name}"? This can't be undone.`, { title: 'Delete draft?' })
      if (!ok) return
      setPendingKey(r.key)
      const res = await deleteProposal(r.proposal!.id)
      setPendingKey(null)
      if (!res.success) setError((res as { success: false; error: string }).error)
      else router.refresh()
    },
  }

  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const day = (d: string | null) => (d ? d.slice(0, 10) : '')
    const head = ['Project', 'Client', 'Proposal', 'Status', 'Version', 'Sent', 'Views', 'Last viewed', 'Expires', 'Last activity', 'Owner', ...(showMoney ? ['Value'] : [])]
    const lines = visible.map(r => [
      r.project.name, r.client.name, r.proposal?.title ?? '', STATUS_LABEL[effectiveStatus(r, now)],
      r.proposal ? `v${r.proposal.version}` : '', day(r.proposal?.sentAt ?? null), r.proposal ? String(r.proposal.viewCount) : '',
      day(r.proposal?.lastViewedAt ?? null), day(r.proposal?.expiresAt ?? null), day(lastActivity(r)),
      r.owner ? (r.owner.name ?? r.owner.email) : '',
      ...(showMoney ? [r.valueCents != null ? (r.valueCents / 100).toFixed(2) : ''] : []),
    ].map(esc).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `proposals-${now.toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const any = rows.length > 0
  const winRate = s.decidedCount > 0 ? Math.round((s.wonCount / s.decidedCount) * 100) : null
  const qDelta = s.wonLastQCents > 0 ? Math.round(((s.wonThisQCents - s.wonLastQCents) / s.wonLastQCents) * 100) : null

  const newProposal = (
    <Popover open={newOpen} onOpenChange={setNewOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={SL.btnPrimary}><Plus className="h-4 w-4" /> New proposal</button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-[4px] p-1.5">
        <p className={`px-2 pb-1.5 pt-1 text-xs ${SL.mut}`}>{draftable.length ? 'Start a proposal for a lead' : 'No leads waiting for a proposal'}</p>
        <div className="max-h-80 overflow-y-auto">
          {draftable.map(r => (
            <button key={r.key} type="button" onClick={() => { setNewOpen(false); actions.draft(r) }} className="flex w-full items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-[#FAF9F7]">
              <ClientLogo client={r.client} size={24} />
              <span className="min-w-0 flex-1 truncate">{r.project.name}</span>
              <span className={`whitespace-nowrap text-xs ${SL.mut}`}>{r.proposal ? `Draft v${r.proposal.version}` : r.hasBudget ? (showMoney && r.valueCents ? formatMoney(r.valueCents) : 'Budget ready') : 'No budget'}</span>
            </button>
          ))}
        </div>
        {canManageProjects && (
          <button type="button" onClick={() => router.push('/projects?new=1')} className="mt-1 w-full rounded-[3px] border-t border-[#EEEDEA] px-2 pb-1.5 pt-2 text-left text-sm text-primary hover:bg-[#FAF9F7]">＋ New lead</button>
        )}
        <p className={`px-2 pb-1 pt-1.5 text-xs ${SL.mut}`}>To revise a sent proposal, open its project.</p>
      </PopoverContent>
    </Popover>
  )

  return (
    // Flush white page, Ramp-style: escape the content padding (p-4 / md:p-6).
    <div className="-mx-4 min-h-[calc(100vh-52px)] bg-white pb-24 text-[#1A1A1A] md:-m-6 md:pb-10">
      {ConfirmDialog}

      {/* Header */}
      <div className="flex flex-wrap items-end gap-2.5 px-4 pt-6 md:px-10 md:pt-8">
        <div className="mr-auto">
          <h1 className="text-[34px] font-medium leading-tight tracking-[-0.035em] md:text-[44px]">Proposals</h1>
          {any && <p className={`mt-1 text-[15px] ${SL.t2}`}>What you’re bidding for: {s.outCount} out with clients, {s.nsCount} not started</p>}
        </div>
        {any && <button type="button" onClick={exportCsv} className={`${SL.btn} hidden sm:inline-flex`}><Download className="h-4 w-4" /> Export CSV</button>}
        {(draftable.length > 0 || canManageProjects) && newProposal}
      </div>

      {/* Stats: square boxes joined in a row */}
      {any && (
        <div className="px-4 pt-6 md:px-10"><div className="grid grid-cols-2 border-l border-t border-[#EEEDEA] md:grid-cols-4">
          <Stat label="Pipeline" accent>
            {showMoney ? formatMoney(s.pipelineCents) : s.outCount}<Sub>{showMoney ? `${s.outCount} out` : 'out with clients'}</Sub>
          </Stat>
          <Stat label="Drafting">
            {showMoney ? formatMoney(s.draftingCents) : s.nsCount}<Sub>{showMoney ? `${s.nsCount} not sent` : 'not sent'}</Sub>
          </Stat>
          <Stat label="Won this quarter">
            {showMoney ? formatMoney(s.wonThisQCents) : s.wonThisQCount}
            {showMoney && qDelta !== null
              ? <Sub className={qDelta >= 0 ? 'text-[#027A48]' : SL.mut}>{qDelta >= 0 ? '+' : ''}{qDelta}% vs last</Sub>
              : <Sub>{showMoney ? `${s.wonThisQCount} won` : 'won'}</Sub>}
          </Stat>
          <Stat label="Win rate">
            {winRate === null ? '—' : `${winRate}%`}<Sub>{s.wonCount} of {s.decidedCount} decided</Sub>
          </Stat>
        </div></div>
      )}

      {/* Toolbar strip */}
      {any && (
        <div className={`mt-6 flex flex-wrap items-center gap-2 border-y border-[#EEEDEA] ${SL.band} px-4 py-3 md:px-10`}>
          <div className="flex overflow-x-auto rounded-[4px] border border-[#E2E0DC] bg-white" role="tablist">
            {TABS.map(t => (
              <button
                key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-r border-[#EEEDEA] px-3.5 py-2 text-sm last:border-r-0 ${tab === t.key ? 'bg-[#1A1A1A] text-white' : `${SL.t2} hover:text-[#1A1A1A]`}`}
              >
                {t.label}
                <span className={`rounded-full px-2 text-xs ${tab === t.key ? 'bg-[#04FFCC] font-medium text-[#003D31]' : t.key === 'follow' && counts.follow > 0 ? 'bg-[#FEF3E2] font-medium text-[#B45309]' : 'bg-[#F0EFEC] text-[#6B6B6B]'}`}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <span className="hidden flex-1 lg:block" />
          <label className="flex w-full items-center gap-2 rounded-full border border-[#E2E0DC] bg-white px-4 py-2 sm:w-56">
            <Search className={`h-4 w-4 flex-none ${SL.mut}`} />
            <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="Search proposals…" className="w-full bg-transparent text-sm placeholder:text-[#9A9A9A] focus:outline-none" />
          </label>
          {ownerOptions.length > 0 && <FilterChip label="Owner" options={ownerOptions} selected={filters.owners} onChange={v => setFilters(f => ({ ...f, owners: v }))} />}
          <FilterChip label="Client" options={clientOptions} selected={filters.clients} onChange={v => setFilters(f => ({ ...f, clients: v }))} searchable />
          <FilterChip label="Status" options={STATUS_OPTIONS} selected={filters.statuses} onChange={v => setFilters(f => ({ ...f, statuses: v }))} />
          {filterCount > 0 && (
            <button type="button" onClick={() => setFilters(f => ({ ...EMPTY_FILTERS, q: f.q }))} className={`text-[13px] ${SL.t2} hover:text-[#1A1A1A]`}>Clear</button>
          )}
          <div className="ml-auto inline-flex rounded-full border border-[#E2E0DC] bg-white p-[3px] lg:ml-0">
            {(['list', 'board'] as const).map(v => (
              <button
                key={v} type="button" aria-pressed={view === v} onClick={() => switchView(v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[13px] ${view === v ? 'bg-[#1A1A1A] text-white' : SL.t2}`}
              >
                {v === 'list' ? <List className="h-3.5 w-3.5" /> : <Kanban className="h-3.5 w-3.5" />}{v === 'list' ? 'List' : 'Board'}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="flex items-center gap-2 border-b border-[#EEEDEA] bg-amber-50 px-4 py-2 text-sm text-amber-800 md:px-10" role="alert">{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="ml-auto"><X className="h-4 w-4" /></button></p>}
      {note && <p className={`flex items-center gap-2 border-b border-[#EEEDEA] px-4 py-2 text-sm md:px-10 ${note.includes('didn’t send') ? 'text-destructive' : 'text-emerald-700'}`} role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss" className="ml-auto"><X className="h-4 w-4" /></button></p>}

      {/* Body */}
      {!any ? (
        <div className="px-4 py-20 text-center md:px-10">
          <p className="text-lg font-medium">No proposals yet</p>
          <p className={`mt-1 text-sm ${SL.t2}`}>Start a lead on Projects, build its budget, then draft the proposal here.</p>
          {canManageProjects && <button type="button" onClick={() => router.push('/projects?new=1')} className={`${SL.btnPrimary} mt-5`}><Plus className="h-4 w-4" /> New lead</button>}
        </div>
      ) : view === 'board' ? (
        <ProposalsBoard rows={visible} showMoney={showMoney} actions={actions} onDraftNew={draftable.length ? () => setNewOpen(true) : undefined} />
      ) : visible.length === 0 ? (
        <p className={`px-4 py-14 text-center text-sm md:px-10 ${SL.t2}`}>
          {filters.q || filterCount ? 'No proposals match.' : tab === 'follow' ? 'Nothing to follow up.' : 'Nothing here.'}
        </p>
      ) : (
        <ProposalsList
          rows={visible} showMoney={showMoney} actions={actions} collapsed={collapsed}
          onToggleBand={k => setCollapsed(c => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })}
        />
      )}

      {any && (
        <p className={`border-t border-[#EEEDEA] px-4 py-4 text-[12.5px] md:px-10 ${SL.t2}`}>
          Open = drafts and proposals still with the client, plus leads with no proposal. Follow up = viewed more than 5 days ago with no reply, not opened 3+ days after sending, expiring within 2 days, or changes asked for.
        </p>
      )}

      <ReopenProposalDialog
        open={!!reopen}
        proposalId={reopen?.proposal?.id ?? null}
        proposalTitle={reopen?.proposal?.title ?? ''}
        onClose={() => setReopen(null)}
        onReopened={n => { setReopen(null); setNote(n); router.refresh() }}
        onMakeChanges={reopen ? (() => router.push(`/projects/${reopen.project.id}`)) : undefined}
        makeChangesLabel="Opens the project, where you can revise it and send the new version."
      />
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ label, accent = false, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-r border-[#EEEDEA] px-5 pb-[18px] pt-4">
      <div className={`text-[13px] ${SL.t2}`}>{label}</div>
      <div className={`mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[24px] font-medium leading-tight tracking-[-0.03em] md:text-[30px] ${accent ? 'text-primary' : ''}`}>{children}</div>
    </div>
  )
}

function Sub({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[13px] font-normal tracking-normal md:text-[13.5px] ${className || SL.mut}`}>{children}</span>
}
