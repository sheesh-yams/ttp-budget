'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import type { ShootType } from '@prisma/client'

const templateSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  shootType:   z.enum([
    'MUSIC_VIDEO','BRAND_CAMPAIGN','PRODUCT_SHOOT','EVENT_RECAP',
    'SOCIAL_CONTENT','INFLUENCER','DOCUMENTARY','OTHER',
  ]),
})

export async function createTemplate(
  input: z.infer<typeof templateSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser()
    const data = templateSchema.parse(input)
    const tpl = await db.budgetTemplate.create({
      data: {
        workspaceId: user.workspaceId,
        name:        data.name,
        description: data.description ?? null,
        shootType:   data.shootType as ShootType,
        structure:   { accounts: [] },
      },
    })
    revalidatePath('/templates')
    return { success: true, data: { id: tpl.id } }
  } catch {
    return { success: false, error: 'Failed to create template' }
  }
}

export async function updateTemplate(
  id: string,
  input: z.infer<typeof templateSchema>
): Promise<ActionResult> {
  try {
    const data = templateSchema.parse(input)
    await db.budgetTemplate.update({
      where: { id },
      data: {
        name:        data.name,
        description: data.description ?? null,
        shootType:   data.shootType as ShootType,
      },
    })
    revalidatePath('/templates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update template' }
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  try {
    await db.budgetTemplate.delete({ where: { id } })
    revalidatePath('/templates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete template' }
  }
}
