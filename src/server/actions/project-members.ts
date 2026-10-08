'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getAccess, getProjectAccess, requireProjectPermission } from '@/lib/access'
import { getScopedDb } from '@/lib/db-scoped'
import { toJsonSafe } from '@/lib/json-safe'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import type { CrewDept, TalentMember } from './call-sheets'

// ── Schema ─────────────────────────────────────────────────────────────────────

const memberSchema = z.object({
  contactId:  z.string().optional().nullable(),  // null = ad-hoc
  name:       z.string().min(1).max(200),
  role:       z.string().min(1).max(200),
  department: z.string().optional().nullable(),
  email:      z.string().email().optional().or(z.literal('')).nullable(),
  phone:      z.string().optional().nullable(),
  rateCents:  z.number().int().min(0).optional().nullable(),
  rateUnit:   z.enum(['HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'FLAT', 'EACH', 'MILE']).default('DAY'),
  callTime:   z.string().optional().nullable(),  // "07:00"
  order:      z.number().int().default(0),
})

export type MemberFormData = z.infer<typeof memberSchema>

// ── Gates (not exported — every export of a 'use server' file is an endpoint) ─

/**
 * A crew member action: the member must be on `projectId` (the client sends
 * both — never trust the pairing) and the caller needs crew EDIT there.
 */
async function requireMemberPermission(memberId: string, projectId: string) {
  const access = await getAccess()
  const member = typeof memberId === 'string' && memberId
    ? await db.projectMember.findFirst({ where: { id: memberId, workspaceId: access.workspaceId }, select: { projectId: true } })
    : null
  if (!member || member.projectId !== projectId) {
    return { ok: false, error: { success: false as const, error: 'Team member not found' }, userId: access.userId, workspaceId: access.workspaceId }
  }
  return requireProjectPermission(projectId, 'crew', 'EDIT')
}

/**
 * People picked from a project-scoped search arrive without contact details
 * (names-only search) — fill email / phone / rate from their rolodex record.
 * Never overrides what the caller sent.
 */
async function fillFromContact(sdb: Awaited<ReturnType<typeof getScopedDb>>, data: MemberFormData, opts: { rate: boolean }) {
  // Only for callers who got the names-only search; with the rolodex the
  // form already carried the details, and a blank is deliberate.
  if (!data.contactId || (await getAccess()).can('rolodex')) return
  const c = await sdb.contact.findFirst({
    where:  { id: data.contactId },
    select: { email: true, phone: true, defaultRateCents: true, defaultRateUnit: true },
  })
  if (!c) return
  if (!data.email) data.email = c.email
  if (!data.phone) data.phone = c.phone
  // Rate only when adding — on an edit an empty rate may be deliberate.
  if (opts.rate && data.rateCents == null && c.defaultRateCents != null) {
    data.rateCents = c.defaultRateCents
    data.rateUnit  = c.defaultRateUnit as MemberFormData['rateUnit']
  }
}

/** What crew are paid follows dealMemos. */
async function canSetRates(projectId: string) {
  return !!(await getProjectAccess(projectId))?.can('dealMemos', 'EDIT')
}

// ── Read ───────────────────────────────────────────────────────────────────────

export async function getProjectMembers(projectId: string) {
  // Callable directly by any signed-in user, so it enforces the same rule as
  // the crew page: crew VIEW on a project this user may open.
  const access = await getProjectAccess(projectId)
  if (!access || !access.can('crew')) return []
  const sdb = await getScopedDb()

  const members = await sdb.projectMember.findMany({
    where: { projectId },
    orderBy: [{ department: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    select: {
      id:           true,
      contactId:    true,
      name:         true,
      role:         true,
      department:   true,
      email:        true,
      phone:        true,
      rateCents:    true,
      rateUnit:     true,
      callTime:     true,
      mismatchFlag: true,
      order:        true,
      // Dietary lives on the Rolodex contact (kept current there) — for
      // whoever plans food; crew VIEW already gates this list.
      contact:      { select: { dietaryTags: true, dietaryNotes: true } },
    },
  })
  // Crew rates are vendor pay (awarded deal memos write the day rate here) —
  // they follow dealMemos, like the deal memos themselves. An "Unassigned"
  // placeholder's rate was seeded from the budget line, so it's a budget cost.
  const seesVendorRates = access.can('dealMemos')
  const seesBudgetRates = access.can('budget.costs')
  return members.map(m => {
    const visible = m.name === 'Unassigned' ? seesVendorRates && seesBudgetRates : seesVendorRates
    return visible ? m : { ...m, rateCents: null }
  })
}

export type ProjectMemberRow = Awaited<ReturnType<typeof getProjectMembers>>[number]

// ── Write ──────────────────────────────────────────────────────────────────────

export async function addProjectMember(
  projectId: string,
  input: MemberFormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireProjectPermission(projectId, 'crew', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    // Scoped read — verifies project belongs to this workspace.
    const project = await sdb.project.findFirst({ where: { id: projectId }, select: { id: true } })
    if (!project) return { success: false, error: 'Project not found' }

    const data = memberSchema.parse(input)
    await fillFromContact(sdb, data, { rate: true })
    // Setting what someone is paid is a deal-memo level decision.
    if (!(await canSetRates(projectId))) data.rateCents = null

    // sdb.projectMember.create auto-injects workspaceId.
    const member = await sdb.projectMember.create({
      data: {
        projectId,
        contactId:  data.contactId  ?? null,
        name:       data.name,
        role:       data.role,
        department: data.department ?? null,
        email:      data.email      ?? null,
        phone:      data.phone      ?? null,
        rateCents:  data.rateCents  ?? null,
        rateUnit:   data.rateUnit,
        callTime:   data.callTime   ?? null,
        order:      data.order,
      },
    })

    revalidatePath(`/projects/${projectId}/crew`)
    return { success: true, data: { id: member.id } }
  } catch {
    return { success: false, error: 'Failed to add team member' }
  }
}

export async function updateProjectMember(
  id: string,
  projectId: string,
  input: MemberFormData
): Promise<ActionResult> {
  try {
    const gate = await requireMemberPermission(id, projectId)
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    // Scoped update — WHERE id = ? AND workspaceId = ? blocks foreign member ids.
    const data = memberSchema.parse(input)
    await fillFromContact(sdb, data, { rate: false })
    // If the editor never received the rate (stripped on read: no dealMemos,
    // or a budget-seeded placeholder without budget.costs) keep the stored
    // one rather than writing back a blank.
    const projectAccess = await getProjectAccess(projectId)
    const existing = await sdb.projectMember.findFirst({ where: { id }, select: { name: true } })
    const rateWasHidden =
      !projectAccess?.can('dealMemos', 'EDIT') ||
      (existing?.name === 'Unassigned' && !projectAccess.can('budget.costs'))
    if (rateWasHidden) {
      const current = await sdb.projectMember.findFirst({ where: { id }, select: { rateCents: true, rateUnit: true } })
      data.rateCents = current?.rateCents ?? null
      if (current?.rateUnit) data.rateUnit = current.rateUnit
    }
    await sdb.projectMember.update({
      where: { id },
      data: {
        contactId:  data.contactId  ?? null,
        name:       data.name,
        role:       data.role,
        department: data.department ?? null,
        email:      data.email      ?? null,
        phone:      data.phone      ?? null,
        rateCents:  data.rateCents  ?? null,
        rateUnit:   data.rateUnit,
        callTime:   data.callTime   ?? null,
        order:      data.order,
      },
    })

    // Bi-directional sync: push callTime to any call sheet rows for the same contact.
    // Fire-and-forget — don't fail the save if sync errors.
    if (data.contactId && data.callTime) {
      syncMemberCallTimeToCallSheets(projectId, data.contactId, data.callTime, sdb).catch(() => {})
    }

    revalidatePath(`/projects/${projectId}/crew`)
    revalidatePath(`/projects/${projectId}/call-sheets`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update team member' }
  }
}

// ── Sync helper: push a Teams-page callTime edit into call sheet crew/talent ──

async function syncMemberCallTimeToCallSheets(
  projectId: string,
  contactId: string,
  callTime: string,
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
) {
  const sheets = await sdb.callSheet.findMany({
    where: { projectId },
    select: { id: true, crew: true, talent: true },
  })

  for (const sheet of sheets) {
    let dirty = false

    const crew = (sheet.crew as unknown as CrewDept[]) ?? []
    const newCrew = crew.map(dept => ({
      ...dept,
      members: dept.members.map(m => {
        if (m.contactId === contactId) { dirty = true; return { ...m, callTime } }
        return m
      }),
    }))

    const talent = (sheet.talent as unknown as TalentMember[]) ?? []
    const newTalent = talent.map(t => {
      if (t.contactId === contactId) { dirty = true; return { ...t, callTime } }
      return t
    })

    if (dirty) {
      await sdb.callSheet.update({
        where: { id: sheet.id },
        data: { crew: toJsonSafe(newCrew), talent: toJsonSafe(newTalent) },
      })
    }
  }
}

// Seed team from a proposal's budget crew — called when team is empty on first load.
// Priority: 1) won proposal (APPROVED), 2) latest sent/viewed proposal.
// Falls back to workspace CREW rate cards if no proposals found.
// No-op if the team already has members.
// Returns count + proposalTitle (null if fell back to rate cards).
export async function seedTeamFromBudget(
  projectId: string
): Promise<ActionResult<{ count: number; proposalTitle: string | null }>> {
  try {
    const gate = await requireProjectPermission(projectId, 'crew', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()

    // Scoped read — verifies project belongs to this workspace.
    const project = await sdb.project.findFirst({ where: { id: projectId }, select: { id: true } })
    if (!project) return { success: false, error: 'Project not found' }

    // Only seed if team is empty
    const existingCount = await sdb.projectMember.count({ where: { projectId } })
    if (existingCount > 0) return { success: true, data: { count: 0, proposalTitle: null } }

    // ── Find the best proposal to seed from ──────────────────────────────────
    // 1st priority: won (APPROVED) proposal — sdb auto-scopes to this workspace.
    let proposal = await sdb.proposal.findFirst({
      where: { projectId, status: 'APPROVED' },
      select: { id: true, title: true, budgetId: true },
      orderBy: { updatedAt: 'desc' },
    })

    // 2nd priority: latest SENT or VIEWED proposal
    if (!proposal) {
      proposal = await sdb.proposal.findFirst({
        where: { projectId, status: { in: ['SENT', 'VIEWED'] } },
        select: { id: true, title: true, budgetId: true },
        orderBy: { updatedAt: 'desc' },
      })
    }

    // ── If we have a proposal, pull CREW line items from its budget ───────────
    if (proposal) {
      const phases = await sdb.phase.findMany({
        where: { budgetId: proposal.budgetId },
        select: {
          isPrimary: true,
          accounts: {
            select: {
              name: true,
              lineItems: {
                where: { lineItemCategory: 'CREW' },
                select: {
                  description: true,
                  rateCents:   true,
                  unit:        true,
                  order:       true,
                },
                orderBy: { order: 'asc' },
              },
            },
          },
        },
        orderBy: { order: 'asc' },
      })

      // Prefer the primary phase; fall back to first phase
      const phase =
        phases.find((p) => p.isPrimary) ?? phases[0]

      if (phase) {
        const members: {
          projectId: string
          contactId: null
          name: string
          role: string
          department: string | null
          email: null
          phone: null
          rateCents: number | null
          rateUnit: import('@prisma/client').RateUnit
          callTime: null
          order: number
        }[] = []

        let globalOrder = 0
        for (const account of phase.accounts) {
          for (const item of account.lineItems) {
            members.push({
              projectId,
              contactId:  null,
              name:       'Unassigned',
              role:       item.description,
              department: account.name,
              email:      null,
              phone:      null,
              rateCents:  item.rateCents,
              rateUnit:   item.unit,
              callTime:   null,
              order:      globalOrder++,
            })
          }
        }

        if (members.length > 0) {
          // sdb.createMany auto-injects workspaceId into each item.
          await sdb.projectMember.createMany({ data: members })
          revalidatePath(`/projects/${projectId}/crew`)
          return { success: true, data: { count: members.length, proposalTitle: proposal.title } }
        }
      }
    }

    // ── Fallback: workspace CREW rate cards ──────────────────────────────────
    // sdb auto-scopes findMany to this workspace; no manual workspaceId filter needed.
    const rateCards = await sdb.rateCard.findMany({
      where: { category: 'CREW', archivedAt: null },
      select: { role: true, defaultRateCents: true, defaultUnit: true },
      orderBy: { role: 'asc' },
    })
    if (rateCards.length === 0) return { success: true, data: { count: 0, proposalTitle: null } }

    // sdb.createMany auto-injects workspaceId into each item.
    await sdb.projectMember.createMany({
      data: rateCards.map((rc, i) => ({
        projectId,
        contactId:  null,
        name:       'Unassigned',
        role:       rc.role,
        department: null,
        email:      null,
        phone:      null,
        rateCents:  rc.defaultRateCents,
        rateUnit:   rc.defaultUnit,
        callTime:   null,
        order:      i,
      })),
    })

    revalidatePath(`/projects/${projectId}/crew`)
    return { success: true, data: { count: rateCards.length, proposalTitle: null } }
  } catch {
    return { success: false, error: 'Failed to seed team' }
  }
}

export async function removeProjectMember(
  id: string,
  projectId: string
): Promise<ActionResult> {
  try {
    const gate = await requireMemberPermission(id, projectId)
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    // Scoped delete — WHERE id = ? AND workspaceId = ? blocks foreign member ids.
    await sdb.projectMember.delete({ where: { id } })
    revalidatePath(`/projects/${projectId}/crew`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to remove team member' }
  }
}

// ── Dismiss a proposal-mismatch flag ─────────────────────────────────────────
// Called when the user confirms "yes, keep them" on a card that has a red outline.

export async function dismissMismatch(
  id: string,
  projectId: string
): Promise<ActionResult> {
  try {
    const gate = await requireMemberPermission(id, projectId)
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await sdb.projectMember.update({ where: { id }, data: { mismatchFlag: false } })
    revalidatePath(`/projects/${projectId}/crew`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to dismiss mismatch' }
  }
}
