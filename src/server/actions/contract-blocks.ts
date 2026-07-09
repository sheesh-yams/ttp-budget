'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getWorkspaceId, requireRole } from '@/lib/auth'
import type { ActionResult } from '@/types'
import type { ContractBlockCategory, TriggerKind } from '@prisma/client'

export type TriggerInput = {
  kind: TriggerKind
  matchValue: string
}

export type ContractBlockInput = {
  title:     string
  category:  ContractBlockCategory
  body:      string
  isDefault: boolean
  triggers:  TriggerInput[]
}

export type ContractBlockRow = {
  id:         string
  title:      string
  category:   ContractBlockCategory
  body:       string
  isDefault:  boolean
  isActive:   boolean
  orderIndex: number
  triggers: {
    id:         string
    kind:       TriggerKind
    matchValue: string
  }[]
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// List all blocks for the active workspace
// ---------------------------------------------------------------------------

export async function listContractBlocks(): Promise<ActionResult<ContractBlockRow[]>> {
  try {
    const sdb = await getScopedDb()
    const blocks = await sdb.contractBlock.findMany({
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: { triggers: { orderBy: { kind: 'asc' } } },
    })
    return { success: true, data: blocks as unknown as ContractBlockRow[] }
  } catch {
    return { success: false, error: 'Failed to load contract blocks.' }
  }
}

// ---------------------------------------------------------------------------
// Create a new block
// ---------------------------------------------------------------------------

export async function createContractBlock(
  input: ContractBlockInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const workspaceId = await getWorkspaceId()
    const sdb = await getScopedDb()

    const maxOrder = await sdb.contractBlock.aggregate({ _max: { orderIndex: true } })
    const nextOrder = (maxOrder._max.orderIndex ?? 0) + 10

    const block = await sdb.contractBlock.create({
      data: {
        title:      input.title.trim(),
        category:   input.category,
        body:       input.body,
        isDefault:  input.isDefault,
        isActive:   true,
        orderIndex: nextOrder,
        triggers: {
          create: input.triggers
            .filter(t => t.matchValue.trim())
            .map(t => ({
              workspaceId,
              kind:       t.kind,
              matchValue: t.matchValue.trim().toLowerCase(),
            })),
        },
      } as unknown as Parameters<typeof sdb.contractBlock.create>[0]['data'],
    })

    revalidatePath('/settings/contracts')
    return { success: true, data: { id: block.id } }
  } catch {
    return { success: false, error: 'Failed to create contract block.' }
  }
}

// ---------------------------------------------------------------------------
// Update an existing block (replaces triggers)
// ---------------------------------------------------------------------------

export async function updateContractBlock(
  id: string,
  input: ContractBlockInput
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const workspaceId = await getWorkspaceId()
    const sdb = await getScopedDb()

    await sdb.contractBlock.update({
      where: { id },
      data: {
        title:     input.title.trim(),
        category:  input.category,
        body:      input.body,
        isDefault: input.isDefault,
        triggers: {
          deleteMany: {},
          create: input.triggers
            .filter(t => t.matchValue.trim())
            .map(t => ({
              workspaceId,
              kind:       t.kind,
              matchValue: t.matchValue.trim().toLowerCase(),
            })),
        },
      },
    })

    revalidatePath('/settings/contracts')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update contract block.' }
  }
}

// ---------------------------------------------------------------------------
// Toggle active state
// ---------------------------------------------------------------------------

export async function toggleContractBlockActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await sdb.contractBlock.update({ where: { id }, data: { isActive } })
    revalidatePath('/settings/contracts')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update contract block.' }
  }
}

// ---------------------------------------------------------------------------
// Delete a block
// ---------------------------------------------------------------------------

export async function deleteContractBlock(id: string): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await sdb.contractBlock.delete({ where: { id } })
    revalidatePath('/settings/contracts')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete contract block.' }
  }
}

// ---------------------------------------------------------------------------
// Reorder blocks
// ---------------------------------------------------------------------------

export async function reorderContractBlocks(
  orderedIds: string[]
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await Promise.all(
      orderedIds.map((id, index) =>
        sdb.contractBlock.update({
          where: { id },
          data:  { orderIndex: (index + 1) * 10 },
        })
      )
    )
    revalidatePath('/settings/contracts')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reorder contract blocks.' }
  }
}
