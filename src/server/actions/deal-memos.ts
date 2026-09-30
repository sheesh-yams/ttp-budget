'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId, requireRole } from '@/lib/auth'
import type { ActionResult } from '@/types'
import {
  dealMemoDefaultsSchema,
  resolveDealMemoDefaults,
  type DealMemoDefaults,
} from '@/lib/deal-memo-defaults'

// ─── Workspace defaults (Settings → Contracts → Crew & Vendor) ───────────────

export async function getDealMemoDefaults(): Promise<ActionResult<DealMemoDefaults>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error
    const workspaceId = await getWorkspaceId()
    const ws = await db.workspace.findUnique({
      where:  { id: workspaceId },
      select: { dealMemoDefaults: true },
    })
    return { success: true, data: resolveDealMemoDefaults(ws?.dealMemoDefaults) }
  } catch {
    return { success: false, error: 'Failed to load deal memo defaults.' }
  }
}

export async function updateDealMemoDefaults(input: DealMemoDefaults): Promise<ActionResult<DealMemoDefaults>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error
    const parsed = dealMemoDefaultsSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Some defaults are invalid — check the highlighted fields.' }

    // Workspace is the tenant row itself (not a SCOPED_MODEL); the id comes
    // from the session, never from input.
    const workspaceId = await getWorkspaceId()
    await db.workspace.update({
      where: { id: workspaceId },
      data:  { dealMemoDefaults: parsed.data },
    })
    revalidatePath('/settings/contracts')
    return { success: true, data: parsed.data }
  } catch {
    return { success: false, error: 'Failed to save deal memo defaults.' }
  }
}
