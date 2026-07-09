'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'

const rateCardSchema = z.object({
  role: z.string().min(1).max(200),
  category: z.enum(['CREW','EQUIPMENT','POST','LOCATION','TALENT','TRAVEL','CATERING','INSURANCE','PRODUCTION_FEE','MISC']),
  defaultUnit: z.enum(['HOUR','HALF_DAY','DAY','WEEK','FLAT','EACH','MILE']),
  defaultRateCents: z.number().int().nonnegative(),
  notes: z.string().optional().nullable(),
  isFavorite: z.boolean().optional(),
})

export async function upsertRateCard(
  id: string | null,
  input: z.infer<typeof rateCardSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const data = rateCardSchema.parse(input)
    const searchTokens = `${data.role} ${data.category} ${data.notes ?? ''}`.toLowerCase()
    const payload = { ...data, searchTokens }
    const card = id
      ? await db.rateCard.update({ where: { id }, data: payload })
      : await db.rateCard.create({ data: payload } as unknown as { data: Prisma.RateCardUncheckedCreateInput })
    revalidatePath('/rates')
    return { success: true, data: { id: card.id } }
  } catch {
    return { success: false, error: 'Failed to save rate card' }
  }
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    await db.rateCard.update({ where: { id }, data: { isFavorite } })
    revalidatePath('/rates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update favorite' }
  }
}

export async function archiveRateCard(id: string): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    await db.rateCard.update({ where: { id }, data: { archivedAt: new Date() } })
    revalidatePath('/rates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to archive rate card' }
  }
}
