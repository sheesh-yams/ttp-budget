/**
 * Report the UUID v4 vs legacy token split across all public-token models.
 *
 * Run: npx tsx scripts/report-token-formats.ts
 *
 * UUID v4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
 * Anything else is legacy (CUID v1 or other).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function classify(token: string): 'uuid' | 'legacy' {
  return UUID_V4.test(token) ? 'uuid' : 'legacy'
}

type Row = { publicToken: string; status: string }

function summarise(model: string, rows: Row[]) {
  const uuid   = rows.filter(r => classify(r.publicToken) === 'uuid')
  const legacy = rows.filter(r => classify(r.publicToken) === 'legacy')

  const byStatus: Record<string, number> = {}
  for (const r of legacy) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  }
  const detail = Object.entries(byStatus)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ')

  const legacyStr = legacy.length > 0
    ? `${legacy.length} legacy   (${detail})`
    : `${legacy.length} legacy`

  console.log(`${model.padEnd(18)} ${String(uuid.length).padStart(4)} UUID   ${legacyStr}`)
  return { uuid: uuid.length, legacy: legacy.length, rows: legacy }
}

async function main() {
  console.log('\n── Token Format Report ─────────────────────────────────────────')
  console.log('   UUID v4 = safe  |  legacy = CUID v1 or other (low entropy)\n')

  const [proposals, invoices, callSheets, deliveryPages, deliverableAssets] = await Promise.all([
    prisma.proposal.findMany({ select: { publicToken: true, status: true } }),
    prisma.invoice.findMany({ select: { publicToken: true, status: true } }),
    prisma.callSheet.findMany({ select: { publicToken: true, status: true } }),
    prisma.deliveryPage.findMany({ select: { publicToken: true, status: true } }),
    prisma.deliverableAsset.findMany({ select: { publicToken: true, status: true } }),
  ])

  const results = {
    Proposal:        summarise('Proposal',        proposals),
    Invoice:         summarise('Invoice',         invoices),
    CallSheet:       summarise('CallSheet',       callSheets),
    DeliveryPage:    summarise('DeliveryPage',    deliveryPages),
    DeliverableAsset: summarise('DeliverableAsset', deliverableAssets),
  }

  const totalLegacy = Object.values(results).reduce((s, r) => s + r.legacy, 0)
  const totalUuid   = Object.values(results).reduce((s, r) => s + r.uuid, 0)

  console.log('\n' + '─'.repeat(62))
  console.log(`Total: ${totalUuid} UUID v4,  ${totalLegacy} legacy`)

  if (totalLegacy === 0) {
    console.log('\n✅ All tokens are UUID v4. No rotation needed.')
  } else {
    console.log('\n⚠  Legacy tokens remain. Rotation steps:')
    console.log('  1. npx tsx scripts/rotate-public-tokens.ts --live')
    console.log('     (rotates DRAFT/inactive — no link breakage)')
    console.log('  2. Re-run this report. Review remaining live-doc tokens.')
    console.log('  3. Notify clients of link changes, then run with --live --all')
  }
  console.log('─'.repeat(62) + '\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
