// Deal memo vendor link + e-signature (deal memos Phase 2). Server-only;
// plain module, not 'use server' — nothing here is a callable endpoint.
//
// Lifecycle on top of DealMemoStatus (CONFIRMED = awarded internally):
//   awarded → sent (link emailed, terms frozen in sentSnapshot) → viewed →
//   signed (vendor signed the frozen snapshot). Cancel: status CANCELLED.

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { scopedDbFor, type ScopedDb } from '@/lib/db-scoped'
import { toVendorDealMemo, type VendorDealMemo } from '@/lib/deal-memo-vendor-view'

/** How long a sent link works (renewed on every re-send). */
export const DEAL_MEMO_LINK_DAYS = 60

/** The word a user must type to cancel a deal memo. */
export const CANCEL_WORD = 'CANCEL'

/** Typed confirmation for a cancel: exactly CANCEL, ignoring surrounding spaces and case. */
export function isCancelConfirmation(text: unknown): boolean {
  return typeof text === 'string' && text.trim().toUpperCase() === CANCEL_WORD
}

export function normEmail(e: string): string {
  return e.trim().toLowerCase()
}

/**
 * Whether the terms the vendor would see now differ from what was sent —
 * the editor shows "re-send" when they do. Compares the vendor DTOs only.
 */
export function vendorViewChanged(live: VendorDealMemo, sent: unknown): boolean {
  if (!sent || typeof sent !== 'object') return true
  const pick = (v: VendorDealMemo) => JSON.stringify({
    position: v.position, startDate: v.startDate, endDate: v.endDate, days: v.days, workDayHours: v.workDayHours,
    fees: v.fees.map(f => [f.label, f.rateCents, f.unit, f.quantity, f.termsText]),
    sections: v.sections.map(s => [s.title, s.bodyText]),
  })
  return pick(live) !== pick(sent as VendorDealMemo)
}

type Num = number | string | { toString(): string }

/** The raw term inputs — merge tags unresolved. */
export interface DealMemoTermsInput {
  position: string; startDate: Date | null; endDate: Date | null; days: Num
  workDayHours: number; otMultiplier: Num; doubleTimeAfterHours: number; doubleTimeMultiplier: Num; productionZoneMiles: number
  fees:     { label: string; rateCents: number; unit: string; quantity: Num; termsText: string | null }[]
  sections: { title: string; body: string }[]
}

/**
 * Fingerprint of a memo's terms, stored with the snapshot at send. Built from
 * raw inputs (not merge-resolved text), so renaming the project, vendor or
 * studio doesn't make a sent memo "outdated" — only a real term change does.
 * Fees and sections must be in display order; zero-rate fees aren't shown to
 * the vendor and don't count.
 */
export function dealMemoTermsKey(m: DealMemoTermsInput): string {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return createHash('sha256').update(JSON.stringify([
    m.position, day(m.startDate), day(m.endDate), Number(m.days),
    m.workDayHours, Number(m.otMultiplier), m.doubleTimeAfterHours, Number(m.doubleTimeMultiplier), m.productionZoneMiles,
    m.fees.filter(f => f.rateCents > 0).map(f => [f.label, f.rateCents, f.unit, Number(f.quantity), f.termsText ?? '']),
    m.sections.map(s => [s.title, s.body]),
  ])).digest('hex')
}

/** The live terms fingerprint, or null if the memo is gone. */
export async function loadDealMemoTermsKey(sdb: ScopedDb, memoId: string): Promise<string | null> {
  const memo = await sdb.dealMemo.findFirst({
    where:  { id: memoId },
    select: {
      position: true, startDate: true, endDate: true, days: true,
      workDayHours: true, otMultiplier: true, doubleTimeAfterHours: true, doubleTimeMultiplier: true, productionZoneMiles: true,
      fees:     { orderBy: { order: 'asc' }, select: { label: true, rateCents: true, unit: true, quantity: true, termsText: true } },
      sections: { orderBy: { orderIndex: 'asc' }, select: { title: true, body: true } },
    },
  })
  return memo ? dealMemoTermsKey(memo) : null
}

/**
 * Whether the terms changed since the memo was sent. Snapshots carry a
 * `termsKey`; any without one fall back to comparing vendor views.
 */
export async function dealMemoChangedSinceSent(sdb: ScopedDb, memoId: string, sentSnapshot: unknown): Promise<boolean> {
  const sentKey = sentSnapshot && typeof sentSnapshot === 'object' ? (sentSnapshot as { termsKey?: unknown }).termsKey : undefined
  if (typeof sentKey === 'string') {
    const live = await loadDealMemoTermsKey(sdb, memoId)
    return live === null || live !== sentKey
  }
  const live = await buildVendorView(sdb, memoId)
  return !live || vendorViewChanged(live, sentSnapshot)
}

/** The vendor view of a memo as it is now (for sending, preview and change detection). */
export async function buildVendorView(sdb: ScopedDb, memoId: string): Promise<VendorDealMemo | null> {
  const memo = await sdb.dealMemo.findFirst({
    where:   { id: memoId },
    include: {
      contact:  { select: { name: true } },
      project:  { select: { name: true } },
      workspace: { select: { name: true, legalName: true } },
      fees:     { orderBy: { order: 'asc' } },
      sections: { orderBy: { orderIndex: 'asc' } },
    },
  })
  if (!memo) return null
  return toVendorDealMemo(memo, {
    vendorName:         memo.contact?.name ?? '',
    projectName:        memo.project.name,
    workspaceName:      memo.workspace.name,
    workspaceLegalName: memo.workspace.legalName,
  })
}

/**
 * Whether the producer changed the terms after sending, so the vendor's copy
 * is outdated and can't be signed until it's re-sent. Public routes call this
 * with the token-verified row's workspace — never a user-supplied one.
 */
export async function isDealMemoOutdated(memo: { id: string; workspaceId: string; sentSnapshot: unknown }): Promise<boolean> {
  return dealMemoChangedSinceSent(scopedDbFor(memo.workspaceId), memo.id, memo.sentSnapshot)
}

/** The public page's lookup — raw db, keyed only by the unguessable token. */
export async function loadDealMemoByToken(token: string) {
  if (typeof token !== 'string' || token.length < 16) return null
  return db.dealMemo.findUnique({
    where:  { publicToken: token },
    select: {
      id: true, workspaceId: true, projectId: true, status: true,
      publicToken: true, publicTokenExpiresAt: true, sentAt: true, sentSnapshot: true,
      signedAt: true, signatureName: true, cancelledAt: true,
      workspace: { select: { name: true, logoUrl: true, primaryColor: true } },
    },
  })
}

/**
 * Record a vendor view. Only while sent, unsigned and not cancelled — a view
 * never changes anything once the memo is decided.
 */
export async function recordDealMemoView(memoId: string): Promise<void> {
  const now = new Date()
  try {
    await db.dealMemo.updateMany({
      where: { id: memoId, status: 'CONFIRMED', sentAt: { not: null }, signedAt: null, firstViewedAt: null },
      data:  { firstViewedAt: now },
    })
    await db.dealMemo.updateMany({
      where: { id: memoId, status: 'CONFIRMED', sentAt: { not: null }, signedAt: null },
      data:  { lastViewedAt: now },
    })
  } catch (err) {
    console.error('[recordDealMemoView]', err)
  }
}
