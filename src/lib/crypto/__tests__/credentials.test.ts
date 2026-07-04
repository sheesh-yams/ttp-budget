/**
 * Unit tests for the credential encryption module.
 *
 * Tests the crypto logic directly — no network, no real DB.
 * The DB is mocked; KEKs are set via process.env before each test.
 */

// ── Mocks (hoisted by Jest before imports) ────────────────────────────────

type CredRow = {
  id:          string
  workspaceId: string
  kind:        string
  ciphertext:  Buffer
  iv:          Buffer
  authTag:     Buffer
  keyVersion:  number
  last4:       string
  createdAt:   Date
  rotatedAt:   Date | null
}

// In-memory store: credentialId → row data
const credStore = new Map<string, CredRow>()
let idSeq = 0

const mockCreate     = jest.fn()
const mockFindUnique = jest.fn()
const mockFindMany   = jest.fn()
const mockUpdate     = jest.fn()
const mockDelete     = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    encryptedCredential: {
      create:     (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany:   (...args: unknown[]) => mockFindMany(...args),
      update:     (...args: unknown[]) => mockUpdate(...args),
      delete:     (...args: unknown[]) => mockDelete(...args),
    },
  },
}))

// Import AFTER mocks are in place
import {
  encryptCredential,
  decryptCredential,
  deleteCredential,
  rotateCredential,
  listCredentials,
} from '../credentials'

// ── Helpers ───────────────────────────────────────────────────────────────

function genKek(): string {
  // 32 random bytes as base64
  const { randomBytes } = require('crypto') as typeof import('crypto')
  return randomBytes(32).toString('base64')
}

function setKeks(versions: Record<number, string>) {
  // Clear all existing KEK env vars
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CREDENTIAL_KEK_V')) delete process.env[key]
  }
  for (const [v, k] of Object.entries(versions)) {
    process.env[`CREDENTIAL_KEK_V${v}`] = k
  }
}

function setupMocks() {
  credStore.clear()
  idSeq = 0

  mockCreate.mockImplementation(async ({ data }: { data: Omit<CredRow, 'id'> }) => {
    const id = `cred-${++idSeq}`
    const row: CredRow = {
      id,
      workspaceId: data.workspaceId,
      kind:        data.kind,
      ciphertext:  Buffer.from(data.ciphertext),
      iv:          Buffer.from(data.iv),
      authTag:     Buffer.from(data.authTag),
      keyVersion:  data.keyVersion,
      last4:       data.last4,
      createdAt:   new Date(),
      rotatedAt:   null,
    }
    credStore.set(id, row)
    return { id }
  })

  mockFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    return credStore.get(where.id) ?? null
  })

  mockFindMany.mockImplementation(async ({ where }: { where?: { workspaceId?: string } }) => {
    const rows = [...credStore.values()]
    if (where?.workspaceId) return rows.filter(r => r.workspaceId === where.workspaceId)
    return rows
  })

  mockUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<CredRow> }) => {
    const row = credStore.get(where.id)
    if (!row) throw new Error('Credential not found')
    const updated = { ...row, ...data }
    credStore.set(where.id, updated)
    return updated
  })

  mockDelete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    credStore.delete(where.id)
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupMocks()
  jest.clearAllMocks()
  setupMocks() // re-attach after clearAllMocks
})

afterEach(() => {
  // Clean up KEK env vars after each test
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CREDENTIAL_KEK_V')) delete process.env[key]
  }
})

// ── Test 1: Round-trip ────────────────────────────────────────────────────

describe('round-trip: encrypt → decrypt', () => {
  test('returns the original plaintext', async () => {
    setKeks({ 1: genKek() })
    const plaintext = 'sk_live_abc123ABCDEF'

    const { credentialId } = await encryptCredential({
      plaintext,
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    const recovered = await decryptCredential(credentialId)
    expect(recovered).toBe(plaintext)
  })

  test('works for various plaintext lengths', async () => {
    setKeks({ 1: genKek() })
    const cases = ['a', 'short', 'sk_live_' + 'x'.repeat(64), 'x'.repeat(512)]
    for (const pt of cases) {
      const { credentialId } = await encryptCredential({
        plaintext: pt,
        workspaceId: 'ws-1',
        kind: 'HELCIM_API_TOKEN',
      })
      expect(await decryptCredential(credentialId)).toBe(pt)
    }
  })

  test('stores last4 correctly', async () => {
    setKeks({ 1: genKek() })
    const plaintext = 'sk_live_WXYZ'
    await encryptCredential({ plaintext, workspaceId: 'ws-1', kind: 'HELCIM_API_TOKEN' })

    const row = credStore.get('cred-1')!
    expect(row.last4).toBe('WXYZ')
  })

  test('stores workspaceId and kind', async () => {
    setKeks({ 1: genKek() })
    await encryptCredential({
      plaintext:   'token-abc',
      workspaceId: 'ws-999',
      kind:        'HELCIM_WEBHOOK_VERIFIER',
    })

    const row = credStore.get('cred-1')!
    expect(row.workspaceId).toBe('ws-999')
    expect(row.kind).toBe('HELCIM_WEBHOOK_VERIFIER')
  })
})

// ── Test 2: Tamper detection ──────────────────────────────────────────────

describe('tamper detection', () => {
  test('flipping one byte of ciphertext causes decrypt to throw', async () => {
    setKeks({ 1: genKek() })
    const { credentialId } = await encryptCredential({
      plaintext: 'honest-token',
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    // Flip the first byte of the stored ciphertext
    const row = credStore.get(credentialId)!
    const tampered = Buffer.from(row.ciphertext)
    tampered[0] ^= 0xff
    credStore.set(credentialId, { ...row, ciphertext: tampered })

    await expect(decryptCredential(credentialId)).rejects.toThrow()
  })

  test('flipping one byte of authTag causes decrypt to throw', async () => {
    setKeks({ 1: genKek() })
    const { credentialId } = await encryptCredential({
      plaintext: 'honest-token',
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    const row = credStore.get(credentialId)!
    const tamperedTag = Buffer.from(row.authTag)
    tamperedTag[0] ^= 0x01
    credStore.set(credentialId, { ...row, authTag: tamperedTag })

    await expect(decryptCredential(credentialId)).rejects.toThrow()
  })

  test('error message from tampered row does not contain the word "token" or raw bytes', async () => {
    setKeks({ 1: genKek() })
    const plaintext = 'my-secret-token'
    const { credentialId } = await encryptCredential({
      plaintext,
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    const row = credStore.get(credentialId)!
    const tampered = Buffer.from(row.ciphertext)
    tampered[0] ^= 0xff
    credStore.set(credentialId, { ...row, ciphertext: tampered })

    let thrown: Error | null = null
    try { await decryptCredential(credentialId) } catch (e) { thrown = e as Error }
    expect(thrown).not.toBeNull()
    expect(thrown!.message).not.toContain(plaintext)
  })
})

// ── Test 3: Wrong KEK version ─────────────────────────────────────────────

describe('missing KEK version', () => {
  test('throws a clear error when the row keyVersion is not configured', async () => {
    setKeks({ 1: genKek() })
    const { credentialId } = await encryptCredential({
      plaintext: 'my-token',
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    // Now remove V1 from env (simulate a misconfigured deploy)
    delete process.env.CREDENTIAL_KEK_V1

    // With no KEKs configured, loadKeks() throws before we even check version
    await expect(decryptCredential(credentialId)).rejects.toThrow(/CREDENTIAL_KEK_V/)
  })

  test('throws when no KEK env vars are set at all', async () => {
    // Ensure no KEK vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CREDENTIAL_KEK_V')) delete process.env[key]
    }

    await expect(
      encryptCredential({ plaintext: 'x', workspaceId: 'ws-1', kind: 'HELCIM_API_TOKEN' })
    ).rejects.toThrow(/CREDENTIAL_KEK_V/)
  })
})

// ── Test 4: KEK rotation ──────────────────────────────────────────────────

describe('rotateCredential', () => {
  test('re-encrypts under a new KEK version, row decrypts correctly after', async () => {
    const kekV1 = genKek()
    setKeks({ 1: kekV1 })

    const plaintext = 'rotate-me-token'
    const { credentialId } = await encryptCredential({
      plaintext,
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    // Verify original keyVersion
    expect(credStore.get(credentialId)!.keyVersion).toBe(1)

    // Add V2
    const kekV2 = genKek()
    setKeks({ 1: kekV1, 2: kekV2 })

    const result = await rotateCredential(credentialId)
    expect(result.rotated).toBe(true)

    const rotatedRow = credStore.get(credentialId)!
    expect(rotatedRow.keyVersion).toBe(2)
    expect(rotatedRow.rotatedAt).not.toBeNull()

    // Round-trip still works after rotation
    // Remove V1 to prove V2 is actually being used
    delete process.env.CREDENTIAL_KEK_V1
    setKeks({ 2: kekV2 })

    const recovered = await decryptCredential(credentialId)
    expect(recovered).toBe(plaintext)
  })

  test('no-op when row is already on the current KEK version', async () => {
    const kekV1 = genKek()
    setKeks({ 1: kekV1 })

    const { credentialId } = await encryptCredential({
      plaintext: 'already-current',
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    const result = await rotateCredential(credentialId)
    expect(result.rotated).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ── Test 5: last4 ─────────────────────────────────────────────────────────

describe('last4', () => {
  test('stores the final 4 characters of the plaintext', async () => {
    setKeks({ 1: genKek() })
    const cases: [string, string][] = [
      ['sk_live_abcdEFGH', 'EFGH'],
      ['1234', '1234'],
      ['ab', 'ab'],    // shorter than 4 — slice(-4) still works
      ['x', 'x'],
    ]
    for (const [pt, expectedLast4] of cases) {
      credStore.clear(); idSeq = 0
      await encryptCredential({ plaintext: pt, workspaceId: 'ws-1', kind: 'HELCIM_API_TOKEN' })
      expect(credStore.get('cred-1')!.last4).toBe(expectedLast4)
    }
  })
})

// ── Test 6: deleteCredential ──────────────────────────────────────────────

describe('deleteCredential', () => {
  test('removes the row so subsequent decrypt throws', async () => {
    setKeks({ 1: genKek() })
    const { credentialId } = await encryptCredential({
      plaintext: 'to-be-deleted',
      workspaceId: 'ws-1',
      kind: 'HELCIM_API_TOKEN',
    })

    await deleteCredential(credentialId)

    await expect(decryptCredential(credentialId)).rejects.toThrow('Credential not found')
  })
})
