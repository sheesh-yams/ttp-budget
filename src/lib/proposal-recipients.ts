// Who a proposal goes to. `Proposal.toEmail` is the main recipient ("To");
// null means the client's contact email, so a proposal keeps following the
// client profile unless someone typed a different address. The CC list is
// `recipientEmails`. Plain module (no email client import) — jest-tested.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What to store for a To address typed in the send window:
 * null when blank or the same as the client's contact email, the normalised
 * address otherwise, or an error for something that isn't an email.
 */
export function storedToEmail(
  input: string | null | undefined,
  clientEmail: string | null | undefined,
): { value: string | null; error: string | null } {
  // Flat shape (not a union): this repo runs strict: false, which doesn't narrow.
  const to = (input ?? '').trim().toLowerCase()
  if (!to) return { value: null, error: null }
  if (!EMAIL_RE.test(to)) return { value: null, error: `"${input!.trim()}" isn’t a valid To address.` }
  if (to === (clientEmail ?? '').trim().toLowerCase()) return { value: null, error: null }
  return { value: to, error: null }
}

/** The address a proposal is actually emailed to. */
export function proposalTo(toEmail: string | null | undefined, clientEmail: string | null | undefined): string | null {
  return toEmail?.trim() || clientEmail?.trim() || null
}

export const NO_TO_ERROR = 'Add a To address (or a contact email on the client), or use "Mark as Sent" instead.'
