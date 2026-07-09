'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
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

// ── Read ───────────────────────────────────────────────────────────────────────

export async function getProjectMembers(projectId: string) {
  const sdb = await getScopedDb()
  // Scoped read — verifies project belongs to this workspace.
  const project = await sdb.project.findFirst({ where: { id: projectId }, select: { id: true } })
  if (!project) return []

  return sdb.projectMember.findMany({
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
    },
  })
}

export type ProjectMemberRow = Awaited<ReturnType<typeof getProjectMembers>>[number]

// ── Write ──────────────────────────────────────────────────────────────────────

export async function addProjectMember(
  projectId: string,
  input: MemberFormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    // Scoped read — verifies project belongs to this workspace.
    const project = await sdb.project.findFirst({ where: { id: projectId }, select: { id: true } })
    if (!project) return { success: false, error: 'Project not found' }

    const data = memberSchema.parse(input)

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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    // Scoped update — WHERE id = ? AND workspaceId = ? blocks foreign member ids.
    const data = memberSchema.parse(input)
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await sdb.projectMember.update({ where: { id }, data: { mismatchFlag: false } })
    revalidatePath(`/projects/${projectId}/crew`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to dismiss mismatch' }
  }
}
