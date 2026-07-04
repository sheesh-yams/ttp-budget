/**
 * rotate-credential-kek.ts
 *
 * Re-encrypts all EncryptedCredential rows that are on an older KEK version
 * under the current highest-version KEK.
 *
 * Usage:
 *   npx tsx scripts/rotate-credential-kek.ts              # dry-run (no writes)
 *   npx tsx scripts/rotate-credential-kek.ts --apply      # write changes
 *
 * Key rotation workflow:
 *   1. Generate a new key:  openssl rand -base64 32
 *   2. Set CREDENTIAL_KEK_V<n+1> in Railway env (alongside the existing CREDENTIAL_KEK_V<n>)
 *   3. Deploy (both keys present — decrypt with old, encrypt with new)
 *   4. Run this script with --apply
 *   5. Verify all rows are now on the new version (see output summary)
 *   6. Remove the old CREDENTIAL_KEK_V<n> from Railway and redeploy
 *
 * Never remove a KEK version before all rows are rotated off it.
 */

import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(__dirname, '../.env.local') })

import { db } from '../src/lib/db'
import { rotateCredential, listCredentials } from '../src/lib/crypto/credentials'

const apply = process.argv.includes('--apply')

async function main() {
  console.log(`\nCredential KEK rotation — ${apply ? 'APPLYING' : 'DRY RUN'}`)
  console.log('─'.repeat(50))

  // Detect current KEK versions from env
  const kekVersions: number[] = []
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CREDENTIAL_KEK_V')) {
      const v = parseInt(key.slice('CREDENTIAL_KEK_V'.length), 10)
      if (!Number.isNaN(v)) kekVersions.push(v)
    }
  }

  if (kekVersions.length === 0) {
    console.error('ERROR: No CREDENTIAL_KEK_V* env vars found. Cannot rotate.')
    process.exit(1)
  }

  const currentVersion = Math.max(...kekVersions)
  console.log(`KEK versions present: ${kekVersions.sort().join(', ')}`)
  console.log(`Target version:       ${currentVersion}\n`)

  const allRows = await listCredentials()
  const toRotate = allRows.filter(row => row.keyVersion < currentVersion)

  console.log(`Total credentials:    ${allRows.length}`)
  console.log(`Already current:      ${allRows.length - toRotate.length}`)
  console.log(`Need rotation:        ${toRotate.length}`)

  if (toRotate.length === 0) {
    console.log('\nAll rows are on the current KEK version. Nothing to do.')
    return
  }

  if (!apply) {
    console.log('\nRun with --apply to rotate these rows:')
    for (const row of toRotate) {
      console.log(`  ${row.id}  ws=${row.workspaceId}  kind=${row.kind}  v${row.keyVersion} → v${currentVersion}`)
    }
    console.log('\nDry-run complete — no changes made.')
    return
  }

  // ── Apply: rotate each row ───────────────────────────────────────────────
  let rotated = 0
  const failed: string[] = []

  for (const row of toRotate) {
    try {
      const result = await rotateCredential(row.id)
      if (result.rotated) {
        rotated++
        console.log(`  ✓ ${row.id}  (v${row.keyVersion} → v${currentVersion})`)
      }
    } catch (err) {
      // Per-row isolation: one corrupt row doesn't halt the batch
      failed.push(row.id)
      const msg = err instanceof Error ? err.message : String(err)
      // Never include plaintext fragments — err.message from GCM failure is safe
      console.error(`  ✗ ${row.id}  FAILED: ${msg}`)
    }
  }

  console.log('\n─'.repeat(50))
  console.log(`Rotated: ${rotated} / ${toRotate.length}`)
  if (failed.length > 0) {
    console.error(`Failed:  ${failed.length}  IDs: ${failed.join(', ')}`)
    console.error('         Investigate failed rows before removing the old KEK version.')
    process.exit(1)
  }
  console.log('KEK rotation complete.')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
