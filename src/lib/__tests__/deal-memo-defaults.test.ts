import {
  BUILT_IN_DEAL_MEMO_DEFAULTS,
  autoOvertimeRateCents,
  resolveDealMemoDefaults,
} from '../deal-memo-defaults'

describe('resolveDealMemoDefaults', () => {
  it('returns built-ins for an empty or missing value', () => {
    expect(resolveDealMemoDefaults({})).toEqual(BUILT_IN_DEAL_MEMO_DEFAULTS)
    expect(resolveDealMemoDefaults(null)).toEqual(BUILT_IN_DEAL_MEMO_DEFAULTS)
    expect(resolveDealMemoDefaults('garbage')).toEqual(BUILT_IN_DEAL_MEMO_DEFAULTS)
  })

  it('ships the five standard fee rows in order', () => {
    expect(BUILT_IN_DEAL_MEMO_DEFAULTS.fees.map(f => f.kind)).toEqual(
      ['DAY_RATE', 'OVERTIME', 'KIT', 'PER_DIEM', 'MILEAGE'],
    )
  })

  it('keeps valid stored fields and falls back per field on invalid ones', () => {
    const resolved = resolveDealMemoDefaults({
      workDayHours: 12,          // valid
      otMultiplier: 'lots',      // invalid → built-in
      productionZoneMiles: 50,   // valid
      perDiemCents: 7500,        // valid
    })
    expect(resolved.workDayHours).toBe(12)
    expect(resolved.otMultiplier).toBe(BUILT_IN_DEAL_MEMO_DEFAULTS.otMultiplier)
    expect(resolved.productionZoneMiles).toBe(50)
    expect(resolved.perDiemCents).toBe(7500)
    expect(resolved.fees).toEqual(BUILT_IN_DEAL_MEMO_DEFAULTS.fees)
  })

  it('rejects an out-of-range work day rather than storing it', () => {
    expect(resolveDealMemoDefaults({ workDayHours: 9 }).workDayHours).toBe(10)
  })
})

describe('autoOvertimeRateCents', () => {
  it('is day rate ÷ work-day hours × multiplier, rounded to the cent', () => {
    // $500/day on a 10-hour day at 1.5x → $75.00/hr
    expect(autoOvertimeRateCents(50000, 10, 1.5)).toBe(7500)
    // $650/day on a 12-hour day at 1.5x → $81.25/hr
    expect(autoOvertimeRateCents(65000, 12, 1.5)).toBe(8125)
    // $333/day on a 10-hour day at 1.5x → 4995 cents exactly
    expect(autoOvertimeRateCents(33300, 10, 1.5)).toBe(4995)
  })

  it('is 0 when there is no day rate or no work day', () => {
    expect(autoOvertimeRateCents(0, 10, 1.5)).toBe(0)
    expect(autoOvertimeRateCents(50000, 0, 1.5)).toBe(0)
  })
})
