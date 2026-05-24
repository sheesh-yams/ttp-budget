/**
 * Shared validation schema for the Bulk Import / Quick Load feature.
 *
 * Expected input: flat array of objects — one object per LINE ITEM.
 * Items are grouped client-side for preview and server-side for DB writes.
 *
 * Money — rateCents must be a whole integer (cents).
 *   $1,500  →  rateCents: 150000
 *   $850    →  rateCents:  85000
 *
 * Percentages — markupPct and taxRate are decimals, NOT percents.
 *   10%  →  markupPct: 0.10
 *   8.5% →  taxRate:   0.085
 */

import { z } from 'zod'

// ─── Unit normaliser ──────────────────────────────────────────────────────────
// Accepts both display labels ("Day", "Half Day") and DB enum values ("DAY").

const UNIT_MAP: Record<string, string> = {
  HOUR:     'HOUR',  Hour:     'HOUR',  hour:     'HOUR',
  HALF_DAY: 'HALF_DAY',
  'Half Day': 'HALF_DAY', 'half day': 'HALF_DAY', 'Half day': 'HALF_DAY',
  DAY:      'DAY',   Day:      'DAY',   day:       'DAY',
  WEEK:     'WEEK',  Week:     'WEEK',  week:      'WEEK',
  FLAT:     'FLAT',  Flat:     'FLAT',  flat:      'FLAT',
  EACH:     'EACH',  Each:     'EACH',  each:      'EACH',
  MILE:     'MILE',  Mile:     'MILE',  mile:      'MILE',
}

const unitSchema = z
  .string()
  .transform((v, ctx) => {
    const mapped = UNIT_MAP[v]
    if (!mapped) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown unit "${v}". Valid values: Hour, Half Day, Day, Week, Flat, Each, Mile`,
      })
      return z.NEVER
    }
    return mapped
  })

// ─── Single import row ────────────────────────────────────────────────────────

export const importRowSchema = z.object({
  /** Which account (group) this line belongs to. Created if it doesn't exist. */
  accountName: z
    .string({ required_error: 'accountName is required' })
    .min(1, 'accountName cannot be empty')
    .max(200),

  /** The line item description (e.g. "Director Fee", "RED Komodo Package") */
  description: z
    .string({ required_error: 'description is required' })
    .min(1, 'description cannot be empty')
    .max(500),

  /** Quantity — decimals allowed (e.g. 0.5 for a half-day billed fractionally) */
  qty: z.number({ required_error: 'qty is required' }).positive('qty must be > 0').default(1),

  /** Rate unit. See UNIT_MAP for accepted strings. */
  unit: unitSchema,

  /**
   * Rate in CENTS — must be a whole integer.
   * $1,500/day  →  rateCents: 150000
   */
  rateCents: z
    .number({ required_error: 'rateCents is required' })
    .int('rateCents must be a whole integer (no decimals). $1,500 → 150000')
    .nonnegative('rateCents cannot be negative'),

  /**
   * Per-line markup as a decimal.  10% → 0.10  (max 1000%)
   * Applied on top of the raw line total before agency fee.
   */
  markupPct: z
    .number()
    .min(0, 'markupPct must be ≥ 0')
    .max(10, 'markupPct must be ≤ 10 (= 1000%)')
    .optional()
    .nullable()
    .default(null),

  /** Whether the budget-level agency fee applies to this item. */
  hasMarkup: z.boolean().optional().default(true),

  /**
   * Per-item tax rate as a decimal.  8.5% → 0.085
   * Used for equipment sales tax, workers' comp, etc.
   */
  taxRate: z
    .number()
    .min(0, 'taxRate must be ≥ 0')
    .max(1, 'taxRate must be ≤ 1 (= 100%)')
    .optional()
    .nullable()
    .default(null),

  /** Optional internal note shown next to the description */
  notes: z.string().max(1000).optional().nullable().default(null),
})

export type ImportRow = z.infer<typeof importRowSchema>

export const importPayloadSchema = z
  .array(importRowSchema)
  .min(1, 'Import must contain at least one row')

export type ImportPayload = z.infer<typeof importPayloadSchema>

// ─── Human-readable Zod error ─────────────────────────────────────────────────

export function formatZodError(err: z.ZodError): string {
  const e = err.errors[0]
  if (!e) return 'Validation failed'
  const rowIdx = typeof e.path[0] === 'number' ? e.path[0] : null
  const field  = e.path.slice(rowIdx !== null ? 1 : 0).join('.')
  const prefix = rowIdx !== null ? `Row ${rowIdx + 1}` : ''
  const parts  = [prefix, field && `field "${field}"`, e.message].filter(Boolean)
  return parts.join(' — ')
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Handles quoted fields (including commas inside quotes) and CRLF/LF line endings.

function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Escaped quote inside quoted field: ""
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue }
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

const NUMERIC_FIELDS  = new Set(['qty', 'rateCents', 'markupPct', 'taxRate'])
const BOOLEAN_FIELDS  = new Set(['hasMarkup'])

export function parseFileText(text: string, filename: string): unknown[] {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(text) as unknown
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects')
    return parsed
  }

  if (lower.endsWith('.csv')) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')
    const headers = parseCSVRow(lines[0])

    return lines.slice(1).map((line, idx) => {
      const values = parseCSVRow(line)
      const obj: Record<string, unknown> = {}
      headers.forEach((header, i) => {
        const raw = values[i] ?? ''
        if (NUMERIC_FIELDS.has(header)) {
          const n = Number(raw)
          obj[header] = raw === '' ? undefined : isNaN(n) ? raw : n
        } else if (BOOLEAN_FIELDS.has(header)) {
          obj[header] = raw === '' ? undefined : raw.toLowerCase() === 'true' || raw === '1'
        } else {
          obj[header] = raw === '' ? undefined : raw
        }
      })
      if (!('qty' in obj)) obj.qty = 1
      // Zero-value rateCents from an empty CSV cell → keep as 0 (valid)
      if (obj.rateCents === undefined) {
        throw new Error(`Row ${idx + 2}: missing rateCents`)
      }
      return obj
    })
  }

  throw new Error('Unsupported file type. Upload a .json or .csv file.')
}

// ─── Sample CSV template (for download) ──────────────────────────────────────

export const CSV_TEMPLATE = [
  'accountName,description,qty,unit,rateCents,markupPct,hasMarkup,taxRate,notes',
  'Pre-Production,Director Fee,1,Flat,500000,,,',
  'Pre-Production,Treatment Writing,1,Flat,75000,,,',
  'Crew,Director of Photography,3,Day,150000,,true,',
  'Crew,Gaffer,3,Day,90000,,true,',
  'Equipment,RED Komodo Package,3,Day,80000,,true,0.0875',
  'Equipment,Grip Truck,3,Day,45000,,true,0.0875',
  'Post Production,Edit – Assembly + Fine Cut,1,Flat,350000,,,',
  'Post Production,Color Grade,1,Flat,120000,,,',
].join('\n')
