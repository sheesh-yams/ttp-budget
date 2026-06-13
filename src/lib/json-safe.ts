/**
 * Serialise a value to a JSON-safe plain object.
 *
 * Use this at server-action boundaries when storing typed objects in Prisma
 * JSON fields — in place of the `JSON.parse(JSON.stringify(value))` pattern.
 *
 * Handles:
 *   - Prisma Decimal (anything with `.toNumber()`) → number
 *   - Date instances                               → ISO-8601 string
 *   - Arrays and plain objects                     → recursed into
 *   - null / undefined / primitives                → passed through as-is
 *
 * Returns `any` intentionally so callers can assign to Prisma JSON fields
 * without extra casts (mirrors the behaviour of JSON.parse(JSON.stringify)).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJsonSafe(value: unknown): any {
  if (value === null || value === undefined) return value

  // Decimal-like objects (Prisma Decimal, decimal.js, BigNumber…)
  if (
    typeof value === 'object' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber(): number }).toNumber()
  }

  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) return value.map(toJsonSafe)

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toJsonSafe(v)])
    )
  }

  return value
}
