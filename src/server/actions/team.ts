'use server'

import { revalidatePath } from 'next/cache'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser, getActiveWorkspace, requireRole } from '@/lib/auth'
import { sendInvitationEmail } from '@/lib/email'
import type { ActionResult } from '@/types'
import type { UserRole } from '@prisma/client'
import { logAuditEvent } from '@/lib/audit'
import { verifiedEmailsFor } from '@/lib/invitations'
import { legacyRoleForInvite, removeWorkspaceMembership, syncWorkspaceMembership } from '@/lib/roles'
import { requireTeamAdmin } from '@/lib/access'
import { legacyRoleFor } from '@/lib/permissions'

// WorkspaceInvitation is a new model — types are generated after `prisma generate`.
// Until then, cast db to include the accessor.
type InvitationRecord = {
  id: string; email: string; role: UserRole; roleId: string | null; token: string
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
  /** Their workspace role here (configurable). */
  roleId:    string | null
  roleName:  string | null
  createdAt: Date
  isCurrentUser: boolean
}

export type PendingInvitation = {
  id:            string
  email:         string
  role:          UserRole
  roleName:      string | null
  invitedByName: string | null
  expiresAt:     Date
  createdAt:     Date
}

// ─── listTeamMembers ──────────────────────────────────────────────────────────

export async function listTeamMembers(): Promise<TeamMember[]> {
  // Exported = callable: member emails are for people who manage the team.
  const gate = await requireTeamAdmin()
  if (!gate.ok) return []
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

  const memberships = await db.workspaceMember.findMany({
    where:  { workspaceId, userId: { in: users.map(u => u.id) } },
    select: { userId: true, role: { select: { id: true, name: true } } },
  })
  const roleBy = new Map(memberships.map(m => [m.userId, m.role]))

  return users.map(u => ({
    ...u,
    roleId:        roleBy.get(u.id)?.id ?? null,
    roleName:      roleBy.get(u.id)?.name ?? null,
    isCurrentUser: u.clerkId === userId,
  }))
}

// ─── getPendingInvitations ────────────────────────────────────────────────────

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const gate = await requireTeamAdmin()
  if (!gate.ok) return []
  const workspaceId = await getWorkspaceId()

  const rows = await db.workspaceInvitation.findMany({
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
      workspaceRole: { select: { name: true } },
    },
  })
  return rows.map(({ workspaceRole, ...r }) => ({ ...r, roleName: workspaceRole?.name ?? null }))
}

// ─── inviteTeamMember ─────────────────────────────────────────────────────────

export async function inviteTeamMember(
  email: string,
  roleId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await requireTeamAdmin()
    if (!gate.ok) return gate.error
    const [workspaceId, currentUser, workspace] = await Promise.all([
      getWorkspaceId(),
      getCurrentUser(),
      getActiveWorkspace(),
    ])
    const chosenRole = await db.workspaceRole.findFirst({ where: { id: roleId, workspaceId } })
    if (!chosenRole) return { success: false, error: 'Choose a role for this person.' }
    // The legacy role checks not yet on permissions will use.
    const role = legacyRoleFor(chosenRole)

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
        roleId:        chosenRole.id,
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
        roleName:       chosenRole.name,
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
      metadata:   { email: normalizedEmail, role, roleId: chosenRole.id, roleName: chosenRole.name },
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

// (changeMemberRole was replaced by assignWorkspaceRole in roles.ts.)

// ─── acceptInvitation ────────────────────────────────────────────────────────
// Called from the /invite/[token] page after the user is authenticated.
// Adds them to the Clerk org → triggers the organizationMembership.created
// webhook → webhook updates (or creates) their DB User record.

export async function acceptInvitation(token: string): Promise<ActionResult<{ workspaceName: string; clerkOrgId: string }>> {
  try {
    // A brand-new account may still be "pending" (Clerk's choose-organization
    // step) — that's exactly when it comes here to join, so count it.
    const { userId: clerkUserId } = await auth({ treatPendingAsSignedOut: false })
    if (!clerkUserId) return { success: false, error: 'You must be signed in to accept an invitation.' }

    const invitation = await dbi.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true, clerkOrgId: true } } },
    })

    if (!invitation) return { success: false, error: 'Invitation not found or already used.' }
    if (invitation.acceptedAt) return { success: false, error: 'This invitation has already been accepted.' }
    if (invitation.expiresAt < new Date()) return { success: false, error: 'This invitation has expired.' }

    // Only the person the invite was sent to may accept it.
    const emails = await verifiedEmailsFor(clerkUserId)
    if (!emails.includes(invitation.email.toLowerCase())) {
      return { success: false, error: `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.` }
    }

    const { workspace } = invitation
    if (!workspace.clerkOrgId) return { success: false, error: 'Workspace is not fully set up yet.' }

    // Map our role to Clerk's org role slug
    const clerkRole = invitation.role === 'OWNER' ? 'org:admin' : 'org:member'

    // Add user to the Clerk org — this fires organizationMembership.created webhook
    const clerk = await clerkClient()
    try {
      await clerk.organizations.createOrganizationMembership({
        organizationId: workspace.clerkOrgId,
        userId:         clerkUserId,
        role:           clerkRole,
      })
    } catch (createErr) {
      // Clerk throws if the user is already a member (e.g. someone added
      // them directly via the Clerk Dashboard). Re-check actual membership
      // state rather than pattern-matching the error message — Clerk's SDK
      // puts the real reason in err.errors[], not necessarily err.message.
      const memberships = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId })
      const alreadyMember = memberships.data.some(m => m.organization.id === workspace.clerkOrgId)
      if (!alreadyMember) throw createErr
    }

    // Reconcile the DB User row directly rather than relying solely on the
    // organizationMembership.created webhook. That webhook only fires once,
    // at the moment Clerk membership is actually created — if the user was
    // already a member going into this call (added via the Clerk Dashboard,
    // or a previous webhook delivery failed) there's no second event to
    // catch us up, and they'd be stuck on their throwaway personal workspace.
    // The invited role as it is now — it may have been edited since sending.
    const joinedRole = await legacyRoleForInvite(invitation, workspace.id)
    const joined = await db.user.update({
      where: { clerkId: clerkUserId },
      data:  { workspaceId: workspace.id, role: joinedRole, onboarded: true },
      select: { id: true },
    })
    await syncWorkspaceMembership({ userId: joined.id, workspaceId: workspace.id, role: joinedRole, roleId: invitation.roleId })

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

    return { success: true, data: { workspaceName: workspace.name, clerkOrgId: workspace.clerkOrgId } }
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

// ─── removeWorkspaceMember ────────────────────────────────────────────────────
// OWNER only. Removes a member from the Clerk org (triggers DB cleanup via
// future webhook) and atomically vacates all their active project team roles.

export async function removeWorkspaceMember(
  userId: string,
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER'])
    if (!gate.ok) return gate.error

    if (userId === gate.userId) {
      return { success: false, error: "You can't remove yourself. Use 'Leave workspace' instead." }
    }

    const workspace = await getActiveWorkspace()

    // Verify target belongs to this workspace.
    const target = await db.user.findFirst({
      where:  { id: userId, workspaceId: gate.workspaceId },
      select: { id: true, clerkId: true, name: true, email: true },
    })
    if (!target) return { success: false, error: 'Member not found.' }

    // Atomically vacate all active project team roles and their access to
    // this workspace's projects.
    await db.$transaction(async (tx) => {
      await tx.projectAssignment.deleteMany({ where: { userId, workspaceId: gate.workspaceId } })
      await tx.projectTeamMember.updateMany({
        where: {
          userId,
          workspaceId:  gate.workspaceId,
          unassignedAt: null,
        },
        data: {
          unassignedAt:       new Date(),
          unassignedByUserId: gate.userId,
          unassignReason:     'USER_LEFT_WORKSPACE',
        },
      })
    })

    // Remove from Clerk org — this will fire organizationMembership.deleted
    // which can be used for any additional cleanup in the future.
    if (workspace.clerkOrgId) {
      try {
        const clerk = await clerkClient()
        await clerk.organizations.deleteOrganizationMembership({
          organizationId: workspace.clerkOrgId,
          userId:         target.clerkId,
        })
      } catch (e) {
        console.error('[removeWorkspaceMember] Clerk removal failed:', e)
        return { success: false, error: 'Failed to remove member from workspace.' }
      }
    }
    // Mirror only — Clerk removal already succeeded.
    await removeWorkspaceMembership({ userId, workspaceId: gate.workspaceId })
      .catch(err => console.error('[removeWorkspaceMember] membership cleanup failed (non-fatal):', err))

    void logAuditEvent({
      workspaceId: gate.workspaceId,
      actorId:     gate.userId,
      action:      'member.removed',
      entityType:  'Member',
      entityId:    userId,
      metadata:    { name: target.name, email: target.email },
    })

    revalidatePath('/team')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[removeWorkspaceMember]', err)
    return { success: false, error: 'Failed to remove member.' }
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
