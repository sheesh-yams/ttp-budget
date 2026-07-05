/**
 * migrate-ttp-helcim.ts
 *
 * One-time migration: reads HELCIM_API_TOKEN (and optionally HELCIM_WEBHOOK_VERIFIER)
 * from env, validates the token against Helcim's API, encrypts it under the KEK,
 * and writes the credential ID to WorkspacePaymentConfig.
 *
 * Usage:
 *   npx tsx scripts/migrate-ttp-helcim.ts --workspace <workspaceId>          # dry run
 *   npx tsx scripts/migrate-ttp-helcim.ts --workspace <workspaceId> --apply
 *
 * Prerequisites (in order):
 *   1. Generate a KEK:  openssl rand -base64 32
 *   2. Set CREDENTIAL_KEK_V1=<output> in Railway AND in .env.local.
 *   3. Deploy Railway so the runtime can decrypt at request time.
 *   4. Run in Neon SQL:
 *        UPDATE "WorkspacePaymentConfig"
 *        SET "helcimEnabled" = true
 *        WHERE "workspaceId" = '<id>';
 *   5. Run this script with --apply.
 *   6. Remove HELCIM_API_TOKEN (and HELCIM_WEBHOOK_VERIFIER) from Railway env. Redeploy.
 *
 * After --apply the payment button reappears and Helcim charges are live.
 */

import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(__dirname, '../.env.local') })

import { db } from '../src/lib/db'
import { encryptCredential } from '../src/lib/crypto/credentials'

// ── CLI args ───────────────────────────────────────────────────────────────

const apply        = process.argv.includes('--apply')
const skipValidate = process.argv.includes('--skip-validate')

const wsIdx       = process.argv.indexOf('--workspace')
const workspaceId = wsIdx !== -1 ? process.argv[wsIdx + 1] : undefined

if (!workspaceId) {
  console.error('Usage: npx tsx scripts/migrate-ttp-helcim.ts --workspace <workspaceId> [--apply]')
  console.error('\nTo find your workspace ID, run in Neon:')
  console.error("  SELECT id, name FROM \"Workspace\" WHERE name ILIKE '%third place%';")
  process.exit(1)
}

// ── DB cast ────────────────────────────────────────────────────────────────

type ConfigRow = {
  workspaceId:             string
  helcimEnabled:           boolean
  helcimCredentialId:      string | null
  helcimWebhookVerifierId: string | null
  provider:                string
}

type MigDb = {
  workspacePaymentConfig: {
    findUnique: (args: object) => Promise<ConfigRow | null>
    update:     (args: object) => Promise<unknown>
  }
}

function mdb(): MigDb {
  return db as unknown as MigDb
}

// ── Token validation ───────────────────────────────────────────────────────

async function validateHelcimToken(token: string): Promise<void> {
  const res = await fetch('https://api.helcim.com/v2/card-transactions?limit=1', {
    method:  'GET',
    headers: { 'accept': 'application/json', 'api-token': token },
  })

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Helcim rejected the token (HTTP ${res.status}) — check HELCIM_API_TOKEN`)
  }
  // 200 or 422 (no records, but auth succeeded) are both fine
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiToken        = process.env.HELCIM_API_TOKEN ?? ''
  const webhookVerifier = process.env.HELCIM_WEBHOOK_VERIFIER ?? ''

  if (!apiToken) {
    console.error('Error: HELCIM_API_TOKEN is not set in .env.local or env')
    process.exit(1)
  }

  console.log(`\nHelcim credential migration — ${apply ? 'APPLYING' : 'DRY RUN'}`)
  console.log('─'.repeat(55))

  // ── Load workspace config ─────────────────────────────────────────────────
  const row = await mdb().workspacePaymentConfig.findUnique({
    where:  { workspaceId },
    select: {
      workspaceId:             true,
      helcimEnabled:           true,
      helcimCredentialId:      true,
      helcimWebhookVerifierId: true,
      provider:                true,
    },
  })

  if (!row) {
    console.error(`Error: No WorkspacePaymentConfig found for workspaceId = ${workspaceId}`)
    process.exit(1)
  }

  console.log(`Workspace:   ${workspaceId}`)
  console.log(`Provider:    ${row.provider}`)
  console.log(`helcimEnabled: ${row.helcimEnabled}`)
  console.log(`Token last4: ...${apiToken.slice(-4)}`)
  console.log(`Verifier:    ${webhookVerifier ? 'present' : 'not set (will skip)'}`)
  console.log()

  if (!row.helcimEnabled) {
    console.error('Error: helcimEnabled = false — grant it first via Neon SQL:')
    console.error(`  UPDATE "WorkspacePaymentConfig"`)
    console.error(`  SET "helcimEnabled" = true`)
    console.error(`  WHERE "workspaceId" = '${workspaceId}';`)
    process.exit(1)
  }

  if (row.helcimCredentialId) {
    console.warn(`Skipping: helcimCredentialId already set (${row.helcimCredentialId}).`)
    console.warn('Clear it in Neon first if you need to re-run.')
    return
  }

  // ── Validate token ────────────────────────────────────────────────────────
  if (skipValidate) {
    console.log('Skipping token validation (--skip-validate).')
  } else {
    process.stdout.write('Validating HELCIM_API_TOKEN... ')
    await validateHelcimToken(apiToken)
    console.log('OK')
  }

  if (!apply) {
    console.log()
    console.log('── Dry run complete ──────────────────────────────────────────')
    console.log('Would create:')
    console.log('  • EncryptedCredential (HELCIM_API_TOKEN)')
    if (webhookVerifier) {
      console.log('  • EncryptedCredential (HELCIM_WEBHOOK_VERIFIER)')
    }
    console.log('  • WorkspacePaymentConfig.helcimCredentialId + provider = HELCIM')
    console.log()
    console.log('Re-run with --apply to write.')
    return
  }

  // ── Encrypt API token ─────────────────────────────────────────────────────
  process.stdout.write('Encrypting HELCIM_API_TOKEN... ')
  const { credentialId: tokenCredId } = await encryptCredential({
    plaintext:   apiToken,
    workspaceId,
    kind:        'HELCIM_API_TOKEN',
  })
  console.log(`stored  id=${tokenCredId}  last4=...${apiToken.slice(-4)}`)

  // ── Encrypt webhook verifier (optional) ───────────────────────────────────
  let verifierCredId: string | null = null
  if (webhookVerifier) {
    process.stdout.write('Encrypting HELCIM_WEBHOOK_VERIFIER... ')
    const { credentialId } = await encryptCredential({
      plaintext:   webhookVerifier,
      workspaceId,
      kind:        'HELCIM_WEBHOOK_VERIFIER',
    })
    verifierCredId = credentialId
    console.log(`stored  id=${verifierCredId}`)
  }

  // ── Write to WorkspacePaymentConfig ───────────────────────────────────────
  process.stdout.write('Updating WorkspacePaymentConfig... ')
  await mdb().workspacePaymentConfig.update({
    where: { workspaceId },
    data: {
      provider:                'HELCIM',
      helcimCredentialId:      tokenCredId,
      helcimWebhookVerifierId: verifierCredId,
    },
  })
  console.log('done')

  // ── Checklist ─────────────────────────────────────────────────────────────
  console.log()
  console.log('── Migration complete ────────────────────────────────────────')
  console.log()
  console.log('Next steps:')
  console.log('  1. Remove HELCIM_API_TOKEN from Railway environment variables.')
  if (webhookVerifier) {
    console.log('  2. Remove HELCIM_WEBHOOK_VERIFIER from Railway environment variables.')
  }
  console.log('  3. Keep CREDENTIAL_KEK_V1 in Railway — it decrypts the stored credential.')
  console.log('  4. Redeploy on Railway.')
  console.log('  5. Open a test invoice and confirm the payment button appears.')
  console.log('  6. Run a test payment to confirm end-to-end Helcim flow.')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\nMigration failed:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
  .finally(() => db.$disconnect())
