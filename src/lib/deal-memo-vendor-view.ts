// The ONLY shape a vendor ever sees. Every vendor-facing surface — the
// in-app "Preview as vendor" now, the Phase 2 public link and PDF later —
// renders this DTO, never a DealMemo row. Fields are whitelisted here, so
// internal data (budget role, budget line links, internal notes, actuals
// mappings, client-facing budget rates) can't leak by construction.

import type { RateUnit } from '@prisma/client'
import { renderSmartText } from '@/lib/smart-text'
import { resolveMergeTags, resolveMergeTagsPlain, type MergeTagContext } from '@/lib/merge-tags'
import { parseLocalDate } from '@/lib/time-format'
import { feeExpectedCents } from '@/lib/deal-memo-core'

type Num = number | string | { toString(): string }

export interface DealMemoForVendor {
  position:             string
  startDate:            Date | string | null
  endDate:              Date | string | null
  days:                 Num
  workDayHours:         number
  otMultiplier:         Num
  doubleTimeAfterHours: number
  doubleTimeMultiplier: Num
  productionZoneMiles:  number
  fees:     { id: string; label: string; rateCents: number; unit: RateUnit; quantity: Num; termsText: string | null }[]
  sections: { id: string; title: string; body: string }[]
}

export interface VendorDealMemo {
  position:      string
  vendorName:    string
  projectName:   string
  workspaceName: string
  startDate:     string | null   // formatted, e.g. "October 3, 2026"
  endDate:       string | null
  days:          number
  workDayHours:  number
  fees: {
    id:          string
    label:       string
    rateCents:   number
    unit:        RateUnit
    quantity:    number
    expectedCents: number
    termsHtml:   string
    termsText:   string
  }[]
  expectedTotalCents: number
  sections: { id: string; title: string; bodyHtml: string; bodyText: string }[]
}

function fmtDate(d: Date | string | null): string | null {
  const date = parseLocalDate(d)
  return date ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
}

export function toVendorDealMemo(
  memo: DealMemoForVendor,
  ctx: { vendorName: string; projectName: string; workspaceName: string; workspaceLegalName?: string | null },
  opts: { warnUnresolved?: boolean } = {},
): VendorDealMemo {
  const warn = opts.warnUnresolved ?? false
  const startDate = fmtDate(memo.startDate)
  const endDate   = fmtDate(memo.endDate)

  const mergeCtx: MergeTagContext = {
    workspace: { name: ctx.workspaceName, legalName: ctx.workspaceLegalName ?? undefined },
    project:   { name: ctx.projectName },
    vendor:    { name: ctx.vendorName },
    dealMemo: {
      position:             memo.position,
      workDayHours:         memo.workDayHours,
      otMultiplier:         Number(memo.otMultiplier),
      doubleTimeAfterHours: memo.doubleTimeAfterHours,
      doubleTimeMultiplier: Number(memo.doubleTimeMultiplier),
      productionZoneMiles:  memo.productionZoneMiles,
      startDate:            startDate ?? undefined,
      endDate:              endDate ?? undefined,
    },
  }

  // A fee with no rate isn't part of the deal (e.g. an unused kit row).
  const fees = memo.fees
    .filter(f => f.rateCents > 0)
    .map(f => ({
      id:            f.id,
      label:         f.label,
      rateCents:     f.rateCents,
      unit:          f.unit,
      quantity:      Number(f.quantity),
      expectedCents: feeExpectedCents(f),
      termsHtml:     resolveMergeTags(renderSmartText(f.termsText ?? ''), mergeCtx, { warnUnresolved: warn }),
      termsText:     resolveMergeTagsPlain(f.termsText ?? '', mergeCtx),
    }))

  return {
    position:      memo.position,
    vendorName:    ctx.vendorName,
    projectName:   ctx.projectName,
    workspaceName: ctx.workspaceName,
    startDate,
    endDate,
    days:          Number(memo.days),
    workDayHours:  memo.workDayHours,
    fees,
    expectedTotalCents: fees.reduce((s, f) => s + f.expectedCents, 0),
    sections: memo.sections.map(s => ({
      id:       s.id,
      title:    s.title,
      bodyHtml: resolveMergeTags(renderSmartText(s.body), mergeCtx, { warnUnresolved: warn }),
      bodyText: resolveMergeTagsPlain(s.body, mergeCtx),
    })),
  }
}
