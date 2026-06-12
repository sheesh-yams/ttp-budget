/**
 * audit.ts — Minimal workspace audit log
 *
 * `logAuditEvent` is fire-and-forget: it never throws. A failure here must never
 * break the calling action. Call it after the main operation has succeeded.
 *
 * This helper uses raw `db` (not getScopedDb) so it works from:
 *   - Authenticated server actions (pass actorId = user.id)
 *   - Public API routes (pass actorId = 'public' or null)
 *   - System/cron tasks (pass actorId = null)
 *
 * AuditEvent has no FK to Workspace so events survive workspace soft-delete
 * during the 30-day grace period. The hard-purge cron deletes events first.
 *
 * Action naming convention: '<entity>.<event>' in snake_case
 *   proposal.sent, proposal.approved, proposal.lost
 *   invoice.sent, invoice.paid
 *   member.invited, member.joined
 *   workspace.delete_requested
 *   token.regenerated
 */

import { db } from '@/lib/db'

// Cast type — AuditEvent types are generated after `prisma generate`.
// Until then (and after) this cast pattern keeps TS happy exactly like
// WorkspaceInvitation in team.ts.
type AuditEventCreate = {
  create: (args: {
    data: {
      workspaceId: string
      actorId?:    string | null
      action:      string
      entityType?: string | null
      entityId?:   string | null
      metadata?:   Record<string, unknown> | null
    }
  }) => Promise<unknown>
  findMany: (args: object) => Promise<AuditEventRow[]>
}

type DbWithAudit = typeof db & { auditEvent: AuditEventCreate }

export type AuditEventRow = {
  id:          string
  workspaceId: string
  actorId:     string | null
  action:      string
  entityType:  string | null
  entityId:    string | null
  metadata:    Record<string, unknown> | null
  createdAt:   Date
}

const dba = db as unknown as DbWithAudit

export async function logAuditEvent(params: {
  workspaceId: string
  actorId?:    string | null  // User.id | 'public' | null (system)
  action:      string
  entityType?: string
  entityId?:   string
  metadata?:   Record<string, unknown>
}): Promise<void> {
  try {
    await dba.auditEvent.create({
      data: {
        workspaceId: params.workspaceId,
        actorId:     params.actorId ?? null,
        action:      params.action,
        entityType:  params.entityType ?? null,
        entityId:    params.entityId ?? null,
        metadata:    params.metadata ?? null,
      },
    })
  } catch (err) {
    // Non-fatal — never let audit log failure break the calling action.
    console.error('[logAuditEvent]', err)
  }
}

/** Fetch the last N audit events for a workspace. Used on the Settings page. */
export async function getRecentAuditEvents(
  workspaceId: string,
  limit = 10,
): Promise<AuditEventRow[]> {
  try {
    return await dba.auditEvent.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    })
  } catch {
    return []
  }
}
