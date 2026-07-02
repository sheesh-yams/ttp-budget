/**
 * Audit: every Prisma model that carries a workspaceId column
 * must appear in SCOPED_MODELS, with documented exceptions.
 *
 * Run: npx tsx scripts/audit-scoped-models.ts
 * Exit code 1 if any unregistered model is found (CI-friendly).
 */
import { Prisma } from '@prisma/client'
import { SCOPED_MODELS } from '../src/lib/db-scoped'

// Models that intentionally carry workspaceId but are NOT scoped, with the reason.
// Anything not in this list and not in SCOPED_MODELS fails.
const DOCUMENTED_EXCEPTIONS: Record<string, string> = {
  User: 'always looked up by clerkId (Clerk-provided, unique) via auth.ts — no server action accepts a raw userId from external callers, so there is no IDOR vector',
  WorkspaceInvitation: 'read/written by invite-flow helpers before a session exists; never exposed via server actions that accept foreign IDs',
  WebhookEvent: 'written by webhook handlers with no auth session; reads always route through PaymentAttempt',
}

const modelsWithWorkspaceId = Prisma.dmmf.datamodel.models
  .filter(m => m.fields.some(f => f.name === 'workspaceId'))
  .map(m => m.name)

const scoped = new Set<string>(SCOPED_MODELS)
const failures: string[] = []

console.log('\nModels carrying workspaceId:')
for (const model of modelsWithWorkspaceId) {
  if (scoped.has(model)) {
    console.log(`  ✅ ${model} — scoped`)
    continue
  }
  if (model in DOCUMENTED_EXCEPTIONS) {
    console.log(`  ⚠️  ${model} — exception: ${DOCUMENTED_EXCEPTIONS[model]}`)
    continue
  }
  console.log(`  ❌ ${model} — UNREGISTERED`)
  failures.push(model)
}

if (failures.length) {
  console.error(`\n❌ UNREGISTERED MODELS WITH workspaceId:\n${failures.map(f => `  - ${f}`).join('\n')}`)
  console.error('\nAdd each to SCOPED_MODELS in src/lib/db-scoped.ts, or document the exception above with a reason.')
  process.exit(1)
}
console.log(`\n✅ All ${modelsWithWorkspaceId.length} workspaceId-carrying models are scoped or documented.`)
