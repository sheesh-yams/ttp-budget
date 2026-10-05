import {
  allowedFromStatuses, applyAutoOvertime, buildDealMemoPrefill, canTransition,
  dayRateForOvertime, lineHeadcountAndDays, memoExpectedCents, moveInOrder,
} from '../deal-memo-core'
import { BUILT_IN_DEAL_MEMO_DEFAULTS } from '../deal-memo-defaults'

const project = { shootStartDate: new Date('2026-10-03T00:00:00Z'), shootEndDate: new Date('2026-10-04T00:00:00Z') }
const contact = { primaryRole: 'Director of Photography', defaultRateCents: 200000, defaultRateUnit: 'DAY' as const, hasKit: true, kitRateCents: 50000 }

describe('status lifecycle', () => {
  it('only lets a bid be awarded, and only a confirmed memo be cancelled', () => {
    expect(canTransition('BID', 'CONFIRMED')).toBe(true)
    expect(canTransition('NOT_SELECTED', 'CONFIRMED')).toBe(false)
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false)
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true)
    expect(canTransition('BID', 'CANCELLED')).toBe(false)
  })

  it('derives the guarded `where` statuses from the same rules', () => {
    expect(allowedFromStatuses('CONFIRMED')).toEqual(['BID'])
    expect(allowedFromStatuses('BID').sort()).toEqual(['CANCELLED', 'NOT_SELECTED'])
  })
})

describe('buildDealMemoPrefill', () => {
  const line = { description: 'Videographer', quantity: 2, quantityFormula: '1x2', rateCents: 125000, unit: 'DAY' as const }

  it('starts the day rate from the budget line (planned cost, before the agency fee)', () => {
    const p = buildDealMemoPrefill({ defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line, contact, project })
    const day = p.fees.find(f => f.kind === 'DAY_RATE')!
    expect(day).toMatchObject({ rateCents: 125000, unit: 'DAY', quantity: 2 })
    expect(p.fees.find(f => f.kind === 'KIT')).toMatchObject({ rateCents: 50000, unit: 'DAY', quantity: 2 })
  })

  it('falls back to the person’s rolodex rate when the budget line has no rate', () => {
    const p = buildDealMemoPrefill({ defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line: { ...line, rateCents: 0 }, contact, project })
    expect(p.fees.find(f => f.kind === 'DAY_RATE')).toMatchObject({ rateCents: 200000, quantity: 2 })
  })

  it('defaults the vendor-facing position to the budget role and copies shoot dates', () => {
    const p = buildDealMemoPrefill({ defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line, contact, project })
    expect(p.roleLabel).toBe('Videographer')
    expect(p.position).toBe('Videographer')
    expect(p.startDate).toEqual(project.shootStartDate)
    expect(p.days).toBe(2)
  })

  it('sets auto overtime from the day rate ($1,250 ÷ 10 hours × 1.5 = $187.50/hr)', () => {
    const p = buildDealMemoPrefill({ defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line, contact, project })
    expect(p.fees.find(f => f.kind === 'OVERTIME')).toMatchObject({ rateCents: 18750, isAutoRate: true, quantity: 0 })
  })

  it('still prefills from the budget when the person has no rolodex rate (the reported $0 case)', () => {
    const p = buildDealMemoPrefill({
      defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line, project,
      contact: { ...contact, defaultRateCents: null, hasKit: false, kitRateCents: null },
    })
    expect(p.fees.find(f => f.kind === 'DAY_RATE')!.rateCents).toBe(125000)
    expect(p.fees.find(f => f.kind === 'KIT')!.rateCents).toBe(0)
  })

  it('uses the typed role name when there is no budget line', () => {
    const p = buildDealMemoPrefill({ defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line: null, contact, project, roleLabel: 'Production Assistant' })
    expect(p.roleLabel).toBe('Production Assistant')
    expect(p.days).toBe(1)
  })

  it('expects nothing for per diem, mileage or OT until quantities are entered', () => {
    const p = buildDealMemoPrefill({ defaults: BUILT_IN_DEAL_MEMO_DEFAULTS, line, contact, project })
    // day rate 2 × $1,250 + kit 2 × $500
    expect(memoExpectedCents(p.fees)).toBe(350000)
  })
})

describe('overtime + line helpers', () => {
  it('recomputes only auto-rate OT fees', () => {
    const fees = [
      { kind: 'OVERTIME' as const, isAutoRate: true,  rateCents: 1 },
      { kind: 'OVERTIME' as const, isAutoRate: false, rateCents: 9999 },
      { kind: 'DAY_RATE' as const, isAutoRate: false, rateCents: 65000 },
    ]
    const next = applyAutoOvertime(fees, 65000, 12, 1.5)
    expect(next.map(f => f.rateCents)).toEqual([8125, 9999, 65000])
  })

  it('follows only a per-day day rate', () => {
    expect(dayRateForOvertime([{ kind: 'DAY_RATE', unit: 'FLAT', rateCents: 100000 }])).toBe(0)
    expect(dayRateForOvertime([{ kind: 'DAY_RATE', unit: 'DAY', rateCents: 100000 }])).toBe(100000)
  })

  it('reads headcount × days from the quantity formula', () => {
    expect(lineHeadcountAndDays({ quantity: 6, quantityFormula: '3x2' })).toEqual({ headcount: 3, days: 2 })
    expect(lineHeadcountAndDays({ quantity: 4, quantityFormula: null })).toEqual({ headcount: 4, days: 1 })
  })
})

describe('moveInOrder', () => {
  const ids = ['a', 'b', 'c']
  it('swaps with the neighbour', () => {
    expect(moveInOrder(ids, 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveInOrder(ids, 'b', 'down')).toEqual(['a', 'c', 'b'])
  })
  it('is null at the ends or for an unknown id', () => {
    expect(moveInOrder(ids, 'a', 'up')).toBeNull()
    expect(moveInOrder(ids, 'c', 'down')).toBeNull()
    expect(moveInOrder(ids, 'z', 'up')).toBeNull()
  })
  it('does not mutate the input', () => {
    moveInOrder(ids, 'b', 'up')
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
