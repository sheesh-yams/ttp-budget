import { centsToHelcimDollars, helcimDollarsToCents } from '../money'

// ── centsToHelcimDollars ───────────────────────────────────────────────────

describe('centsToHelcimDollars', () => {
  test('whole dollar amounts', () => {
    expect(centsToHelcimDollars(10000)).toBe(100)
    expect(centsToHelcimDollars(0)).toBe(0)
    expect(centsToHelcimDollars(100)).toBe(1)
  })

  test('fractional dollar amounts', () => {
    expect(centsToHelcimDollars(1099)).toBe(10.99)
    expect(centsToHelcimDollars(1)).toBe(0.01)
    expect(centsToHelcimDollars(50)).toBe(0.5)
    expect(centsToHelcimDollars(999)).toBe(9.99)
  })

  test('large amounts', () => {
    expect(centsToHelcimDollars(1_500_000)).toBe(15000)
    expect(centsToHelcimDollars(250_000_00)).toBe(250000)
  })

  test('result is a number (not a string)', () => {
    expect(typeof centsToHelcimDollars(100)).toBe('number')
  })

  test('throws for non-integer input', () => {
    expect(() => centsToHelcimDollars(1.5)).toThrow(TypeError)
    expect(() => centsToHelcimDollars(NaN)).toThrow(TypeError)
  })

  test('round-trip: centsToHelcimDollars → helcimDollarsToCents recovers original', () => {
    const cases = [1, 99, 100, 1099, 10000, 12345, 999999]
    for (const cents of cases) {
      const dollars = centsToHelcimDollars(cents)
      expect(helcimDollarsToCents(dollars)).toBe(cents)
    }
  })
})

// ── helcimDollarsToCents ───────────────────────────────────────────────────

describe('helcimDollarsToCents', () => {
  test('numeric input', () => {
    expect(helcimDollarsToCents(100)).toBe(10000)
    expect(helcimDollarsToCents(0)).toBe(0)
    expect(helcimDollarsToCents(10.99)).toBe(1099)
    expect(helcimDollarsToCents(0.01)).toBe(1)
    expect(helcimDollarsToCents(0.1)).toBe(10)
  })

  test('string input (Helcim event shape)', () => {
    expect(helcimDollarsToCents('100.00')).toBe(10000)
    expect(helcimDollarsToCents('10.99')).toBe(1099)
    expect(helcimDollarsToCents('0.01')).toBe(1)
    expect(helcimDollarsToCents('0.50')).toBe(50)
    expect(helcimDollarsToCents('9999.99')).toBe(999999)
  })

  test('floating point drift is rounded correctly', () => {
    // 10.99 * 100 in IEEE 754 = 1098.9999999999999
    expect(helcimDollarsToCents(10.99)).toBe(1099)
    // 2.30 * 100 in IEEE 754 = 229.99999999999997
    expect(helcimDollarsToCents(2.30)).toBe(230)
    // 1.15 * 100 = 114.99999999999999
    expect(helcimDollarsToCents(1.15)).toBe(115)
  })

  test('throws for non-numeric string', () => {
    expect(() => helcimDollarsToCents('abc')).toThrow(TypeError)
    expect(() => helcimDollarsToCents('')).toThrow(TypeError)
  })

  test('throws for Infinity / NaN', () => {
    expect(() => helcimDollarsToCents(Infinity)).toThrow(TypeError)
    expect(() => helcimDollarsToCents(NaN)).toThrow(TypeError)
  })

  test('result is an integer', () => {
    const result = helcimDollarsToCents('123.45')
    expect(Number.isInteger(result)).toBe(true)
  })
})
