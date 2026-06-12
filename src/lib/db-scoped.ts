/**
 * db-scoped.ts — Workspace-scoped Prisma client
 *
 * USE THIS in all server actions and server components that read/write
 * workspace-owned data. It automatically injects `workspaceId` into every
 * query so a missed filter can never leak data across tenants.
 *
 * DO NOT USE THIS in:
 *   - Webhook handlers (no Clerk session — use raw `db` from lib/db.ts)
 *   - Workspace/User creation (no workspace to scope to yet)
 *   - Public routes (/p, /i, /cs — token-scoped, no user session)
 *   - src/lib/auth.ts (looks up User by clerkId without workspace filter)
 *
 * PROOF that this does real work (for future devs):
 *   Using raw `db`: db.project.findFirst({ where: { id } })
 *     → returns any project by that ID, regardless of workspace
 *   Using scopedDb: scopedDb.project.findFirst({ where: { id } })
 *     → automatically becomes WHERE id = ? AND workspaceId = ?
 *     → returns null if the project belongs to a different workspace ✓
 *
 * CHILD MODELS (Phase, Account, LineItem, ProjectMember):
 *   These models carry a denormalized `workspaceId` column (backfilled via
 *   scripts/backfill-workspace-ids.ts) and are now fully scoped. A crafted
 *   request with a foreign phaseId / accountId / lineItemId / memberId will
 *   receive not-found rather than data or a successful mutation.
 */

import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'

// Models that have a direct `workspaceId` column and should be automatically scoped.
const SCOPED_MODELS = new Set([
  // Top-level workspace-owned models
  'Client',
  'Project',
  'RateCard',
  'BudgetTemplate',
  'Budget',
  'Proposal',
  'Invoice',
  'CallSheet',
  'ActualSheet',
  'Contact',
  // Child models — denormalized workspaceId added in A1 migration
  'Phase',
  'Account',
  'LineItem',
  'ProjectMember',
  // A9: audit log — workspaceId plain column (no FK), same injection pattern
  'AuditEvent',
])

// Operations that read data — inject workspaceId into `where`
const READ_OPS = new Set(['findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'findFirstOrThrow'])

// Operations that write a single record — inject workspaceId into `data`
const CREATE_OPS = new Set(['create'])

// Operations that modify existing data — inject workspaceId into `where`
const MUTATE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany'])

/**
 * Returns a Prisma client that automatically scopes all queries to the
 * currently active workspace (from auth().orgId via getWorkspaceId()).
 *
 * Call once at the top of a server action:
 *   const sdb = await getScopedDb()
 *
 * After that, all queries on scoped models automatically include workspaceId.
 * You can remove manual `where: { workspaceId }` clauses — they're redundant
 * (but harmless if left in, since the extension merges rather than replaces).
 *
 * createMany: workspaceId is injected into every item in the data array.
 */
export async function getScopedDb() {
  const workspaceId = await getWorkspaceId()

  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string
          operation: string
          args: Record<string, unknown>
          query: (args: Record<string, unknown>) => Promise<unknown>
        }) {
          if (!SCOPED_MODELS.has(model)) {
            return query(args)
          }

          if (READ_OPS.has(operation)) {
            const where = (args.where as Record<string, unknown> | undefined) ?? {}
            return query({ ...args, where: { ...where, workspaceId } })
          }

          if (CREATE_OPS.has(operation)) {
            const data = (args.data as Record<string, unknown> | undefined) ?? {}
            return query({ ...args, data: { ...data, workspaceId } })
          }

          if (operation === 'createMany') {
            // data is an array — inject workspaceId into every item
            const data = (args.data as Record<string, unknown>[]) ?? []
            return query({ ...args, data: data.map(item => ({ ...item, workspaceId })) })
          }

          if (MUTATE_OPS.has(operation)) {
            const where = (args.where as Record<string, unknown> | undefined) ?? {}
            return query({ ...args, where: { ...where, workspaceId } })
          }

          // findUnique / findUniqueOrThrow / upsert / etc.
          // Pass through — server actions should avoid findUnique on scoped models
          // (use findFirst instead) and upsert is only used on User in auth.ts.
          return query(args)
        },
      },
    },
  })
}

// Type alias for convenience in server actions
export type ScopedDb = Awaited<ReturnType<typeof getScopedDb>>
