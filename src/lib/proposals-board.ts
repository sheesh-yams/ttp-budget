// /proposals — one row per deal (a project's current proposal, or a lead with
// no proposal yet), and everything the list and board derive from it: stage,
// follow-ups, badges, tabs, activity bands, board columns and the stats.
// Plain module (no server imports) — used by the page, the client and jest.

import { isProposalExpired } from '@/lib/proposal-expiry'

export type DealStage = 'ns' | 'out' | 'won' | 'lost'
export type Tone = 'grey' | 'amber' | 'violet' | 'green' | 'blue'

export interface DealProposal {
  id:            string
  title:         string
  token:         string
  status:        string
  version:       number
  /** Other versions of this project's proposal (earlier ones, plus a newer draft). */
  otherVersions: number
  /** A newer draft sits above this one (a revision in progress). */
  draftAbove:    number | null
  viewCount:     number
  sentAt:        string | null
  lastViewedAt:  string | null
  expiresAt:     string | null
  approvedAt:    string | null
  declinedAt:    string | null
  updatedAt:     string
  /** When it was won or marked lost: approvedAt, else the audit event. Never
   *  updatedAt — opening the client link bumps that. Null when unknown. */
  decidedAt:     string | null
  signatureName: string | null
}

export interface DealRow {
  /** Proposal id, or `p:<projectId>` for a lead with no proposal. */
  key:      string
  project:  { id: string; name: string; status: string }
  client:   { id: string; name: string; logoUrl: string | null }
  owner:    { userId: string; name: string | null; email: string; avatarUrl: string | null } | null
  proposal: DealProposal | null
  /** The project has a priced budget (says "Budget ready" without showing money). */
  hasBudget:  boolean
  /** Null for roles that can't see money. */
  valueCents: number | null
  canEdit:    boolean
}

// ─── Picking the proposal that represents a project ─────────────────────────

type Versioned = { status: string; version: number }

/** The latest non-draft version, or the newest draft when nothing was sent. */
export function pickProposal<T extends Versioned>(proposals: T[]): { rep: T; others: number; draftAbove: number | null } | null {
  if (proposals.length === 0) return null
  const byVersion = [...proposals].sort((a, b) => b.version - a.version)
  const rep = byVersion.find(p => p.status !== 'DRAFT') ?? byVersion[0]
  const draft = byVersion.find(p => p.status === 'DRAFT' && p.version > rep.version)
  return { rep, others: proposals.length - 1, draftAbove: draft ? draft.version : null }
}

/** Frozen client-facing total of a sent proposal (same fallback as updateProposalStatus). */
export function frozenTotalCents(content: unknown): number | null {
  const c = content && typeof content === 'object' ? (content as Record<string, unknown>) : null
  if (!c) return null
  if (typeof c.totalCents === 'number') return c.totalCents
  const snap = c.budgetSnapshot && typeof c.budgetSnapshot === 'object' ? (c.budgetSnapshot as Record<string, unknown>) : null
  return snap && typeof snap.totalCents === 'number' ? snap.totalCents : null
}

// ─── Status, stage, follow-ups ───────────────────────────────────────────────

const DAY = 86_400_000
const days = (from: string, to: Date) => Math.floor((to.getTime() - new Date(from).getTime()) / DAY)

/** Stored status, with an open proposal past its expiry reading as EXPIRED; 'NONE' without one. */
export function effectiveStatus(r: DealRow, now: Date): string {
  if (!r.proposal) return 'NONE'
  return isProposalExpired(r.proposal, now) ? 'EXPIRED' : r.proposal.status
}

export function stage(r: DealRow, now: Date): DealStage {
  const s = effectiveStatus(r, now)
  if (s === 'NONE' || s === 'DRAFT') return 'ns'
  if (s === 'APPROVED') return 'won'
  if (s === 'LOST' || s === 'DECLINED' || s === 'EXPIRED') return 'lost'
  return 'out'
}

export interface FollowUp { short: string; long: string }

/** Why an open proposal needs chasing, or null. Thresholds match the Projects next-step rules. */
export function followUp(r: DealRow, now: Date): FollowUp | null {
  if (!r.proposal || stage(r, now) !== 'out') return null
  const p = r.proposal
  if (p.status === 'CHANGES_NEEDED') return { short: 'Changes asked', long: 'Client asked for changes' }
  if (p.expiresAt) {
    const left = Math.ceil((new Date(p.expiresAt).getTime() - now.getTime()) / DAY)
    if (left <= 2) return left <= 0 ? { short: 'Expires today', long: 'Expires today' } : { short: `Expires ${left}d`, long: `Expires in ${left} ${left === 1 ? 'day' : 'days'}` }
  }
  if (p.viewCount > 0 && p.lastViewedAt) {
    const quiet = days(p.lastViewedAt, now)
    if (quiet > 5) return { short: `Quiet ${quiet}d`, long: `No reply in ${quiet} days` }
  }
  if (p.viewCount === 0 && p.sentAt) {
    const since = days(p.sentAt, now)
    if (since >= 3) return { short: `Not opened ${since}d`, long: `Not opened in ${since} days` }
  }
  return null
}

// ─── Text ────────────────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Nov 4" (UTC, so server and browser agree). */
export function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function ago(iso: string, now: Date): string {
  const n = days(iso, now)
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}

const on = (iso: string | null) => (iso ? ` ${shortDate(iso)}` : '')

/** When a closed proposal closed (best available date). */
export function closedAt(r: DealRow, now: Date): string | null {
  const p = r.proposal
  if (!p) return null
  const s = effectiveStatus(r, now)
  if (s === 'APPROVED') return p.approvedAt ?? p.decidedAt
  if (s === 'DECLINED') return p.declinedAt ?? p.decidedAt
  if (s === 'EXPIRED') return p.expiresAt ?? p.decidedAt
  if (s === 'LOST') return p.decidedAt
  return null
}

/** The one-line "what's happening" under the status pill in the list. */
export function nextLine(r: DealRow, now: Date): { text: string; tone: Tone } {
  const p = r.proposal
  if (!p) return { text: r.hasBudget ? 'Budget ready · draft the proposal' : 'Build the budget, then draft', tone: 'grey' }
  const s = effectiveStatus(r, now)
  const fu = followUp(r, now)
  if (fu) return { text: fu.long, tone: 'amber' }
  switch (s) {
    case 'DRAFT':    return { text: `Draft v${p.version} · not sent`, tone: 'grey' }
    case 'SENT':     return { text: p.sentAt ? `Sent ${ago(p.sentAt, now)} · not opened yet` : 'Sent · not opened yet', tone: 'grey' }
    case 'VIEWED':   return { text: `Viewed ${p.viewCount}×${p.lastViewedAt ? ` ${ago(p.lastViewedAt, now)}` : ''}`, tone: 'violet' }
    case 'APPROVED': return { text: `${p.signatureName ? 'Signed' : 'Won'}${on(closedAt(r, now))}`, tone: 'green' }
    case 'DECLINED': return { text: `Declined${on(closedAt(r, now))}`, tone: 'grey' }
    case 'EXPIRED':  return { text: `Expired${on(closedAt(r, now))} · reopen?`, tone: 'grey' }
    case 'LOST':     return { text: `Marked lost${on(closedAt(r, now))}`, tone: 'grey' }
    default:         return { text: '', tone: 'grey' }
  }
}

export const STATUS_LABEL: Record<string, string> = {
  NONE: 'Not started', DRAFT: 'Draft', SENT: 'Sent', VIEWED: 'Viewed', CHANGES_NEEDED: 'Changes needed',
  APPROVED: 'Won', DECLINED: 'Declined', EXPIRED: 'Expired', LOST: 'Lost',
}

/** Board-card badges: one status badge, plus "Follow up" and its reason when it's gone quiet. */
export function badges(r: DealRow, now: Date): { text: string; tone: Tone }[] {
  const p = r.proposal
  const st = stage(r, now)
  if (!p) return [{ text: 'Draft needed', tone: 'grey' }]
  if (st === 'ns') return [{ text: `Draft v${p.version}`, tone: 'grey' }]
  if (st === 'won') return [{ text: nextLine(r, now).text, tone: 'green' }]
  if (st === 'lost') return [{ text: STATUS_LABEL[effectiveStatus(r, now)], tone: 'grey' }]
  const fu = followUp(r, now)
  if (fu) return [{ text: 'Follow up', tone: 'amber' }, { text: fu.short, tone: 'grey' }]
  if (p.viewCount > 0) return [{ text: `Viewed ${p.viewCount}×`, tone: 'violet' }]
  return [{ text: 'Not opened', tone: 'blue' }]
}

// ─── Tabs, filters, bands, board columns ────────────────────────────────────

export const TABS = [
  { key: 'open',   label: 'Open' },
  { key: 'follow', label: 'Follow up' },
  { key: 'won',    label: 'Won' },
  { key: 'lost',   label: 'Lost & expired' },
  { key: 'all',    label: 'All' },
] as const
export type TabKey = typeof TABS[number]['key']
export const isTab = (v: unknown): v is TabKey => TABS.some(t => t.key === v)

export function inTab(r: DealRow, tab: TabKey, now: Date): boolean {
  const st = stage(r, now)
  switch (tab) {
    case 'open':   return st === 'ns' || st === 'out'
    case 'follow': return followUp(r, now) !== null
    case 'won':    return st === 'won'
    case 'lost':   return st === 'lost'
    case 'all':    return true
  }
}

export interface Filters { q: string; owners: string[]; clients: string[]; statuses: string[] }
export const EMPTY_FILTERS: Filters = { q: '', owners: [], clients: [], statuses: [] }

export function matches(r: DealRow, f: Filters, now: Date): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && ![r.project.name, r.client.name, r.proposal?.title ?? ''].some(s => s.toLowerCase().includes(q))) return false
  if (f.owners.length && !f.owners.includes(r.owner?.userId ?? '')) return false
  if (f.clients.length && !f.clients.includes(r.client.id)) return false
  if (f.statuses.length && !f.statuses.includes(effectiveStatus(r, now))) return false
  return true
}

/** Latest thing that happened with the client. */
export function lastActivity(r: DealRow): string | null {
  const p = r.proposal
  if (!p) return null
  const ds = [p.lastViewedAt, p.sentAt, p.approvedAt, p.declinedAt, p.decidedAt].filter((d): d is string => !!d)
  return ds.length ? ds.reduce((a, b) => (a > b ? a : b)) : p.updatedAt
}

export type BandKey = 'd7' | 'd30' | 'ns' | 'older'
export const BANDS: { key: BandKey; label: string }[] = [
  { key: 'd7',    label: 'Active last 7 days' },
  { key: 'd30',   label: 'Active last 30 days' },
  { key: 'ns',    label: 'Not started' },
  { key: 'older', label: 'Older activity' },
]

export function band(r: DealRow, now: Date): BandKey {
  if (stage(r, now) === 'ns') return 'ns'
  const last = lastActivity(r)
  const n = last ? days(last, now) : Infinity
  return n <= 7 ? 'd7' : n <= 30 ? 'd30' : 'older'
}

/** Newest activity first; not-started leads by value, then name. */
export function sortDeals(rows: DealRow[]): DealRow[] {
  return [...rows].sort((a, b) => {
    const la = lastActivity(a) ?? '', lb = lastActivity(b) ?? ''
    if (la !== lb) return la < lb ? 1 : -1
    const va = a.valueCents ?? 0, vb = b.valueCents ?? 0
    if (va !== vb) return vb - va
    return a.project.name.localeCompare(b.project.name)
  })
}

const quarterOf = (d: Date) => d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3)
export const quarterLabel = (now: Date) => `Q${Math.floor(now.getUTCMonth() / 3) + 1}`

export type ColumnKey = 'ns' | 'sent' | 'viewed' | 'won' | 'lost'
export const BOARD_COLUMNS: { key: ColumnKey; label: (now: Date) => string; dot: string }[] = [
  { key: 'ns',     label: () => 'Not started',               dot: '#C9C6C0' },
  { key: 'sent',   label: () => 'Sent',                      dot: '#9DB5F2' },
  { key: 'viewed', label: () => 'Viewed',                    dot: 'var(--brand-primary, #5D00A4)' },
  { key: 'won',    label: now => `Won · ${quarterLabel(now)}`, dot: '#12B76A' },
  { key: 'lost',   label: () => 'Lost · expired',            dot: '#D9A3AE' },
]

/** Board column, or null when it's off the board (won before this quarter, closed 90+ days ago). */
export function boardColumn(r: DealRow, now: Date): ColumnKey | null {
  const st = stage(r, now)
  if (st === 'ns') return 'ns'
  if (st === 'out') return r.proposal!.status === 'SENT' ? 'sent' : 'viewed'
  const at = closedAt(r, now)
  if (!at) return null
  if (st === 'won') return quarterOf(new Date(at)) === quarterOf(now) ? 'won' : null
  return days(at, now) <= 90 ? 'lost' : null
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface DealSummary {
  outCount: number; pipelineCents: number
  nsCount: number;  draftingCents: number
  wonThisQCents: number; wonLastQCents: number; wonThisQCount: number
  wonCount: number; decidedCount: number
  followCount: number
}

export function summarize(rows: DealRow[], now: Date): DealSummary {
  const q = quarterOf(now)
  const s: DealSummary = { outCount: 0, pipelineCents: 0, nsCount: 0, draftingCents: 0, wonThisQCents: 0, wonLastQCents: 0, wonThisQCount: 0, wonCount: 0, decidedCount: 0, followCount: 0 }
  for (const r of rows) {
    const v = r.valueCents ?? 0
    const st = stage(r, now)
    if (st === 'out') { s.outCount++; s.pipelineCents += v }
    if (st === 'ns')  { s.nsCount++;  s.draftingCents += v }
    if (st === 'won' || st === 'lost') s.decidedCount++
    if (st === 'won') {
      s.wonCount++
      const at = closedAt(r, now)
      const wq = at ? quarterOf(new Date(at)) : null
      if (wq === q)     { s.wonThisQCents += v; s.wonThisQCount++ }
      if (wq === q - 1) s.wonLastQCents += v
    }
    if (followUp(r, now)) s.followCount++
  }
  return s
}
