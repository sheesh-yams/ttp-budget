'use server'

import { revalidatePath } from 'next/cache'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser, getActiveWorkspace, requireRole } from '@/lib/auth'
import { sendInvitationEmail } from '@/lib/email'
import type { ActionResult } from '@/types'
import type { UserRole } from '@prisma/client'
import { logAuditEvent } from '@/lib/audit'

// WorkspaceInvitation is a new model — types are generated after `prisma generate`.
// Until then, cast db to include the accessor.
type InvitationRecord = {
  id: string; email: string; role: UserRole; token: string
  invitedByName: string | null; expiresAt: Date; acceptedAt: Date | null; createdAt: Date
  workspaceId: string
}
type InvitationWithWorkspace = InvitationRecord & {
  workspace: { id: string; name: string; logoUrl: string | null; clerkOrgId: string | null }
}

const dbi = db as unknown as {
  workspaceInvitation: {
    findFirst:  (args: object) => Promise<InvitationRecord | null>
    findUnique: (args: object) => Promise<InvitationWithWorkspace | null>
    findMany:   (args: object) => Promise<InvitationRecord[]>
    create:     (args: object) => Promise<InvitationRecord>
    update:     (args: object) => Promise<InvitationRecord>
    delete:     (args: object) => Promise<InvitationRecord>
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeamMember = {
  id:        string
  clerkId:   string
  name:      string | null
  email:     string
  avatarUrl: string | null
  role:      UserRole
  createdAt: Date
  isCurrentUser: boolean
}

export type PendingInvitation = {
  id:            string
  email:         string
  role:          UserRole
  invitedByName: string | null
  expiresAt:     Date
  createdAt:     Date
}

// ─── listTeamMembers ──────────────────────────────────────────────────────────

export async function listTeamMembers(): Promise<TeamMember[]> {
  const { userId } = await auth()
  const workspaceId = await getWorkspaceId()

  const users = await db.user.findMany({
    where:   { workspaceId },
    orderBy: { createdAt: 'asc' },
    select: {
      id:        true,
      clerkId:   true,
      name:      true,
      email:     true,
      avatarUrl: true,
      role:      true,
      createdAt: true,
    },
  })

  return users.map(u => ({
    ...u,
    isCurrentUser: u.clerkId === userId,
  }))
}

// ─── getPendingInvitations ────────────────────────────────────────────────────

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const workspaceId = await getWorkspaceId()

  return dbi.workspaceInvitation.findMany({
    where: {
      workspaceId,
      acceptedAt: null,
      expiresAt:  { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      email:         true,
      role:          true,
      invitedByName: true,
      expiresAt:     true,
      createdAt:     true,
    },
  })
}

// ─── inviteTeamMember ─────────────────────────────────────────────────────────

export async function inviteTeamMember(
  email: string,
  role: UserRole,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER'])
    if (!gate.ok) return gate.error
    const [workspaceId, currentUser, workspace] = await Promise.all([
      getWorkspaceId(),
      getCurrentUser(),
      getActiveWorkspace(),
    ])

    const normalizedEmail = email.trim().toLowerCase()

    // Check: is this person already a member?
    const existing = await db.user.findFirst({
      where: { workspaceId, email: normalizedEmail },
      select: { id: true },
    })
    if (existing) return { success: false, error: 'This person is already a member of your workspace.' }

    // Check: is there already a pending invite?
    const pendingInvite = await dbi.workspaceInvitation.findFirst({
      where: {
        workspaceId,
        email:      normalizedEmail,
        acceptedAt: null,
        expiresAt:  { gt: new Date() },
      },
      select: { id: true },
    })
    if (pendingInvite) return { success: false, error: 'An invitation is already pending for this email.' }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invitation = await dbi.workspaceInvitation.create({
      data: {
        workspaceId,
        email:         normalizedEmail,
        role,
        invitedByName: currentUser.name ?? currentUser.email,
        expiresAt,
      },
    })

    // Send branded Resend email — kept separate from the outer try/catch so a
    // Resend failure surfaces its real message instead of a generic one.
    try {
      await sendInvitationEmail({
        to:             normalizedEmail,
        invitedByName:  currentUser.name ?? currentUser.email,
        invitedByEmail: currentUser.email,
        workspaceName:  workspace.name,
        role,
        token:          invitation.token,
        expiresAt,
      })
    } catch (emailErr) {
      console.error('[inviteTeamMember] email send failed', emailErr)
      await logAuditEvent({
        workspaceId,
        actorId:    currentUser.id,
        action:     'member.invite_email_failed',
        entityType: 'Member',
        metadata:   { email: normalizedEmail, role, error: emailErr instanceof Error ? emailErr.message : String(emailErr) },
      })
      return { success: false, error: `Invitation email failed to send: ${emailErr instanceof Error ? emailErr.message : 'Unknown error'}` }
    }

    revalidatePath('/team')

    await logAuditEvent({
      workspaceId,
      actorId:    currentUser.id,
      action:     'member.invited',
      entityType: 'Member',
      metadata:   { email: normalizedEmail, role },
    })

    return { success: true, data: undefined }
  } catch (err) {
    console.error('[inviteTeamMember]', err)
    return { success: false, error: 'Failed to send invitation. Please try again.' }
  }
}

// ─── revokeInvitation ────────────────────────────────────────────────────────

export async function revokeInvitation(invitationId: string): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER'])
    if (!gate.ok) return gate.error
    const workspaceId = await getWorkspaceId()

    // Verify the invitation belongs to this workspace before deleting
    const invitation = await dbi.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId },
      select: { id: true },
    })
    if (!invitation) return { success: false, error: 'Invitation not found.' }

    await dbi.workspaceInvitation.delete({ where: { id: invitationId } })

    revalidatePath('/team')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[revokeInvitation]', err)
    return { success: false, error: 'Failed to revoke invitation.' }
  }
}

// ─── changeMemberRole ─────────────────────────────────────────────────────────
// OWNER-only. Updates our DB role (source of truth) and best-effort syncs the
// member's coarse Clerk org role (admin vs member).

export async function changeMemberRole(
  userId: string,
  role:   UserRole,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireRole(['OWNER'])
    if (!gate.ok) return gate.error

    const workspaceId = await getWorkspaceId()

    // Target must be a member of THIS workspace (tenant isolation).
    const target = await db.user.findFirst({
      where:  { id: userId, workspaceId },
      select: { id: true, clerkId: true },
    })
    if (!target) return { success: false, error: 'Member not found.' }
    if (target.id === gate.userId) {
      return { success: false, error: "You can't change your own role." }
    }

    await db.user.update({ where: { id: target.id }, data: { role } })

    // Best-effort Clerk sync — DB remains the source of truth regardless.
    const workspace = await getActiveWorkspace()
    if (workspace.clerkOrgId) {
      try {
        const clerk = await clerkClient()
        await clerk.organizations.updateOrganizationMembership({
          organizationId: workspace.clerkOrgId,
          userId:         target.clerkId,
          role:           role === 'OWNER' ? 'org:admin' : 'org:member',
        })
      } catch (e) {
        console.error('[changeMemberRole] Clerk role sync failed (DB updated):', e)
      }
    }

    await logAuditEvent({
      workspaceId,
      actorId:    gate.userId,
      action:     'member.role_changed',
      entityType: 'Member',
      metadata:   { userId: target.id, role },
    })

    revalidatePath('/team')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[changeMemberRole]', err)
    return { success: false, error: 'Failed to change role.' }
  }
}

// ─── acceptInvitation ────────────────────────────────────────────────────────
// Called from the /invite/[token] page after the user is authenticated.
// Adds them to the Clerk org → triggers the organizationMembership.created
// webhook → webhook updates (or creates) their DB User record.

export async function acceptInvitation(token: string): Promise<ActionResult<{ workspaceName: string }>> {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) return { success: false, error: 'You must be signed in to accept an invitation.' }

    const invitation = await dbi.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true, clerkOrgId: true } } },
    })

    if (!invitation) return { success: false, error: 'Invitation not found or already used.' }
    if (invitation.acceptedAt) return { success: false, error: 'This invitation has already been accepted.' }
    if (invitation.expiresAt < new Date()) return { success: false, error: 'This invitation has expired.' }

    const { workspace } = invitation
    if (!workspace.clerkOrgId) return { success: false, error: 'Workspace is not fully set up yet.' }

    // Map our role to Clerk's org role slug
    const clerkRole = invitation.role === 'OWNER' ? 'org:admin' : 'org:member'

    // Add user to the Clerk org — this fires organizationMembership.created webhook
    const clerk = await clerkClient()
    await clerk.organizations.createOrganizationMembership({
      organizationId: workspace.clerkOrgId,
      userId:         clerkUserId,
      role:           clerkRole,
    })

    // Mark the invitation as accepted
    await dbi.workspaceInvitation.update({
      where: { token },
      data:  { acceptedAt: new Date() },
    })

    await logAuditEvent({
      workspaceId: workspace.id,
      actorId:     null,       // Clerk userId available but not our DB User.id yet
      action:      'member.joined',
      entityType:  'Member',
      metadata:    { email: invitation.email, role: invitation.role },
    })

    return { success: true, data: { workspaceName: workspace.name } }
  } catch (err: unknown) {
    console.error('[acceptInvitation]', err)
    // Clerk throws if the user is already a member
    const message = err instanceof Error ? err.message : ''
    if (message.includes('already') || message.includes('existing')) {
      return { success: false, error: 'You are already a member of this workspace.' }
    }
    return { success: false, error: 'Failed to accept invitation. Please try again.' }
  }
}

// ─── getInvitationByToken ─────────────────────────────────────────────────────
// Public — does NOT require auth. Used by the /invite/[token] page server component.

export async function getInvitationByToken(token: string) {
  return dbi.workspaceInvitation.findUnique({
    where: { token },
    select: {
      id:            true,
      email:         true,
      role:          true,
      invitedByName: true,
      expiresAt:     true,
      acceptedAt:    true,
      workspace: {
        select: { name: true, logoUrl: true },
      },
    },
  })
}
