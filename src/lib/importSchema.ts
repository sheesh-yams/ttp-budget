/**
 * Shared validation schema for the Bulk Import / Quick Load feature.
 *
 * Expected input: flat array of objects — one object per LINE ITEM.
 * Items are grouped client-side for preview and server-side for DB writes.
 *
 * Rate — provide EITHER:
 *   rate      dollars (preferred) — e.g. 1500  → stored as 150000 cents
 *   rateCents cents  (legacy)    — e.g. 150000 → stored as-is
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
    const mapped = UNIT_MAP[v.trim()]
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

export const importRowSchema = z
  .object({
    /** Which account (group) this line belongs to. Created if it doesn't exist. */
    accountName: z
      .string({ required_error: 'accountName is required' })
      .min(1, 'accountName cannot be empty')
      .max(200),

    /**
     * The line item description. If blank, falls back to accountName.
     * e.g. "Director Fee", "RED Komodo Package"
     */
    description: z.string().max(500).optional().nullable().default(null),

    /** Quantity — decimals allowed (e.g. 0.5 for a half-day billed fractionally) */
    qty: z.number().positive('qty must be > 0').optional().nullable().default(1),

    /** Rate unit. See UNIT_MAP for accepted strings. */
    unit: unitSchema,

    /**
     * Rate in DOLLARS — preferred. Automatically converted to cents.
     * $1,500/day → rate: 1500
     */
    rate: z.number().nonnegative('rate cannot be negative').optional().nullable(),

    /**
     * Rate in CENTS — legacy / advanced. Must be a whole integer.
     * $1,500/day → rateCents: 150000
     */
    rateCents: z
      .number()
      .int('rateCents must be a whole integer. Use the "rate" column for dollar amounts.')
      .nonnegative('rateCents cannot be negative')
      .optional()
      .nullable(),

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
  .transform((data, ctx) => {
    // ── Resolve rate → rateCents ────────────────────────────────────────────
    let cents: number
    if (data.rateCents != null) {
      cents = data.rateCents
    } else if (data.rate != null) {
      cents = Math.round(data.rate * 100)
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'rate (dollar amount) is required',
      })
      return z.NEVER
    }

    // ── description falls back to accountName if blank ──────────────────────
    const description =
      data.description && data.description.trim().length > 0
        ? data.description.trim()
        : data.accountName.trim()

    const { rate: _r, rateCents: _rc, description: _d, ...rest } = data
    return {
      ...rest,
      description,
      qty: rest.qty ?? 1,
      rateCents: cents,
    }
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
  let current  = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
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

/**
 * Strip non-alphanumeric chars from a header cell so exported templates with
 * labels like "accountName *" or "rate ($)" normalise to "accountName" / "rate".
 */
function cleanHeader(h: string): string {
  return h.replace(/[^a-zA-Z]/g, '')
}

const KNOWN_HEADERS = new Set([
  'accountName', 'description', 'qty', 'unit',
  'rate', 'rateCents', 'markupPct', 'hasMarkup', 'taxRate', 'notes',
])

const NUMERIC_FIELDS = new Set(['qty', 'rate', 'rateCents', 'markupPct', 'taxRate'])
const BOOLEAN_FIELDS = new Set(['hasMarkup'])

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

    // ── Find the header row ──────────────────────────────────────────────────
    // Scan the first 5 rows for the one that contains at least 2 known field
    // names. This skips title rows, subtitle rows, etc. exported from sheets.
    let headerLineIdx = 0
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const fields = parseCSVRow(lines[i]).map(cleanHeader)
      if (fields.filter(f => KNOWN_HEADERS.has(f)).length >= 2) {
        headerLineIdx = i
        break
      }
    }

    const headers = parseCSVRow(lines[headerLineIdx]).map(cleanHeader)

    // ── Skip description row if present ─────────────────────────────────────
    // A description row immediately follows the header and has no numeric value
    // in the rate/rateCents column — it's a long explanatory string instead.
    const rateColIdx = headers.indexOf('rate') !== -1
      ? headers.indexOf('rate')
      : headers.indexOf('rateCents')

    let dataStartIdx = headerLineIdx + 1
    if (dataStartIdx < lines.length && rateColIdx >= 0) {
      const candidateCells = parseCSVRow(lines[dataStartIdx])
      const rateVal        = candidateCells[rateColIdx] ?? ''
      if (rateVal.length > 15 && isNaN(Number(rateVal))) {
        dataStartIdx++ // skip description row
      }
    }

    // ── Parse data rows ──────────────────────────────────────────────────────
    return lines.slice(dataStartIdx).map((line) => {
      const values = parseCSVRow(line)
      const obj: Record<string, unknown> = {}

      headers.forEach((header, i) => {
        if (!header) return // skip empty/unknown columns
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

      if (!('qty' in obj) || obj.qty === undefined) obj.qty = 1
      return obj
    })
  }

  throw new Error('Unsupported file type. Upload a .json or .csv file.')
}

// ─── Sample CSV template (for download) ──────────────────────────────────────
// Uses "rate" (dollars) — simpler for end users.

export const CSV_TEMPLATE = [
  'accountName,description,qty,unit,rate,markupPct,hasMarkup,taxRate,notes',
  'Pre-Production,Director Fee,1,Flat,5000,,,',
  'Pre-Production,Treatment Writing,1,Flat,750,,,',
  'Crew,Director of Photography,3,Day,1500,,true,',
  'Crew,Gaffer,3,Day,900,,true,',
  'Equipment,RED Komodo Package,3,Day,800,,true,0.0875',
  'Equipment,Grip Truck,3,Day,450,,true,0.0875',
  'Post Production,Edit – Assembly + Fine Cut,1,Flat,3500,,,',
  'Post Production,Color Grade,1,Flat,1200,,,',
].join('\n')
