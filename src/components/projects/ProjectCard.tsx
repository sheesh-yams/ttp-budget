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
import { archiveProject, unarchiveProject } from '@/server/actions/projects'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  type ProjectForCard,
  computeProgress,
  statusLabel,
  statusColor,
  shootTypeLabel,
} from './projects-types'

interface Props {
  project: ProjectForCard
  view?: 'grid' | 'list'
}

export function ProjectCard({ project, view = 'grid' }: Props) {
  const router    = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const progress  = computeProgress(project)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos,  setMenuPos ] = useState<{ top: number; left: number } | null>(null)
  const [mounted,  setMounted ] = useState(false)
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
  const approvedProposal  = project.proposals.find(p => p.status === 'APPROVED')
  const approvedCents     = approvedProposal?.approvedTotalCents ?? null
  const pendingInvoice    = project.invoices.find(i => ['SENT','VIEWED','OVERDUE'].includes(i.status))
  const paidTotal         = project.invoices
    .filter(i => i.status === 'PAID')
    .reduce((s, i) => s + i.totalCents, 0)
  const callSheetCount    = project.callSheets.length
  const hasSentCallSheet  = project.callSheets.some(cs => cs.status === 'SENT' || cs.status === 'FINAL')
  const shootDate         = project.shootStartDate ? new Date(project.shootStartDate) : null

  // Days until / since shoot
  let shootLabel: string | null = null
  if (shootDate) {
    const diff = Math.ceil((shootDate.getTime() - Date.now()) / 86_400_000)
    if      (diff > 0)  shootLabel = `in ${diff}d`
    else if (diff === 0) shootLabel = 'today'
    else                shootLabel = `${Math.abs(diff)}d ago`
  }

  const isArchived = project.status === 'ARCHIVED'

  if (view === 'list') {
    return (
      <div className="group relative bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-all">
        {/* Status dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: statusColor(project.status) }}
        />

        {/* Name + client */}
        <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold text-gray-900 truncate">{project.name}</span>
            <span className="text-xs text-gray-400 truncate hidden sm:inline">{project.client.name}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{shootTypeLabel(project.shootType)}</div>
        </Link>

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

        {/* Progress bar */}
        <div className="hidden sm:block w-20 flex-shrink-0">
          <ProgressBar progress={progress} />
        </div>

        {/* Financial pill */}
        <div className="flex-shrink-0 text-right hidden lg:block w-24">
          {approvedCents !== null
            ? <span className="text-sm font-semibold text-gray-900">{formatMoney(approvedCents)}</span>
            : paidTotal > 0
            ? <span className="text-sm font-semibold text-emerald-600">{formatMoney(paidTotal)}</span>
            : <span className="text-xs text-gray-400">—</span>
          }
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
  return (
    <div className="group relative bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Colour bar */}
      <div
        className="h-1 w-full"
        style={{ background: statusColor(project.status) }}
      />

      <div className="p-4">
        {/* Top row: status pill + 3-dot */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ background: statusColor(project.status) }}
            >
              {statusLabel(project.status)}
            </span>
            <span className="text-xs text-gray-400">{shootTypeLabel(project.shootType)}</span>
          </div>
          <button
            ref={triggerRef}
            onClick={openMenu}
            className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Project name */}
        <Link href={`/projects/${project.id}`} className="block group/link">
          <h3 className="font-bold text-gray-900 text-base leading-snug group-hover/link:text-[var(--brand-primary)] transition-colors line-clamp-2 mb-0.5">
            {project.name}
          </h3>
          <p className="text-xs text-gray-400">{project.client.name}</p>
        </Link>

        {/* Progress */}
        <div className="mt-3 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Progress</span>
            <span className="text-xs font-semibold text-gray-600">{progress}%</span>
          </div>
          <ProgressBar progress={progress} />
        </div>

        {/* Shoot date */}
        {shootDate && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            <span>
              {shootDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {shootLabel && (
              <span
                className="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  background: shootLabel === 'today' || shootLabel.startsWith('in')
                    ? 'var(--brand-primary-light)'
                    : '#f3f4f6',
                  color: shootLabel === 'today' || shootLabel.startsWith('in')
                    ? 'var(--brand-primary)'
                    : '#6b7280',
                }}
              >
                {shootLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom stats bar */}
      <div className="border-t border-gray-50 px-4 py-2.5 flex items-center justify-between bg-gray-50/50">
        {/* Financial */}
        <div className="text-xs">
          {approvedCents !== null ? (
            <div>
              <span className="text-gray-400">Approved </span>
              <span className="font-semibold text-gray-900">{formatMoney(approvedCents)}</span>
            </div>
          ) : paidTotal > 0 ? (
            <div>
              <span className="text-gray-400">Paid </span>
              <span className="font-semibold text-emerald-600">{formatMoney(paidTotal)}</span>
            </div>
          ) : pendingInvoice ? (
            <div>
              <span className="text-gray-400">Invoiced </span>
              <span className="font-semibold text-amber-600">{formatMoney(pendingInvoice.totalCents)}</span>
            </div>
          ) : (
            <span className="text-gray-300">No proposal</span>
          )}
        </div>

        {/* Icons */}
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          background: progress >= 85
            ? '#10b981'   // emerald - paid/wrapped
            : progress >= 50
            ? 'var(--brand-primary)'
            : 'var(--brand-accent)',
        }}
      />
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

const CardMenu = forwardRef<
  HTMLDivElement,
  {
    pos: { top: number; left: number }
    projectId: string
    isArchived: boolean
    onArchive: () => void
    onUnarchive: () => void
    onClose: () => void
  }
>(({ pos, projectId, isArchived, onArchive, onUnarchive, onClose }, ref) => {
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
      <div className="h-px bg-gray-100 my-1" />
      {isArchived
        ? item('Unarchive', <ArchiveRestore className="w-4 h-4" />, onUnarchive)
        : item('Archive', <Archive className="w-4 h-4" />, onArchive, true)
      }
    </div>
  )
})
CardMenu.displayName = 'CardMenu'
