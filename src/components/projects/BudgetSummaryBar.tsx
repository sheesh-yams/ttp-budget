'use client'

import type { AccountWithItems } from '@/types'

// ─── Money helper ─────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function pctLabel(pct: number): string {
  const rounded = Math.round(pct * 1000) / 10  // e.g. 0.05 → 5.0 → "5%"
  return `${rounded % 1 === 0 ? Math.round(rounded) : rounded}%`
}

// ─── Breakdown calculation ────────────────────────────────────────────────────

interface Breakdown {
  netSubtotalCents:  number   // Σ(qty × rateCents) — pure base, no per-line markup
  lineMarkupCents:   number   // Σ(qty × rateCents × lineMarkupPct) — per-line premiums
  lineTaxCents:      number   // Σ(qty × rateCents × taxRate) — per-line taxes (new field)
  productionCents:   number   // net + line markups + line taxes
  agencyFeeCents:    number   // productionCents × budgetMarkupPct
  budgetTaxCents:    number   // (production + agency) × budgetTaxPct
  grandTotalCents:   number
}

// Safely coerce Prisma Decimal | number | null to number
function toNum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v !== null) {
    if ('toNumber' in v && typeof (v as { toNumber(): number }).toNumber === 'function')
      return (v as { toNumber(): number }).toNumber()
    if ('valueOf' in v) return Number((v as { valueOf(): unknown }).valueOf())
  }
  return Number(v)
}

function calcItemBreakdown(item: AccountWithItems['lineItems'][number]) {
  const qty     = toNum(item.quantity)
  const rate    = item.rateCents
  const base    = Math.round(qty * rate)

  const markup  = toNum(item.markupPct)
  const lineMkp = markup ? Math.round(base * markup) : 0

  // hasMarkup and taxRate are new schema fields — cast safely
  const ext     = item as unknown as { hasMarkup?: boolean; taxRate?: unknown }
  const taxRate = toNum(ext.taxRate ?? null)
  const lineTax = taxRate ? Math.round(base * taxRate) : 0

  return { base, lineMkp, lineTax }
}

function sumAccountBreakdown(account: AccountWithItems): { base: number; lineMkp: number; lineTax: number } {
  const own = account.lineItems.reduce(
    (acc, item) => {
      const b = calcItemBreakdown(item)
      return { base: acc.base + b.base, lineMkp: acc.lineMkp + b.lineMkp, lineTax: acc.lineTax + b.lineTax }
    },
    { base: 0, lineMkp: 0, lineTax: 0 }
  )
  const children = (account.children ?? []).reduce(
    (acc, child) => {
      const b = sumAccountBreakdown(child)
      return { base: acc.base + b.base, lineMkp: acc.lineMkp + b.lineMkp, lineTax: acc.lineTax + b.lineTax }
    },
    { base: 0, lineMkp: 0, lineTax: 0 }
  )
  return {
    base:    own.base    + children.base,
    lineMkp: own.lineMkp + children.lineMkp,
    lineTax: own.lineTax + children.lineTax,
  }
}

function computeBreakdown(
  accounts:        AccountWithItems[],
  budgetMarkupPct: number,
  budgetTaxPct:    number,
): Breakdown {
  const totals = accounts.reduce(
    (acc, a) => {
      const b = sumAccountBreakdown(a)
      return { base: acc.base + b.base, lineMkp: acc.lineMkp + b.lineMkp, lineTax: acc.lineTax + b.lineTax }
    },
    { base: 0, lineMkp: 0, lineTax: 0 }
  )

  const netSubtotalCents = totals.base
  const lineMarkupCents  = totals.lineMkp
  const lineTaxCents     = totals.lineTax
  const productionCents  = netSubtotalCents + lineMarkupCents + lineTaxCents
  const agencyFeeCents   = Math.round(productionCents * budgetMarkupPct)
  const preTax           = productionCents + agencyFeeCents
  const budgetTaxCents   = Math.round(preTax * budgetTaxPct)
  const grandTotalCents  = preTax + budgetTaxCents

  return {
    netSubtotalCents,
    lineMarkupCents,
    lineTaxCents,
    productionCents,
    agencyFeeCents,
    budgetTaxCents,
    grandTotalCents,
  }
}

// ─── Sub-column ───────────────────────────────────────────────────────────────

function SummaryCol({
  label,
  sublabel,
  value,
  dimmed,
}: {
  label:     string
  sublabel?: string
  value:     string
  dimmed?:   boolean
}) {
  return (
    <div className="flex flex-col justify-center">
      <p className={`text-[10px] font-medium uppercase tracking-[0.06em] ${dimmed ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
        {label}
      </p>
      {sublabel && (
        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{sublabel}</p>
      )}
      <p className={`mt-1 tabular-nums font-semibold leading-none ${dimmed ? 'text-foreground/40 text-sm' : 'text-sm text-foreground'}`}>
        {value}
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  accounts:        AccountWithItems[]
  budgetMarkupPct: number   // e.g. 0.1 = 10% agency fee on top of production
  budgetTaxPct:    number   // e.g. 0.0875 = 8.75% tax
}

/** Fixed sticky bar anchored to the bottom of the content area (sidebar-aware). */
export function BudgetSummaryBar({ accounts, budgetMarkupPct, budgetTaxPct }: Props) {
  const b = computeBreakdown(accounts, budgetMarkupPct, budgetTaxPct)

  const markupsAndTaxCents = b.lineMarkupCents + b.lineTaxCents
  const hasAgencyFee       = budgetMarkupPct > 0
  const hasBudgetTax       = budgetTaxPct > 0

  return (
    /* left: 200px matches the sidebar w-[200px] in AuthLayout */
    <div
      className="fixed bottom-0 right-0 z-40 border-t border-border bg-background/85 backdrop-blur-md shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]"
      style={{ left: 200 }}
    >
      <div className="mx-auto flex max-w-[1400px] items-stretch gap-0 px-6 py-3">

        {/* Col 1 — Net Subtotal */}
        <div className="flex flex-1 items-center pr-6 border-r border-border/60">
          <SummaryCol
            label="Net Subtotal"
            sublabel="before markups"
            value={formatCents(b.netSubtotalCents)}
          />
        </div>

        {/* Col 2 — Markups & Taxes */}
        <div className="flex flex-1 items-center px-6 border-r border-border/60">
          {markupsAndTaxCents > 0 ? (
            <div className="flex flex-col gap-1">
              {b.lineMarkupCents > 0 && (
                <div className="flex items-baseline gap-2">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60 font-medium w-20">Markup</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground/70">{formatCents(b.lineMarkupCents)}</p>
                </div>
              )}
              {b.lineTaxCents > 0 && (
                <div className="flex items-baseline gap-2">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60 font-medium w-20">Per-item Tax</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground/70">{formatCents(b.lineTaxCents)}</p>
                </div>
              )}
              {markupsAndTaxCents > 0 && b.lineMarkupCents > 0 && b.lineTaxCents > 0 && (
                <div className="flex items-baseline gap-2 border-t border-border/40 pt-1 mt-0.5">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground font-medium w-20">Total</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCents(markupsAndTaxCents)}</p>
                </div>
              )}
            </div>
          ) : (
            <SummaryCol
              label="Markups & Taxes"
              sublabel="none applied"
              value="—"
              dimmed
            />
          )}
        </div>

        {/* Col 3 — Agency Fee + Budget Tax */}
        <div className="flex flex-1 items-center px-6 border-r border-border/60">
          {(hasAgencyFee || hasBudgetTax) ? (
            <div className="flex flex-col gap-1">
              {hasAgencyFee && (
                <div className="flex items-baseline gap-2">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60 font-medium w-24">
                    Agency Fee <span className="normal-case text-[9px]">({pctLabel(budgetMarkupPct)})</span>
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground/70">{formatCents(b.agencyFeeCents)}</p>
                </div>
              )}
              {hasBudgetTax && (
                <div className="flex items-baseline gap-2">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60 font-medium w-24">
                    Tax <span className="normal-case text-[9px]">({pctLabel(budgetTaxPct)})</span>
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground/70">{formatCents(b.budgetTaxCents)}</p>
                </div>
              )}
            </div>
          ) : (
            <SummaryCol
              label="Agency Fee & Tax"
              sublabel="set in budget settings"
              value="—"
              dimmed
            />
          )}
        </div>

        {/* Col 4 — Grand Gross Total */}
        <div className="flex items-center pl-6">
          <div className="flex flex-col justify-center min-w-[140px]">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Gross Total
            </p>
            <p
              className="mt-1 text-2xl font-bold tabular-nums leading-none"
              style={{ color: '#5D00A4' }}
            >
              {formatCents(b.grandTotalCents)}
            </p>
            {b.grandTotalCents !== b.productionCents && (
              <p className="mt-1 text-[10px] text-muted-foreground/50 tabular-nums">
                Production: {formatCents(b.productionCents)}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
