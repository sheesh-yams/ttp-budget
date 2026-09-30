// Pure deal memo logic — no db, no framework. Shared by server actions,
// pages and client components, and unit-tested in __tests__.

import type { DealMemoFeeKind, DealMemoStatus, Prisma, RateUnit } from '@prisma/client'
import { lineTotal, parseQtyFormula } from '@/lib/money'
import { autoOvertimeRateCents, type DealMemoDefaults } from '@/lib/deal-memo-defaults'

/** Budget lines that represent people — same filter the won-proposal team reconcile uses. */
export const CREW_LINE_WHERE: Prisma.LineItemWhereInput = {
  OR: [
    { lineItemCategory: 'CREW' },
    { lineItemCategory: null, rateCard: { category: { in: ['CREW', 'TALENT'] } } },
  ],
}

// ─── Money ────────────────────────────────────────────────────────────────────

export interface FeeAmountInput { rateCents: number; quantity: number | string | { toString(): string } }

export function feeExpectedCents(fee: FeeAmountInput): number {
  return lineTotal(Number(fee.quantity), fee.rateCents)
}

export function memoExpectedCents(fees: FeeAmountInput[]): number {
  return fees.reduce((sum, f) => sum + feeExpectedCents(f), 0)
}

/** Headcount and days a budget line represents ("3x2" → 3 people × 2 days). */
export function lineHeadcountAndDays(line: { quantity: number | string | { toString(): string }; quantityFormula: string | null }) {
  const [headcount, days] = parseQtyFormula(Number(line.quantity), line.quantityFormula)
  return { headcount: Math.max(1, Math.round(headcount)), days }
}

// ─── Status lifecycle ─────────────────────────────────────────────────────────

const ALLOWED: Record<DealMemoStatus, DealMemoStatus[]> = {
  BID:          ['CONFIRMED', 'NOT_SELECTED'],
  NOT_SELECTED: ['BID'],
  CONFIRMED:    ['CANCELLED'],
  CANCELLED:    ['BID'],
}

export function canTransition(from: DealMemoStatus, to: DealMemoStatus): boolean {
  return ALLOWED[from].includes(to)
}

/** Statuses a transition to `to` may start from — for guarded updateMany `where`. */
export function allowedFromStatuses(to: DealMemoStatus): DealMemoStatus[] {
  return (Object.keys(ALLOWED) as DealMemoStatus[]).filter(from => ALLOWED[from].includes(to))
}

export const DELETABLE_STATUSES: DealMemoStatus[] = ['BID', 'NOT_SELECTED']

// ─── Prefill for a new bid ────────────────────────────────────────────────────

export interface PrefillLine {
  description:     string
  quantity:        number | string | { toString(): string }
  quantityFormula: string | null
}

export interface PrefillContact {
  primaryRole:      string
  defaultRateCents: number | null
  defaultRateUnit:  RateUnit
  hasKit:           boolean
  kitRateCents:     number | null
}

export interface PrefillFee {
  kind:       DealMemoFeeKind
  label:      string
  rateCents:  number
  unit:       RateUnit
  quantity:   number
  termsText:  string
  isAutoRate: boolean
  order:      number
}

export interface DealMemoPrefill {
  roleLabel:            string
  position:             string
  days:                 number
  startDate:            Date | null
  endDate:              Date | null
  workDayHours:         number
  otMultiplier:         number
  doubleTimeAfterHours: number
  doubleTimeMultiplier: number
  productionZoneMiles:  number
  fees:                 PrefillFee[]
}

function quantityFor(unit: RateUnit, days: number): number {
  return unit === 'FLAT' || unit === 'EACH' ? 1 : unit === 'MILE' || unit === 'HOUR' ? 0 : days
}

/**
 * Builds a new bid. Rates come from the person's own rolodex rates — never
 * from the budget line, whose rate is what the CLIENT is billed.
 */
export function buildDealMemoPrefill(args: {
  defaults:  DealMemoDefaults
  line:      PrefillLine | null
  contact:   PrefillContact
  roleLabel?: string
  project:   { shootStartDate: Date | null; shootEndDate: Date | null }
}): DealMemoPrefill {
  const { defaults, line, contact, project } = args
  const roleLabel = (line?.description ?? args.roleLabel ?? contact.primaryRole).trim() || contact.primaryRole
  const days = line ? lineHeadcountAndDays(line).days : 1

  let dayRateCents = 0
  let dayRateUnit: RateUnit | null = null

  const fees = defaults.fees.map((row, i): PrefillFee => {
    const base: PrefillFee = {
      kind: row.kind, label: row.label, rateCents: 0, unit: row.unit as RateUnit,
      quantity: quantityFor(row.unit as RateUnit, days), termsText: row.termsText ?? '',
      isAutoRate: false, order: i,
    }
    switch (row.kind) {
      case 'DAY_RATE':
        if (contact.defaultRateCents) {
          base.rateCents = contact.defaultRateCents
          base.unit      = contact.defaultRateUnit
          base.quantity  = quantityFor(contact.defaultRateUnit, days)
        }
        dayRateCents = base.unit === 'DAY' ? base.rateCents : 0
        dayRateUnit  = base.unit
        return base
      case 'OVERTIME':
        return { ...base, quantity: 0, isAutoRate: true }
      case 'KIT':
        if (contact.hasKit && contact.kitRateCents) {
          return { ...base, rateCents: contact.kitRateCents, unit: 'DAY', quantity: days }
        }
        return base
      case 'PER_DIEM':
        return { ...base, rateCents: defaults.perDiemCents ?? 0, quantity: 0 }
      case 'MILEAGE':
        return { ...base, rateCents: defaults.mileageRateCents ?? 0, quantity: 0 }
      default:
        return base
    }
  })

  const withOt = dayRateUnit === 'DAY'
    ? applyAutoOvertime(fees, dayRateCents, defaults.workDayHours, defaults.otMultiplier)
    : fees

  return {
    roleLabel,
    position:             roleLabel,
    days,
    startDate:            project.shootStartDate,
    endDate:              project.shootEndDate,
    workDayHours:         defaults.workDayHours,
    otMultiplier:         defaults.otMultiplier,
    doubleTimeAfterHours: defaults.doubleTimeAfterHours,
    doubleTimeMultiplier: defaults.doubleTimeMultiplier,
    productionZoneMiles:  defaults.productionZoneMiles,
    fees:                 withOt,
  }
}

/** Recomputes every isAutoRate overtime fee from the day rate. Others untouched. */
export function applyAutoOvertime<T extends { kind: DealMemoFeeKind; isAutoRate: boolean; rateCents: number }>(
  fees: T[], dayRateCents: number, workDayHours: number, otMultiplier: number,
): T[] {
  const rate = autoOvertimeRateCents(dayRateCents, workDayHours, otMultiplier)
  return fees.map(f => (f.kind === 'OVERTIME' && f.isAutoRate ? { ...f, rateCents: rate } : f))
}

/** The day rate an auto-OT fee should follow: the first DAY_RATE fee billed per day. */
export function dayRateForOvertime(fees: { kind: DealMemoFeeKind; unit: RateUnit; rateCents: number }[]): number {
  const f = fees.find(x => x.kind === 'DAY_RATE' && x.unit === 'DAY')
  return f?.rateCents ?? 0
}
