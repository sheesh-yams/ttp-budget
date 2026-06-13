#!/usr/bin/env npx tsx
/**
 * scripts/test-payments.ts
 *
 * Security-guard integration tests for POST /api/payments/confirm.
 * Does NOT require a Helcim test account — it tests every layer of the
 * confirm route that can be exercised without a real transaction.
 *
 * What's covered:
 *   [1] Missing / malformed request fields          → 400
 *   [2] Unknown attemptId                           → 404
 *   [3] Wrong secretToken (hash mismatch)           → 403
 *   [4] Tampered rawDataJson (hash fails)           → 422
 *   [5] Replay: attempt already SUCCEEDED           → 409
 *   [6] Replay: attempt EXPIRED                     → 409
 *
 * What's NOT covered here (requires a live Helcim test account):
 *   - Amount mismatch (needs getTransaction() to return a real tx)
 *   - Full SUCCEEDED settlement (needs real Helcim tx + amount match)
 *
 * Usage:
 *   # Against local dev server:
 *   BASE_URL=http://localhost:3000 npx tsx scripts/test-payments.ts
 *
 *   # Against Vercel preview / production:
 *   BASE_URL=https://your-app.vercel.app npx tsx scripts/test-payments.ts
 *
 * The script creates its own PaymentAttempt rows in the DB and deletes
 * them on completion (pass or fail). It never touches real invoices.
 */

import { createHash, randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'

// ── Setup ──────────────────────────────────────────────────────────────────

const db     = new PrismaClient()
const BASE   = process.env.BASE_URL ?? 'http://localhost:3000'
const ENDPOINT = `${BASE}/api/payments/confirm`

let passed = 0
let failed = 0
const cleanup: string[] = []   // attempt IDs to delete at the end

// ── Helpers ────────────────────────────────────────────────────────────────

function sha256(s: string) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function secret() {
  return randomBytes(16).toString('hex')
}

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let json: Record<string, unknown> = {}
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, json }
}

function ok(label: string, condition: boolean, extra = '') {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}${extra ? `  (${extra})` : ''}`)
    failed++
  }
}

/** Create a test PaymentAttempt row in the DB with a known secretToken. */
async function makeAttempt(
  invoiceId: string,
  workspaceId: string,
  secretToken: string,
  status: 'INITIATED' | 'SUCCEEDED' | 'EXPIRED' = 'INITIATED',
) {
  const idempotencyKey = `test:${randomBytes(8).toString('hex')}`
  const row = await (db as unknown as {
    paymentAttempt: {
      create: (a: object) => Promise<{ id: string }>
    }
  }).paymentAttempt.create({
    data: {
      workspaceId,
      invoiceId,
      provider:        'HELCIM',
      status,
      amountCents:     100,   // $1.00 — irrelevant for these tests
      currency:        'USD',
      checkoutToken:   'test-checkout-token',
      secretTokenHash: sha256(secretToken),
      idempotencyKey,
      ...(status !== 'INITIATED' ? { resolvedAt: new Date() } : {}),
      // For SUCCEEDED we also need a unique providerRef
      ...(status === 'SUCCEEDED' ? { providerRef: `test-${Date.now()}` } : {}),
    },
    select: { id: true },
  })
  cleanup.push(row.id)
  return row.id
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function t1_missing_fields() {
  console.log('\n[1]  Missing / malformed fields  →  400')

  const r1 = await post({})
  ok('empty body → 400', r1.status === 400, `got ${r1.status}`)

  const r2 = await post({ attemptId: 'x', rawDataJson: '{}', helcimHash: 'h' })
  ok('missing secretToken → 400', r2.status === 400, `got ${r2.status}`)

  const r3 = await post({ attemptId: 'x', rawDataJson: '{}', secretToken: 's' })
  ok('missing helcimHash → 400', r3.status === 400, `got ${r3.status}`)

  const r4 = await post({ attemptId: '', rawDataJson: '{}', helcimHash: 'h', secretToken: 's' })
  ok('empty string fields → 400', r4.status === 400, `got ${r4.status}`)
}

async function t2_not_found() {
  console.log('\n[2]  Unknown attemptId  →  404')
  const r = await post({
    attemptId:   'cm000000000000000000000000',
    rawDataJson: '{}',
    helcimHash:  'abc',
    secretToken: 'fake',
  })
  ok('unknown attemptId → 404', r.status === 404, `got ${r.status}`)
}

async function t3_wrong_secret(invoiceId: string, workspaceId: string) {
  console.log('\n[3]  Wrong secretToken  →  403')
  const realSecret = secret()
  const id = await makeAttempt(invoiceId, workspaceId, realSecret)

  const r = await post({
    attemptId:   id,
    rawDataJson: '{}',
    helcimHash:  'abc',
    secretToken: 'definitely-not-the-right-secret',
  })
  ok('wrong secretToken → 403', r.status === 403, `got ${r.status}`)
}

async function t4_tampered_data(invoiceId: string, workspaceId: string) {
  console.log('\n[4]  Tampered rawDataJson (hash mismatch)  →  422')
  const realSecret = secret()
  const id = await makeAttempt(invoiceId, workspaceId, realSecret)

  // Build a hash for the original data ...
  const originalData  = JSON.stringify({ transactionId: '99999', amount: '1.00', status: 'APPROVED' })
  const legitimateHash = sha256(JSON.stringify(JSON.parse(originalData)) + realSecret)

  // ... but submit different data with that hash
  const tamperedData = JSON.stringify({ transactionId: '99999', amount: '0.01', status: 'APPROVED' })

  const r = await post({
    attemptId:   id,
    rawDataJson: tamperedData,      // ← swapped amount
    helcimHash:  legitimateHash,    // ← hash was for original data
    secretToken: realSecret,
  })
  ok('tampered rawDataJson → 422', r.status === 422, `got ${r.status}`)
}

async function t5_replay_succeeded(invoiceId: string, workspaceId: string) {
  console.log('\n[5]  Replay: SUCCEEDED attempt  →  409')
  const realSecret = secret()
  const id = await makeAttempt(invoiceId, workspaceId, realSecret, 'SUCCEEDED')

  const r = await post({
    attemptId:   id,
    rawDataJson: '{}',
    helcimHash:  'abc',
    secretToken: realSecret,
  })
  ok('SUCCEEDED attempt → 409', r.status === 409, `got ${r.status}`)
}

async function t6_replay_expired(invoiceId: string, workspaceId: string) {
  console.log('\n[6]  Replay: EXPIRED attempt  →  409')
  const realSecret = secret()
  const id = await makeAttempt(invoiceId, workspaceId, realSecret, 'EXPIRED')

  const r = await post({
    attemptId:   id,
    rawDataJson: '{}',
    helcimHash:  'abc',
    secretToken: realSecret,
  })
  ok('EXPIRED attempt → 409', r.status === 409, `got ${r.status}`)
}

// ── Teardown ───────────────────────────────────────────────────────────────

async function teardown() {
  if (cleanup.length === 0) return
  await (db as unknown as {
    paymentAttempt: { deleteMany: (a: object) => Promise<unknown> }
  }).paymentAttempt.deleteMany({
    where: { id: { in: cleanup } },
  })
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════')
  console.log('  Payment confirm route — security guard tests')
  console.log(`  Target : ${ENDPOINT}`)
  console.log('══════════════════════════════════════════════════')

  // Tests that don't need any DB data
  await t1_missing_fields()
  await t2_not_found()

  // Tests that create PaymentAttempt rows — need a real invoice to attach to
  const invoice = await db.invoice.findFirst({
    where: { status: { in: ['SENT', 'VIEWED', 'PAID'] } },
    select: { id: true, workspaceId: true },
  })

  if (!invoice) {
    console.warn('\n⚠  No SENT/VIEWED/PAID invoice found in DB.')
    console.warn('   Send at least one invoice, then re-run to cover tests 3–6.\n')
  } else {
    await t3_wrong_secret(invoice.id, invoice.workspaceId)
    await t4_tampered_data(invoice.id, invoice.workspaceId)
    await t5_replay_succeeded(invoice.id, invoice.workspaceId)
    await t6_replay_expired(invoice.id, invoice.workspaceId)
  }

  await teardown()

  const total = passed + failed
  console.log('\n══════════════════════════════════════════════════')
  console.log(`  ${passed}/${total} passed${failed > 0 ? `  ·  ${failed} FAILED` : '  ·  all green ✓'}`)
  console.log('══════════════════════════════════════════════════\n')

  if (failed > 0) process.exit(1)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
