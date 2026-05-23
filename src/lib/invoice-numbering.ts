import { db } from '@/lib/db'

/**
 * Generate the next invoice number for a workspace.
 * Format: TTP-2026-001
 * Uses an atomic DB update to prevent races.
 */
export async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const currentYear = new Date().getFullYear()

  // Atomically increment the sequence, resetting if the year changed
  const workspace = await db.workspace.update({
    where: { id: workspaceId },
    data: {
      invoiceNumberSeq: {
        // If the year matches, increment. Otherwise, Prisma doesn't support
        // conditional increments directly, so we handle year reset separately.
        increment: 1,
      },
      invoiceNumberYear: currentYear,
    },
    select: {
      invoiceNumberSeq: true,
      invoiceNumberYear: true,
      invoiceNumberPrefix: true,
    },
  })

  // If year rolled over, reset sequence to 1
  if (workspace.invoiceNumberYear !== currentYear) {
    const reset = await db.workspace.update({
      where: { id: workspaceId },
      data: { invoiceNumberSeq: 1, invoiceNumberYear: currentYear },
      select: {
        invoiceNumberSeq: true,
        invoiceNumberPrefix: true,
      },
    })
    return `${reset.invoiceNumberPrefix}-${currentYear}-${String(reset.invoiceNumberSeq).padStart(3, '0')}`
  }

  const seq = String(workspace.invoiceNumberSeq).padStart(3, '0')
  return `${workspace.invoiceNumberPrefix}-${currentYear}-${seq}`
}
