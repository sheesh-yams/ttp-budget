// Keeping SlateSuite's copy of a person's email (User.email) in step with
// their Clerk primary email — after they change it in Clerk's account window.
// User.email is used for the copy-to-sender on proposals/invoices, the team
// pages and invitations. Server-only use (raw db, keyed by clerkId).

import { db } from '@/lib/db'

type ClerkEmail = { id: string; email_address?: string; emailAddress?: string }

/** The primary address from a Clerk user (webhook payload or API object); else the first. */
export function primaryEmailOf(u: {
  primary_email_address_id?: string | null
  primaryEmailAddressId?: string | null
  email_addresses?: ClerkEmail[]
  emailAddresses?: ClerkEmail[]
}): string | null {
  const list = u.email_addresses ?? u.emailAddresses ?? []
  const primaryId = u.primary_email_address_id ?? u.primaryEmailAddressId ?? null
  const pick = list.find(e => e.id === primaryId) ?? list[0]
  const email = (pick?.email_address ?? pick?.emailAddress ?? '').trim().toLowerCase()
  return email || null
}

export type EmailSyncResult = 'updated' | 'unchanged' | 'conflict' | 'no-user' | 'no-email'

/**
 * Point User.email at the Clerk primary email. Refuses (and logs) when another
 * SlateSuite account already uses that address — User.email is unique.
 */
export async function syncUserEmail(clerkId: string, email: string | null): Promise<EmailSyncResult> {
  const next = email?.trim().toLowerCase()
  if (!next) return 'no-email'
  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true, email: true } })
  if (!user) return 'no-user'
  if (user.email.toLowerCase() === next) return 'unchanged'
  const taken = await db.user.findFirst({ where: { email: { equals: next, mode: 'insensitive' }, id: { not: user.id } }, select: { id: true } })
  if (taken) {
    console.error('[account-email] primary email already used by another account — not synced', { userId: user.id, email: next })
    return 'conflict'
  }
  try {
    await db.user.update({ where: { id: user.id }, data: { email: next } })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return 'conflict'
    throw err
  }
  return 'updated'
}
