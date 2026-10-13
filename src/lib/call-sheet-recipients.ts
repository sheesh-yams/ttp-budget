// Who a call sheet is emailed to, and what changed since each person's last
// email. Plain module (tested in src/lib/__tests__/call-sheet-recipients.test.ts);
// the send/track actions live in src/server/actions/call-sheets.ts.

import { formatTime, type TimeFormat } from '@/lib/time-format'
import type { CrewDept, OtherContact, TalentMember } from '@/server/actions/call-sheets'

export type RecipientGroup = 'CREW' | 'TALENT' | 'OTHER'

/** Where a person sits in the call sheet's JSON — to write a typed email back. */
export type RowRef =
  | { group: 'CREW'; dept: number; member: number }
  | { group: 'TALENT'; index: number }
  | { group: 'OTHER'; index: number }

export interface SheetPerson {
  /** Identity across edits: "contact:<id>" when linked to the Rolodex, else
   *  "email:<lowercased email>|<lowercased name>" (two people can share an
   *  address, e.g. an agent's); null with neither (no email, not linked). */
  personKey: string | null
  /** Identifies the row in this request: the personKey, else its position. */
  ref: string
  rowRef: RowRef
  group: RecipientGroup
  name: string
  role: string | null
  email: string | null
  /** "HH:mm"; null for other contacts (they follow the general call). */
  callTime: string | null
  contactId: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function personKeyFor(contactId: string | null | undefined, email: string | null | undefined, name?: string | null): string | null {
  if (contactId) return `contact:${contactId}`
  const e = norm(email)
  return e ? `email:${e}|${norm(name)}` : null
}

function refOf(r: RowRef): string {
  return r.group === 'CREW' ? `row:CREW:${r.dept}:${r.member}` : `row:${r.group}:${r.index}`
}

const blank = (s: string | null | undefined) => !s || !s.trim()

/**
 * Everyone on the sheet who could get an email, in sheet order (crew, talent,
 * other contacts). Empty rows are skipped; someone listed twice (same contact
 * or email) appears once, with their earliest call time.
 */
export function peopleOnSheet(crew: CrewDept[], talent: TalentMember[], others: OtherContact[]): SheetPerson[] {
  const out: SheetPerson[] = []
  const byKey = new Map<string, SheetPerson>()
  const add = (p: Omit<SheetPerson, 'personKey' | 'ref'>) => {
    if (blank(p.name) && blank(p.email)) return
    const personKey = personKeyFor(p.contactId, p.email, p.name)
    // The same person listed once linked to the Rolodex and once not (same
    // email and name) is one person.
    const existing = (personKey ? byKey.get(personKey) : undefined)
      ?? (!p.contactId && p.email ? out.find(x => x.contactId && norm(x.email) === norm(p.email) && norm(x.name) === norm(p.name)) : undefined)
    if (existing) {
      if (p.callTime && (!existing.callTime || p.callTime < existing.callTime)) existing.callTime = p.callTime
      if (!existing.email && p.email) existing.email = p.email
      return
    }
    const person: SheetPerson = { ...p, personKey, ref: personKey ?? refOf(p.rowRef) }
    if (personKey) byKey.set(personKey, person)
    out.push(person)
  }
  crew.forEach((d, di) => (d.members ?? []).forEach((m, mi) => add({
    rowRef: { group: 'CREW', dept: di, member: mi }, group: 'CREW', name: m.name?.trim() ?? '',
    role: m.role?.trim() || null, email: m.email?.trim() || null, callTime: m.callTime || null, contactId: m.contactId ?? null,
  })))
  talent.forEach((t, i) => add({
    rowRef: { group: 'TALENT', index: i }, group: 'TALENT', name: t.name?.trim() ?? '',
    role: t.role?.trim() || null, email: t.email?.trim() || null, callTime: t.callTime || null, contactId: t.contactId ?? null,
  }))
  others.forEach((o, i) => add({
    rowRef: { group: 'OTHER', index: i }, group: 'OTHER', name: o.name?.trim() ?? '',
    role: [o.role, o.company].filter(x => x?.trim()).join(' · ') || null, email: o.email?.trim() || null,
    callTime: null, contactId: null,
  }))
  return out
}

// ── What each email said, and what changed since ─────────────────────────────

/** Saved on the recipient row at each send (CallSheetRecipient.lastSent). */
export interface SendSnapshot {
  date: string               // "YYYY-MM-DD"
  generalCall: string        // "HH:mm"
  callTime: string | null    // theirs
  location: string | null
}

export function sendSnapshot(sheet: {
  shootDate: Date | string; generalCall: string; locationName: string | null; locationAddress: string | null
}, person: Pick<SheetPerson, 'callTime'>): SendSnapshot {
  const date = typeof sheet.shootDate === 'string' ? sheet.shootDate.slice(0, 10) : sheet.shootDate.toISOString().slice(0, 10)
  const location = [sheet.locationName?.trim(), sheet.locationAddress?.trim()].filter(Boolean).join(' — ') || null
  return { date, generalCall: sheet.generalCall, callTime: person.callTime, location }
}

function asSnapshot(v: unknown): SendSnapshot | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.date !== 'string' || typeof o.generalCall !== 'string') return null
  return {
    date: o.date, generalCall: o.generalCall,
    callTime: typeof o.callTime === 'string' ? o.callTime : null,
    location: typeof o.location === 'string' ? o.location : null,
  }
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Lines for the "What changed" box of an update email; [] if nothing did. */
export function changesSince(prev: unknown, now: SendSnapshot, fmt: TimeFormat = '12H'): string[] {
  const p = asSnapshot(prev)
  if (!p) return []
  const t = (s: string | null) => (s ? formatTime(s, fmt) : '—')
  const out: string[] = []
  if (p.date !== now.date) out.push(`Date: ${prettyDate(p.date)} → ${prettyDate(now.date)}`)
  if (p.callTime !== now.callTime) out.push(`Your call: ${t(p.callTime)} → ${t(now.callTime)}`)
  if (p.generalCall !== now.generalCall) out.push(`General call: ${t(p.generalCall)} → ${t(now.generalCall)}`)
  if ((p.location ?? '') !== (now.location ?? '')) out.push(`Location: ${now.location ?? 'to be confirmed'}`)
  return out
}

/**
 * Whether a confirmation still stands after this send: it resets when the
 * date, location or their call changed (their own call time, or — for people
 * without one — the general call).
 */
export function confirmationStillValid(prev: unknown, now: SendSnapshot): boolean {
  const p = asSnapshot(prev)
  if (!p) return true
  if (p.date !== now.date || (p.location ?? '') !== (now.location ?? '')) return false
  if (p.callTime !== now.callTime) return false
  if (!now.callTime && p.generalCall !== now.generalCall) return false
  return true
}

/**
 * Pairs people on the sheet with their recipient rows. An exact key first;
 * then — so linking someone to the Rolodex or fixing an email typo doesn't
 * make them look brand new — the same contact, the same email, or a unique
 * name in the same group. Each row is used once.
 */
export function matchRecipients<R extends { personKey: string; contactId: string | null; email: string; name: string; group: string }>(
  people: SheetPerson[], rows: R[],
): Map<string, R> {
  const out = new Map<string, R>()        // person ref → row
  const used = new Set<R>()
  const take = (p: SheetPerson, r: R | undefined) => { if (r && !used.has(r)) { out.set(p.ref, r); used.add(r) } }
  for (const p of people) take(p, rows.find(r => r.personKey === p.personKey))
  for (const p of people) if (!out.has(p.ref) && p.contactId) take(p, rows.find(r => !used.has(r) && r.contactId === p.contactId))
  for (const p of people) if (!out.has(p.ref) && p.email) {
    const same = rows.filter(r => !used.has(r) && norm(r.email) === norm(p.email))
    take(p, same.find(r => norm(r.name) === norm(p.name)) ?? (same.length === 1 ? same[0] : undefined))
  }
  for (const p of people) if (!out.has(p.ref) && p.name.trim()) {
    const same = rows.filter(r => !used.has(r) && r.group === p.group && norm(r.name) === norm(p.name))
    if (same.length === 1 && people.filter(x => x.group === p.group && norm(x.name) === norm(p.name)).length === 1) take(p, same[0])
  }
  return out
}

export type RecipientStatus = 'NOT_SENT' | 'SENT' | 'OPENED' | 'CONFIRMED'

export function recipientStatus(r: { lastSentAt: Date | null; firstViewedAt: Date | null; confirmedAt: Date | null } | null | undefined): RecipientStatus {
  if (!r?.lastSentAt) return 'NOT_SENT'
  if (r.confirmedAt) return 'CONFIRMED'
  if (r.firstViewedAt) return 'OPENED'
  return 'SENT'
}
