// Deal memo vendor link + e-signature (deal memos Phase 2). Server-only;
// plain module, not 'use server' — nothing here is a callable endpoint.
//
// Lifecycle on top of DealMemoStatus (CONFIRMED = awarded internally):
//   awarded → sent (link emailed, terms frozen in sentSnapshot) → viewed →
//   signed (vendor signed the frozen snapshot). Cancel: status CANCELLED.

import { db } from '@/lib/db'
import type { ScopedDb } from '@/lib/db-scoped'
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
