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
