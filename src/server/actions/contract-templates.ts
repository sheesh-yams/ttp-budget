'use server'

// Contract Builder (Settings → Contracts): templates = named, ordered groups of
// contract blocks. Managing them is Settings, like the block library.
// Applying a template lives with its target: applyContractTemplateToDealMemo
// (deal-memos.ts) and applyContractTemplateToProposal (proposal-contracts.ts).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ContractAudience, ContractBlockCategory } from '@prisma/client'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getAccess, requirePermission } from '@/lib/access'
import { logAuditEvent } from '@/lib/audit'
import type { ActionResult } from '@/types'

export interface ContractTemplateRow {
  id:          string
  audience:    ContractAudience
  name:        string
  description: string | null
  isDefault:   boolean
  blocks:      { id: string; title: string; internalName: string | null; category: ContractBlockCategory; isActive: boolean }[]
}

/** Names only — what the "Use template" / Add bid pickers need. */
export interface ContractTemplateOption { id: string; name: string; isDefault: boolean; blockCount: number }

const audienceSchema = z.enum(['CLIENT', 'VENDOR'])
const templateSchema = z.object({
  name:        z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault:   z.boolean(),
  blockIds:    z.array(z.string().min(1)).max(100),
})

export async function listContractTemplates(audience: ContractAudience): Promise<ActionResult<ContractTemplateRow[]>> {
  try {
    const gate = await requirePermission('settings', 'VIEW')
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const rows = await sdb.contractTemplate.findMany({
      where:   { audience: audienceSchema.parse(audience) },
      orderBy: [{ isDefault: 'desc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
      select:  {
        id: true, audience: true, name: true, description: true, isDefault: true,
        blocks: { orderBy: { orderIndex: 'asc' }, select: { block: { select: { id: true, title: true, internalName: true, category: true, isActive: true } } } },
      },
    })
    return { success: true, data: rows.map(r => ({ ...r, blocks: r.blocks.map(b => b.block) })) }
  } catch {
    return { success: false, error: 'Failed to load contract templates.' }
  }
}

/**
 * Template names for the pickers on a memo / proposal. Any workspace member
 * may see names (no block text); applying is gated by the target's permission.
 */
export async function listContractTemplateOptions(audience: ContractAudience): Promise<ActionResult<ContractTemplateOption[]>> {
  try {
    await getAccess()
    const sdb = await getScopedDb()
    const rows = await sdb.contractTemplate.findMany({
      where:   { audience: audienceSchema.parse(audience) },
      orderBy: [{ isDefault: 'desc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
      // Count only the blocks a template will actually add (active ones).
      select:  { id: true, name: true, isDefault: true, _count: { select: { blocks: { where: { block: { isActive: true } } } } } },
    })
    return { success: true, data: rows.map(r => ({ id: r.id, name: r.name, isDefault: r.isDefault, blockCount: r._count.blocks })) }
  } catch {
    return { success: false, error: 'Failed to load contract templates.' }
  }
}

/** The blocks exist in this workspace and are all for this audience. */
async function validBlockIds(audience: ContractAudience, blockIds: string[]): Promise<string[] | null> {
  const unique = [...new Set(blockIds)]
  if (unique.length === 0) return []
  const sdb = await getScopedDb()
  const found = await sdb.contractBlock.count({ where: { id: { in: unique }, audience } })
  return found === unique.length ? unique : null
}

export async function createContractTemplate(
  audience: ContractAudience, input: z.infer<typeof templateSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requirePermission('settings', 'EDIT')
    if (!gate.ok) return gate.error
    const aud = audienceSchema.parse(audience)
    const parsed = templateSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Give the template a name.' }
    const data = parsed.data
    const blockIds = await validBlockIds(aud, data.blockIds)
    if (!blockIds) return { success: false, error: 'Some blocks aren’t in this library.' }

    const { workspaceId } = gate
    // Raw db in a transaction — every row carries the session's workspaceId,
    // and the default flag moves atomically (one default per audience).
    const created = await db.$transaction(async tx => {
      const max = await tx.contractTemplate.aggregate({ where: { workspaceId, audience: aud }, _max: { orderIndex: true } })
      if (data.isDefault) await tx.contractTemplate.updateMany({ where: { workspaceId, audience: aud, isDefault: true }, data: { isDefault: false } })
      const t = await tx.contractTemplate.create({
        data: {
          workspaceId, audience: aud, name: data.name, description: data.description || null,
          isDefault: data.isDefault, orderIndex: (max._max.orderIndex ?? 0) + 10,
        },
        select: { id: true },
      })
      await tx.contractTemplateBlock.createMany({
        data: blockIds.map((blockId, i) => ({ workspaceId, templateId: t.id, blockId, orderIndex: i })),
      })
      return t
    })

    await logAuditEvent({ workspaceId, actorId: gate.userId, action: 'contractTemplate.created', entityType: 'ContractTemplate', entityId: created.id, metadata: { audience: aud, name: data.name, blocks: blockIds.length, isDefault: data.isDefault } })
    revalidatePath('/settings/contracts')
    return { success: true, data: { id: created.id } }
  } catch {
    return { success: false, error: 'Failed to create the template.' }
  }
}

export async function updateContractTemplate(
  id: string, input: z.infer<typeof templateSchema>,
): Promise<ActionResult> {
  try {
    const gate = await requirePermission('settings', 'EDIT')
    if (!gate.ok) return gate.error
    const parsed = templateSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Give the template a name.' }
    const data = parsed.data
    const { workspaceId } = gate

    const existing = await db.contractTemplate.findFirst({ where: { id, workspaceId }, select: { id: true, audience: true } })
    if (!existing) return { success: false, error: 'Template not found.' }
    const blockIds = await validBlockIds(existing.audience, data.blockIds)
    if (!blockIds) return { success: false, error: 'Some blocks aren’t in this library.' }

    await db.$transaction(async tx => {
      if (data.isDefault) {
        await tx.contractTemplate.updateMany({ where: { workspaceId, audience: existing.audience, isDefault: true, id: { not: id } }, data: { isDefault: false } })
      }
      await tx.contractTemplate.updateMany({
        where: { id, workspaceId },
        data:  { name: data.name, description: data.description || null, isDefault: data.isDefault },
      })
      // The block list is replaced in full, in the order given.
      await tx.contractTemplateBlock.deleteMany({ where: { templateId: id, workspaceId } })
      await tx.contractTemplateBlock.createMany({
        data: blockIds.map((blockId, i) => ({ workspaceId, templateId: id, blockId, orderIndex: i })),
      })
    })

    await logAuditEvent({ workspaceId, actorId: gate.userId, action: 'contractTemplate.updated', entityType: 'ContractTemplate', entityId: id, metadata: { name: data.name, blocks: blockIds.length, isDefault: data.isDefault } })
    revalidatePath('/settings/contracts')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save the template.' }
  }
}

export async function deleteContractTemplate(id: string): Promise<ActionResult> {
  try {
    const gate = await requirePermission('settings', 'EDIT')
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const existing = await sdb.contractTemplate.findFirst({ where: { id }, select: { name: true, isDefault: true, audience: true } })
    if (!existing) return { success: false, error: 'Template not found.' }
    // Sections already added to memos/proposals are copies — unaffected.
    await sdb.contractTemplate.deleteMany({ where: { id } })
    await logAuditEvent({ workspaceId: gate.workspaceId, actorId: gate.userId, action: 'contractTemplate.deleted', entityType: 'ContractTemplate', entityId: id, metadata: existing })
    revalidatePath('/settings/contracts')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete the template.' }
  }
}
