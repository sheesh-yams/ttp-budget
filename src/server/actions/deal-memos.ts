'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { DealMemoStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { getScopedDb, type ScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId, requireRole } from '@/lib/auth'
import { getAccess, getProjectAccess, requireProjectPermission } from '@/lib/access'
import { logAuditEvent } from '@/lib/audit'
import type { ActionResult } from '@/types'
import {
  FEE_KINDS,
  FEE_UNITS,
  dealMemoDefaultsSchema,
  resolveDealMemoDefaults,
  type DealMemoDefaults,
} from '@/lib/deal-memo-defaults'
import {
  DELETABLE_STATUSES,
  allowedFromStatuses,
  applyAutoOvertime,
  buildDealMemoPrefill,
  dayRateForOvertime,
  lineHeadcountAndDays,
} from '@/lib/deal-memo-core'
import { applyDealMemoAwardEffects } from '@/lib/deal-memo-effects'
import { Prisma } from '@prisma/client'
import { generatePublicToken } from '@/lib/secure-token'
import { toJsonSafe } from '@/lib/json-safe'
import { sendDealMemoEmail, sendDealMemoCancelledEmail } from '@/lib/email'
import {
  CANCEL_WORD, DEAL_MEMO_LINK_DAYS, buildVendorView, isCancelConfirmation, normEmail,
} from '@/lib/deal-memo-signing'

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://budget.thethirdplace.co').replace(/\/$/, '')
}

// ─── Shared guards (not exported — 'use server' exports are public RPC) ──────

function revalidateMemo(projectId: string, memoId?: string) {
  revalidatePath(`/projects/${projectId}/deal-memos`)
  if (memoId) revalidatePath(`/projects/${projectId}/deal-memos/${memoId}`)
  revalidatePath(`/projects/${projectId}/crew`)
}

/** A budget line may only be referenced if it belongs to this project. */
async function lineBelongsToProject(sdb: ScopedDb, lineItemId: string, projectId: string) {
  const line = await sdb.lineItem.findFirst({
    where:  { id: lineItemId, account: { phase: { budget: { projectId } } } },
    select: { id: true, description: true, quantity: true, quantityFormula: true, rateCents: true, unit: true },
  })
  return line
}

/**
 * Gate for actions on an existing memo: resolve it to its project in the
 * active workspace, then require dealMemos EDIT there. Not exported — every
 * export of a 'use server' file is an endpoint.
 */
async function requireMemoPermission(memoId: string) {
  const access = await getAccess()
  const memo = typeof memoId === 'string' && memoId
    ? await db.dealMemo.findFirst({ where: { id: memoId, workspaceId: access.workspaceId }, select: { projectId: true } })
    : null
  if (!memo) {
    return { ok: false, error: { success: false as const, error: 'Deal memo not found.' }, userId: access.userId, workspaceId: access.workspaceId }
  }
  return requireProjectPermission(memo.projectId, 'dealMemos', 'EDIT')
}

/**
 * Write-time guard for child rows: the vendor may sign between
 * loadEditableMemo's read and the write.
 */
const UNSIGNED = { signedAt: null } as const

/** Loads a memo that may still be edited (not CANCELLED, not signed). */
async function loadEditableMemo(sdb: ScopedDb, memoId: string) {
  const memo = await sdb.dealMemo.findFirst({
    where:  { id: memoId },
    select: { id: true, projectId: true, status: true, workDayHours: true, otMultiplier: true, signedAt: true },
  })
  if (!memo) return { error: 'Deal memo not found.' as const }
  if (memo.status === 'CANCELLED') return { error: 'This deal memo is cancelled. Reopen it as a bid to edit.' as const }
  // The vendor signed these exact terms — they can't change underneath them.
  if (memo.signedAt) return { error: 'Signed — the vendor agreed to these terms. Cancel the deal memo to change them.' as const }
  return { memo }
}

/** Keeps every auto-rate overtime fee in step with the memo's day rate. */
async function syncAutoOvertime(sdb: ScopedDb, memoId: string) {
  const memo = await sdb.dealMemo.findFirst({
    where:  { id: memoId },
    select: {
      workDayHours: true, otMultiplier: true,
      fees: { select: { id: true, kind: true, unit: true, rateCents: true, isAutoRate: true } },
    },
  })
  if (!memo) return
  const dayRate = dayRateForOvertime(memo.fees)
  const next = applyAutoOvertime(memo.fees, dayRate, memo.workDayHours, Number(memo.otMultiplier))
  await Promise.all(next
    .filter((f, i) => f.rateCents !== memo.fees[i].rateCents)
    .map(f => sdb.dealMemoFee.updateMany({ where: { id: f.id, dealMemo: UNSIGNED }, data: { rateCents: f.rateCents } })))
}

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

// ─── Create a bid ─────────────────────────────────────────────────────────────

const createSchema = z.object({
  projectId:  z.string().min(1),
  lineItemId: z.string().min(1).nullable().optional(),
  contactId:  z.string().min(1),
  roleLabel:  z.string().trim().max(200).optional(),
})

export async function createDealMemo(input: z.infer<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Missing project or person.' }
    const { projectId, lineItemId, contactId, roleLabel } = parsed.data
    const gate = await requireProjectPermission(projectId, 'dealMemos', 'EDIT')
    if (!gate.ok) return gate.error
    // The day rate prefills from the budget line rate — that's a budget cost,
    // so without budget.costs it falls back to the person's own rate.
    const canSeeCosts = !!(await getProjectAccess(projectId))?.can('budget.costs')

    const [sdb, user, workspaceId] = await Promise.all([getScopedDb(), getCurrentUser(), getWorkspaceId()])
    const [project, contact, workspace] = await Promise.all([
      sdb.project.findFirst({ where: { id: projectId }, select: { id: true, shootStartDate: true, shootEndDate: true } }),
      sdb.contact.findFirst({
        where:  { id: contactId, archivedAt: null },
        select: { id: true, primaryRole: true, defaultRateCents: true, defaultRateUnit: true, hasKit: true, kitRateCents: true },
      }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { dealMemoDefaults: true } }),
    ])
    if (!project) return { success: false, error: 'Project not found.' }
    if (!contact) return { success: false, error: 'That person isn’t in your rolodex.' }

    const line = lineItemId ? await lineBelongsToProject(sdb, lineItemId, projectId) : null
    if (lineItemId && !line) return { success: false, error: 'That budget line isn’t on this project.' }
    if (!line && !roleLabel?.trim()) return { success: false, error: 'Give the role a name.' }

    const prefill = buildDealMemoPrefill({
      defaults: resolveDealMemoDefaults(workspace?.dealMemoDefaults),
      line: line && !canSeeCosts ? { ...line, rateCents: 0 } : line,
      contact, roleLabel, project,
    })
    const defaultBlocks = await sdb.contractBlock.findMany({
      where:   { audience: 'VENDOR', isActive: true, isDefault: true },
      orderBy: { orderIndex: 'asc' },
      select:  { id: true, title: true, body: true },
    })

    const { fees, ...memoFields } = prefill
    const memo = await sdb.$transaction(async tx => {
      const created = await tx.dealMemo.create({
        data: {
          ...memoFields, workspaceId, projectId,
          lineItemId: line?.id ?? null, contactId: contact.id, createdById: user.id,
        },
        select: { id: true },
      })
      await tx.dealMemoFee.createMany({ data: fees.map(f => ({ ...f, workspaceId, dealMemoId: created.id })) })
      if (defaultBlocks.length) {
        await tx.dealMemoSection.createMany({
          data: defaultBlocks.map((b, i) => ({
            workspaceId, dealMemoId: created.id, sourceBlockId: b.id,
            title: b.title, body: b.body, orderIndex: i,
          })),
        })
      }
      return created
    })

    revalidateMemo(projectId)
    return { success: true, data: { id: memo.id } }
  } catch (err) {
    console.error('[createDealMemo]', err)
    return { success: false, error: 'Failed to create the bid.' }
  }
}

// ─── Update memo fields ───────────────────────────────────────────────────────

const updateSchema = z.object({
  position:             z.string().trim().min(1).max(200).optional(),
  startDate:            z.string().nullable().optional(),
  endDate:              z.string().nullable().optional(),
  days:                 z.number().min(0).max(1000).optional(),
  workDayHours:         z.union([z.literal(10), z.literal(12)]).optional(),
  otMultiplier:         z.number().min(1).max(5).optional(),
  doubleTimeAfterHours: z.number().int().min(1).max(24).optional(),
  doubleTimeMultiplier: z.number().min(1).max(5).optional(),
  productionZoneMiles:  z.number().int().min(0).max(1000).optional(),
  internalNotes:        z.string().max(10000).nullable().optional(),
})

export async function updateDealMemo(memoId: string, patch: z.infer<typeof updateSchema>): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const parsed = updateSchema.safeParse(patch)
    if (!parsed.success) return { success: false, error: 'Some fields are invalid.' }

    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }

    const { startDate, endDate, ...rest } = parsed.data
    const res = await sdb.dealMemo.updateMany({
      where: { id: memoId, signedAt: null },
      data:  {
        ...rest,
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate   !== undefined ? { endDate:   endDate   ? new Date(endDate)   : null } : {}),
      },
    })
    if (res.count === 0) return { success: false, error: 'Signed — the vendor agreed to these terms. Cancel the deal memo to change them.' }
    if (rest.workDayHours !== undefined || rest.otMultiplier !== undefined) await syncAutoOvertime(sdb, memoId)

    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[updateDealMemo]', err)
    return { success: false, error: 'Failed to save.' }
  }
}

// ─── Fees ─────────────────────────────────────────────────────────────────────

const feeSchema = z.object({
  id:               z.string().optional(),
  kind:             z.enum(FEE_KINDS),
  label:            z.string().trim().min(1).max(120),
  rateCents:        z.number().int().min(0),
  unit:             z.enum(FEE_UNITS),
  quantity:         z.number().min(0).max(100000),
  termsText:        z.string().max(2000).nullable().optional(),
  budgetLineItemId: z.string().min(1).nullable().optional(),
  isAutoRate:       z.boolean().optional(),
})

export async function upsertDealMemoFee(memoId: string, input: z.infer<typeof feeSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const parsed = feeSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Check the fee’s name, rate and quantity.' }

    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }

    const { id, budgetLineItemId, ...fee } = parsed.data
    if (budgetLineItemId && !(await lineBelongsToProject(sdb, budgetLineItemId, loaded.memo.projectId))) {
      return { success: false, error: 'That budget line isn’t on this project.' }
    }
    const data = {
      kind:             fee.kind,
      label:            fee.label,
      rateCents:        fee.rateCents,
      unit:             fee.unit,
      // A "total" fee is one amount — a leftover per-day quantity would
      // multiply it (e.g. $4,000 total × 5 = $20,000).
      quantity:         fee.unit === 'FLAT' ? 1 : fee.quantity,
      termsText:        fee.termsText ?? null,
      budgetLineItemId: budgetLineItemId ?? null,
      isAutoRate:       fee.kind === 'OVERTIME' && !!fee.isAutoRate,
    }

    let feeId: string
    if (id) {
      const res = await sdb.dealMemoFee.updateMany({ where: { id, dealMemoId: memoId, dealMemo: UNSIGNED }, data })
      if (res.count === 0) return { success: false, error: 'Fee not found.' }
      feeId = id
    } else {
      const max = await sdb.dealMemoFee.aggregate({ where: { dealMemoId: memoId }, _max: { order: true } })
      const workspaceId = await getWorkspaceId()
      const created = await sdb.dealMemoFee.create({
        data:   { ...data, workspaceId, dealMemoId: memoId, order: (max._max.order ?? -1) + 1 },
        select: { id: true },
      })
      feeId = created.id
    }
    await syncAutoOvertime(sdb, memoId)

    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: { id: feeId } }
  } catch (err) {
    console.error('[upsertDealMemoFee]', err)
    return { success: false, error: 'Failed to save the fee.' }
  }
}

export async function deleteDealMemoFee(memoId: string, feeId: string): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }
    await sdb.dealMemoFee.deleteMany({ where: { id: feeId, dealMemoId: memoId, dealMemo: UNSIGNED } })
    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to remove the fee.' }
  }
}

// ─── Terms sections ───────────────────────────────────────────────────────────

async function nextSectionIndex(sdb: ScopedDb, memoId: string) {
  const max = await sdb.dealMemoSection.aggregate({ where: { dealMemoId: memoId }, _max: { orderIndex: true } })
  return (max._max.orderIndex ?? -1) + 1
}

export async function addDealMemoSection(
  memoId: string,
  from: { blockId: string } | { adHoc: true },
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }

    let title = 'New section'
    let body = ''
    let sourceBlockId: string | null = null
    if ('blockId' in from) {
      // Vendor terms only — a client proposal block never lands on a deal memo.
      const block = await sdb.contractBlock.findFirst({
        where:  { id: from.blockId, audience: 'VENDOR' },
        select: { id: true, title: true, body: true },
      })
      if (!block) return { success: false, error: 'That terms block isn’t in your crew & vendor library.' }
      ;({ title, body } = block)
      sourceBlockId = block.id
    }
    const workspaceId = await getWorkspaceId()
    const created = await sdb.dealMemoSection.create({
      data:   { workspaceId, dealMemoId: memoId, sourceBlockId, title, body, orderIndex: await nextSectionIndex(sdb, memoId) },
      select: { id: true },
    })
    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: { id: created.id } }
  } catch {
    return { success: false, error: 'Failed to add the section.' }
  }
}

export async function updateDealMemoSection(
  memoId: string, sectionId: string, input: { title: string; body: string },
): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const title = input.title.trim()
    if (!title) return { success: false, error: 'Sections need a title.' }
    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }
    const existing = await sdb.dealMemoSection.findFirst({ where: { id: sectionId, dealMemoId: memoId }, select: { sourceBlockId: true } })
    if (!existing) return { success: false, error: 'Section not found.' }
    await sdb.dealMemoSection.updateMany({
      where: { id: sectionId, dealMemoId: memoId, dealMemo: UNSIGNED },
      data:  { title, body: input.body, editedFromSource: !!existing.sourceBlockId },
    })
    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save the section.' }
  }
}

export async function resetDealMemoSection(memoId: string, sectionId: string): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }
    const existing = await sdb.dealMemoSection.findFirst({ where: { id: sectionId, dealMemoId: memoId }, select: { sourceBlockId: true } })
    if (!existing?.sourceBlockId) return { success: false, error: 'No library version to reset to.' }
    const block = await sdb.contractBlock.findFirst({
      where:  { id: existing.sourceBlockId, audience: 'VENDOR' },
      select: { title: true, body: true },
    })
    if (!block) return { success: false, error: 'The library version no longer exists.' }
    await sdb.dealMemoSection.updateMany({ where: { id: sectionId, dealMemoId: memoId, dealMemo: UNSIGNED }, data: { title: block.title, body: block.body, editedFromSource: false } })
    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reset the section.' }
  }
}

export async function removeDealMemoSection(memoId: string, sectionId: string): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const loaded = await loadEditableMemo(sdb, memoId)
    if ('error' in loaded) return { success: false, error: loaded.error as string }
    await sdb.dealMemoSection.deleteMany({ where: { id: sectionId, dealMemoId: memoId, dealMemo: UNSIGNED } })
    revalidateMemo(loaded.memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to remove the section.' }
  }
}

// ─── Status: award, not selected, cancel, reopen, delete ─────────────────────

export async function awardDealMemo(memoId: string): Promise<ActionResult<{ crewUpdated: boolean; closedOthers: number }>> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    const memo = await sdb.dealMemo.findFirst({
      where:  { id: memoId },
      select: { id: true, projectId: true, lineItemId: true, workspaceId: true, contactId: true, roleLabel: true },
    })
    if (!memo) return { success: false, error: 'Deal memo not found.' }

    // Headcount comes from the budget line ("2x3" = 2 people). Unbudgeted
    // memos have no line and no cap.
    const line = memo.lineItemId ? await lineBelongsToProject(sdb, memo.lineItemId, memo.projectId) : null
    const headcount = line ? lineHeadcountAndDays(line).headcount : null
    const confirmedOnLine = () => memo.lineItemId
      ? sdb.dealMemo.count({ where: { projectId: memo.projectId, lineItemId: memo.lineItemId, status: 'CONFIRMED' } })
      : Promise.resolve(0)

    if (headcount !== null && (await confirmedOnLine()) >= headcount) {
      return { success: false, error: `${memo.roleLabel} already has ${headcount} of ${headcount} confirmed. Cancel one first.` }
    }

    // Compare-and-set: only a BID can be awarded; a double click or a second
    // tab loses the race here instead of awarding twice.
    const res = await sdb.dealMemo.updateMany({
      where: { id: memoId, status: { in: allowedFromStatuses('CONFIRMED') } },
      data:  { status: 'CONFIRMED', awardedAt: new Date() },
    })
    if (res.count === 0) return { success: false, error: 'Only a bid can be awarded.' }

    // Two different bids awarded at the same moment can both pass the check
    // above; re-count and back this one out if the line went over.
    let closedOthers = 0
    if (headcount !== null) {
      const confirmed = await confirmedOnLine()
      if (confirmed > headcount) {
        await sdb.dealMemo.updateMany({ where: { id: memoId, status: 'CONFIRMED' }, data: { status: 'BID', awardedAt: null } })
        return { success: false, error: `${memo.roleLabel} was just filled by another award. Refresh to see it.` }
      }
      // Line is now full — the remaining bids for it lose.
      if (confirmed === headcount) {
        const closed = await sdb.dealMemo.updateMany({
          where: { projectId: memo.projectId, lineItemId: memo.lineItemId, status: 'BID', id: { not: memoId } },
          data:  { status: 'NOT_SELECTED' },
        })
        closedOthers = closed.count
      }
    }

    // The award is committed; a crew-roster hiccup must not undo it.
    let crewUpdated = false
    try {
      crewUpdated = (await applyDealMemoAwardEffects(sdb, memoId)) !== null
    } catch (err) {
      console.error('[awardDealMemo] crew roster update failed (award succeeded):', memoId, err)
    }

    await logAuditEvent({
      workspaceId: memo.workspaceId, actorId: user.id, action: 'dealMemo.awarded',
      entityType: 'DealMemo', entityId: memoId,
      metadata: { lineItemId: memo.lineItemId, contactId: memo.contactId, crewUpdated, closedOthers },
    })
    revalidateMemo(memo.projectId, memoId)
    return { success: true, data: { crewUpdated, closedOthers } }
  } catch (err) {
    console.error('[awardDealMemo]', err)
    return { success: false, error: 'Failed to award the bid.' }
  }
}

// Cancelling goes through cancelDealMemo (typed CANCEL confirmation).
const SETTABLE: DealMemoStatus[] = ['NOT_SELECTED', 'BID']

export async function setDealMemoStatus(memoId: string, to: DealMemoStatus): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    if (!SETTABLE.includes(to)) return { success: false, error: 'Use Award to confirm a bid.' }
    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const memo = await sdb.dealMemo.findFirst({ where: { id: memoId }, select: { projectId: true, workspaceId: true } })
    if (!memo) return { success: false, error: 'Deal memo not found.' }

    const res = await sdb.dealMemo.updateMany({
      where: { id: memoId, status: { in: allowedFromStatuses(to) } },
      // Back to a bid = a fresh negotiation: the old link and any signature go.
      data:  { status: to, ...(to === 'BID' ? { awardedAt: null, ...CLEARED_VENDOR_LINK } : {}) },
    })
    if (res.count === 0) return { success: false, error: 'That status change isn’t allowed from here.' }

    await logAuditEvent({
      workspaceId: memo.workspaceId, actorId: user.id, action: `dealMemo.${to === 'BID' ? 'reopened' : 'not_selected'}`,
      entityType: 'DealMemo', entityId: memoId,
    })
    revalidateMemo(memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update the status.' }
  }
}

// ─── Vendor link: send, cancel ────────────────────────────────────────────────

const CLEARED_VENDOR_LINK = {
  publicToken: null, publicTokenExpiresAt: null, sentAt: null, sentToEmail: null, sentSnapshot: Prisma.DbNull,
  firstViewedAt: null, lastViewedAt: null,
  signedAt: null, signatureName: null, signatureEmail: null, signatureIp: null,
  cancelledAt: null, cancelledById: null,
}

/**
 * Email the vendor their link. Freezes the terms as they are now — the vendor
 * sees and signs exactly this. Re-sending refreshes the snapshot and keeps the
 * same link.
 */
export async function sendDealMemo(memoId: string, input: { email: string }): Promise<ActionResult<{ url: string }>> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const email = typeof input?.email === 'string' ? normEmail(input.email) : ''
    if (!z.string().email().safeParse(email).success) return { success: false, error: 'Enter the vendor’s email address.' }

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const memo = await sdb.dealMemo.findFirst({
      where:  { id: memoId },
      select: {
        id: true, projectId: true, workspaceId: true, status: true, signedAt: true, publicToken: true, position: true,
        contact: { select: { name: true } },
        project: { select: { name: true } },
        workspace: { select: { name: true, primaryColor: true, accentColor: true } },
      },
    })
    if (!memo) return { success: false, error: 'Deal memo not found.' }
    if (memo.status !== 'CONFIRMED') return { success: false, error: 'Award the bid before sending it to the vendor.' }
    if (memo.signedAt) return { success: false, error: 'Already signed.' }

    const snapshot = await buildVendorView(sdb, memoId)
    if (!snapshot) return { success: false, error: 'Deal memo not found.' }
    if (snapshot.fees.length === 0) return { success: false, error: 'Add at least one fee with a rate before sending.' }

    const token     = memo.publicToken ?? generatePublicToken()
    const now       = new Date()
    const expiresAt = new Date(now.getTime() + DEAL_MEMO_LINK_DAYS * 86_400_000)
    // Guarded: still awarded and unsigned at write time.
    const res = await sdb.dealMemo.updateMany({
      where: { id: memoId, status: 'CONFIRMED', signedAt: null },
      data:  {
        publicToken: token, publicTokenExpiresAt: expiresAt, sentAt: now, sentToEmail: email,
        sentSnapshot: toJsonSafe(snapshot) as Prisma.InputJsonValue,
      },
    })
    if (res.count === 0) return { success: false, error: 'This deal memo changed — refresh and try again.' }

    const url = `${appUrl()}/dm/${token}`
    let emailError: string | null = null
    try {
      await sendDealMemoEmail({
        to: email, vendorName: memo.contact?.name ?? '', position: memo.position, projectName: memo.project.name,
        url, expiresAt, actorName: user.name, actorEmail: user.email,
        workspaceName: memo.workspace.name, brandPrimary: memo.workspace.primaryColor, brandAccent: memo.workspace.accentColor,
      })
    } catch (err) {
      console.error('[sendDealMemo] email failed', err)
      emailError = err instanceof Error ? err.message : 'unknown error'
    }

    // The link is live either way — audit it even when the email failed.
    await logAuditEvent({
      workspaceId: memo.workspaceId, actorId: user.id, action: 'dealMemo.sent',
      entityType: 'DealMemo', entityId: memoId, metadata: { to: email, emailed: !emailError },
    })
    revalidateMemo(memo.projectId, memoId)
    if (emailError) {
      return { success: false, error: `The link is ready, but the email didn’t send: ${emailError}. Copy the link instead.` }
    }
    return { success: true, data: { url } }
  } catch (err) {
    console.error('[sendDealMemo]', err)
    return { success: false, error: 'Failed to send the deal memo.' }
  }
}

/**
 * Cancel an awarded deal memo. The caller must type CANCEL (checked here, not
 * just in the dialog). Optionally emails the vendor if it was sent; the link
 * then shows "cancelled" and can't be signed.
 */
export async function cancelDealMemo(
  memoId: string, input: { confirm: string; notifyVendor: boolean },
): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    if (!isCancelConfirmation(input?.confirm)) return { success: false, error: `Type ${CANCEL_WORD} to confirm.` }

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const memo = await sdb.dealMemo.findFirst({
      where:  { id: memoId },
      select: {
        id: true, projectId: true, workspaceId: true, position: true, sentAt: true, sentToEmail: true, signedAt: true,
        contact: { select: { name: true } },
        project: { select: { name: true } },
        workspace: { select: { name: true, primaryColor: true, accentColor: true } },
      },
    })
    if (!memo) return { success: false, error: 'Deal memo not found.' }

    const now = new Date()
    const res = await sdb.dealMemo.updateMany({
      where: { id: memoId, status: 'CONFIRMED' },
      data:  { status: 'CANCELLED', cancelledAt: now, cancelledById: user.id },
    })
    if (res.count === 0) return { success: false, error: 'Only an awarded deal memo can be cancelled.' }

    let notified = false
    if (input.notifyVendor && memo.sentAt && memo.sentToEmail) {
      try {
        await sendDealMemoCancelledEmail({
          to: memo.sentToEmail, vendorName: memo.contact?.name ?? '', position: memo.position, projectName: memo.project.name,
          actorName: user.name, actorEmail: user.email,
          workspaceName: memo.workspace.name, brandPrimary: memo.workspace.primaryColor, brandAccent: memo.workspace.accentColor,
        })
        notified = true
      } catch (err) {
        console.error('[cancelDealMemo] vendor email failed (memo is cancelled)', err)
      }
    }

    await logAuditEvent({
      workspaceId: memo.workspaceId, actorId: user.id, action: 'dealMemo.cancelled',
      entityType: 'DealMemo', entityId: memoId,
      metadata: { wasSent: !!memo.sentAt, wasSigned: !!memo.signedAt, vendorNotified: notified },
    })
    revalidateMemo(memo.projectId, memoId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[cancelDealMemo]', err)
    return { success: false, error: 'Failed to cancel the deal memo.' }
  }
}

export async function deleteDealMemo(memoId: string): Promise<ActionResult> {
  try {
    const gate = await requireMemoPermission(memoId)
    if (!gate.ok) return gate.error
    const sdb = await getScopedDb()
    const memo = await sdb.dealMemo.findFirst({ where: { id: memoId }, select: { projectId: true } })
    if (!memo) return { success: false, error: 'Deal memo not found.' }
    const res = await sdb.dealMemo.deleteMany({ where: { id: memoId, status: { in: DELETABLE_STATUSES } } })
    if (res.count === 0) return { success: false, error: 'Confirmed deal memos can’t be deleted — cancel it instead.' }
    revalidateMemo(memo.projectId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete.' }
  }
}
