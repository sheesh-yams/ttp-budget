'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, Send, CheckCircle, XCircle, Clock, ExternalLink, AlertCircle } from 'lucide-react'
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
  totalCount: number  // how many proposals exist for this project
}

// ─── Column config ────────────────────────────────────────────────────────────

type ColumnId = 'DRAFT' | 'SENT' | 'VIEWED' | 'CHANGES_NEEDED' | 'CLOSED'

const COLUMNS: {
  id:        ColumnId
  label:     string
  dotColor:  string
  headerBg:  string
  borderTop: string
}[] = [
  { id: 'DRAFT',          label: 'Drafts',         dotColor: '#9CA3AF', headerBg: '#F9FAFB', borderTop: '#D1D5DB' },
  { id: 'SENT',           label: 'Sent',            dotColor: '#3B82F6', headerBg: '#EFF6FF', borderTop: '#3B82F6' },
  { id: 'VIEWED',         label: 'Viewed',          dotColor: '#7C3AED', headerBg: '#F5F3FF', borderTop: '#7C3AED' },
  { id: 'CHANGES_NEEDED', label: 'Changes Needed',  dotColor: '#F59E0B', headerBg: '#FFFBEB', borderTop: '#F59E0B' },
  { id: 'CLOSED',         label: 'Closed',          dotColor: '#374151', headerBg: '#F3F4F6', borderTop: '#6B7280' },
]

function getColumnId(status: string, expiresAt: Date | string | null): ColumnId {
  const now = new Date()
  const isExpired = !!expiresAt && new Date(expiresAt) < now && status !== 'APPROVED'

  if (isExpired)                   return 'CLOSED'
  if (status === 'APPROVED')       return 'CLOSED'
  if (status === 'DECLINED')       return 'CLOSED'
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

// ─── Card ─────────────────────────────────────────────────────────────────────

function ProposalCard({
  card,
  onStatusChange,
}: {
  card:           ProposalCardData
  onStatusChange: (proposalId: string, status: string) => void
}) {
  const { proposal } = card
  const now        = new Date()
  const isApproved = proposal.status === 'APPROVED'
  const isDeclined = proposal.status === 'DECLINED'
  const isExpired  = !!proposal.expiresAt &&
                     new Date(proposal.expiresAt) < now &&
                     proposal.status !== 'APPROVED'

  const canFlagChanges = proposal.status === 'SENT' || proposal.status === 'VIEWED'
  const canResend      = proposal.status === 'CHANGES_NEEDED'

  return (
    <div className="rounded-xl bg-white border border-border hover:border-violet-200 hover:shadow-sm transition-all group">
      <Link href={`/projects/${card.projectId}`} className="block p-3.5">
        {/* Shoot type pill */}
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SHOOT_COLORS[card.shootType] ?? 'bg-gray-100 text-gray-600'}`}>
          {SHOOT_LABELS[card.shootType] ?? card.shootType}
        </span>

        {/* Project + client */}
        <p className="mt-2 font-semibold text-[13.5px] text-foreground leading-snug group-hover:text-violet-700 transition-colors">
          {card.projectName}
        </p>
        <p className="text-[11.5px] text-muted-foreground mt-0.5">{card.clientName}</p>

        {/* Latest proposal info */}
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="text-[11.5px] font-medium text-foreground line-clamp-1">{proposal.title}</p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">
            v{proposal.version}
            {card.totalCount > 1 && (
              <span className="ml-1 text-muted-foreground/70">· {card.totalCount} revisions</span>
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

        {/* Closed outcome badge */}
        {(isApproved || isDeclined || isExpired) && (
          <div className="mt-2.5">
            {isApproved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-medium">
                <CheckCircle className="h-3 w-3" />
                Won{proposal.signatureName ? ` · ${proposal.signatureName}` : ''}
              </span>
            )}
            {isDeclined && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium">
                <XCircle className="h-3 w-3" />
                Declined
              </span>
            )}
            {isExpired && !isDeclined && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-medium">
                <Clock className="h-3 w-3" />
                Expired
              </span>
            )}
          </div>
        )}
      </Link>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border/60 px-3.5 py-2 min-h-[36px]">
        <div>
          {canFlagChanges && (
            <button
              onClick={(e) => { e.preventDefault(); onStatusChange(proposal.id, 'CHANGES_NEEDED') }}
              className="flex items-center gap-1 text-[10.5px] text-amber-600 hover:text-amber-700 font-medium"
            >
              <AlertCircle className="h-3 w-3" />
              Flag changes needed
            </button>
          )}
          {canResend && (
            <button
              onClick={(e) => { e.preventDefault(); onStatusChange(proposal.id, 'SENT') }}
              className="flex items-center gap-1 text-[10.5px] text-blue-600 hover:text-blue-700 font-medium"
            >
              <Send className="h-3 w-3" />
              Mark re-sent
            </button>
          )}
        </div>
        <a
          href={`/p/${proposal.publicToken}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-muted-foreground/50 hover:text-violet-600 transition-colors ml-auto"
          title="Open public link"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

// ─── Main Kanban ──────────────────────────────────────────────────────────────

export function ProposalsKanban({ cards: initialCards }: { cards: ProposalCardData[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [cards, setCards] = useState(initialCards)

  function handleStatusChange(proposalId: string, newStatus: string) {
    // Optimistic update — move card to new column immediately
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

  // Group cards into columns
  const grouped = Object.fromEntries(
    COLUMNS.map(col => [col.id, [] as ProposalCardData[]])
  ) as Record<ColumnId, ProposalCardData[]>

  for (const card of cards) {
    const colId = getColumnId(card.proposal.status, card.proposal.expiresAt)
    grouped[colId].push(card)
  }

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <div className="flex gap-3" style={{ minWidth: `${COLUMNS.length * 272}px` }}>
        {COLUMNS.map(col => {
          const colCards = grouped[col.id]
          return (
            <div key={col.id} className="flex flex-col w-[260px] shrink-0">
              {/* Column header */}
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-2"
                style={{
                  backgroundColor: col.headerBg,
                  borderLeft: `3px solid ${col.borderTop}`,
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

              {/* Cards */}
              <div className="flex flex-col gap-2">
                {colCards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 py-8 text-center">
                    <p className="text-[11px] text-muted-foreground/60">Empty</p>
                  </div>
                ) : (
                  colCards.map(card => (
                    <ProposalCard
                      key={card.proposal.id}
                      card={card}
                      onStatusChange={handleStatusChange}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
