/**
 * Adversarial verification for newly scoped models.
 *
 * For each model added to SCOPED_MODELS in the Phase 1 hardening:
 *   1. Find a real row belonging to workspace A
 *   2. Query it through a workspace-B-scoped client by its primary ID
 *   3. PASS = null (not found). FAIL = data returned (IDOR).
 *
 * Run: npx tsx scripts/verify-scoping.ts
 */
import { db }         from '../src/lib/db'
import { SCOPED_MODELS } from '../src/lib/db-scoped'

// Two real workspaces from the dev DB.
const WORKSPACE_A = 'ttp-workspace'              // The Third Place (production data)
const WORKSPACE_B = 'cmpt7mrzq0000bbe0zo512mc0' // Testing This (empty workspace)

// Fake scopedDb factory for a given workspaceId — mirrors the real getScopedDb logic.
function buildScopedClient(workspaceId: string) {
  const READ_OPS   = new Set(['findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'findFirstOrThrow'])
  const CREATE_OPS = new Set(['create'])
  const MUTATE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany'])

  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model: string; operation: string; args: Record<string, unknown>
          query: (args: Record<string, unknown>) => Promise<unknown>
        }) {
          if (!SCOPED_MODELS.has(model)) return query(args)

          if (READ_OPS.has(operation)) {
            const where = (args.where as Record<string, unknown> | undefined) ?? {}
            return query({ ...args, where: { ...where, workspaceId } })
          }
          if (CREATE_OPS.has(operation)) {
            const data = (args.data as Record<string, unknown> | undefined) ?? {}
            return query({ ...args, data: { ...data, workspaceId } })
          }
          if (MUTATE_OPS.has(operation)) {
            const where = (args.where as Record<string, unknown> | undefined) ?? {}
            return query({ ...args, where: { ...where, workspaceId } })
          }
          return query(args)
        },
      },
    },
  })
}

type TestCase = {
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findInA: (prisma: typeof db) => Promise<{ id: string } | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findByIdInB: (sdb: ReturnType<typeof buildScopedClient>, id: string) => Promise<unknown>
}

const cases: TestCase[] = [
  {
    model: 'Receipt',
    findInA:     (p) => p.receipt.findFirst({ where: { workspaceId: WORKSPACE_A }, select: { id: true } }),
    findByIdInB: (s, id) => s.receipt.findFirst({ where: { id } }),
  },
  {
    model: 'DeliveryPage',
    findInA:     (p) => p.deliveryPage.findFirst({ where: { workspaceId: WORKSPACE_A }, select: { id: true } }),
    findByIdInB: (s, id) => s.deliveryPage.findFirst({ where: { id } }),
  },
  {
    model: 'DeliverableAsset',
    findInA:     (p) => p.deliverableAsset.findFirst({ where: { workspaceId: WORKSPACE_A }, select: { id: true } }),
    findByIdInB: (s, id) => s.deliverableAsset.findFirst({ where: { id } }),
  },
  {
    model: 'Project',
    findInA:     (p) => p.project.findFirst({ where: { workspaceId: WORKSPACE_A }, select: { id: true } }),
    findByIdInB: (s, id) => s.project.findFirst({ where: { id } }),
  },
  {
    model: 'ActualSheet',
    findInA:     (p) => p.actualSheet.findFirst({ where: { workspaceId: WORKSPACE_A }, select: { id: true } }),
    findByIdInB: (s, id) => s.actualSheet.findFirst({ where: { id } }),
  },
]

async function main() {
  const sdbB = buildScopedClient(WORKSPACE_B)
  let passed = 0, failed = 0, skipped = 0

  for (const tc of cases) {
    const row = await tc.findInA(db)
    if (!row) {
      console.log(`⚠️  ${tc.model} — no rows in workspace A, skipping`)
      skipped++
      continue
    }

    const crossResult = await tc.findByIdInB(sdbB, row.id)
    if (crossResult === null) {
      console.log(`✅ ${tc.model} (id=${row.id.slice(0, 8)}…) — cross-workspace query returned null  [PASS]`)
      passed++
    } else {
      console.error(`❌ ${tc.model} (id=${row.id.slice(0, 8)}…) — IDOR: workspace-B client returned a workspace-A row!`)
      failed++
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`)
  await db.$disconnect()
  if (failed > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
