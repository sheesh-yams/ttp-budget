'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { generateInvoiceNumber } from '@/lib/invoice-numbering'
import { z } from 'zod'
import type { ActionResult } from '@/types'

const createSchema = z.object({
  projectId: z.string(),
  clientId: z.string(),
  budgetId: z.string().optional().nullable(),
  kind: z.enum(['DEPOSIT', 'PROGRESS', 'FINAL', 'STANDALONE']),
  title: z.string().min(1).max(300),
  dueDate: z.string(),
  lineItems: z.array(z.object({
    id: z.string(),
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
    rateCents: z.number().int(),
    lineTotalCents: z.number().int(),
    notes: z.string().optional(),
  })),
  subtotalCents: z.number().int(),
  taxPct: z.number(),
  taxCents: z.number().int(),
  discountCents: z.number().int().optional(),
  totalCents: z.number().int(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  poNumber: z.string().optional(),
})

export async function createInvoice(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string; number: string; publicToken: string }>> {
  try {
    const [scopedDb, user, workspaceId] = await Promise.all([
      getScopedDb(),
      getCurrentUser(),
      getWorkspaceId(),
    ])
    const data = createSchema.parse(input)
    const number = await generateInvoiceNumber(workspaceId)
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultInvoiceTerms: true },
    })

    const invoice = await scopedDb.invoice.create({
      data: {
        projectId: data.projectId,
        clientId: data.clientId,
        budgetId: data.budgetId ?? null,
        number,
        kind: data.kind,
        title: data.title,
        dueDate: new Date(data.dueDate),
        lineItems: data.lineItems as object[],
        subtotalCents: data.subtotalCents,
        taxPct: data.taxPct,
        taxCents: data.taxCents,
        discountCents: data.discountCents ?? 0,
        totalCents: data.totalCents,
        notes: data.notes ?? null,
        terms: data.terms ?? workspace?.defaultInvoiceTerms ?? null,
        poNumber: data.poNumber ?? null,
        createdById: user.id,
      } as unknown as Parameters<typeof scopedDb.invoice.create>[0]['data'],
    })

    revalidatePath(`/projects/${data.projectId}`)
    return { success: true, data: { id: invoice.id, number: invoice.number, publicToken: invoice.publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create invoice' }
  }
}

export async function markInvoicePaid(
  invoiceId: string,
  paymentMethod?: string,
  paymentRef?: string
): Promise<ActionResult> {
  try {
    const scopedDb = await getScopedDb()
    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date(), paymentMethod: paymentMethod ?? null, paymentRef: paymentRef ?? null },
    })
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to mark as paid' }
  }
}

export async function sendInvoice(invoiceId: string): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    const scopedDb = await getScopedDb()
    const invoice = await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT', sentAt: new Date() },
    })
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/i/${(invoice as unknown as { publicToken: string }).publicToken}`
    return { success: true, data: { publicUrl } }
  } catch {
    return { success: false, error: 'Failed to send invoice' }
  }
}

export async function recordInvoiceView(invoiceId: string, ip: string, userAgent: string): Promise<void> {
  // Public route — uses raw db (no user session)
  try {
    const now = new Date()
    await db.invoiceView.create({ data: { invoiceId, ip, userAgent, viewedAt: now } })
    await db.invoice.update({
      where: { id: invoiceId },
      data: { viewCount: { increment: 1 }, lastViewedAt: now, status: 'VIEWED' },
    })
    await db.invoice.updateMany({
      where: { id: invoiceId, firstViewedAt: null },
      data: { firstViewedAt: now },
    })
  } catch (err) {
    console.error('Failed to record invoice view:', err)
  }
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'VOID'
): Promise<ActionResult> {
  try {
    const scopedDb = await getScopedDb()
    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { projectId: true, totalCents: true },
    })
    if (!invoice) return { success: false, error: 'Invoice not found' }
    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        ...(status === 'PAID'
          ? { paidAt: new Date(), amountPaidCents: invoice.totalCents, sentAt: undefined }
          : status === 'SENT'
          ? { sentAt: new Date() }
          : {}),
      },
    })
    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update status' }
  }
}

export async function recordPayment(
  invoiceId: string,
  amountCents: number,
  method?: string,
  ref?: string
): Promise<ActionResult> {
  try {
    const scopedDb = await getScopedDb()
    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { totalCents: true, amountPaidCents: true, projectId: true },
    })
    if (!invoice) return { success: false, error: 'Invoice not found' }
    const newPaid = (invoice.amountPaidCents as number) + amountCents
    const fullyPaid = newPaid >= (invoice.totalCents as number)
    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaidCents: newPaid,
        ...(fullyPaid
          ? { status: 'PAID', paidAt: new Date(), paymentMethod: method ?? null, paymentRef: ref ?? null }
          : { paymentMethod: method ?? null, paymentRef: ref ?? null }),
      },
    })
    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to record payment' }
  }
}

export async function updateOverdueInvoices(): Promise<void> {
  // System cron — uses raw db (no user session)
  await db.invoice.updateMany({
    where: { status: { in: ['SENT', 'VIEWED'] }, dueDate: { lt: new Date() } },
    data: { status: 'OVERDUE' },
  })
}
