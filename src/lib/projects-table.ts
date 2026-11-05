// The /projects table: row shape (built server-side in projects/page.tsx) and
// the pure tab / filter / sort helpers the client uses. Plain module.

import type { NextStep } from '@/lib/project-next-step'
import { phaseIndex, type PhaseKey } from '@/lib/project-phase'

export interface ProjectRow {
  id:        string
  name:      string
  shootType: string
  status:    string
  phase:     PhaseKey
  client:    { id: string; name: string; logoUrl: string | null }
  /** "YYYY-MM-DD" (UTC). */
  shootStart: string | null
  shootEnd:   string | null
  updatedAt:  string
  /** Has a sent (non-draft, non-void) invoice — money is being collected, so
   *  it counts as booked work even if it's still marked Lead. */
  billing:    boolean
  /** Unpaid invoices past their due date. A count, not money. */
  overdueInvoices: number
  /** Null for roles without project money (stripped server-side). */
  money: null | {
    /** Expected gross (primary budget + added scope), never less than what's been invoiced. */
    valueCents:     number
    /** Sum of sent invoices (not draft / void). */
    invoicedCents:  number
    collectedCents: number
    won:            boolean
    wonAt:          string | null
    proposed:       boolean
  }
  step:      NextStep
  attention: boolean
  suggested: PhaseKey | null
  team: { role: string; userId: string; name: string | null; email: string; avatarUrl: string | null }[]
  /** Project Overview EDIT: change phase / wrap. */
  canEdit:     boolean
  canEditTeam: boolean
}

/** The tabs shown. /projects is booked work only; leads (bidding) are
 *  reached through the separate "Leads" link (`?tab=leads`). */
export const TABS = [
  { key: 'progress',  label: 'In progress' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'wrapped',   label: 'Wrapped' },
  { key: 'archived',  label: 'Archived' },
  { key: 'all',       label: 'All' },
] as const
export type TabKey = typeof TABS[number]['key'] | 'leads'

export function isTab(v: unknown): v is TabKey {
  return v === 'leads' || (typeof v === 'string' && TABS.some(t => t.key === v))
}

/** Won work: anything past Lead, or a lead that's already being invoiced. */
export function isBooked(r: Pick<ProjectRow, 'status' | 'billing'>): boolean {
  return r.status !== 'LEAD' || r.billing
}

export function inTab(r: ProjectRow, tab: TabKey): boolean {
  if (tab === 'leads') return r.status === 'LEAD'
  if (!isBooked(r)) return false
  switch (tab) {
    case 'progress':  return r.status === 'ACTIVE' || r.status === 'LEAD'
    case 'attention': return r.attention && r.status !== 'ARCHIVED'
    case 'wrapped':   return r.status === 'WRAPPED'
    case 'archived':  return r.status === 'ARCHIVED'
    case 'all':       return r.status !== 'ARCHIVED'
  }
}

export interface BookedSummary {
  count:               number
  bookedCents:         number
  collectedCents:      number
  /** booked − collected: everything still to come in. */
  outstandingCents:    number
  /** The part of outstanding that's been invoiced. */
  invoicedUnpaidCents: number
  /** The part of outstanding not invoiced yet. */
  notInvoicedCents:    number
  overdueCount:        number
  upcomingShoots:      number
}

/**
 * The /projects stat row: booked, non-archived projects among `rows` (the
 * filtered list, whatever the tab). Per project, outstanding = value −
 * collected and not-invoiced = value − invoiced, each floored at 0, so
 * outstanding = invoiced-unpaid + not-invoiced. Money fields are 0 when
 * rows carry no money (margin-blind roles).
 */
export function summarizeBooked(rows: ProjectRow[], todayKey: string, soonKey: string): BookedSummary {
  const s: BookedSummary = { count: 0, bookedCents: 0, collectedCents: 0, outstandingCents: 0, invoicedUnpaidCents: 0, notInvoicedCents: 0, overdueCount: 0, upcomingShoots: 0 }
  for (const r of rows) {
    if (!isBooked(r) || r.status === 'ARCHIVED') continue
    s.count++
    s.overdueCount += r.overdueInvoices
    if (r.shootStart && r.shootStart >= todayKey && r.shootStart <= soonKey) s.upcomingShoots++
    if (!r.money) continue
    const { valueCents: v, invoicedCents: inv, collectedCents: col } = r.money
    const out = Math.max(0, v - col)
    const notInv = Math.min(out, Math.max(0, v - inv))
    s.bookedCents += v
    s.collectedCents += col
    s.outstandingCents += out
    s.notInvoicedCents += notInv
    s.invoicedUnpaidCents += out - notInv
  }
  return s
}

export interface Filters {
  q:      string
  phases: string[]
  clients: string[]
  types:  string[]
  /** userId of a team member (any of PL / AM / PM). */
  lead:   string | null
}

export const EMPTY_FILTERS: Filters = { q: '', phases: [], clients: [], types: [], lead: null }

export function matches(r: ProjectRow, f: Filters): boolean {
  if (f.phases.length && !f.phases.includes(r.phase)) return false
  if (f.clients.length && !f.clients.includes(r.client.id)) return false
  if (f.types.length && !f.types.includes(r.shootType)) return false
  if (f.lead && !r.team.some(m => m.userId === f.lead)) return false
  const q = f.q.trim().toLowerCase()
  if (q && !r.name.toLowerCase().includes(q) && !r.client.name.toLowerCase().includes(q)) return false
  return true
}

export const SORT_KEYS = ['name', 'client', 'phase', 'status', 'shoot', 'value', 'updated'] as const
export type SortKey = typeof SORT_KEYS[number]
export type SortDir = 'asc' | 'desc'

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === 'string' && (SORT_KEYS as readonly string[]).includes(v)
}

/** The direction a column sorts in when first clicked. */
export function defaultDir(key: SortKey): SortDir {
  return key === 'value' || key === 'updated' ? 'desc' : 'asc'
}

const TONE_RANK: Record<string, number> = { red: 0, amber: 1, violet: 2, grey: 3, green: 4 }

/** Sorted copy. Rows without a value for the key (no shoot date, no money)
 *  always go last, whatever the direction; ties fall back to most recently
 *  updated. */
export function sortRows(rows: ProjectRow[], key: SortKey, dir: SortDir): ProjectRow[] {
  const val = (r: ProjectRow): string | number | null => {
    switch (key) {
      case 'name':    return r.name.toLowerCase()
      case 'client':  return r.client.name.toLowerCase()
      case 'phase':   return phaseIndex(r.phase)
      case 'status':  return TONE_RANK[r.step.tone] ?? 9
      case 'shoot':   return r.shootStart
      case 'value':   return r.money ? r.money.valueCents : null
      case 'updated': return r.updatedAt
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b)
    if (va == null && vb != null) return 1
    if (vb == null && va != null) return -1
    if (va != null && vb != null && va !== vb) return (va < vb ? -1 : 1) * sign
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** Stable monogram colours, picked by hashing the client id. */
const MONO = [
  ['#FFF4E5', '#B45309'], ['#E8F0FE', '#1A56DB'], ['#F3E8FF', '#6B21A8'], ['#ECFDF3', '#027A48'],
  ['#FFF1F2', '#BE123C'], ['#EEF2FF', '#4338CA'], ['#FEF3C7', '#92400E'], ['#F0FDFA', '#0F766E'],
] as const

export function monogram(name: string, id: string): { text: string; bg: string; fg: string } {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const text = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const [bg, fg] = MONO[h % MONO.length]
  return { text, bg, fg }
}
