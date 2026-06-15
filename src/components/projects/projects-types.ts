/**
 * Shared TypeScript types for the projects dashboard.
 * Dates come from the server as ISO strings (Next.js serialises Date → string).
 */

export interface ProjectProposalSnap {
  id: string
  status: string
  approvedTotalCents: number | null
  lastViewedAt: string | null
  sentAt: string | null
  expiresAt: string | null
  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectInvoiceSnap {
  id: string
  status: string
  totalCents: number
  amountPaidCents: number
  dueDate: string
  paidAt: string | null
  issueDate: string
}

export interface ProjectCallSheetSnap {
  id: string
  status: string
  shootDate: string
}

export interface ProjectForCard {
  id: string
  name: string
  status: string
  shootType: string
  shootStartDate: string | null
  shootEndDate: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  client: { id: string; name: string }
  _count: { budgets: number }
  proposals: ProjectProposalSnap[]
  invoices: ProjectInvoiceSnap[]
  callSheets: ProjectCallSheetSnap[]
  // F1: actuals burn bar (0 if no actuals sheet)
  actualSpentCents: number
  budgetTotalCents: number
}

export interface ProjectMetrics {
  pipelineValueCents: number
  pipelineCount: number
  activeCount: number
  upcomingShootCount: number
  outstandingCents: number
  overdueCount: number
  wonThisQuarterCents: number
  wonLastQuarterCents: number
  thisWeekProposalsSent: number
  thisWeekInvoicesIssued: number
  thisWeekProjectsCreated: number
}

export type AttentionType =
  | 'proposal-viewed'
  | 'invoice-overdue'
  | 'shoot-no-callsheet'
  | 'proposal-expiring'

export interface AttentionItem {
  type: AttentionType
  projectId: string
  projectName: string
  label: string
  href: string
}

export interface UpcomingShoot {
  projectId: string
  projectName: string
  clientName: string
  shootDate: Date | string
}

export interface StatusCounts {
  lead: number
  active: number
  wrapped: number
  archived: number
}

export type ViewMode = 'grid' | 'list'
export type SortKey = 'recent' | 'name' | 'shoot' | 'value'

/** Compute progress percentage (0-100) from a project's proposals + invoices */
export function computeProgress(project: ProjectForCard): number {
  const hasApprovedProposal = project.proposals.some(p => p.status === 'APPROVED')
  const hasPendingProposal  = project.proposals.some(p => ['SENT', 'VIEWED'].includes(p.status))
  const hasAnyInvoice       = project.invoices.length > 0
  const hasSentInvoice      = project.invoices.some(i => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status))
  const hasPaidInvoice      = project.invoices.some(i => i.status === 'PAID')
  const isWrapped           = project.status === 'WRAPPED'

  if (isWrapped && hasPaidInvoice) return 100
  if (isWrapped)                   return 90
  if (hasPaidInvoice)              return 85
  if (hasSentInvoice)              return 65
  if (hasApprovedProposal)         return 50
  if (hasPendingProposal)          return 25
  if (hasAnyInvoice)               return 40
  return 5
}

/** Return a color token for the status colour bar / dot (always opaque) */
export function statusColor(status: string): string {
  switch (status) {
    case 'LEAD':     return 'var(--brand-accent)'
    case 'ACTIVE':   return 'var(--brand-primary)'
    case 'WRAPPED':  return '#6b7280'
    case 'ARCHIVED': return '#9ca3af'
    default:         return 'var(--brand-primary)'
  }
}

/**
 * Badge background + text colour — contrast-safe.
 *
 * For LEAD (mint accent), we use a light tint bg + dark accent text so the
 * badge is readable regardless of how light the brand accent is.
 * `color-mix` blends the CSS variable with white at build time in the browser,
 * so it automatically adapts when the workspace brand colour changes.
 */
export function statusBadgeStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'LEAD':
      return {
        background: 'color-mix(in srgb, var(--brand-accent) 18%, white)',
        color:      'var(--brand-accent-dark)',
      }
    case 'ACTIVE':
      return { background: 'var(--brand-primary)', color: '#ffffff' }
    case 'WRAPPED':
      return { background: '#6b7280', color: '#ffffff' }
    case 'ARCHIVED':
      return { background: '#e5e7eb', color: '#6b7280' }
    default:
      return { background: 'var(--brand-primary)', color: '#ffffff' }
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'LEAD':     return 'Lead'
    case 'ACTIVE':   return 'Active'
    case 'WRAPPED':  return 'Wrapped'
    case 'ARCHIVED': return 'Archived'
    default:         return status
  }
}

export function shootTypeLabel(type: string): string {
  const map: Record<string, string> = {
    MUSIC_VIDEO:     'Music Video',
    BRAND_CAMPAIGN:  'Brand Campaign',
    PRODUCT_SHOOT:   'Product Shoot',
    EVENT_RECAP:     'Event Recap',
    SOCIAL_CONTENT:  'Social Content',
    INFLUENCER:      'Influencer',
    DOCUMENTARY:     'Documentary',
    OTHER:           'Other',
  }
  return map[type] ?? type
}
