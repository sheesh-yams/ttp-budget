// A client's people and who each document is for. Plain module (jest-tested,
// safe in the browser).
//
// ClientContact is the one list of people; one of them may be Main (mirrored
// onto Client.contactName/Email/Phone by syncClientMain). Roles pick who each
// document defaults to; any single document can choose someone else. A
// document stores a PersonSnapshot, so it keeps showing who it was for after
// the person is edited or removed.

export const CLIENT_ROLES = ['BILLING', 'PROPOSALS', 'ON_SET'] as const
export type ClientRole = (typeof CLIENT_ROLES)[number]

export const ROLE_LABEL: Record<ClientRole, string> = {
  BILLING:   'Billing',
  PROPOSALS: 'Proposals',
  ON_SET:    'On-set',
}

/** What each role is for — shown next to the role checkboxes. */
export const ROLE_HINT: Record<ClientRole, string> = {
  BILLING:   'Invoices are addressed to them',
  PROPOSALS: 'Proposals are prepared for them',
  ON_SET:    'Listed on call sheets',
}

export function isClientRole(v: unknown): v is ClientRole {
  return typeof v === 'string' && (CLIENT_ROLES as readonly string[]).includes(v)
}

/** Unknown values dropped, duplicates removed, in CLIENT_ROLES order. */
export function normalizeRoles(roles: unknown): ClientRole[] {
  const set = new Set(Array.isArray(roles) ? roles.filter(isClientRole) : [])
  return CLIENT_ROLES.filter(r => set.has(r))
}

export interface ClientPerson {
  id:     string
  name:   string
  title:  string | null
  email:  string | null
  phone:  string | null
  isMain: boolean
  roles:  string[]
}

/** Who a document is for, frozen on the document. */
export interface PersonSnapshot {
  /** The ClientContact it came from (null once only the snapshot remains). */
  contactId: string | null
  name:      string
  title:     string | null
  email:     string | null
  phone:     string | null
}

export function snapshotOf(p: ClientPerson): PersonSnapshot {
  return { contactId: p.id, name: p.name, title: p.title, email: p.email, phone: p.phone }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A stored snapshot read back safely (JSON from the DB or a request). Null if unusable. */
export function readSnapshot(v: unknown): PersonSnapshot | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const name = str(o.name)
  const email = str(o.email)
  if (!name && !email) return null
  return {
    contactId: str(o.contactId),
    name:      name ?? email!,
    title:     str(o.title),
    email:     email ? email.toLowerCase() : null,
    phone:     str(o.phone),
  }
}

/** A stored snapshot list read back safely; null when never set (legacy behaviour). */
export function readSnapshots(v: unknown): PersonSnapshot[] | null {
  if (v == null) return null
  if (!Array.isArray(v)) return []
  return v.map(readSnapshot).filter((s): s is PersonSnapshot => s !== null)
}

export function mainPerson<T extends ClientPerson>(people: T[]): T | null {
  return people.find(p => p.isMain) ?? null
}

export function withRole<T extends ClientPerson>(people: T[], role: ClientRole): T[] {
  return people.filter(p => p.roles.includes(role))
}

/** Invoices: the first Billing person with an email, else Main. */
export function defaultBillTo<T extends ClientPerson>(people: T[]): T | null {
  return withRole(people, 'BILLING').find(p => p.email) ?? mainPerson(people)
}

/** Proposals: the Proposals people (with an email first), else Main. */
export function defaultPreparedFor<T extends ClientPerson>(people: T[]): T[] {
  const tagged = withRole(people, 'PROPOSALS')
  if (tagged.length) return [...tagged.filter(p => p.email), ...tagged.filter(p => !p.email)]
  const main = mainPerson(people)
  return main ? [main] : []
}

/** Call sheets: the On-set people, else Main. */
export function defaultOnSet<T extends ClientPerson>(people: T[]): T[] {
  const tagged = withRole(people, 'ON_SET')
  if (tagged.length) return tagged
  const main = mainPerson(people)
  return main ? [main] : []
}

/** "Hi Jamie," — a person's first name, else the company. */
export function greetingName(person: { name: string } | null | undefined, companyName: string): string {
  const first = person?.name?.trim().split(/\s+/)[0]
  return first || companyName
}

/** "Jamie Lee, Pat Doe" for a stored snapshot list; null when none. */
export function attnNames(v: unknown): string | null {
  const list = readSnapshots(v)
  return list && list.length ? list.map(s => s.name).join(', ') : null
}

/**
 * Who an invoice is for right now. The stored snapshot's person, refreshed
 * from the client's current people (their email may have changed). If that
 * person is gone: a never-sent invoice follows the client's role default
 * (drafts stay live); a sent one keeps the stored snapshot (what it went to).
 */
export function resolveBillTo<T extends ClientPerson>(stored: PersonSnapshot | null, people: T[], sent: boolean): { person: T | null; snapshot: PersonSnapshot | null } {
  const live = stored?.contactId ? people.find(p => p.id === stored.contactId && p.email) ?? null : null
  if (live) return { person: live, snapshot: snapshotOf(live) }
  if (!sent) {
    const d = defaultBillTo(people)
    return { person: d, snapshot: d ? snapshotOf(d) : null }
  }
  return { person: null, snapshot: stored }
}

/** The call sheet editor's pick for one client person. */
export interface ClientContactPick { id: string; hidePhone?: boolean; hideEmail?: boolean }

/** A client contact on a call sheet — plus what the crew may see of them. */
export interface SheetClientContact extends PersonSnapshot {
  /** Leave their phone off the sheet the crew sees (public page + PDF). */
  hidePhone: boolean
  /** Leave their email off it. It's still used to send them their copy. */
  hideEmail: boolean
}

/** A call sheet's stored client contacts; null when never picked (legacy). */
export function readSheetContacts(v: unknown): SheetClientContact[] | null {
  if (v == null) return null
  if (!Array.isArray(v)) return []
  return v.flatMap(raw => {
    const snap = readSnapshot(raw)
    if (!snap) return []
    const o = raw as Record<string, unknown>
    return [{ ...snap, hidePhone: o.hidePhone === true, hideEmail: o.hideEmail === true }]
  })
}

/**
 * The client contacts a call sheet shows: its stored picks, or — on a sheet
 * saved before picking existed (null) — the client's main contact, as before.
 * Hidden phones/emails are blanked: this is what the crew sees.
 */
export function sheetClientContacts(stored: unknown, client: {
  name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null
} | null): SheetClientContact[] {
  const picked = readSheetContacts(stored)
  if (picked) return picked.map(c => ({
    ...c,
    // A person saved with only an email is named by it — don't let the name
    // show what hideEmail hides.
    name:  c.hideEmail && /@/.test(c.name) ? (c.title || 'Client contact') : c.name,
    phone: c.hidePhone ? null : c.phone,
    email: c.hideEmail ? null : c.email,
  }))
  if (!client) return []
  const name = client.contactName?.trim() || null
  const email = client.contactEmail?.trim() || null
  const phone = client.contactPhone?.trim() || null
  if (!name && !email && !phone) return []
  return [{ contactId: null, name: name ?? client.name, title: null, email: email ? email.toLowerCase() : null, phone, hidePhone: false, hideEmail: false }]
}

/**
 * A proposal's To/CC after the "Prepared for" ticks change from `prev` to
 * `next` (ids). Only the ticked/unticked people's own addresses move:
 * unticked → removed from To/CC; ticked → fills an empty To, else joins CC.
 * Everything else (typed, standard CC, other people) stays. If the To was
 * unticked, the next picked person moves up to To.
 */
export function retargetPreparedFor(args: {
  to: string; cc: string[]; prev: string[]; next: string[]
  emailOf: (id: string) => string | null
}): { to: string; cc: string[] } {
  const low = (e: string) => e.trim().toLowerCase()
  const added   = args.next.filter(id => !args.prev.includes(id)).map(args.emailOf).filter((e): e is string => !!e).map(low)
  const removed = new Set(args.prev.filter(id => !args.next.includes(id)).map(args.emailOf).filter((e): e is string => !!e).map(low))
  let to = args.to.trim()
  let cc = args.cc.filter(e => !removed.has(low(e)))
  if (removed.has(low(to))) to = ''
  for (const e of added) {
    if (!to) to = e
    else if (e !== low(to) && !cc.some(c => low(c) === e)) cc.push(e)
  }
  if (!to) {
    const next = args.next.map(args.emailOf).find((e): e is string => !!e)
    if (next) { to = low(next); cc = cc.filter(c => low(c) !== low(next)) }
  }
  return { to, cc }
}
