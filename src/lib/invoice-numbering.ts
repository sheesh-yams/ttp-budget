import { db } from '@/lib/db'

/**
 * Generate the next invoice number for a workspace.
 * Format: {prefix}-{year}-{seq}  e.g. TTP-2026-001
 *
 * Uses a single atomic PostgreSQL UPDATE…RETURNING with a CASE expression so
 * that concurrent calls serialize on the row lock and each receive a distinct
 * sequential number — no two callers can read the same counter value.
 *
 * Year rollover is handled in the same statement:
 *   - Same year → increment seq
 *   - Different year (or NULL on first ever invoice) → reset seq to 1
 *
 * The Invoice table has @@unique([workspaceId, number]) as a hard backstop in
 * case something unexpected produces the same number.
 */
export async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const currentYear = new Date().getFullYear()

  const rows = await db.$queryRaw<
    Array<{ invoiceNumberSeq: number; invoiceNumberPrefix: string }>
  >`
    UPDATE "Workspace"
    SET
      "invoiceNumberSeq" = CASE
                             WHEN "invoiceNumberYear" IS NOT DISTINCT FROM ${currentYear}
                             THEN "invoiceNumberSeq" + 1
                             ELSE 1
                           END,
      "invoiceNumberYear" = ${currentYear},
      "updatedAt"         = NOW()
    WHERE id = ${workspaceId}
    RETURNING "invoiceNumberSeq", "invoiceNumberPrefix"
  `

  if (!rows.length) throw new Error(`Workspace ${workspaceId} not found`)

  const { invoiceNumberSeq, invoiceNumberPrefix } = rows[0]
  const seq = String(Number(invoiceNumberSeq)).padStart(3, '0')
  return `${invoiceNumberPrefix}-${currentYear}-${seq}`
}
