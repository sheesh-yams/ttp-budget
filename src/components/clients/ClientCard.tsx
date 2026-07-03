'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  MoreHorizontal, Archive, Mail, Globe, AlertCircle,
  FolderOpen, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatMoney } from '@/lib/money'

export interface ClientRow {
  id:               string
  name:             string
  legalName:        string | null
  logoUrl:          string | null
  contactName:      string | null
  contactEmail:     string | null
  contactPhone:     string | null
  billingAddress:   string | null
  website:          string | null
  notes:            string | null
  specialNotes:     string | null
  createdAt:        string
  projectCount:     number
  activeProjects:   number
  ltvCents:         number
  outstandingCents: number
  lastEngagementAt: string | null
  projects: {
    id:             string
    name:           string
    status:         string
    accountManager: { name: string | null; email: string; avatarUrl: string | null } | null
  }[]
}

interface Props {
  client:    ClientRow
  onEdit:    () => void
  onArchive: () => void
}

const STATUS_COLORS: Record<string, string> = {
  LEAD:     'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  WRAPPED:  'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/)
  const letters = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2)
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700 uppercase select-none">
      {letters}
    </div>
  )
}

function formatEngagement(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30)  return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

const PROJECT_STATUS_COLORS: Record<string, string> = {
  LEAD:     'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  WRAPPED:  'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

const PREVIEW_COUNT = 3

export function ClientCard({ client: c, onEdit, onArchive }: Props) {
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [showAllProjects, setShowAllProjects] = useState(false)

  const hasSpecialNotes = !!c.specialNotes?.trim()
  const visibleProjects = showAllProjects ? c.projects : c.projects.slice(0, PREVIEW_COUNT)
  const hiddenCount     = c.projects.length - PREVIEW_COUNT

  return (
    <div
      className="group relative flex flex-col rounded-[10px] border bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: '#E8E0F0' }}
    >
      {/* ── Three-dot menu ── */}
      <div className="absolute right-3 top-3 z-10">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[5]" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute right-0 top-7 z-10 min-w-[140px] rounded-lg border bg-white py-1 shadow-lg"
              style={{ borderColor: '#E8E0F0' }}
            >
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onEdit() }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-muted/50"
              >
                Edit client
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onArchive() }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5">

        {/* ── Identity ── */}
        <div className="flex items-start gap-3 pr-6">
          {c.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logoUrl} alt={c.name} className="h-10 w-10 shrink-0 rounded-full object-contain border border-border/40" />
          ) : (
            <Initials name={c.name} />
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground leading-snug">{c.name}</h2>
            {c.contactName && (
              <p className="text-[12px] text-muted-foreground mt-0.5">{c.contactName}</p>
            )}
          </div>
        </div>

        {/* ── Financials ── */}
        <div
          className="grid grid-cols-2 gap-2 rounded-lg px-3 py-2.5"
          style={{ background: '#F7F4FA' }}
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-0.5">Lifetime Value</p>
            <p className={`text-[14px] font-bold tabular-nums ${c.ltvCents > 0 ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
              {c.ltvCents > 0 ? formatMoney(c.ltvCents) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-0.5">Outstanding</p>
            <p className={`text-[14px] font-bold tabular-nums ${c.outstandingCents > 0 ? 'text-red-500' : 'text-muted-foreground/40'}`}>
              {c.outstandingCents > 0 ? formatMoney(c.outstandingCents) : '—'}
            </p>
          </div>
        </div>

        {/* ── Projects list ── */}
        {c.projects.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Projects
              </p>
              {c.lastEngagementAt && (
                <span className="text-[10px] text-muted-foreground/50">
                  {formatEngagement(c.lastEngagementAt)}
                </span>
              )}
            </div>
            {visibleProjects.map(p => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors group/proj"
              >
                <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground group-hover/proj:text-foreground" />
                <span className="flex-1 truncate text-[12px] font-medium text-foreground">{p.name}</span>
                {p.accountManager && (
                  <span title={`Account Manager · ${p.accountManager.name ?? p.accountManager.email}`} className="shrink-0">
                    {p.accountManager.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.accountManager.avatarUrl} alt={p.accountManager.name ?? p.accountManager.email} className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: 'var(--brand-primary, #5D00A4)' }}>
                        {(p.accountManager.name ?? p.accountManager.email).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${PROJECT_STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                </span>
              </Link>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowAllProjects(v => !v) }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAllProjects ? (
                  <><ChevronUp className="h-3 w-3" /> Show less</>
                ) : (
                  <><ChevronDown className="h-3 w-3" /> +{hiddenCount} more</>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground/50">
            <FolderOpen className="h-3.5 w-3.5" />
            <span>No projects yet</span>
            {c.lastEngagementAt && (
              <span className="ml-auto text-[11px]">{formatEngagement(c.lastEngagementAt)}</span>
            )}
          </div>
        )}

        {/* ── Contact ── */}
        {(c.contactEmail || c.website) && (
          <div className="space-y-1">
            {c.contactEmail && (
              <a
                href={`mailto:${c.contactEmail}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.contactEmail}</span>
              </a>
            )}
            {c.website && (
              <a
                href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>
        )}

        {/* ── Special Notes callout ── */}
        {hasSpecialNotes && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Account Note
                </p>
                <p className={`text-[12px] leading-relaxed text-amber-700 whitespace-pre-line ${!expanded ? 'line-clamp-3' : ''}`}>
                  {c.specialNotes}
                </p>
                {c.specialNotes && c.specialNotes.length > 120 && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                    className="mt-1 flex items-center gap-0.5 text-[11px] font-medium text-amber-600 hover:text-amber-800 transition-colors"
                  >
                    {expanded ? (
                      <><ChevronUp className="h-3 w-3" /> Show less</>
                    ) : (
                      <><ChevronDown className="h-3 w-3" /> Show more</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
