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
  /** Null for roles without project money (stripped server-side). */
  money: null | {
    valueCents:     number
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

export const TABS = [
  { key: 'progress',  label: 'In progress' },
  { key: 'leads',     label: 'Leads' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'wrapped',   label: 'Wrapped' },
  { key: 'archived',  label: 'Archived' },
  { key: 'all',       label: 'All' },
] as const
export type TabKey = typeof TABS[number]['key']

export function isTab(v: unknown): v is TabKey {
  return typeof v === 'string' && TABS.some(t => t.key === v)
}

export function inTab(r: ProjectRow, tab: TabKey): boolean {
  switch (tab) {
    case 'progress':  return r.status === 'ACTIVE'
    case 'leads':     return r.status === 'LEAD'
    case 'attention': return r.attention && r.status !== 'ARCHIVED'
    case 'wrapped':   return r.status === 'WRAPPED'
    case 'archived':  return r.status === 'ARCHIVED'
    case 'all':       return r.status !== 'ARCHIVED'
  }
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
