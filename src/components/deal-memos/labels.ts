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
