// Workspace invitation helpers shared by the /invite and /join pages and
// acceptInvitation. Server-only; plain module, not 'use server'.

import { clerkClient } from '@clerk/nextjs/server'

/**
 * The signed-in person's verified email addresses, lowercased. An invitation
 * can only be accepted by someone holding the address it was sent to —
 * otherwise anyone with the link could join with the invited role.
 */
export async function verifiedEmailsFor(clerkUserId: string): Promise<string[]> {
  const clerk = await clerkClient()
  const user  = await clerk.users.getUser(clerkUserId)
  return user.emailAddresses
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase())
}
