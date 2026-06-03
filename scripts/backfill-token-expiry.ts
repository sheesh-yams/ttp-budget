/**
 * backfill-token-expiry.ts
 *
 * One-time script: sets publicTokenExpiresAt on existing rows that don't have it.
 *
 * Proposal:   NOW + 90 days
 * Invoice:    NOW + 180 days
 * CallSheet:  shootDate + 14 days  (or NOW + 14 days if shootDate is in the past)
 *
 * Run AFTER `npx prisma db push && npx prisma generate`:
 *   npx tsx scripts/backfill-token-expiry.ts
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const now = new Date()

  // ── Proposals ──────────────────────────────────────────────────────────────
  const proposals = await db.proposal.findMany({
    where: { publicTokenExpiresAt: null },
    select: { id: true },
  })
  const proposalExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  await db.proposal.updateMany({
    where: { publicTokenExpiresAt: null },
    data:  { publicTokenExpiresAt: proposalExpiry },
  })
  console.log(`✓ Proposals backfilled: ${proposals.length} rows → ${proposalExpiry.toISOString()}`)

  // ── Invoices ───────────────────────────────────────────────────────────────
  const invoices = await db.invoice.findMany({
    where: { publicTokenExpiresAt: null },
    select: { id: true },
  })
  const invoiceExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  await db.invoice.updateMany({
    where: { publicTokenExpiresAt: null },
    data:  { publicTokenExpiresAt: invoiceExpiry },
  })
  console.log(`✓ Invoices backfilled: ${invoices.length} rows → ${invoiceExpiry.toISOString()}`)

  // ── Call sheets — expiry relative to shoot date ────────────────────────────
  const callSheets = await db.callSheet.findMany({
    where: { publicTokenExpiresAt: null },
    select: { id: true, shootDate: true },
  })
  let csCount = 0
  for (const cs of callSheets) {
    const base   = cs.shootDate > now ? cs.shootDate : now
    const expiry = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000)
    await db.callSheet.update({
      where: { id: cs.id },
      data:  { publicTokenExpiresAt: expiry },
    })
    csCount++
  }
  console.log(`✓ Call sheets backfilled: ${csCount} rows`)

  console.log('\nDone.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
