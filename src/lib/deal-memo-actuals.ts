// Confirmed deal memos → Actuals prefill.
//
// planActualsFromDealMemos is pure and unit-tested; applyDealMemosToActualSheet
// runs it against the database. Rules:
//   • Only CONFIRMED memos count, and only fees with an expected amount.
//   • Each fee targets a budget line: its own budgetLineItemId if set, else a
//     default by kind (day rate / OT → the memo's role line; kit → a kit
//     (EQUIPMENT) line linked to this person). Fees with no budget line in the
//     tracked phase — per diem, mileage, custom, or a missing target — get
//     their own unbudgeted ("ad-hoc") entry.
//   • NEVER overwrite the user's number: an entry the user typed into, or
//     whose amount came from receipts, is amountUserOwned and never touched
//     again — including a deliberate $0. Otherwise it's writable while its
//     amount came from memos (dealMemoSourced) or it's still an untouched $0.
//   • Only budget lines that still exist in the sheet's phase are targets; a
//     leftover entry for a deleted line is cleared, not written.
//   • Entries a memo used to fill but no longer does (cancelled memo, removed
//     or remapped fee) are cleared back to $0.

import type { DealMemoFeeKind, DealMemoStatus, LineItemCategory } from '@prisma/client'
import { db } from '@/lib/db'
import type { ScopedDb } from '@/lib/db-scoped'
import { feeExpectedCents } from '@/lib/deal-memo-core'
import { resolveTrackedPhase } from '@/lib/deal-memo-queries'

export interface PlannerMemo {
  id:          string
  status:      DealMemoStatus
  lineItemId:  string | null
  roleLabel:   string
  contactId:   string | null
  contactName: string
  fees: { id: string; kind: DealMemoFeeKind; label: string; rateCents: number; quantity: number; budgetLineItemId: string | null }[]
}

export interface PlannerEntry {
  id:              string
  lineItemId:      string | null
  isAdHoc:         boolean
  actualCents:     number
  dealMemoSourced: boolean
  dealMemoFeeId:   string | null
  amountUserOwned: boolean
}

export interface PlannerLine { id: string; accountId: string; contactId: string | null; category: LineItemCategory | null }

export interface ActualsPlan {
  /** Set actualCents + mark sourced. */
  updates: { entryId: string; actualCents: number; vendorContactId: string | null }[]
  /** New unbudgeted entries, one per fee — filed under the role line's account when there is one. */
  creates: { dealMemoFeeId: string; accountId: string | null; description: string; actualCents: number; vendorContactId: string | null }[]
  /** Sourced entries no memo fills anymore — back to $0, unsourced. */
  clears:  { entryId: string }[]
}

function isWritable(e: PlannerEntry): boolean {
  return !e.amountUserOwned && (e.dealMemoSourced || e.actualCents === 0)
}

export function planActualsFromDealMemos(
  memos: PlannerMemo[], entries: PlannerEntry[], lines: PlannerLine[],
): ActualsPlan {
  const currentLineIds = new Set(lines.map(l => l.id))
  const sheetLineIds = new Set(
    entries
      .filter(e => !e.isAdHoc && e.lineItemId && currentLineIds.has(e.lineItemId))
      .map(e => e.lineItemId as string),
  )

  // target → summed amount; vendor only when a single person contributes
  const toLine = new Map<string, { cents: number; vendors: Set<string | null> }>()
  const toFee  = new Map<string, { cents: number; vendor: string | null; description: string; accountId: string | null }>()
  const accountOf = new Map(lines.map(l => [l.id, l.accountId]))

  for (const memo of memos) {
    if (memo.status !== 'CONFIRMED') continue
    for (const fee of memo.fees) {
      const cents = feeExpectedCents(fee)
      if (cents <= 0) continue

      let target: string | null = fee.budgetLineItemId
      if (!target) {
        if (fee.kind === 'DAY_RATE' || fee.kind === 'OVERTIME') target = memo.lineItemId
        else if (fee.kind === 'KIT' && memo.contactId) {
          target = lines.find(l => l.contactId === memo.contactId && l.category === 'EQUIPMENT')?.id ?? null
        }
      }

      if (target && sheetLineIds.has(target)) {
        const cur = toLine.get(target) ?? { cents: 0, vendors: new Set<string | null>() }
        cur.cents += cents
        cur.vendors.add(memo.contactId)
        toLine.set(target, cur)
      } else {
        toFee.set(fee.id, {
          cents,
          vendor: memo.contactId,
          description: `${memo.roleLabel} — ${fee.label} (${memo.contactName})`,
          accountId: (memo.lineItemId && accountOf.get(memo.lineItemId)) || null,
        })
      }
    }
  }

  const plan: ActualsPlan = { updates: [], creates: [], clears: [] }

  for (const e of entries) {
    if (e.isAdHoc) continue
    if (!e.lineItemId) continue
    const c = toLine.get(e.lineItemId)
    if (c) {
      if (!isWritable(e)) continue
      if (e.dealMemoSourced && e.actualCents === c.cents) continue
      plan.updates.push({ entryId: e.id, actualCents: c.cents, vendorContactId: c.vendors.size === 1 ? [...c.vendors][0] : null })
    } else if (e.dealMemoSourced && !e.amountUserOwned) {
      plan.clears.push({ entryId: e.id })
    }
  }

  const adHocByFee = new Map(entries.filter(e => e.isAdHoc && e.dealMemoFeeId).map(e => [e.dealMemoFeeId as string, e]))
  for (const [feeId, c] of toFee) {
    const existing = adHocByFee.get(feeId)
    if (!existing) {
      plan.creates.push({ dealMemoFeeId: feeId, accountId: c.accountId, description: c.description, actualCents: c.cents, vendorContactId: c.vendor })
    } else if (isWritable(existing) && !(existing.dealMemoSourced && existing.actualCents === c.cents)) {
      plan.updates.push({ entryId: existing.id, actualCents: c.cents, vendorContactId: c.vendor })
    }
  }
  for (const [feeId, e] of adHocByFee) {
    if (!toFee.has(feeId) && e.dealMemoSourced && !e.amountUserOwned) plan.clears.push({ entryId: e.id })
  }

  return plan
}

/**
 * Applies the plan to one actuals sheet. The sheet is verified through the
 * scoped client; entries are then written with the raw client keyed by that
 * verified sheet id (ActualEntry has no workspaceId of its own).
 */
export async function applyDealMemosToActualSheet(sdb: ScopedDb, sheetId: string): Promise<void> {
  const sheet = await sdb.actualSheet.findFirst({
    where:  { id: sheetId },
    select: { id: true, projectId: true, phaseId: true },
  })
  if (!sheet) return

  // Same budget version the Actuals page syncs rows for (its current primary
  // phase) — not the phase the sheet happened to be created against, which
  // goes stale when the primary phase changes.
  const tracked = await resolveTrackedPhase(sdb, sheet.projectId)
  const phaseId = tracked.phaseId ?? sheet.phaseId

  const [memos, entries, lines] = await Promise.all([
    sdb.dealMemo.findMany({
      where:  { projectId: sheet.projectId, status: 'CONFIRMED' },
      select: {
        id: true, status: true, lineItemId: true, roleLabel: true, contactId: true,
        contact: { select: { name: true } },
        fees: { select: { id: true, kind: true, label: true, rateCents: true, quantity: true, budgetLineItemId: true } },
      },
    }),
    db.actualEntry.findMany({
      where:  { actualSheetId: sheet.id },
      select: { id: true, lineItemId: true, isAdHoc: true, actualCents: true, dealMemoSourced: true, dealMemoFeeId: true, amountUserOwned: true, order: true },
    }),
    sdb.lineItem.findMany({
      where:  { account: { phaseId } },
      select: { id: true, accountId: true, contactId: true, lineItemCategory: true },
    }),
  ])

  const plan = planActualsFromDealMemos(
    memos.map(m => ({
      id: m.id, status: m.status, lineItemId: m.lineItemId, roleLabel: m.roleLabel,
      contactId: m.contactId, contactName: m.contact?.name ?? 'Unknown',
      fees: m.fees.map(f => ({ ...f, quantity: Number(f.quantity) })),
    })),
    entries,
    lines.map(l => ({ id: l.id, accountId: l.accountId, contactId: l.contactId, category: l.lineItemCategory })),
  )
  if (!plan.updates.length && !plan.creates.length && !plan.clears.length) return

  const maxOrder = entries.reduce((m, e) => Math.max(m, e.order), -1)
  await db.$transaction([
    ...plan.updates.map(u => db.actualEntry.update({
      where: { id: u.entryId },
      data:  { actualCents: u.actualCents, dealMemoSourced: true, ...(u.vendorContactId ? { vendorContactId: u.vendorContactId } : {}) },
    })),
    ...plan.clears.map(c => db.actualEntry.update({
      where: { id: c.entryId },
      data:  { actualCents: 0, dealMemoSourced: false },
    })),
    ...(plan.creates.length
      ? [db.actualEntry.createMany({
          // The (actualSheetId, dealMemoFeeId) unique index makes a racing
          // second Actuals load a no-op instead of a double-counted fee.
          skipDuplicates: true,
          data: plan.creates.map((c, i) => ({
            actualSheetId: sheet.id, accountId: c.accountId, description: c.description, actualCents: c.actualCents,
            isAdHoc: true, order: maxOrder + 1 + i, dealMemoSourced: true,
            dealMemoFeeId: c.dealMemoFeeId, vendorContactId: c.vendorContactId,
          })),
        })]
      : []),
  ])
}
