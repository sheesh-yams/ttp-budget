'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'

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
  // Access control: verify the project belongs to the current workspace
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  })
  if (!project) return []

  return db.projectMember.findMany({
    where: { projectId },
    orderBy: [{ department: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    select: {
      id:         true,
      contactId:  true,
      name:       true,
      role:       true,
      department: true,
      email:      true,
      phone:      true,
      rateCents:  true,
      rateUnit:   true,
      callTime:   true,
      order:      true,
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
    // Access control: verify project belongs to workspace
    const workspaceId = await getWorkspaceId()
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    const data = memberSchema.parse(input)

    const member = await db.projectMember.create({
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

    revalidatePath(`/projects/${projectId}/team`)
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
    // Access control via project
    const workspaceId = await getWorkspaceId()
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    const data = memberSchema.parse(input)
    await db.projectMember.update({
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

    revalidatePath(`/projects/${projectId}/team`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update team member' }
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
    const workspaceId = await getWorkspaceId()

    // Access control
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    // Only seed if team is empty
    const existingCount = await db.projectMember.count({ where: { projectId } })
    if (existingCount > 0) return { success: true, data: { count: 0, proposalTitle: null } }

    // ── Find the best proposal to seed from ──────────────────────────────────
    // 1st priority: won (APPROVED) proposal
    let proposal = await db.proposal.findFirst({
      where: { projectId, workspaceId, status: 'APPROVED' },
      select: { id: true, title: true, budgetId: true },
      orderBy: { updatedAt: 'desc' },
    })

    // 2nd priority: latest SENT or VIEWED proposal
    if (!proposal) {
      proposal = await db.proposal.findFirst({
        where: { projectId, workspaceId, status: { in: ['SENT', 'VIEWED'] } },
        select: { id: true, title: true, budgetId: true },
        orderBy: { updatedAt: 'desc' },
      })
    }

    // ── If we have a proposal, pull CREW line items from its budget ───────────
    if (proposal) {
      const phases = await db.phase.findMany({
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
          await db.projectMember.createMany({ data: members })
          revalidatePath(`/projects/${projectId}/team`)
          return { success: true, data: { count: members.length, proposalTitle: proposal.title } }
        }
      }
    }

    // ── Fallback: workspace CREW rate cards ──────────────────────────────────
    const rateCards = await db.rateCard.findMany({
      where: { workspaceId, category: 'CREW', archivedAt: null },
      select: { role: true, defaultRateCents: true, defaultUnit: true },
      orderBy: { role: 'asc' },
    })
    if (rateCards.length === 0) return { success: true, data: { count: 0, proposalTitle: null } }

    await db.projectMember.createMany({
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

    revalidatePath(`/projects/${projectId}/team`)
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
    const workspaceId = await getWorkspaceId()
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    await db.projectMember.delete({ where: { id } })
    revalidatePath(`/projects/${projectId}/team`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to remove team member' }
  }
}
