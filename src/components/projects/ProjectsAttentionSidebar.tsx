'use client'

import Link from 'next/link'
import {
  AlertTriangle, Clock, FileX, Timer,
  CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useState } from 'react'
import type { AttentionItem, UpcomingShoot, ProjectMetrics } from './projects-types'

interface Props {
  attentionItems: AttentionItem[]
  upcomingShoots: UpcomingShoot[]
  metrics: ProjectMetrics
}

const ATTENTION_ICONS: Record<string, React.ReactNode> = {
  'proposal-viewed':    <Clock className="w-3.5 h-3.5" />,
  'invoice-overdue':    <AlertTriangle className="w-3.5 h-3.5" />,
  'shoot-no-callsheet': <FileX className="w-3.5 h-3.5" />,
  'proposal-expiring':  <Timer className="w-3.5 h-3.5" />,
}

const ATTENTION_COLORS: Record<string, { bg: string; text: string }> = {
  'proposal-viewed':    { bg: '#fef9c3', text: '#854d0e' },
  'invoice-overdue':    { bg: '#fee2e2', text: '#b91c1c' },
  'shoot-no-callsheet': { bg: '#ffedd5', text: '#9a3412' },
  'proposal-expiring':  { bg: '#fef3c7', text: '#92400e' },
}

export function ProjectsAttentionSidebar({ attentionItems, upcomingShoots, metrics }: Props) {
  const [shootsExpanded, setShootsExpanded] = useState(true)

  return (
    <aside className="flex flex-col gap-4">

      {/* ── Attention needed ──────────────────────────────────────────────────── */}
      {attentionItems.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-900">Needs attention</span>
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              {attentionItems.length}
            </span>
          </div>

          <ul className="divide-y divide-gray-50">
            {attentionItems.map((item, i) => {
              const colors = ATTENTION_COLORS[item.type] ?? { bg: '#f9fafb', text: '#374151' }
              return (
                <li key={`${item.type}-${item.projectId}-${i}`}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <span
                      className="mt-0.5 p-1 rounded-md flex-shrink-0"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {ATTENTION_ICONS[item.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-[var(--brand-primary)]">
                        {item.projectName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{item.label}</p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Upcoming shoots ───────────────────────────────────────────────────── */}
      {upcomingShoots.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShootsExpanded(v => !v)}
            className="w-full px-4 py-3 border-b border-gray-50 flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <CalendarDays className="w-4 h-4 text-[var(--brand-accent)]" />
            <span className="text-sm font-semibold text-gray-900">Upcoming shoots</span>
            <span className="ml-auto text-xs bg-[var(--brand-primary-light)] text-[var(--brand-primary)] px-2 py-0.5 rounded-full font-semibold">
              {upcomingShoots.length}
            </span>
            {shootsExpanded
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-1" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1" />
            }
          </button>

          {shootsExpanded && (
            <ul className="divide-y divide-gray-50">
              {upcomingShoots.map(shoot => {
                const d       = new Date(shoot.shootDate)
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
                const date    = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const diff    = Math.ceil((d.getTime() - Date.now()) / 86_400_000)

                return (
                  <li key={shoot.projectId}>
                    <Link
                      href={`/projects/${shoot.projectId}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                    >
                      {/* Mini calendar chip */}
                      <div
                        className="flex-shrink-0 w-9 text-center rounded-lg overflow-hidden text-white"
                        style={{ background: 'var(--brand-primary)' }}
                      >
                        <div className="text-[9px] font-bold uppercase bg-white/20 py-0.5">{dayName}</div>
                        <div className="text-sm font-bold leading-tight pb-0.5">{d.getDate()}</div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-[var(--brand-primary)]">
                          {shoot.projectName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{shoot.clientName}</p>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{
                            background: diff <= 3 ? '#fee2e2' : diff <= 7 ? '#fef3c7' : '#f3f4f6',
                            color:      diff <= 3 ? '#b91c1c' : diff <= 7 ? '#92400e' : '#6b7280',
                          }}
                        >
                          {diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff}d`}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── This week stats ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">This week</p>
        <div className="flex flex-col gap-2">
          <StatRow
            label="Projects created"
            value={metrics.thisWeekProjectsCreated}
          />
          <StatRow
            label="Proposals sent"
            value={metrics.thisWeekProposalsSent}
          />
          <StatRow
            label="Invoices issued"
            value={metrics.thisWeekInvoicesIssued}
          />
        </div>
      </div>

      {/* ── Empty attention state ─────────────────────────────────────────────── */}
      {attentionItems.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: 'var(--brand-primary-light)' }}
          >
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <p className="text-sm font-medium text-gray-700">All clear</p>
          <p className="text-xs text-gray-400 mt-0.5">No items need attention right now</p>
        </div>
      )}
    </aside>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className="text-sm font-bold"
        style={{ color: value > 0 ? 'var(--brand-primary)' : '#d1d5db' }}
      >
        {value}
      </span>
    </div>
  )
}
