// Background budget-line saves: optimistic rows layered over server data.
// Plain module (tested in src/lib/__tests__/pending-line-ops.test.ts).
//
// A line saved from the pop-up is shown at once and saved behind the scenes.
// Ops still saving are re-applied on top of every server refresh, so a
// refresh never wipes them. New rows carry a temporary id ("tmp-…") until
// their save lands, then take the real id (replaceRowId).
// Each save is its own op (key), so two edits of one row in quick succession
// don't overwrite each other's bookkeeping; edits apply in the order made.

import type { AccountWithItems } from '@/types'
import type { LineItemUpsertInput } from '@/components/projects/LineItemModal'

type LineItemRow = AccountWithItems['lineItems'][number]

export type PendingLineOp = {
  /** Unique per save. */
  key:       string
  /** The row it touches (a "tmp-…" id for a new row). */
  rowId:     string
  isNew:     boolean
  accountId: string
  row:       Partial<LineItemRow>
}

export function rowFromInput(id: string, input: LineItemUpsertInput): Partial<LineItemRow> {
  return {
    id, accountId: input.accountId, description: input.description, quantity: input.quantity,
    unit: input.unit, rateCents: input.rateCents, rateCardId: input.rateCardId ?? null,
    markupPct: input.markupPct ?? null, notes: input.notes ?? null,
    quantityFormula: input.quantityFormula ?? null, lineItemCategory: input.lineItemCategory ?? null,
    contactId: input.contactId ?? null,
  } as unknown as Partial<LineItemRow>
}

function mapItems(accounts: AccountWithItems[], fn: (acc: AccountWithItems, items: LineItemRow[]) => LineItemRow[]): AccountWithItems[] {
  return accounts.map(acc => ({
    ...acc,
    lineItems: fn(acc, acc.lineItems),
    children: acc.children ? mapItems(acc.children as AccountWithItems[], fn) : acc.children,
  }) as AccountWithItems)
}

/** Applies pending ops to an account tree (idempotent: safe to re-run on any refresh). */
export function applyPendingOps(accounts: AccountWithItems[], ops: Map<string, PendingLineOp>): AccountWithItems[] {
  if (ops.size === 0) return accounts
  return mapItems(accounts, (acc, list) => {
    // Edits, in the order they were made (the newest wins).
    let items = list.map(it => {
      let out = it
      for (const op of ops.values()) if (!op.isNew && op.rowId === it.id) out = { ...out, ...op.row } as LineItemRow
      return out
    })
    for (const op of ops.values()) {
      if (op.isNew && op.accountId === acc.id && !items.some(i => i.id === op.rowId)) {
        const order = items.reduce((m, i) => Math.max(m, Number(i.order) || 0), 0) + 1
        items = [...items, { ...op.row, order } as LineItemRow]
      }
    }
    return items
  })
}

/** A new row's save landed: it takes its real id (so it can be edited at once). */
export function replaceRowId(accounts: AccountWithItems[], fromId: string, toId: string): AccountWithItems[] {
  return mapItems(accounts, (_acc, items) => items.map(i => (i.id === fromId ? ({ ...i, id: toId } as LineItemRow) : i)))
}

/** Undo one failed save on screen only: put an edited row back, or drop a new one. */
export function rollbackRow(accounts: AccountWithItems[], rowId: string, previous: LineItemRow | null): AccountWithItems[] {
  return mapItems(accounts, (_acc, items) => previous
    ? items.map(i => (i.id === rowId ? previous : i))
    : items.filter(i => i.id !== rowId))
}

export function findRow(accounts: AccountWithItems[], rowId: string): LineItemRow | null {
  for (const acc of accounts) {
    const hit = acc.lineItems.find(i => i.id === rowId)
    if (hit) return hit
    if (acc.children) {
      const inChild = findRow(acc.children as AccountWithItems[], rowId)
      if (inChild) return inChild
    }
  }
  return null
}
