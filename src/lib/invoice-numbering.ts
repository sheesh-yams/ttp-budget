import { db } from '@/lib/db'

/**
 * The year an invoice is numbered under: its invoice (issue) date's year,
 * capped at the current year. A future date (or a typo like 2062) numbers
 * under this year, so the running counter only ever holds a real year.
 */
export function invoiceNumberYear(issueDate: Date, now = new Date()): number {
  // Calendar dates are stored at midday UTC (calendarDateToStored).
  return Math.min(issueDate.getUTCFullYear(), now.getUTCFullYear())
}

/** {prefix}-{year}-{seq}, seq padded to 3, e.g. TTP-2026-001. */
export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`
}

/**
 * Generate the next invoice number for a workspace, under the year of the
 * invoice's date (an invoice dated last year gets last year's number).
 * Format: {prefix}-{year}-{seq}  e.g. TTP-2026-001
 *
 * Current year: the workspace's running counter, taken with a single atomic
 * UPDATE…RETURNING with a CASE expression, so concurrent calls serialize on
 * the row lock:
 *   - Same year → increment seq
 *   - New year (or NULL on first ever invoice) → reset seq to 1
 *
 * An earlier year (a backdated invoice): one past the highest number that
 * year has used — on a live invoice, or on a deleted one (the invoice.deleted
 * and project.deleted audit events keep their numbers), so a number a client
 * may still hold is never given out again. Two backdated invoices for the same
 * year created at the same instant can compute the same number; the
 * @@unique([workspaceId, number]) constraint refuses the second.
 *
 * Pass a transaction client to take the number inside that transaction — if
 * the transaction rolls back, the counter does too (no gap).
 */
export async function generateInvoiceNumber(
  workspaceId: string,
  issueDate: Date,
  client: Pick<typeof db, '$queryRaw'> = db,
): Promise<string> {
  const year        = invoiceNumberYear(issueDate)
  const currentYear = new Date().getUTCFullYear()

  if (year === currentYear) {
    const rows = await client.$queryRaw<
      Array<{ invoiceNumberSeq: number; invoiceNumberPrefix: string }>
    >`
      UPDATE "Workspace"
      SET
        "invoiceNumberSeq" = CASE
                               WHEN "invoiceNumberYear" IS NOT DISTINCT FROM ${year}
                               THEN "invoiceNumberSeq" + 1
                               ELSE 1
                             END,
        "invoiceNumberYear" = ${year},
        "updatedAt"         = NOW()
      WHERE id = ${workspaceId}
      RETURNING "invoiceNumberSeq", "invoiceNumberPrefix"
    `
    if (!rows.length) throw new Error(`Workspace ${workspaceId} not found`)
    const { invoiceNumberSeq, invoiceNumberPrefix } = rows[0]
    return formatInvoiceNumber(invoiceNumberPrefix, year, Number(invoiceNumberSeq))
  }

  const ws = await client.$queryRaw<Array<{ invoiceNumberPrefix: string }>>`
    SELECT "invoiceNumberPrefix" FROM "Workspace" WHERE id = ${workspaceId}
  `
  if (!ws.length) throw new Error(`Workspace ${workspaceId} not found`)
  const lead = `${ws[0].invoiceNumberPrefix}-${year}-`
  const max = await client.$queryRaw<Array<{ max: number | null }>>`
    WITH used AS (
      SELECT "number" AS n FROM "Invoice" WHERE "workspaceId" = ${workspaceId}
      UNION ALL
      SELECT metadata->>'number' FROM "AuditEvent"
      WHERE "workspaceId" = ${workspaceId} AND action = 'invoice.deleted'
      UNION ALL
      SELECT jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(metadata::jsonb->'invoiceNumbers') = 'array'
                    THEN metadata::jsonb->'invoiceNumbers' ELSE '[]'::jsonb END)
      FROM "AuditEvent"
      WHERE "workspaceId" = ${workspaceId} AND action = 'project.deleted'
    )
    SELECT MAX(CAST(substring(n, ${lead.length + 1}::int) AS INTEGER)) AS "max"
    FROM used
    WHERE n IS NOT NULL
      AND starts_with(n, ${lead})
      AND substring(n, ${lead.length + 1}::int) ~ '^[0-9]{1,9}$'
  `
  return formatInvoiceNumber(ws[0].invoiceNumberPrefix, year, Number(max[0]?.max ?? 0) + 1)
}
