'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId, requireRole } from '@/lib/auth'
import { generateInvoiceNumber } from '@/lib/invoice-numbering'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { logAuditEvent } from '@/lib/audit'
import { generatePublicToken } from '@/lib/secure-token'
import { normalizeRecipientEmails, buildCcList } from '@/lib/email'
import { calcInvoiceTotals, calendarDateToStored } from '@/lib/invoice-totals'
import { formatMoney } from '@/lib/money'

// ─── Payment terms label ────────────────────────────────────────────────────
// Derived from the actual gap between issue date and due date, rather than a
// fixed workspace default — a workspace-wide "Net 30" default is wrong for
// any invoice whose due date was picked custom instead of using that default.
const COMMON_TERM_DAYS = [15, 30, 45, 60, 90]

function deriveInvoicePaymentTerms(issueDate: Date, dueDate: Date): string | null {
  const days = Math.round((dueDate.getTime() - issueDate.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Due on Receipt'
  if (COMMON_TERM_DAYS.includes(days)) return `Net ${days}`
  return null
}

const createSchema = z.object({
  projectId: z.string(),
  clientId: z.string(),
  budgetId: z.string().optional().nullable(),
  kind: z.enum(['DEPOSIT', 'PROGRESS', 'FINAL', 'STANDALONE']),
  title: z.string().min(1).max(300),
  /** YYYY-MM-DD; defaults to today. Can be backdated (a client asks for a date). */
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  notes:         z.string().optional(),
  terms:         z.string().optional(),
  paymentTerms:  z.string().optional(),
  poNumber:      z.string().optional(),
})

export async function createInvoice(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string; number: string; publicToken: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user, workspaceId] = await Promise.all([
      getScopedDb(),
      getCurrentUser(),
      getWorkspaceId(),
    ])
    const data = createSchema.parse(input)

    // Calendar dates stored at midday UTC (see calendarDateToStored).
    const issueDate = data.issueDate ? calendarDateToStored(data.issueDate) : new Date()
    const dueDate   = calendarDateToStored(data.dueDate.slice(0, 10))
    if (!issueDate || !dueDate) return { success: false, error: 'Invalid date' }
    if (data.issueDate && dueDate < issueDate) return { success: false, error: 'The due date can’t be before the invoice date.' }

    // Only take a number once the invoice is going to be created (no gaps).
    const number = await generateInvoiceNumber(workspaceId)
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultInvoiceTerms: true },
    })
    // Recompute — never trust totals sent by the client.
    const totals = calcInvoiceTotals({
      lineTotalsCents: data.lineItems.map(li => li.lineTotalCents),
      discountCents:   data.discountCents ?? 0,
      taxPct:          data.taxPct,
    })

    const invoice = await scopedDb.invoice.create({
      data: {
        projectId: data.projectId,
        clientId: data.clientId,
        budgetId: data.budgetId ?? null,
        number,
        publicToken: generatePublicToken(),
        kind: data.kind,
        title: data.title,
        issueDate,
        dueDate,
        lineItems: data.lineItems as object[],
        subtotalCents: totals.subtotalCents,
        taxPct: data.taxPct,
        taxCents: totals.taxCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        notes:         data.notes ?? null,
        terms:         data.terms ?? workspace?.defaultInvoiceTerms ?? null,
        paymentTerms:  data.paymentTerms ?? deriveInvoicePaymentTerms(issueDate, dueDate),
        poNumber:      data.poNumber ?? null,
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { workspaceId: true, totalCents: true },
    })
    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date(), paymentMethod: paymentMethod ?? null, paymentRef: paymentRef ?? null },
    })
    revalidatePath('/dashboard')

    if (invoice) {
      await logAuditEvent({
        workspaceId: invoice.workspaceId,
        actorId:     user.id,
        action:      'invoice.paid',
        entityType:  'Invoice',
        entityId:    invoiceId,
        metadata:    { totalCents: invoice.totalCents, paymentMethod: paymentMethod ?? null },
      })
    }

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to mark as paid' }
  }
}

export async function getInvoiceSendData(invoiceId: string) {
  try {
    // Money data — Owner/Producer only (server actions are callable directly).
    if (!(await requireRole(['OWNER', 'PRODUCER'])).ok) return null
    const [scopedDb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])

    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        totalCents: true,
        dueDate: true,
        publicToken: true,
        recipientEmails: true,
        client: { select: { name: true, contactEmail: true } },
        project: { select: { name: true } },
      },
    })

    if (!invoice) return null

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, contactEmail: true, primaryColor: true, accentColor: true },
    })

    return {
      id:            invoice.id,
      number:        invoice.number,
      title:         invoice.title,
      status:        invoice.status,
      totalCents:    invoice.totalCents,
      dueDate:       invoice.dueDate,
      publicToken:   invoice.publicToken,
      clientName:    (invoice.client as { name: string }).name,
      clientEmail:   (invoice.client as { contactEmail: string | null }).contactEmail ?? '',
      recipientEmails: invoice.recipientEmails ?? [],
      projectName:   (invoice.project as { name: string }).name,
      workspaceName: workspace?.name ?? '',
      fromEmail:     workspace?.contactEmail ?? '',
      brandPrimary:  workspace?.primaryColor ?? null,
      brandAccent:   workspace?.accentColor ?? null,
    }
  } catch {
    return null
  }
}

export async function sendInvoice(
  invoiceId: string,
  emailOpts: { to: string; cc?: string[]; subject: string; message: string },
): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    // CC recipients the user entered — persisted + pre-filled next time, with the
    // client's own "to" address stripped so it isn't both To and CC.
    const ccRecipients = normalizeRecipientEmails(emailOpts.cc)
      .filter(e => e !== emailOpts.to.trim().toLowerCase())
    // What actually goes out as CC = the sender (so the client can reply-all) + those recipients.
    const ccToSend = buildCcList(emailOpts.to, ccRecipients, user.email)

    const existing = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: {
        workspaceId: true,
        publicToken: true,
        number: true,
        totalCents: true,
        dueDate: true,
        project: { select: { name: true } },
        workspace: { select: { name: true, primaryColor: true, accentColor: true } },
      },
    })

    if (!existing) return { success: false, error: 'Invoice not found' }

    // Build the canonical URL for client-facing invoice links.
    // Priority: APP_URL (server-only, always production) → NEXT_PUBLIC_APP_URL → empty fallback.
    // Always use the canonical production domain — never a deployment-specific URL.
    const baseUrl = (
      process.env.APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null) ??
      process.env.NEXT_PUBLIC_APP_URL ??
      ''
    ).replace(/\/$/, '')
    const publicUrl = `${baseUrl}/i/${(existing as unknown as { publicToken: string }).publicToken}`

    // Send the email via Resend FIRST — the invoice only flips to SENT once the
    // email actually goes out, so a Resend failure never leaves it stuck showing
    // "sent" when the client never received anything.
    const { sendInvoiceEmail } = await import('@/lib/email')
    let messageId: string
    try {
      const sent = await sendInvoiceEmail({
        to:             emailOpts.to,
        cc:             ccToSend,
        subject:        emailOpts.subject,
        customMessage:  emailOpts.message,
        invoiceNumber:  existing.number,
        projectName:    (existing.project as { name: string }).name,
        amountCents:    existing.totalCents,
        dueDate:        new Date(existing.dueDate),
        invoiceUrl:     publicUrl,
        workspaceName:  existing.workspace?.name ?? null,
        brandPrimary:   existing.workspace?.primaryColor ?? null,
        brandAccent:    existing.workspace?.accentColor ?? null,
        actorName:      user.name ?? user.email,
        actorEmail:     user.email,
      })
      messageId = sent.id
    } catch (emailErr) {
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown error'
      console.error('[sendInvoice] email send failed', emailErr)
      await logAuditEvent({
        workspaceId: existing.workspaceId,
        actorId:     user.id,
        action:      'invoice.email_failed',
        entityType:  'Invoice',
        entityId:    invoiceId,
        metadata:    { to: emailOpts.to, error: message },
      })
      return { success: false, error: `Email failed to send: ${message}` }
    }

    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        recipientEmails: ccRecipients,
        publicTokenExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      } as unknown as Parameters<typeof scopedDb.invoice.update>[0]['data'],
    })

    await logAuditEvent({
      workspaceId: existing.workspaceId,
      actorId:     user.id,
      action:      'invoice.email_sent',
      entityType:  'Invoice',
      entityId:    invoiceId,
      metadata:    { to: emailOpts.to, cc: ccToSend, messageId },
    })

    return { success: true, data: { publicUrl } }
  } catch (err) {
    console.error('[sendInvoice]', err)
    return { success: false, error: 'Failed to send invoice' }
  }
}

// ─── Mark an invoice as sent without emailing it ───────────────────────────
// For invoices actually sent through another tool (QuickBooks, Stripe
// Invoicing, a wire) — flips DRAFT → SENT so it's tracked here too, without
// attempting delivery. Mirrors sendDraftProposal's sendEmail=false branch.

export async function markInvoiceAsSent(
  invoiceId: string
): Promise<ActionResult<{ status: 'SENT' }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { workspaceId: true, status: true, projectId: true },
    })
    if (!invoice) return { success: false, error: 'Invoice not found' }
    if (invoice.status !== 'DRAFT') {
      return { success: false, error: `Cannot mark an invoice with status ${invoice.status} as sent — only drafts can be marked sent without emailing.` }
    }

    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        publicTokenExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      } as unknown as Parameters<typeof scopedDb.invoice.update>[0]['data'],
    })

    await logAuditEvent({
      workspaceId: invoice.workspaceId as string,
      actorId:     user.id,
      action:      'invoice.marked_sent',
      entityType:  'Invoice',
      entityId:    invoiceId,
    })

    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath('/invoices')
    revalidatePath('/dashboard')

    return { success: true, data: { status: 'SENT' } }
  } catch (err) {
    console.error('[markInvoiceAsSent]', err)
    return { success: false, error: 'Failed to mark invoice as sent' }
  }
}

export async function voidInvoice(invoiceId: string): Promise<ActionResult> {
  console.log('[voidInvoice] called', { invoiceId })
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { workspaceId: true, status: true, projectId: true },
    })

    if (!invoice) return { success: false, error: 'Invoice not found' }

    const voidable = ['SENT', 'VIEWED', 'OVERDUE', 'DRAFT']
    if (!voidable.includes(invoice.status as string)) {
      return { success: false, error: `Cannot void an invoice with status ${invoice.status}` }
    }

    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID' },
    })

    await logAuditEvent({
      workspaceId: invoice.workspaceId as string,
      actorId:     user.id,
      action:      'invoice.voided',
      entityType:  'Invoice',
      entityId:    invoiceId,
    })

    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    console.log('[voidInvoice] success', { invoiceId, projectId: invoice.projectId })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[voidInvoice] error', err)
    return { success: false, error: 'Failed to void invoice' }
  }
}

export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { workspaceId: true, status: true, projectId: true, number: true },
    })

    if (!invoice) return { success: false, error: 'Invoice not found' }

    if (invoice.status !== 'DRAFT') {
      return { success: false, error: 'Only DRAFT invoices can be deleted. Void sent invoices instead.' }
    }

    await scopedDb.invoice.delete({ where: { id: invoiceId } })

    await logAuditEvent({
      workspaceId: invoice.workspaceId as string,
      actorId:     user.id,
      action:      'invoice.deleted',
      entityType:  'Invoice',
      entityId:    invoiceId,
      metadata:    { number: invoice.number },
    })

    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete invoice' }
  }
}

export async function recordInvoiceView(invoiceId: string, ip: string, userAgent: string): Promise<void> {
  // Public route — uses raw db (no user session)
  try {
    const now = new Date()
    await db.invoiceView.create({ data: { invoiceId, ip, userAgent, viewedAt: now } })
    // Only advance status to VIEWED if the invoice is in a viewable state.
    // Never overwrite terminal statuses (VOID, PAID) — a client opening the link
    // after a void must not un-void the invoice.
    await db.invoice.updateMany({
      where: { id: invoiceId, status: { in: ['SENT', 'OVERDUE'] } },
      data: { viewCount: { increment: 1 }, lastViewedAt: now, status: 'VIEWED' },
    })
    // Still track view count + timestamp for already-VIEWED and DRAFT invoices,
    // but don't change the status.
    await db.invoice.updateMany({
      where: { id: invoiceId, status: { notIn: ['SENT', 'OVERDUE'] } },
      data: { viewCount: { increment: 1 }, lastViewedAt: now },
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

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

// ── Edit invoice line items ────────────────────────────────────────────────

const lineItemSchema = z.object({
  id:             z.string(),
  description:    z.string().min(1),
  quantity:       z.number(),
  unit:           z.enum(['HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'FLAT', 'EACH', 'MILE']),
  rateCents:      z.number().int(),
  lineTotalCents: z.number().int(),
  notes:          z.string().optional(),
})

export async function updateInvoiceLineItems(
  invoiceId:    string,
  lineItems:    z.infer<typeof lineItemSchema>[],
  taxPct:       number,
  notes?:       string,
  title?:       string,
  dueDate?:     string,
  extra?:       { issueDate?: string; discountCents?: number },
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: { status: true, projectId: true, workspaceId: true, issueDate: true, dueDate: true, discountCents: true, amountPaidCents: true },
    })
    if (!invoice) return { success: false, error: 'Invoice not found' }
    if ((invoice.status as string) === 'PAID') return { success: false, error: 'Cannot edit a paid invoice' }
    if ((invoice.status as string) === 'VOID') return { success: false, error: 'Cannot edit a voided invoice' }

    const validated = z.array(lineItemSchema).parse(lineItems)
    // Same math as create. The discount used to be dropped here (total was
    // subtotal + tax on the pre-discount subtotal) — keep the stored one
    // unless a new one is sent.
    const { subtotalCents, discountCents, taxCents, totalCents } = calcInvoiceTotals({
      lineTotalsCents: validated.map(li => li.lineTotalCents),
      discountCents:   extra?.discountCents ?? invoice.discountCents,
      taxPct,
    })
    if (totalCents < invoice.amountPaidCents) {
      return { success: false, error: `The total can’t go below what’s already been paid (${formatMoney(invoice.amountPaidCents)}).` }
    }

    // Re-derive the Terms label whenever either date changes — otherwise it
    // stays stuck at whatever was shown when the invoice was first created.
    const newDueDate   = dueDate !== undefined ? calendarDateToStored(dueDate.slice(0, 10)) : null
    const newIssueDate = extra?.issueDate ? calendarDateToStored(extra.issueDate) : null
    if ((dueDate !== undefined && !newDueDate) || (extra?.issueDate && !newIssueDate)) {
      return { success: false, error: 'Invalid date' }
    }
    const issueDate = newIssueDate ?? invoice.issueDate
    const due       = newDueDate ?? invoice.dueDate
    if (due < issueDate) return { success: false, error: 'The due date can’t be before the invoice date.' }
    const datesChanged = !!newDueDate || !!newIssueDate

    await scopedDb.invoice.update({
      where: { id: invoiceId },
      data: {
        lineItems:     validated as object[],
        subtotalCents,
        discountCents,
        taxPct,
        taxCents,
        totalCents,
        ...(notes    !== undefined ? { notes }              : {}),
        ...(title    !== undefined ? { title }              : {}),
        ...(datesChanged ? { issueDate, dueDate: due, paymentTerms: deriveInvoicePaymentTerms(issueDate, due) } : {}),
      },
    })

    await logAuditEvent({
      workspaceId: invoice.workspaceId as string,
      actorId:     user.id,
      action:      'invoice.edited',
      entityType:  'Invoice',
      entityId:    invoiceId,
    })

    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath('/invoices')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[updateInvoiceLineItems]', err)
    return { success: false, error: 'Failed to update invoice' }
  }
}

export async function updateOverdueInvoices(): Promise<void> {
  // System cron — uses raw db (no user session)
  await db.invoice.updateMany({
    where: { status: { in: ['SENT', 'VIEWED'] }, dueDate: { lt: new Date() } },
    data: { status: 'OVERDUE' },
  })
}
