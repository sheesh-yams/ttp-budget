/**
 * /api/cron/purge-workspaces
 *
 * Hard-purges workspaces that were soft-deleted more than 30 days ago.
 * Called by Vercel Cron (see vercel.json). Secured by CRON_SECRET.
 *
 * Order of operations per workspace:
 *   1. Delete AuditEvent rows (no FK cascade — plain workspaceId column)
 *   2. Delete the Workspace (cascades all FK-constrained data)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const GRACE_DAYS = 30

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET from Authorization header (set by Vercel automatically)
  const authHeader = req.headers.get('authorization')
  const expected   = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)

  // Find workspaces past the grace period.
  // Cast via unknown — `deletedAt` is new; types update after `prisma generate`.
  type WorkspaceWithDeleted = { id: string; name: string; deletedAt: Date | null }
  const expired = await (db.workspace.findMany as unknown as (args: object) => Promise<WorkspaceWithDeleted[]>)({
    where:  { deletedAt: { lt: cutoff } },
    select: { id: true, name: true, deletedAt: true },
  })

  if (expired.length === 0) {
    return NextResponse.json({ purged: 0, message: 'No workspaces due for purge' })
  }

  const ids    = expired.map(w => w.id)
  let purged   = 0
  let errored  = 0

  // Process each workspace individually so one failure doesn't block others
  for (const workspace of expired) {
    try {
      // 1. Delete AuditEvents first (no FK cascade)
      await (db as unknown as {
        auditEvent: { deleteMany: (args: object) => Promise<unknown> }
      }).auditEvent.deleteMany({ where: { workspaceId: workspace.id } })

      // 2. Hard-delete the workspace — FK Cascade handles everything else
      await db.workspace.delete({ where: { id: workspace.id } })

      console.log(`[purge-workspaces] Purged workspace ${workspace.id} (${workspace.name}), deletedAt=${workspace.deletedAt?.toISOString()}`)
      purged++
    } catch (err) {
      console.error(`[purge-workspaces] Failed to purge workspace ${workspace.id}:`, err)
      errored++
    }
  }

  return NextResponse.json({
    purged,
    errored,
    workspaceIds: ids,
  })
}
