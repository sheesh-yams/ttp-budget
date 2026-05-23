'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'

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
    const user = await getCurrentUser()
    const data = rateCardSchema.parse(input)
    const searchTokens = `${data.role} ${data.category} ${data.notes ?? ''}`.toLowerCase()
    const payload = { ...data, searchTokens }
    const card = id
      ? await db.rateCard.update({ where: { id }, data: payload })
      : await db.rateCard.create({ data: { ...payload, workspaceId: user.workspaceId } })
    revalidatePath('/rates')
    return { success: true, data: { id: card.id } }
  } catch {
    return { success: false, error: 'Failed to save rate card' }
  }
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<ActionResult> {
  try {
    await db.rateCard.update({ where: { id }, data: { isFavorite } })
    revalidatePath('/rates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update favorite' }
  }
}

export async function archiveRateCard(id: string): Promise<ActionResult> {
  try {
    await db.rateCard.update({ where: { id }, data: { archivedAt: new Date() } })
    revalidatePath('/rates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to archive rate card' }
  }
}
