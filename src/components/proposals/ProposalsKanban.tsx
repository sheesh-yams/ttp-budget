'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, Send, ExternalLink, ChevronDown, CheckCircle, XCircle, Clock, GripVertical, TrendingDown, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { updateProposalStatus } from '@/server/actions/proposals'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProposalCardData = {
  projectId:   string
  projectName: string
  clientName:  string
  shootType:   string
  proposal: {
    id:            string
    title:         string
    version:       number
    status:        string
    viewCount:     number
    sentAt:        Date | string | null
    approvedAt:    Date | string | null
    declinedAt:    Date | string | null
    expiresAt:     Date | string | null
    publicToken:   string
    signatureName: string | null
  }
  totalCount: number
}

// ─── Column config ────────────────────────────────────────────────────────────

type ColumnId = 'DRAFT' | 'SENT' | 'VIEWED' | 'CHANGES_NEEDED' | 'WON' | 'LOST'

const COLUMNS: {
  id:          ColumnId
  label:       string
  dotColor:    string
  headerBg:    string
  accentColor: string
  droppable:   boolean
}[] = [
  { id: 'DRAFT',          label: 'Drafts',        dotColor: '#9CA3AF', headerBg: '#F9FAFB', accentColor: '#D1D5DB', droppable: true  },
  { id: 'SENT',           label: 'Sent',           dotColor: '#3B82F6', headerBg: '#EFF6FF', accentColor: '#3B82F6', droppable: true  },
  { id: 'VIEWED',         label: 'Viewed',         dotColor: '#7C3AED', headerBg: '#F5F3FF', accentColor: '#7C3AED', droppable: true  },
  { id: 'CHANGES_NEEDED', label: 'Changes Needed', dotColor: '#F59E0B', headerBg: '#FFFBEB', accentColor: '#F59E0B', droppable: true  },
  { id: 'WON',            label: 'Won',            dotColor: '#10B981', headerBg: '#ECFDF5', accentColor: '#10B981', droppable: false },
  { id: 'LOST',           label: 'Lost',           dotColor: '#9F1239', headerBg: '#FFF1F2', accentColor: '#E11D48', droppable: false },
]

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT:          { label: 'Draft',          bg: '#F3F4F6', text: '#374151' },
  SENT:           { label: 'Sent',           bg: '#DBEAFE', text: '#1E40AF' },
  VIEWED:         { label: 'Viewed',         bg: '#EDE9FE', text: '#5B21B6' },
  CHANGES_NEEDED: { label: 'Changes Needed', bg: '#FEF3C7', text: '#92400E' },
  APPROVED:       { label: 'Approved',       bg: '#D1FAE5', text: '#065F46' },
  DECLINED:       { label: 'Declined',       bg: '#FEE2E2', text: '#991B1B' },
  EXPIRED:        { label: 'Expired',        bg: '#FEF3C7', text: '#78350F' },
  LOST:           { label: 'Lost',           bg: '#FFF1F2', text: '#9F1239' },
}

// Working stages shown in the status dropdown; LOST is the "close as lost" action
const ACTIVE_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'CHANGES_NEEDED', 'LOST']

function isTerminal(status: string, expiresAt: Date | string | null): boolean {
  if (['APPROVED', 'DECLINED', 'LOST'].includes(status)) return true
  if (expiresAt && new Date(expiresAt) < new Date() && !['APPROVED', 'LOST'].includes(status)) return true
  return false
}

function effectiveStatus(status: string, expiresAt: Date | string | null): string {
  if (expiresAt && new Date(expiresAt) < new Date() && !['APPROVED', 'LOST'].includes(status)) return 'EXPIRED'
  return status
}

function getColumnId(status: string, expiresAt: Date | string | null): ColumnId {
  if (status === 'APPROVED') return 'WON'
  if (['DECLINED', 'LOST'].includes(status)) return 'LOST'
  if (expiresAt && new Date(expiresAt) < new Date()) return 'LOST' // expired → Lost
  if (status === 'SENT')           return 'SENT'
  if (status === 'VIEWED')         return 'VIEWED'
  if (status === 'CHANGES_NEEDED') return 'CHANGES_NEEDED'
  return 'DRAFT'
}

// ─── Shoot type helpers ───────────────────────────────────────────────────────

const SHOOT_COLORS: Record<string, string> = {
  MUSIC_VIDEO:    'bg-violet-100 text-violet-700',
  BRAND_CAMPAIGN: 'bg-blue-100 text-blue-700',
  PRODUCT_SHOOT:  'bg-amber-100 text-amber-700',
  EVENT_RECAP:    'bg-green-100 text-green-700',
  SOCIAL_CONTENT: 'bg-pink-100 text-pink-700',
  INFLUENCER:     'bg-orange-100 text-orange-700',
  DOCUMENTARY:    'bg-teal-100 text-teal-700',
  OTHER:          'bg-gray-100 text-gray-600',
}

const SHOOT_LABELS: Record<string, string> = {
  MUSIC_VIDEO:    'Music Video',
  BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT:  'Product Shoot',
  EVENT_RECAP:    'Event Recap',
  SOCIAL_CONTENT: 'Social Content',
  INFLUENCER:     'Influencer',
  DOCUMENTARY:    'Documentary',
  OTHER:          'Other',
}

// ─── Status badge / dropdown ──────────────────────────────────────────────────

function StatusBadge({
  status,
  expiresAt,
  onChange,
}: {
  status:     string
  expiresAt:  Date | string | null
  onChange:   (s: string) => void
}) {
  const eff   = effectiveStatus(status, expiresAt)
  const style = STATUS_STYLES[eff] ?? STATUS_STYLES.DRAFT
  const term  = isTerminal(status, expiresAt)

  if (term) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ background: style.bg, color: style.text }}
      >
        {eff === 'APPROVED' && <CheckCircle  className="h-2.5 w-2.5" />}
        {eff === 'DECLINED' && <XCircle      className="h-2.5 w-2.5" />}
        {eff === 'LOST'     && <TrendingDown className="h-2.5 w-2.5" />}
        {eff === 'EXPIRED'  && <Clock        className="h-2.5 w-2.5" />}
        {style.label}
      </span>
    )
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={status}
        onChange={e => onChange(e.target.value)}
        style={{ background: style.bg, color: style.text }}
        className="rounded-full pl-2 pr-6 py-0.5 text-[10px] font-medium border-0 outline-none cursor-pointer appearance-none leading-none"
      >
        {ACTIVE_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_STYLES[s].label}</option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 pointer-events-none"
        style={{ color: style.text }}
      />
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ProposalCard({
  card,
  isDragging,
  onStatusChange,
  onMarkWon,
  onDragStart,
  onDragEnd,
}: {
  card:           ProposalCardData
  isDragging:     boolean
  onStatusChange: (proposalId: string, newStatus: string) => void
  onMarkWon:      (proposalId: string) => void
  onDragStart:    (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd:      (e: React.DragEvent<HTMLDivElement>) => void
}) {
  const { proposal } = card
  const terminal  = isTerminal(proposal.status, proposal.expiresAt)
  const eff       = effectiveStatus(proposal.status, proposal.expiresAt)
  const canMarkWon = ['SENT', 'VIEWED', 'CHANGES_NEEDED'].includes(proposal.status)

  return (
    <div
      data-card="true"
      className={`rounded-xl bg-white border transition-all group ${
        isDragging
          ? 'opacity-40 border-violet-300 shadow-md scale-[0.97]'
          : 'border-border hover:border-violet-200 hover:shadow-sm'
      } ${terminal ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {/* Drag handle (only shown on hover for non-terminal cards) */}
      {!terminal && (
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="absolute -left-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center w-5 h-8 rounded cursor-grab text-muted-foreground/40 hover:text-muted-foreground z-10"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Main clickable area */}
      <Link href={`/projects/${card.projectId}`} className="block p-3.5" draggable={false}>
        {/* Shoot type */}
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SHOOT_COLORS[card.shootType] ?? 'bg-gray-100 text-gray-600'}`}>
          {SHOOT_LABELS[card.shootType] ?? card.shootType}
        </span>

        {/* Project + client */}
        <p className="mt-2 font-semibold text-[13.5px] text-foreground leading-snug group-hover:text-violet-700 transition-colors">
          {card.projectName}
        </p>
        <p className="text-[11.5px] text-muted-foreground mt-0.5">{card.clientName}</p>

        {/* Proposal info */}
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <p className="text-[11.5px] font-medium text-foreground line-clamp-1">{proposal.title}</p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">
            v{proposal.version}
            {card.totalCount > 1 && (
              <span className="ml-1 opacity-60">· {card.totalCount} revisions</span>
            )}
          </p>
        </div>

        {/* Stats */}
        <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted-foreground">
          {proposal.sentAt && (
            <span className="flex items-center gap-1">
              <Send className="h-3 w-3" />
              {format(new Date(proposal.sentAt), 'MMM d')}
            </span>
          )}
          {proposal.viewCount > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {proposal.viewCount} view{proposal.viewCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Approved / won badge */}
        {eff === 'APPROVED' && (
          <div className="mt-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-medium">
              <CheckCircle className="h-3 w-3" />
              Won{proposal.signatureName ? ` · ${proposal.signatureName}` : ''}
            </span>
          </div>
        )}
        {eff === 'DECLINED' && (
          <div className="mt-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium">
              <XCircle className="h-3 w-3" />
              Declined
            </span>
          </div>
        )}
        {eff === 'LOST' && (
          <div className="mt-2.5">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: '#FFF1F2', color: '#9F1239' }}>
              <TrendingDown className="h-3 w-3" />
              Lost
            </span>
          </div>
        )}
        {eff === 'EXPIRED' && (
          <div className="mt-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-medium">
              <Clock className="h-3 w-3" />
              Expired
            </span>
          </div>
        )}
      </Link>

      {/* Footer: status + actions — stopPropagation prevents Link navigation */}
      <div
        className="flex items-center justify-between border-t border-border/60 px-3 py-2"
        onClick={e => e.stopPropagation()}
      >
        <StatusBadge
          status={proposal.status}
          expiresAt={proposal.expiresAt}
          onChange={(newStatus) => onStatusChange(proposal.id, newStatus)}
        />
        <div className="flex items-center gap-1">
          {canMarkWon && (
            <button
              type="button"
              onClick={() => onMarkWon(proposal.id)}
              className="rounded p-1 text-muted-foreground/40 hover:text-green-600 hover:bg-green-50 transition-colors"
              title="Mark as Won"
            >
              <Trophy className="h-3.5 w-3.5" />
            </button>
          )}
          <a
            href={`/p/${proposal.publicToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-muted-foreground/40 hover:text-violet-600 transition-colors"
            title="Open public link"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Main Kanban board ────────────────────────────────────────────────────────

export function ProposalsKanban({ cards: initialCards }: { cards: ProposalCardData[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [cards, setCards]           = useState(initialCards)
  const [draggedId, setDraggedId]   = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null)
  const [showLost, setShowLost]     = useState(false)

  function handleStatusChange(proposalId: string, newStatus: string) {
    setCards(prev =>
      prev.map(c =>
        c.proposal.id === proposalId
          ? { ...c, proposal: { ...c.proposal, status: newStatus } }
          : c
      )
    )
    startTransition(async () => {
      await updateProposalStatus(proposalId, newStatus)
      router.refresh()
    })
  }

  function handleMarkWon(proposalId: string) {
    handleStatusChange(proposalId, 'APPROVED')
  }

  // Group into columns
  const grouped = Object.fromEntries(
    COLUMNS.map(col => [col.id, [] as ProposalCardData[]])
  ) as Record<ColumnId, ProposalCardData[]>

  for (const card of cards) {
    const colId = getColumnId(card.proposal.status, card.proposal.expiresAt)
    grouped[colId].push(card)
  }

  const lostCount = grouped['LOST'].length
  const visibleColumns = showLost ? COLUMNS : COLUMNS.filter(c => c.id !== 'LOST')

  return (
    <div className="space-y-3">
      {/* Lost toggle — only shown when there are lost proposals */}
      {lostCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowLost(v => !v)}
            className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <TrendingDown className="h-3 w-3" />
            {showLost ? 'Hide' : 'Show'} lost ({lostCount})
          </button>
        </div>
      )}

    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3" style={{ minWidth: `${visibleColumns.length * 272}px` }}>
        {visibleColumns.map(col => {
          const colCards = grouped[col.id]
          const isOver   = dragOverCol === col.id && col.droppable

          return (
            <div
              key={col.id}
              className="flex flex-col w-[260px] shrink-0"
              onDragOver={e => {
                if (!col.droppable) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverCol(col.id)
              }}
              onDragLeave={e => {
                // Only clear if leaving the column entirely (not entering a child)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null)
                }
              }}
              onDrop={e => {
                e.preventDefault()
                const proposalId = e.dataTransfer.getData('proposalId')
                if (proposalId && col.droppable) {
                  handleStatusChange(proposalId, col.id) // col.id === target status
                }
                setDragOverCol(null)
                setDraggedId(null)
              }}
            >
              {/* Column header */}
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-2 transition-all"
                style={{
                  backgroundColor: isOver ? `${col.accentColor}18` : col.headerBg,
                  borderLeft: `3px solid ${isOver ? col.accentColor : `${col.accentColor}80`}`,
                  boxShadow: isOver ? `0 0 0 1px ${col.accentColor}30` : 'none',
                }}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: col.dotColor }}
                />
                <span className="text-[12px] font-semibold text-foreground tracking-tight">
                  {col.label}
                </span>
                <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                  {colCards.length}
                </span>
              </div>

              {/* Card list */}
              <div
                className={`relative flex flex-col gap-2 rounded-xl min-h-[80px] p-1 -m-1 transition-colors ${
                  isOver ? 'bg-violet-50/50' : ''
                }`}
              >
                {colCards.length === 0 ? (
                  <div
                    className={`rounded-xl border-2 border-dashed py-8 text-center transition-all ${
                      isOver
                        ? 'border-violet-300 bg-violet-50'
                        : 'border-border/50'
                    }`}
                  >
                    <p className="text-[11px] text-muted-foreground/50">
                      {isOver ? 'Drop here' : 'Empty'}
                    </p>
                  </div>
                ) : (
                  colCards.map(card => (
                    <div key={card.proposal.id} className="relative">
                      <ProposalCard
                        card={card}
                        isDragging={draggedId === card.proposal.id}
                        onStatusChange={handleStatusChange}
                        onMarkWon={handleMarkWon}
                        onDragStart={e => {
                          // Set drag image to the whole card element
                          const cardEl = e.currentTarget.closest('[data-card]') as HTMLElement
                          if (cardEl) e.dataTransfer.setDragImage(cardEl, 30, 30)
                          e.dataTransfer.setData('proposalId', card.proposal.id)
                          e.dataTransfer.effectAllowed = 'move'
                          // Use setTimeout so opacity change shows after drag image is captured
                          setTimeout(() => setDraggedId(card.proposal.id), 0)
                        }}
                        onDragEnd={() => {
                          setDraggedId(null)
                          setDragOverCol(null)
                        }}
                      />
                    </div>
                  ))
                )}

                {/* Bottom drop target when column has cards */}
                {isOver && colCards.length > 0 && (
                  <div className="h-1 rounded-full bg-violet-300 mx-2" />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}
