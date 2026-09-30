// Workspace-level deal memo defaults (Settings → Contracts → Crew & Vendor).
// Stored in Workspace.dealMemoDefaults (JSON); anything missing falls back to
// the built-ins below, so {} — every existing workspace — just works.
// Plain module: imported by server actions, pages and client components.

import { z } from 'zod'

export const FEE_KINDS = ['DAY_RATE', 'OVERTIME', 'KIT', 'PER_DIEM', 'MILEAGE', 'CUSTOM'] as const
export const FEE_UNITS = ['DAY', 'HOUR', 'HALF_DAY', 'WEEK', 'FLAT', 'EACH', 'MILE'] as const

export const defaultFeeRowSchema = z.object({
  kind:      z.enum(FEE_KINDS),
  label:     z.string().trim().min(1).max(120),
  unit:      z.enum(FEE_UNITS),
  termsText: z.string().max(2000).default(''),
})

export const dealMemoDefaultsSchema = z.object({
  workDayHours:         z.union([z.literal(10), z.literal(12)]),
  otMultiplier:         z.number().min(1).max(5),
  doubleTimeAfterHours: z.number().int().min(1).max(24),
  doubleTimeMultiplier: z.number().min(1).max(5),
  productionZoneMiles:  z.number().int().min(0).max(1000),
  perDiemCents:         z.number().int().min(0).nullable(),
  mileageRateCents:     z.number().int().min(0).nullable(),
  fees:                 z.array(defaultFeeRowSchema).max(20),
})

export type DealMemoDefaults = z.infer<typeof dealMemoDefaultsSchema>
export type DefaultFeeRow    = z.infer<typeof defaultFeeRowSchema>

export const BUILT_IN_DEAL_MEMO_DEFAULTS: DealMemoDefaults = {
  workDayHours:         10,
  otMultiplier:         1.5,
  doubleTimeAfterHours: 14,
  doubleTimeMultiplier: 2,
  productionZoneMiles:  30,
  perDiemCents:         null,
  mileageRateCents:     null,
  fees: [
    {
      kind: 'DAY_RATE', label: 'Day Rate / Service Fee', unit: 'DAY',
      termsText: 'Based on a {{dealMemo.workDayHours}}-hour work day.',
    },
    {
      kind: 'OVERTIME', label: 'Overtime Rate', unit: 'HOUR',
      termsText: '{{dealMemo.otMultiplier}}x hourly rate after {{dealMemo.workDayHours}} hours; {{dealMemo.doubleTimeMultiplier}}x after {{dealMemo.doubleTimeAfterHours}} hours.',
    },
    {
      kind: 'KIT', label: 'Kit / Equipment Rental Fee', unit: 'FLAT',
      termsText: 'Covers contractor-provided equipment listed in Exhibit A.',
    },
    {
      kind: 'PER_DIEM', label: 'Per Diem', unit: 'DAY',
      termsText: 'Provided for overnight/out-of-town travel days.',
    },
    {
      kind: 'MILEAGE', label: 'Mileage Reimbursement', unit: 'MILE',
      termsText: 'Applicable for travel outside a {{dealMemo.productionZoneMiles}}-mile production zone.',
    },
  ],
}

/**
 * Merge a stored JSON value onto the built-ins. Invalid or partial values
 * never throw — each field that fails validation falls back individually, so
 * one bad field can't wipe a workspace's other settings.
 */
export function resolveDealMemoDefaults(stored: unknown): DealMemoDefaults {
  const base = BUILT_IN_DEAL_MEMO_DEFAULTS
  if (!stored || typeof stored !== 'object') return base
  const raw = stored as Record<string, unknown>
  const shape = dealMemoDefaultsSchema.shape
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(shape) as (keyof DealMemoDefaults)[]) {
    if (!(key in raw)) continue
    const parsed = shape[key].safeParse(raw[key])
    if (parsed.success) out[key] = parsed.data
  }
  return out as DealMemoDefaults
}

/**
 * Overtime hourly rate derived from the day rate: day rate ÷ work-day hours ×
 * OT multiplier, rounded to the cent. Used while a memo's OT row is still
 * isAutoRate.
 */
export function autoOvertimeRateCents(dayRateCents: number, workDayHours: number, otMultiplier: number): number {
  if (!dayRateCents || !workDayHours) return 0
  return Math.round((dayRateCents / workDayHours) * otMultiplier)
}
