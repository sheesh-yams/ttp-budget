// Who a client's invoices and proposals go to by default, and when invoices
// fall due. Plain module (no email client import) — jest-tested, safe in the
// browser. Defaults only pre-fill the send/create windows; nothing stored on
// an existing proposal or invoice is rewritten.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Same cap as proposal/invoice CC lists (MAX_RECIPIENTS in email.ts). */
export const MAX_DEFAULT_CC = 10

/** Trim, lowercase, keep well-formed addresses, dedupe, cap. Same rules as normalizeRecipientEmails. */
export function normalizeEmails(emails: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    if (typeof raw !== 'string') continue
    const e = raw.trim().toLowerCase()
    if (!EMAIL_RE.test(e) || seen.has(e)) continue
    seen.add(e)
    out.push(e)
    if (out.length >= MAX_DEFAULT_CC) break
  }
  return out
}

/** A comma/space/newline-separated list typed by a person: the valid addresses and anything that isn't one. */
export function parseEmailList(text: string): { emails: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
  return { emails: normalizeEmails(parts), invalid: parts.filter(p => !EMAIL_RE.test(p.toLowerCase())) }
}

export interface RecipientClient {
  contactEmail:     string | null
  invoiceCcEmails?: string[] | null
  proposalCcEmails?: string[] | null
  paymentTermsDays?: number | null
}

export interface RecipientContact { email: string | null; isBilling: boolean }

/**
 * Invoice To/CC for a never-sent invoice. With a billing contact that has an
 * email: To the billing contact, the main contact CC'd. Otherwise To the main
 * contact. The client's standard invoice CC is added either way, never
 * repeating the To address.
 */
export function invoiceRecipientDefaults(client: RecipientClient, contacts: RecipientContact[]): { to: string; cc: string[] } {
  const billing = contacts.find(c => c.isBilling && c.email && EMAIL_RE.test(c.email.trim().toLowerCase()))
  const main = (client.contactEmail ?? '').trim().toLowerCase()
  const to = billing ? billing.email!.trim().toLowerCase() : main
  const cc = normalizeEmails([...(billing ? [main] : []), ...(client.invoiceCcEmails ?? [])]).filter(e => e !== to)
  return { to, cc }
}

/**
 * What the invoice send window pre-fills. The To isn't stored on an invoice,
 * so it always follows the client: the billing contact, else the main contact.
 * CC: the client defaults until the invoice has been sent or has its own list;
 * after that the saved list (a resend keeps what it was sent with), plus the
 * main contact whenever the To is someone else — so an invoice sent before a
 * billing contact existed still copies the main contact.
 * `withDefaults: false` (no permission to send): the main contact and the
 * saved list only, as before client contacts existed.
 */
export function invoiceSendRecipients(args: {
  client:       RecipientClient
  contacts:     RecipientContact[]
  sentAt:       Date | string | null
  savedCc:      string[]
  withDefaults: boolean
}): { to: string; cc: string[] } {
  const main = (args.client.contactEmail ?? '').trim().toLowerCase()
  if (!args.withDefaults) return { to: args.client.contactEmail ?? '', cc: args.savedCc }
  const d = invoiceRecipientDefaults(args.client, args.contacts)
  if (!args.sentAt && args.savedCc.length === 0) return d
  const cc = normalizeEmails([...args.savedCc, ...(main && d.to !== main ? [main] : [])]).filter(e => e !== d.to)
  return { to: d.to, cc }
}

/** The client's standard proposal CC (the To stays the main contact). */
export function proposalCcDefaults(client: RecipientClient): string[] {
  const main = (client.contactEmail ?? '').trim().toLowerCase()
  return normalizeEmails(client.proposalCcEmails ?? []).filter(e => e !== main)
}

/** Days from the invoice date to its due date: the client's terms, else the workspace's. */
export function invoiceDueDays(client: Pick<RecipientClient, 'paymentTermsDays'> | null | undefined, workspaceDays: number): number {
  const d = client?.paymentTermsDays
  return typeof d === 'number' && d >= 0 ? d : workspaceDays
}

/** Add / edit a client contact (client page → People). */
export interface ClientContactInput {
  name:       string
  title?:     string
  email?:     string
  phone?:     string
  isBilling?: boolean
}
