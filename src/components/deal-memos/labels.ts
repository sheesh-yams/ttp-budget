import type { DealMemoFeeKind, DealMemoStatus, RateUnit } from '@prisma/client'

export const STATUS_META: Record<DealMemoStatus, { label: string; className: string }> = {
  BID:          { label: 'Bid',          className: 'bg-amber-50 text-amber-700 border-amber-200' },
  CONFIRMED:    { label: 'Confirmed',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  NOT_SELECTED: { label: 'Not selected', className: 'bg-muted text-muted-foreground border-border' },
  CANCELLED:    { label: 'Cancelled',    className: 'bg-red-50 text-red-600 border-red-200' },
}

export const UNIT_SUFFIX: Record<RateUnit, string> = {
  DAY: '/day', HOUR: '/hr', HALF_DAY: '/half day', WEEK: '/week', FLAT: ' total', EACH: ' each', MILE: '/mile',
}

export const UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: 'DAY',      label: 'per day' },
  { value: 'HOUR',     label: 'per hour' },
  { value: 'HALF_DAY', label: 'per half day' },
  { value: 'WEEK',     label: 'per week' },
  { value: 'FLAT',     label: 'total' },
  { value: 'EACH',     label: 'each' },
  { value: 'MILE',     label: 'per mile' },
]

export const QTY_NOUN: Record<RateUnit, string> = {
  DAY: 'days', HOUR: 'hours', HALF_DAY: 'half days', WEEK: 'weeks', FLAT: '×', EACH: '×', MILE: 'miles',
}

export const FEE_KIND_LABEL: Record<DealMemoFeeKind, string> = {
  DAY_RATE: 'Day rate', OVERTIME: 'Overtime', KIT: 'Kit', PER_DIEM: 'Per diem', MILEAGE: 'Mileage', CUSTOM: 'Custom',
}

/**
 * Where an awarded (CONFIRMED) memo is with the vendor — from its send / view
 * / signature stamps. Pure, so client components can use it.
 */
export type VendorStage = 'awarded' | 'sent' | 'viewed' | 'signed'

export function vendorStage(m: { sentAt: string | Date | null; firstViewedAt: string | Date | null; signedAt: string | Date | null }): VendorStage {
  if (m.signedAt) return 'signed'
  if (m.firstViewedAt) return 'viewed'
  if (m.sentAt) return 'sent'
  return 'awarded'
}

export const VENDOR_STAGE_META: Record<VendorStage, { label: string; className: string }> = {
  awarded: { label: 'Awarded — not sent', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  sent:    { label: 'Sent',               className: 'bg-blue-50 text-blue-700 border-blue-200' },
  viewed:  { label: 'Viewed',             className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  signed:  { label: 'Signed',             className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
}

