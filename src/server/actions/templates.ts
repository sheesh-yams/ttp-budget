'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult, TemplateKind, TemplateStructure } from '@/types'
import type { ShootType } from '@prisma/client'

// ─── Validation ───────────────────────────────────────────────────────────────

const SHOOT_TYPES = [
  'MUSIC_VIDEO','BRAND_CAMPAIGN','PRODUCT_SHOOT','EVENT_RECAP',
  'SOCIAL_CONTENT','INFLUENCER','DOCUMENTARY','OTHER',
] as const

const templateMetaSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  kind:        z.enum(['FULL', 'PACKAGE']),
  shootType:   z.enum(SHOOT_TYPES),
  tags:        z.array(z.enum(SHOOT_TYPES)).default([]),
})

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createTemplate(
  input: z.infer<typeof templateMetaSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser()
    const data = templateMetaSchema.parse(input)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      workspaceId: user.workspaceId,
      name:        data.name,
      description: data.description ?? null,
      kind:        data.kind,
      shootType:   data.shootType,
      tags:        data.tags,
      structure:   { accounts: [] },
    }
    const tpl = await db.budgetTemplate.create({ data: createData })
    revalidatePath('/templates')
    return { success: true, data: { id: tpl.id } }
  } catch {
    return { success: false, error: 'Failed to create template' }
  }
}

// ─── Update metadata ──────────────────────────────────────────────────────────

export async function updateTemplateMeta(
  id: string,
  input: z.infer<typeof templateMetaSchema>
): Promise<ActionResult> {
  try {
    const data = templateMetaSchema.parse(input)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      name:        data.name,
      description: data.description ?? null,
      kind:        data.kind,
      shootType:   data.shootType,
      tags:        data.tags,
    }
    await db.budgetTemplate.update({ where: { id }, data: updateData })
    revalidatePath('/templates')
    revalidatePath(`/templates/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update template' }
  }
}

// ─── Save structure (line items) ──────────────────────────────────────────────

export async function saveTemplateStructure(
  id: string,
  structure: TemplateStructure
): Promise<ActionResult> {
  try {
    await db.budgetTemplate.update({
      where: { id },
      data:  { structure: structure as object },
    })
    revalidatePath(`/templates/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save template' }
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTemplate(id: string): Promise<ActionResult> {
  try {
    await db.budgetTemplate.delete({ where: { id } })
    revalidatePath('/templates')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete template' }
  }
}

// ─── List packages (for budget editor insertion) ──────────────────────────────

export async function listPackages(): Promise<ActionResult<Array<{
  id: string
  name: string
  description: string | null
  shootType: ShootType
  tags: ShootType[]
  structure: TemplateStructure
  itemCount: number
}>>> {
  try {
    const user = await getCurrentUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packages = await db.budgetTemplate.findMany({
      where:   { workspaceId: user.workspaceId, ...({ kind: 'PACKAGE' } as any) },
      orderBy: [{ shootType: 'asc' }, { name: 'asc' }],
    })
    return {
      success: true,
      data: packages.map(p => {
        const structure = p.structure as unknown as TemplateStructure
        const itemCount = (structure.accounts ?? []).reduce(
          (sum, a) => sum + (a.items?.length ?? 0), 0
        )
        return {
          id:          p.id,
          name:        p.name,
          description: p.description,
          shootType:   p.shootType,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tags:        ((p as any).tags as ShootType[]) ?? [],
          structure,
          itemCount,
        }
      }),
    }
  } catch {
    return { success: false, error: 'Failed to load packages' }
  }
}

// ─── Unused re-export kept for compatibility ──────────────────────────────────
export type { TemplateKind }
