'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontal, Calendar, FileText, Receipt,
  Archive, ArchiveRestore, ExternalLink,
  ClipboardList,
} from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { parseLocalDate } from '@/lib/time-format'
import { archiveProject, unarchiveProject } from '@/server/actions/projects'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EditTeamModal } from './EditTeamModal'
import {
  type ProjectForCard,
  statusLabel,
  statusBadgeStyle,
} from './projects-types'

interface Props {
  project:      ProjectForCard
  view?:        'grid' | 'list'
  canEditTeam?: boolean
}

// ── Client avatar (initials in a deterministic colored circle) ─────────────────

const AVATAR_COLORS = [
  { bg: '#dbeafe', text: '#1d4ed8' }, // blue
  { bg: '#fce7f3', text: '#be185d' }, // pink
  { bg: '#d1fae5', text: '#065f46' }, // green
  { bg: '#ede9fe', text: '#5b21b6' }, // purple
  { bg: '#fef3c7', text: '#92400e' }, // amber
  { bg: '#fee2e2', text: '#991b1b' }, // red
  { bg: '#e0f2fe', text: '#0369a1' }, // sky
  { bg: '#f3e8ff', text: '#6b21a8' }, // violet
]

function ClientAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const words    = name.trim().split(/\s+/)
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()

  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  const { bg, text } = AVATAR_COLORS[idx]

  const sizeClass = size === 'sm'
    ? 'w-7 h-7 text-xs'
    : 'w-9 h-9 text-sm'

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
      style={{ background: bg, color: text }}
      title={name}
    >
      {initials}
    </div>
  )
}

export function ProjectCard({ project, view = 'grid', canEditTeam = false }: Props) {
  const router    = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [menuPos,     setMenuPos]     = useState<{ top: number; left: number } | null>(null)
  const [mounted,     setMounted]     = useState(false)
  const [teamModal,   setTeamModal]   = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef    = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  function openMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuPos({
      top:  rect.bottom + 4 + window.scrollY,
      left: rect.right  - 168 + window.scrollX,
    })
    setMenuOpen(v => !v)
  }

  async function handleArchive() {
    setMenuOpen(false)
    const ok = await confirm(
      `"${project.name}" will be hidden from the main list.`,
      { title: 'Archive project?', key: 'archive-project', confirmLabel: 'Archive' },
    )
    if (!ok) return
    await archiveProject(project.id)
    router.refresh()
  }

  async function handleUnarchive() {
    setMenuOpen(false)
    await unarchiveProject(project.id)
    router.refresh()
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const approvedProposal   = project.proposals.find(p => p.status === 'APPROVED')
  // Prefer live gross total (budgetTotalCents) over the approvedTotalCents snapshot,
  // which may have been stored as a net value at the time the proposal was approved.
  const approvedCents      = approvedProposal
    ? (project.budgetTotalCents > 0 ? project.budgetTotalCents : (approvedProposal.approvedTotalCents ?? 0))
    : null
  const latestSentProposal = project.proposals
    .filter(p => ['SENT', 'VIEWED'].includes(p.status))
    .sort((a, b) => {
      const aTime = a.sentAt ? new Date(a.sentAt).getTime() : new Date(a.updatedAt).getTime()
      const bTime = b.sentAt ? new Date(b.sentAt).getTime() : new Date(b.updatedAt).getTime()
      return bTime - aTime
    })[0]
  const pendingInvoice     = project.invoices.find(i => ['SENT','VIEWED','OVERDUE'].includes(i.status))
  const paidTotal          = project.invoices
    .filter(i => i.status === 'PAID')
    .reduce((s, i) => s + i.totalCents, 0)
  const totalInvoicedCents = project.invoices
    .filter(i => !['DRAFT', 'VOID'].includes(i.status))
    .reduce((s, i) => s + i.totalCents, 0)
  const callSheetCount     = project.callSheets.length
  const hasSentCallSheet   = project.callSheets.some(cs => cs.status === 'SENT' || cs.status === 'FINAL')
  const shootDate          = parseLocalDate(project.shootStartDate)

  // Days until / since shoot
  let shootLabel: string | null = null
  if (shootDate) {
    const diff = Math.ceil((shootDate.getTime() - Date.now()) / 86_400_000)
    if      (diff > 0)  shootLabel = `in ${diff}d`
    else if (diff === 0) shootLabel = 'today'
    else                shootLabel = `${Math.abs(diff)}d ago`
  }

  const isArchived = project.status === 'ARCHIVED'
  const isActive   = project.status === 'ACTIVE'

  if (view === 'list') {
    const listBadge = statusBadgeStyle(project.status)
    return (
      <div className="group relative bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-all">
        {/* Client avatar */}
        <ClientAvatar name={project.client.name} size="sm" />

        {/* Name + client */}
        <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold text-gray-900 truncate">{project.name}</span>
            <span className="text-xs text-gray-400 truncate hidden sm:inline">{project.client.name}</span>
          </div>
        </Link>

        {/* Status badge */}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={listBadge}
        >
          {statusLabel(project.status)}
        </span>

        {/* Shoot date */}
        {shootDate && (
          <div className="hidden md:flex items-center gap-1 text-sm text-gray-500 flex-shrink-0 w-24">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{shootDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {shootLabel && (
              <span className="text-xs text-gray-400">({shootLabel})</span>
            )}
          </div>
        )}

        {/* Financial pill */}
        <div className="flex-shrink-0 text-right hidden lg:block w-28">
          {isActive ? (
            <div className="text-xs leading-snug">
              <div>
                <span className="text-gray-400">Appr </span>
                <span className="font-semibold text-gray-900">{approvedCents !== null ? formatMoney(approvedCents) : '—'}</span>
              </div>
              <div>
                <span className="text-gray-400">Inv </span>
                <span className={`font-semibold ${totalInvoicedCents > 0 ? 'text-amber-600' : 'text-amber-400'}`}>
                  {formatMoney(totalInvoicedCents)}
                </span>
              </div>
            </div>
          ) : paidTotal > 0 ? (
            <span className="text-sm font-semibold text-emerald-600">{formatMoney(paidTotal)}</span>
          ) : latestSentProposal && project.budgetTotalCents > 0 ? (
            <span className="text-sm text-gray-500">{formatMoney(project.budgetTotalCents)}</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>

        {/* 3-dot menu */}
        <button
          ref={triggerRef}
          onClick={openMenu}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {mounted && menuOpen && menuPos && createPortal(
          <CardMenu
            ref={menuRef}
            pos={menuPos}
            projectId={project.id}
            isArchived={isArchived}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
            onClose={() => setMenuOpen(false)}
          />,
          document.body,
        )}
        {ConfirmDialog}
      </div>
    )
  }

  // ── Grid card ────────────────────────────────────────────────────────────────
  const badge = statusBadgeStyle(project.status)

  return (
    <div className="group relative bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Thin colour bar at top (matches status badge colour) */}
      <div className="h-1 w-full" style={{ background: badge.background }} />

      <div className="p-4">
        {/* Top row: Avatar + Project name + 3-dot */}
        <div className="flex items-center gap-2.5 mb-2">
          <ClientAvatar name={project.client.name} />
          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0 group/link">
            <h3 className="font-bold text-gray-900 text-sm leading-snug group-hover/link:text-[var(--brand-primary)] transition-colors line-clamp-2">
              {project.name}
            </h3>
          </Link>
          <button
            ref={triggerRef}
            onClick={openMenu}
            className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Client name (left) + Status pill (right) */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <p className="text-xs text-gray-400 truncate">{project.client.name}</p>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={badge}
          >
            {statusLabel(project.status)}
          </span>
        </div>

        {/* Shoot date */}
        {shootDate ? (
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            <span className="text-xs font-medium text-gray-700">
              {shootDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            {shootLabel && (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{
                  background: shootLabel === 'today'
                    ? '#dcfce7'
                    : shootLabel.startsWith('in')
                    ? 'var(--brand-primary-light)'
                    : '#f3f4f6',
                  color: shootLabel === 'today'
                    ? '#15803d'
                    : shootLabel.startsWith('in')
                    ? 'var(--brand-primary)'
                    : '#6b7280',
                }}
              >
                {shootLabel}
              </span>
            )}
          </div>
        ) : (
          <div className="mb-2">
            <span className="text-xs text-gray-300">No shoot date</span>
          </div>
        )}

        {/* Burn bar — only for ACTIVE projects with actuals */}
        {isActive && project.actualSpentCents > 0 && project.budgetTotalCents > 0 && (
          <BurnBar spentCents={project.actualSpentCents} budgetCents={project.budgetTotalCents} />
        )}

        {/* Team avatar row — always visible; empty slots are clickable when editor */}
        <TeamAvatarRow
          members={project.teamMembers ?? []}
          canEdit={canEditTeam}
          onEditTeam={() => setTeamModal(true)}
        />
      </div>

      {/* Bottom stats bar */}
      <div className="border-t border-gray-50 px-4 py-2.5 flex items-center justify-between bg-gray-50/50">
        {/* Financial */}
        <div className="text-xs flex flex-col gap-0.5">
          {isActive ? (
            <>
              <div>
                <span className="text-gray-400">Approved </span>
                <span className="font-semibold text-gray-900">{approvedCents !== null ? formatMoney(approvedCents) : '—'}</span>
              </div>
              <div>
                <span className="text-gray-400">Invoiced </span>
                {totalInvoicedCents > 0 ? (
                  <span className="font-semibold text-amber-600">{formatMoney(totalInvoicedCents)}</span>
                ) : (
                  <span className="font-semibold text-amber-400">$0</span>
                )}
              </div>
            </>
          ) : paidTotal > 0 ? (
            <div>
              <span className="text-gray-400">Paid </span>
              <span className="font-semibold text-emerald-600">{formatMoney(paidTotal)}</span>
            </div>
          ) : latestSentProposal && project.budgetTotalCents > 0 ? (
            <>
              <div>
                <span className="text-gray-400">Proposed </span>
                <span className="font-semibold text-gray-600">{formatMoney(project.budgetTotalCents)}</span>
              </div>
              {pendingInvoice && (
                <div>
                  <span className="text-gray-400">Invoiced </span>
                  <span className="font-semibold text-amber-600">{formatMoney(pendingInvoice.totalCents)}</span>
                </div>
              )}
            </>
          ) : pendingInvoice ? (
            <div>
              <span className="text-gray-400">Invoiced </span>
              <span className="font-semibold text-amber-600">{formatMoney(pendingInvoice.totalCents)}</span>
            </div>
          ) : (
            <span className="text-gray-300">No proposal</span>
          )}
        </div>

        {/* Doc icon counts */}
        <div className="flex items-center gap-2">
          <DocIcon
            icon={<FileText className="w-3.5 h-3.5" />}
            count={project.proposals.length}
            title="Proposals"
          />
          <DocIcon
            icon={<Receipt className="w-3.5 h-3.5" />}
            count={project.invoices.length}
            title="Invoices"
          />
          <DocIcon
            icon={<ClipboardList className="w-3.5 h-3.5" />}
            count={callSheetCount}
            title="Call sheets"
            highlight={callSheetCount > 0 && !hasSentCallSheet}
          />
        </div>
      </div>

      {mounted && menuOpen && menuPos && createPortal(
        <CardMenu
          ref={menuRef}
          pos={menuPos}
          projectId={project.id}
          isArchived={isArchived}
          canEditTeam={canEditTeam}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onEditTeam={() => { setMenuOpen(false); setTeamModal(true) }}
          onClose={() => setMenuOpen(false)}
        />,
        document.body,
      )}
      {ConfirmDialog}
      {teamModal && mounted && createPortal(
        <EditTeamModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setTeamModal(false)}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const ROLE_ABBR: Record<string, string> = {
  PROJECT_LEAD:    'PL',
  ACCOUNT_MANAGER: 'AM',
  PROJECT_MANAGER: 'PM',
}
const ROLE_ORDER = ['PROJECT_LEAD', 'ACCOUNT_MANAGER', 'PROJECT_MANAGER']

function TeamAvatarRow({
  members,
  canEdit = false,
  onEditTeam,
}: {
  members: { role: string; user: { name: string | null; email: string; avatarUrl: string | null } }[]
  canEdit?: boolean
  onEditTeam?: () => void
}) {
  const byRole = Object.fromEntries(members.map(m => [m.role, m.user]))

  return (
    <div className="flex items-end gap-2.5 mt-2">
      {ROLE_ORDER.map(role => {
        const user  = byRole[role]
        const label = ROLE_ABBR[role]
        const title = user
          ? `${label} · ${user.name ?? user.email}`
          : canEdit ? `${label} — click to assign` : `${label} — unassigned`

        return (
          <div
            key={role}
            className={`flex flex-col items-center gap-0.5 ${!user && canEdit ? 'cursor-pointer' : ''}`}
            title={title}
            onClick={!user && canEdit ? onEditTeam : undefined}
          >
            {user ? (
              user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={user.name ?? user.email} className="w-[22px] h-[22px] rounded-full object-cover" />
              ) : (
                <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background: 'var(--brand-primary, #5D00A4)' }}>
                  {(user.name ?? user.email).slice(0, 2).toUpperCase()}
                </div>
              )
            ) : (
              <div className={`w-[22px] h-[22px] rounded-full border border-dashed flex items-center justify-center text-[10px] ${canEdit ? 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors' : 'border-gray-200 text-transparent'}`}>
                {canEdit ? '+' : ''}
              </div>
            )}
            <span className="text-[9px] font-semibold text-gray-400">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function BurnBar({ spentCents, budgetCents }: { spentCents: number; budgetCents: number }) {
  const pct      = Math.min((spentCents / budgetCents) * 100, 100)
  const over100  = spentCents > budgetCents
  const barColor = over100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981'
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-400">Burn</span>
        <span className={`text-[10px] font-medium ${over100 ? 'text-red-500' : 'text-gray-500'}`}>
          {formatMoney(spentCents)} / {formatMoney(budgetCents)}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  )
}

function DocIcon({
  icon, count, title, highlight = false,
}: {
  icon: React.ReactNode
  count: number
  title: string
  highlight?: boolean
}) {
  if (count === 0) return null
  return (
    <div
      className="flex items-center gap-0.5 text-xs"
      title={title}
      style={{ color: highlight ? '#f59e0b' : '#9ca3af' }}
    >
      {icon}
      <span>{count}</span>
    </div>
  )
}

// ── Context menu (portal) ──────────────────────────────────────────────────────

import { forwardRef } from 'react'

import { Users } from 'lucide-react'

const CardMenu = forwardRef<
  HTMLDivElement,
  {
    pos: { top: number; left: number }
    projectId: string
    isArchived: boolean
    canEditTeam?: boolean
    onArchive: () => void
    onUnarchive: () => void
    onEditTeam?: () => void
    onClose: () => void
  }
>(({ pos, projectId, isArchived, canEditTeam, onArchive, onUnarchive, onEditTeam, onClose }, ref) => {
  const router = useRouter()

  function item(label: string, icon: React.ReactNode, action: () => void, danger = false) {
    return (
      <button
        onClick={() => { onClose(); action() }}
        className={[
          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left',
          danger
            ? 'text-red-600 hover:bg-red-50'
            : 'text-gray-700 hover:bg-gray-50',
        ].join(' ')}
      >
        <span className="w-4 h-4 flex-shrink-0">{icon}</span>
        {label}
      </button>
    )
  }

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999, width: 168 }}
      className="bg-white border border-gray-100 rounded-xl shadow-xl py-1 px-1"
    >
      {item('Open project', <ExternalLink className="w-4 h-4" />, () => router.push(`/projects/${projectId}`))}
      {canEditTeam && onEditTeam && item('Edit team', <Users className="w-4 h-4" />, onEditTeam)}
      <div className="h-px bg-gray-100 my-1" />
      {isArchived
        ? item('Unarchive', <ArchiveRestore className="w-4 h-4" />, onUnarchive)
        : item('Archive', <Archive className="w-4 h-4" />, onArchive, true)
      }
    </div>
  )
})
CardMenu.displayName = 'CardMenu'
