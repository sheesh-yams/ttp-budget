// Invoice lines that bill extras (e.g. unplanned costs from Actuals) on top of
// the agreed budget. Plain module — jest-tested; resolveActualLines takes the
// caller's scoped db.
//
// An extra line is a normal invoice line plus internal fields (InvoiceLineItem
// in src/types): `extra`, `actualEntryId`, `actualPart`, `costCents`. They
// never reach the client — every client-facing surface goes through
// clientInvoiceLines. Extras never carry the agency fee: an invoice line is
// billed as typed.

import type { InvoiceLineItem } from '@/types'
import { lineTotal } from '@/lib/money'

type LineLike = Partial<Pick<InvoiceLineItem, 'lineTotalCents' | 'extra' | 'actualEntryId' | 'actualPart' | 'costCents'>>

export interface InvoiceForLines {
  status:           string
  totalCents:       number
  isScopeAddition?: boolean
  lineItems?:       unknown
  number?:          string
  /** The invoice's discount — it belongs to the budget part first (see extraCents). */
  discountCents?:   number
}

function lines(inv: { lineItems?: unknown }): LineLike[] {
  return Array.isArray(inv.lineItems) ? (inv.lineItems as LineLike[]).filter(l => l && typeof l === 'object') : []
}

/**
 * The extras' share of an invoice's total. The invoice's discount comes off
 * the budget part first (it's the budget's discount, carried by an itemised
 * full invoice); only what's left over reduces the extras. Tax is charged on
 * subtotal − discount, so it's shared in proportion to what each part is
 * after the discount.
 */
export function extraCents(inv: InvoiceForLines): number {
  const ls = lines(inv)
  const sub = ls.reduce((s, l) => s + (Number(l.lineTotalCents) || 0), 0)
  const ext = ls.reduce((s, l) => s + (l.extra ? Number(l.lineTotalCents) || 0 : 0), 0)
  if (!ext || sub <= 0) return 0
  if (ext >= sub) return inv.totalCents
  const disc = Math.min(Math.max(0, Math.round(inv.discountCents ?? 0)), sub)
  const extNet = ext - Math.max(0, disc - (sub - ext))
  const taxable = sub - disc
  const tax = inv.totalCents - taxable
  const extTax = taxable > 0 ? Math.round(tax * (extNet / taxable)) : 0
  return Math.max(0, Math.min(inv.totalCents, extNet + extTax))
}

/** The part of an invoice that bills the agreed budget (total minus extras). */
export function budgetBilledCents(inv: InvoiceForLines): number {
  return inv.totalCents - extraCents(inv)
}

/** Only what the client may see of a line — cost and source stay on the server. */
export function clientInvoiceLines(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as InvoiceLineItem[]).filter(l => l && typeof l === 'object').map(l => ({
    id:             l.id,
    description:    l.description,
    quantity:       l.quantity,
    unit:           l.unit,
    rateCents:      l.rateCents,
    lineTotalCents: l.lineTotalCents,
    ...(l.notes ? { notes: l.notes } : {}),
    ...(l.extra ? { extra: true } : {}),
  }))
}

/** "entryId" or "entryId:overage" — one key per thing that can be billed. */
export function actualKey(entryId: string, part?: 'overage' | null): string {
  return part === 'overage' ? `${entryId}:overage` : entryId
}

/** Which actuals are already on a non-void invoice → that invoice's number + status. */
export function invoicedActualKeys(invoices: InvoiceForLines[]): Map<string, { number: string; status: string }[]> {
  const out = new Map<string, { number: string; status: string }[]>()
  for (const inv of invoices) {
    if (inv.status === 'VOID') continue
    for (const l of lines(inv)) {
      if (!l.actualEntryId) continue
      const k = actualKey(l.actualEntryId, l.actualPart)
      const list = out.get(k) ?? []
      if (!list.some(x => x.number === (inv.number ?? ''))) list.push({ number: inv.number ?? '', status: inv.status })
      out.set(k, list)
    }
  }
  return out
}

/** Σ extras billed across a project's non-void invoices (Actuals → Billed). */
export function billedExtrasCents(invoices: InvoiceForLines[]): number {
  return invoices.reduce((s, inv) => s + (inv.status === 'VOID' ? 0 : extraCents(inv)), 0)
}

// ─── The "Add from actuals" list ─────────────────────────────────────────────

export interface ActualForInvoice {
  id:          string
  description: string
  actualCents: number
  isAdHoc:     boolean
  lineItemId:  string | null
  dealMemoSourced?: boolean
}

export interface BudgetLineForInvoice {
  id:          string
  description: string
  quantity:    number
  rateCents:   number
  markupPct:   number | null
}

export type InvoiceableGroup = 'unplanned' | 'over' | 'budgeted'

export interface InvoiceableActual {
  key:          string
  entryId:      string
  part:         'overage' | null
  group:        InvoiceableGroup
  description:  string
  /** What it cost — the full actual, or the part over its budget line. */
  costCents:    number
  /** Over budget: the line's budgeted amount and the full actual. */
  budgetedCents?: number
  actualCents:  number
  /** Unplanned, but named like a budget line — may already be billed. */
  looksLike:    string | null
  /** Crew fee from a deal memo — usually a budget line's crew, so never pre-ticked. */
  fromDealMemo: boolean
  invoicedOn:   { number: string; status: string }[]
}

/** What getInvoiceableActuals returns. */
export interface InvoiceableActualsResult {
  items:      InvoiceableActual[]
  /** Budget margin VIEW — show cost → charge → margin. */
  showMargin: boolean
}

/** A budget line's own total, as the budget shows it (before the agency fee). */
export function budgetLineCents(l: BudgetLineForInvoice): number {
  return lineTotal(Number(l.quantity), l.rateCents, l.markupPct ? Number(l.markupPct) : null)
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3)

/**
 * The budget line an unplanned actual looks like, if any: the actual starts
 * with the line's name ("A Cam — Day Rate…" ~ "A Cam"), or contains the
 * line's first two words ("…(West Third Films)" ~ "West Third Photography").
 */
function lookAlike(description: string, lines: { l: BudgetLineForInvoice; n: string }[]): BudgetLineForInvoice | null {
  const d = norm(description)
  const prefix = lines.find(x => d === x.n || d.startsWith(x.n + ' ') || d.startsWith(x.n + ' —') || d.startsWith(x.n + ' -'))
  if (prefix) return prefix.l
  const dw = new Set(words(description))
  const lead = lines.find(x => {
    const w = words(x.l.description)
    return w.length >= 2 && dw.has(w[0]) && dw.has(w[1])
  })
  return lead ? lead.l : null
}

/**
 * A project's actuals sorted for the invoice picker: unplanned first, then
 * the overage of lines that ran over budget, then everything else already in
 * the budget (selectable, but billing it again would charge twice).
 */
export function groupInvoiceableActuals(args: {
  entries:     ActualForInvoice[]
  budgetLines: BudgetLineForInvoice[]
  invoices:    InvoiceForLines[]
}): InvoiceableActual[] {
  const invoiced = invoicedActualKeys(args.invoices)
  const byId = new Map(args.budgetLines.map(l => [l.id, l]))
  // Longest names first, so "A Cam Operator" wins over "A Cam".
  const names = args.budgetLines.map(l => ({ l, n: norm(l.description) })).filter(x => x.n.length >= 3)
    .sort((a, b) => b.n.length - a.n.length)
  const out: InvoiceableActual[] = []
  for (const e of args.entries) {
    if (!(e.actualCents > 0)) continue
    const line = e.lineItemId ? byId.get(e.lineItemId) : undefined
    if (e.isAdHoc || !line) {
      const match = lookAlike(e.description, names)
      out.push({
        key: actualKey(e.id), entryId: e.id, part: null, group: 'unplanned',
        description: e.description, costCents: e.actualCents, actualCents: e.actualCents,
        looksLike: match ? match.description : null, fromDealMemo: !!e.dealMemoSourced,
        invoicedOn: invoiced.get(actualKey(e.id)) ?? [],
      })
      continue
    }
    const budgeted = budgetLineCents(line)
    if (e.actualCents > budgeted) {
      out.push({
        key: actualKey(e.id, 'overage'), entryId: e.id, part: 'overage', group: 'over',
        description: e.description, costCents: e.actualCents - budgeted, budgetedCents: budgeted, actualCents: e.actualCents,
        looksLike: null, fromDealMemo: !!e.dealMemoSourced, invoicedOn: invoiced.get(actualKey(e.id, 'overage')) ?? [],
      })
    }
    out.push({
      key: actualKey(e.id), entryId: e.id, part: null, group: 'budgeted',
      description: e.description, costCents: e.actualCents, budgetedCents: budgeted, actualCents: e.actualCents,
      looksLike: null, fromDealMemo: !!e.dealMemoSourced, invoicedOn: invoiced.get(actualKey(e.id)) ?? [],
    })
  }
  const rank: Record<InvoiceableGroup, number> = { unplanned: 0, over: 1, budgeted: 2 }
  return out.sort((a, b) => rank[a.group] - rank[b.group])
}

// ─── Server-side: re-cost lines that claim to come from actuals ─────────────

/**
 * Validates every line that names an actual before an invoice is saved. The
 * cost is never taken from the browser:
 *  - a line already saved on this invoice with the same source keeps its
 *    stored cost (so editing a title doesn't need Actuals access, and a
 *    since-deleted actual doesn't block the edit);
 *  - a new one must be an entry on this project's actual sheet, needs Actuals
 *    access, and is costed from the database (the overage: actual minus its
 *    budget line's own total).
 * Lines from actuals are always extras. Returns the cleaned lines or an error.
 */
export async function resolveActualLines<T extends InvoiceLineItem>(
  sdb: unknown, projectId: string, input: T[],
  opts: { canUseActuals: boolean; stored?: unknown },
): Promise<{ lines: T[] } | { error: string }> {
  const db = sdb as {
    actualEntry: { findFirst(args: unknown): Promise<{ id: string; actualCents: number; lineItemId: string | null; actualSheet: { projectId: string } } | null> }
    lineItem: { findFirst(args: unknown): Promise<{ quantity: unknown; rateCents: number; markupPct: unknown; description: string } | null> }
  }
  const stored = new Map((Array.isArray(opts.stored) ? (opts.stored as InvoiceLineItem[]) : [])
    .filter(l => l && l.actualEntryId).map(l => [l.id, l]))
  const out: T[] = []
  for (const l of input) {
    // Drop whatever the browser said about cost/source; rebuild it here.
    const { costCents: _c, actualEntryId, actualPart, extra, ...base } = l
    void _c
    if (!actualEntryId) {
      out.push({ ...base, ...(extra ? { extra: true } : {}) } as T)
      continue
    }
    const part = actualPart === 'overage' ? 'overage' : undefined
    const prev = stored.get(l.id)
    if (prev && prev.actualEntryId === actualEntryId && (prev.actualPart ?? undefined) === part) {
      out.push({ ...base, extra: true, actualEntryId, ...(part ? { actualPart: part } : {}), ...(prev.costCents != null ? { costCents: prev.costCents } : {}) } as T)
      continue
    }
    if (!opts.canUseActuals) return { error: 'Adding items from actuals needs access to this project’s Actuals.' }
    const entry = await db.actualEntry.findFirst({
      where:  { id: actualEntryId, actualSheet: { projectId } },
      select: { id: true, actualCents: true, lineItemId: true, actualSheet: { select: { projectId: true } } },
    })
    if (!entry || entry.actualSheet.projectId !== projectId) {
      return { error: 'One of the items from actuals isn’t on this project any more — remove it and add it again.' }
    }
    let costCents = entry.actualCents
    if (part === 'overage') {
      const line = entry.lineItemId
        ? await db.lineItem.findFirst({ where: { id: entry.lineItemId }, select: { quantity: true, rateCents: true, markupPct: true, description: true } })
        : null
      const budgeted = line ? budgetLineCents({ id: '', description: line.description, quantity: Number(line.quantity), rateCents: line.rateCents, markupPct: line.markupPct == null ? null : Number(line.markupPct) }) : 0
      costCents = entry.actualCents - budgeted
      if (!line || costCents <= 0) return { error: 'That budget line is no longer over budget — remove its overage item.' }
    }
    out.push({ ...base, extra: true, actualEntryId: entry.id, ...(part ? { actualPart: part } : {}), costCents } as T)
  }
  return { lines: out }
}

/**
 * Lines for the signed-in app. The cost behind an extra (with the price it
 * gives away the margin) only goes to people who can see the budget margin;
 * the source link stays so edits keep it (the server re-costs on save).
 */
export function internalInvoiceLines(raw: unknown, showCost: boolean): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as InvoiceLineItem[]).filter(l => l && typeof l === 'object').map(l => {
    if (showCost || l.costCents == null) return l
    const { costCents: _c, ...rest } = l
    void _c
    return rest
  })
}

/** Actuals page badges: entry id → "TTP-2026-031 · sent" labels (overages marked). */
export function invoicedOnByEntry(invoices: InvoiceForLines[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [key, list] of invoicedActualKeys(invoices)) {
    const [entryId, part] = key.split(':')
    for (const x of list) (out[entryId] ??= []).push(`${x.number} · ${x.status.toLowerCase()}${part === 'overage' ? ' (overage)' : ''}`)
  }
  return out
}
