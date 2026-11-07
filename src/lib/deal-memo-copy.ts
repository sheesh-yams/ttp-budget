// Duplicate a deal memo / start a new bid from an earlier one. The copy keeps
// the SOW — rates, fees, work-day terms, every terms section as written — and
// drops everything about the person and the vendor flow (notes, status, link,
// signature). Pure builder (jest-tested) plus the loader the action uses.

import type { DealMemoFeeKind, RateUnit } from '@prisma/client'
import type { ScopedDb } from '@/lib/db-scoped'
import { lineHeadcountAndDays } from '@/lib/deal-memo-core'

type Num = number | string | { toString(): string }

export interface CopySource {
  projectId:            string
  lineItemId:           string | null
  roleLabel:            string
  position:             string
  days:                 Num
  startDate:            Date | null
  endDate:              Date | null
  workDayHours:         number
  otMultiplier:         Num
  doubleTimeAfterHours: number
  doubleTimeMultiplier: Num
  productionZoneMiles:  number
  fees: {
    kind: DealMemoFeeKind; label: string; rateCents: number; unit: RateUnit; quantity: Num
    termsText: string | null; budgetLineItemId: string | null; isAutoRate: boolean; order: number
  }[]
  sections: { title: string; body: string; sourceBlockId: string | null; editedFromSource: boolean; orderIndex: number }[]
}

export interface CopyTarget {
  projectId: string
  /** The budget line the new bid is for; null = outside the budget. */
  line:      { id: string; quantity: Num; quantityFormula: string | null } | null
  roleLabel: string
  project:   { shootStartDate: Date | null; shootEndDate: Date | null }
}

/** Units billed per day — their quantity is "how many days". */
const DAY_UNITS: RateUnit[] = ['DAY', 'HALF_DAY', 'WEEK']

export function buildDealMemoCopy(source: CopySource, target: CopyTarget) {
  const sameProject = source.projectId === target.projectId
  // Same project AND the same budget line (or both off budget): a true duplicate.
  const sameLine = sameProject && source.lineItemId === (target.line?.id ?? null)
  const sourceDays = Number(source.days)
  // A different line brings its own days; with no line, the source's days stand.
  const days = sameLine || !target.line ? sourceDays : lineHeadcountAndDays(target.line).days
  const roleLabel = target.roleLabel.trim() || source.roleLabel
  const sameRole = roleLabel.toLowerCase() === source.roleLabel.trim().toLowerCase()

  return {
    roleLabel,
    // A custom vendor-facing title only carries over for the same role.
    position:             sameRole ? source.position : roleLabel,
    days,
    startDate:            sameProject ? source.startDate : target.project.shootStartDate,
    endDate:              sameProject ? source.endDate : target.project.shootEndDate,
    workDayHours:         source.workDayHours,
    otMultiplier:         Number(source.otMultiplier),
    doubleTimeAfterHours: source.doubleTimeAfterHours,
    doubleTimeMultiplier: Number(source.doubleTimeMultiplier),
    productionZoneMiles:  source.productionZoneMiles,
    fees: [...source.fees].sort((a, b) => a.order - b.order).map((f, i) => {
      const qty = Number(f.quantity)
      // Fees that ran for the memo's days follow the new days; the rest keep theirs.
      const followsDays = days !== sourceDays && DAY_UNITS.includes(f.unit) && qty === sourceDays
      return {
        kind: f.kind, label: f.label, rateCents: f.rateCents, unit: f.unit,
        quantity: followsDays ? days : qty,
        termsText: f.termsText,
        // Budget lines belong to one project; elsewhere the default mapping
        // applies. On another line of the same project, a fee pinned to the
        // source's own line would book this role's actuals there — reset it.
        budgetLineItemId: !sameProject || (!sameLine && f.budgetLineItemId === source.lineItemId) ? null : f.budgetLineItemId,
        isAutoRate: f.isAutoRate,
        order: i,
      }
    }),
    sections: [...source.sections].sort((a, b) => a.orderIndex - b.orderIndex).map((s, i) => ({
      title: s.title, body: s.body, sourceBlockId: s.sourceBlockId, editedFromSource: s.editedFromSource, orderIndex: i,
    })),
  }
}

export type DealMemoCopy = ReturnType<typeof buildDealMemoCopy>

/** One option in Add bid → "Start from" (listDealMemoSources). */
export interface DealMemoSource {
  id: string; projectId: string; projectName: string; thisProject: boolean
  contactName: string; position: string
  dayRateCents: number; dayRateUnit: RateUnit; feeCount: number; sectionCount: number
}

/** The source memo's working rows (never the signed snapshot), in this workspace. */
export async function loadCopySource(sdb: ScopedDb, memoId: string): Promise<CopySource | null> {
  return sdb.dealMemo.findFirst({
    where:  { id: memoId },
    select: {
      projectId: true, lineItemId: true, roleLabel: true, position: true, days: true, startDate: true, endDate: true,
      workDayHours: true, otMultiplier: true, doubleTimeAfterHours: true, doubleTimeMultiplier: true, productionZoneMiles: true,
      fees: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select:  { kind: true, label: true, rateCents: true, unit: true, quantity: true, termsText: true, budgetLineItemId: true, isAutoRate: true, order: true },
      },
      sections: {
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
        select:  { title: true, body: true, sourceBlockId: true, editedFromSource: true, orderIndex: true },
      },
    },
  })
}
