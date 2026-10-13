'use server'

// Public (no session) actions for a call sheet's crew page, /cs/[token]?r=…
// Keyed off the sheet's public token AND the person's own recipient token —
// never a workspace id from the caller.

import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { trustedClientIp } from '@/lib/client-ip'
import type { ActionResult } from '@/types'

/** "Confirm I'll be there" from the crew member's own link. */
export async function confirmCallSheetAttendance(sheetToken: string, recipientToken: string): Promise<ActionResult<{ confirmedAt: string }>> {
  if (typeof sheetToken !== 'string' || typeof recipientToken !== 'string' || !sheetToken || !recipientToken
    || sheetToken.length > 100 || recipientToken.length > 100) {
    return { success: false, error: 'This link isn’t valid.' }
  }
  const h = await headers()
  const ip = trustedClientIp(name => h.get(name))
  const { success } = await checkRateLimit('confirm', ip)
  if (!success) return { success: false, error: 'Too many tries — wait a minute and try again.' }

  const cs = await db.callSheet.findUnique({
    where: { publicToken: sheetToken },
    select: { id: true, status: true, publicTokenExpiresAt: true },
  })
  if (!cs || cs.status === 'DRAFT') return { success: false, error: 'This call sheet isn’t available.' }
  if (cs.publicTokenExpiresAt && cs.publicTokenExpiresAt < new Date()) return { success: false, error: 'This link has expired.' }

  const r = await db.callSheetRecipient.findFirst({
    where: { token: recipientToken, callSheetId: cs.id },
    select: { id: true, confirmedAt: true, lastSentAt: true },
  })
  if (!r || !r.lastSentAt) return { success: false, error: 'This link isn’t valid.' }
  if (r.confirmedAt) return { success: true, data: { confirmedAt: r.confirmedAt.toISOString() } }

  const now = new Date()
  // Guarded: only sets it if still unconfirmed.
  await db.callSheetRecipient.updateMany({ where: { id: r.id, confirmedAt: null }, data: { confirmedAt: now } })
  return { success: true, data: { confirmedAt: now.toISOString() } }
}
