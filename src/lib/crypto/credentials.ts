import 'server-only'

/**
 * AES-256-GCM envelope encryption for third-party payment credentials.
 *
 * KEK (key-encryption key) comes from env vars named CREDENTIAL_KEK_V<n>:
 *   CREDENTIAL_KEK_V1="<32-byte base64>"
 *   CREDENTIAL_KEK_V2="<32-byte base64>"   ← add a new version to rotate
 *
 * Always encrypts with the HIGHEST version present; decrypts with the version
 * recorded on the credential row. This enables zero-downtime key rotation.
 *
 * INVARIANTS — violating any of these is a security bug:
 *  1. Plaintext NEVER appears in: logs, thrown errors, ActionResult payloads,
 *     client components, or Prisma query logs.
 *  2. decryptCredential is only importable server-side ('server-only' above).
 *  3. There is no "reveal" path. The UI shows last4 only.
 *  4. The caller is responsible for workspace scoping — this module uses raw
 *     `db` (no Clerk session in webhook contexts). Never call decryptCredential
 *     for a credentialId you did not derive from an authenticated/verified context.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { db } from '@/lib/db'

// ── KEK loading ────────────────────────────────────────────────────────────

const KEK_PREFIX = 'CREDENTIAL_KEK_V'

function loadKeks(): Map<number, Buffer> {
  const keks = new Map<number, Buffer>()
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(KEK_PREFIX) || !value) continue
    const version = parseInt(name.slice(KEK_PREFIX.length), 10)
    if (Number.isNaN(version)) continue
    const key = Buffer.from(value, 'base64')
    if (key.length !== 32) throw new Error(`${name} must be 32 bytes (base64-encoded)`)
    keks.set(version, key)
  }
  if (keks.size === 0) throw new Error('No CREDENTIAL_KEK_V* env var configured')
  return keks
}

function currentKekVersion(keks: Map<number, Buffer>): number {
  return Math.max(...keks.keys())
}

// ── DB shape helpers (pre-generate cast pattern) ───────────────────────────

type CredRow = {
  id:         string
  workspaceId: string
  kind:       string
  ciphertext: Buffer
  iv:         Buffer
  authTag:    Buffer
  keyVersion: number
  last4:      string
  createdAt:  Date
  rotatedAt:  Date | null
}

type CredDb = {
  encryptedCredential: {
    create:     (args: object) => Promise<{ id: string }>
    findUnique: (args: object) => Promise<CredRow | null>
    findMany:   (args: object) => Promise<CredRow[]>
    update:     (args: object) => Promise<CredRow>
    delete:     (args: object) => Promise<void>
  }
}

function credDb(): CredDb {
  return db as unknown as CredDb
}

// ── encryptCredential ──────────────────────────────────────────────────────

export async function encryptCredential(args: {
  plaintext:   string
  workspaceId: string
  kind:        'HELCIM_API_TOKEN' | 'HELCIM_WEBHOOK_VERIFIER'
}): Promise<{ credentialId: string }> {
  const keks    = loadKeks()
  const version = currentKekVersion(keks)
  const iv      = randomBytes(12)

  const cipher     = createCipheriv('aes-256-gcm', keks.get(version)!, iv)
  const ciphertext = Buffer.concat([cipher.update(args.plaintext, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()

  const row = await credDb().encryptedCredential.create({
    data: {
      workspaceId: args.workspaceId,
      kind:        args.kind,
      ciphertext,
      iv,
      authTag,
      keyVersion:  version,
      last4:       args.plaintext.slice(-4),
    },
    select: { id: true },
  })

  return { credentialId: row.id }
}

// ── decryptCredential ──────────────────────────────────────────────────────

export async function decryptCredential(credentialId: string): Promise<string> {
  const row = await credDb().encryptedCredential.findUnique({ where: { id: credentialId } })
  // Generic error — never include the id or workspace in the message (avoid enumeration)
  if (!row) throw new Error('Credential not found')

  const keks = loadKeks()
  const key  = keks.get(row.keyVersion)
  if (!key) throw new Error(`KEK version ${row.keyVersion} is not configured`)

  const decipher = createDecipheriv('aes-256-gcm', key, row.iv)
  decipher.setAuthTag(row.authTag)

  // GCM auth failure (tampered ciphertext / wrong key) throws here — let it propagate
  // as a generic error so no timing / content information is exposed.
  return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString('utf8')
}

// ── deleteCredential ───────────────────────────────────────────────────────

export async function deleteCredential(credentialId: string): Promise<void> {
  await credDb().encryptedCredential.delete({ where: { id: credentialId } })
}

// ── rotateCredential (used by the rotation script) ────────────────────────

/**
 * Re-encrypt a single credential row under the current (highest) KEK version.
 * No-op if the row is already on the current version.
 * Throws on decryption failure (tampered/corrupt row) — the caller handles it.
 */
export async function rotateCredential(credentialId: string): Promise<{ rotated: boolean }> {
  const row = await credDb().encryptedCredential.findUnique({ where: { id: credentialId } })
  if (!row) throw new Error('Credential not found')

  const keks           = loadKeks()
  const targetVersion  = currentKekVersion(keks)
  if (row.keyVersion === targetVersion) return { rotated: false }

  // Decrypt with old KEK
  const oldKey = keks.get(row.keyVersion)
  if (!oldKey) throw new Error(`KEK version ${row.keyVersion} is not configured`)

  const decipher = createDecipheriv('aes-256-gcm', oldKey, row.iv)
  decipher.setAuthTag(row.authTag)
  const plaintext = Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString('utf8')

  // Re-encrypt with newest KEK
  const newKey    = keks.get(targetVersion)!
  const newIv     = randomBytes(12)
  const cipher    = createCipheriv('aes-256-gcm', newKey, newIv)
  const newCipher = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const newTag    = cipher.getAuthTag()

  await credDb().encryptedCredential.update({
    where: { id: credentialId },
    data: {
      ciphertext: newCipher,
      iv:         newIv,
      authTag:    newTag,
      keyVersion: targetVersion,
      rotatedAt:  new Date(),
    },
  })

  return { rotated: true }
}

// ── listCredentialsByWorkspace (used by rotation script) ──────────────────

export async function listCredentials(workspaceId?: string): Promise<CredRow[]> {
  const where = workspaceId ? { workspaceId } : {}
  return credDb().encryptedCredential.findMany({ where })
}
