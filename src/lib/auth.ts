import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// ─── getCurrentUser ───────────────────────────────────────────────────────────
// Returns the DB User row for the currently authenticated Clerk user.
// Includes the user's HOME workspace (the one created on signup) for display
// purposes (name, avatar, role). For DATA access, always use getWorkspaceId()
// or getScopedDb() — those read the ACTIVE workspace from auth().orgId.
//
// Do NOT use this client in webhook handlers or public routes.

export const getCurrentUser = cache(async () => {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  let user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { workspace: true },
  })

  if (!user) {
    // Race condition: OAuth providers redirect before the user.created webhook
    // fires. Create the workspace + user on-the-fly (mirrors webhook logic).
    const clerkUser = await currentUser()
    if (!clerkUser) redirect('/sign-in')

    const email = clerkUser.emailAddresses[0]?.emailAddress
    if (!email) redirect('/sign-in?error=no-email')

    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null
    const defaultWorkspaceName = displayName
      ? `${displayName}'s Workspace`
      : `${email.split('@')[0]}'s Workspace`

    const workspace = await db.workspace.create({
      data: { name: defaultWorkspaceName },
    })

    user = await db.user.upsert({
      where: { clerkId: userId },
      update: {
        email,
        name: displayName,
        // Only fall back to Clerk's imageUrl when no custom R2 avatar is set.
        // If the user has uploaded their own photo we must not overwrite it here.
        avatarUrl: undefined,
      },
      create: {
        clerkId: userId,
        email,
        name: displayName,
        avatarUrl: clerkUser.imageUrl ?? null,
        workspaceId: workspace.id,
        role: 'OWNER',
        onboarded: false,
      },
      include: { workspace: true },
    })
  }

  return user
})

// ─── getWorkspaceId ───────────────────────────────────────────────────────────
// Returns the ID of the currently ACTIVE workspace.
//
// Source of truth: auth().orgId → Workspace.clerkOrgId
// Fallback: user's home workspaceId (handles the transition window while orgs
// are being backfilled, and for users whose workspace was created before Phase 2).

export const getWorkspaceId = cache(async () => {
  const { orgId } = await auth()

  if (orgId) {
    const workspace = await db.workspace.findFirst({
      where: { clerkOrgId: orgId, deletedAt: null } as Parameters<typeof db.workspace.findFirst>[0]['where'],
      select: { id: true },
    })
    if (workspace) return workspace.id

    // orgId is set but no DB workspace has that clerkOrgId. This happens when:
    // - The createWorkspace server action raced with the organization.created webhook
    //   and the DB workspace creation failed (unique constraint), or
    // - The backfill hasn't been run yet for this org.
    // Log so we can debug, then fall through to home workspace.
    // The webhook + createWorkspace race fix prevents this going forward.
    console.warn(`[getWorkspaceId] orgId ${orgId} has no matching DB workspace — falling back to home workspace. Run the dedupe/backfill script to fix.`)
  }

  // Fallback: home workspace. Only reached when orgId is null (no active org yet)
  // or when the org↔workspace link is broken (transitional state).
  const user = await getCurrentUser()
  return user.workspaceId
})

// ─── getActiveWorkspace ────────────────────────────────────────────────────────
// Returns the full Workspace row for the currently active workspace.

export const getActiveWorkspace = cache(async () => {
  const workspaceId = await getWorkspaceId()
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  })
  return workspace
})

// ─── getWorkspaceAndUser ───────────────────────────────────────────────────────
// Convenience helper: returns both the active workspace and the current user.

export const getWorkspaceAndUser = cache(async () => {
  const [workspace, user] = await Promise.all([
    getActiveWorkspace(),
    getCurrentUser(),
  ])
  return { workspace, user }
})

// =============================================================
// RBAC — Roles & Permissions (Feature F9)
// =============================================================
//
// Source of truth for a member's role is our DB `User.role` (UserRole enum),
// NOT Clerk's coarse org:admin/org:member. Clerk still gates *authentication*
// and org membership; we layer the finer OWNER / PRODUCER / COLLABORATOR
// distinction on top in our own database.
//
// Roles:
//   OWNER         — full access incl. workspace settings, billing, member mgmt
//   PRODUCER      — full CRUD on projects/budgets; no settings/member mgmt
//   COLLABORATOR  — only assigned projects; margin-blind budgets; call sheets

import type { UserRole } from '@prisma/client'

// ─── getCurrentRole ───────────────────────────────────────────────────────────
// The active member's workspace role. Cached per request.

export const getCurrentRole = cache(async (): Promise<UserRole> => {
  const user = await getCurrentUser()
  return user.role
})

// ─── requireRole ──────────────────────────────────────────────────────────────
// Gate a server action behind an allow-list of roles. Returns a discriminated
// result rather than throwing, so callers can early-return the standardized
// ActionResult error (never fail silently):
//
//   const gate = await requireRole(['OWNER', 'PRODUCER'])
//   if (!gate.ok) return gate.error          // { success: false, error: 'UNAUTHORIZED_ROLE' }
//   // …authorized; gate.user / gate.role available
//
// `getScopedDb()` still enforces tenant isolation independently; this adds the
// role dimension on top.

// NOTE: this project compiles with `"strict": false` (strictNullChecks OFF),
// under which TypeScript does NOT narrow discriminated unions on a boolean
// discriminant — i.e. `if (!gate.ok) return gate.error` would fail to type-check
// against a `Success | Failure` union. So we model the gate as a SINGLE object
// type where `error` is always a (nullable) field. No narrowing required:
//
//   const gate = await requireRole(['OWNER', 'PRODUCER'])
//   if (!gate.ok) return gate.error      // typed ActionResult failure
//   // …authorized; gate.userId / gate.role available
export type RoleGate = {
  ok:          boolean
  /** The standardized failure result when `ok` is false; null when authorized. */
  error:       { success: false; error: 'UNAUTHORIZED_ROLE' } | null
  role:        UserRole
  userId:      string
  workspaceId: string
}

export async function requireRole(allowedRoles: UserRole[]): Promise<RoleGate> {
  const user = await getCurrentUser()
  const ok = allowedRoles.includes(user.role)
  return {
    ok,
    error: ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    role:        user.role,
    userId:      user.id,
    workspaceId: user.workspaceId,
  }
}
