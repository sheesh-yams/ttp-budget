'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { requireMoneyPermission } from '@/lib/money-access'
import { generateInvoiceNumber } from '@/lib/invoice-numbering'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { logAuditEvent } from '@/lib/audit'
import { normalizeRecipientEmails, buildCcList } from '@/lib/email'
import { calcInvoiceTotals, calendarDateToStored } from '@/lib/invoice-totals'
import { formatMoney } from '@/lib/money'
import { buildInvoiceCreateData, deriveInvoicePaymentTerms, invoiceLineItemSchema, resolveInvoiceDates } from '@/lib/invoice-create'
import { deleteNeedsTypedConfirm, matchesInvoiceNumber, paymentInProgress } from '@/lib/invoice-delete'

const createSchema = z.object({
  projectId: z.string(),
  clientId: z.string(),
  budgetId: z.string().optional().nullable(),
  kind: z.enum(['DEPOSIT', 'PROGRESS', 'FINAL', 'STANDALONE']),
  title: z.string().min(1).max(300),
  /** YYYY-MM-DD; defaults to today. Can be backdated (a client asks for a date). */
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string(),
  lineItems: z.array(invoiceLineItemSchema),
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
    const gate = await requireMoneyPermission({ projectId: input?.projectId }, 'invoices', 'EDIT')
    if (!gate.ok) return gate.error

    const [scopedDb, user, workspaceId] = await Promise.all([
      getScopedDb(),
      getCurrentUser(),
      getWorkspaceId(),
    ])
    const data = createSchema.parse(input)

    const dates = resolveInvoiceDates(data.issueDate, data.dueDate)
    if ('error' in dates) return { success: false, error: dates.error }

    // Only take a number once the invoice is going to be created (no gaps).
    const number = await generateInvoiceNumber(workspaceId)
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultInvoiceTerms: true },
    })

    const invoice = await scopedDb.invoice.create({
      data: buildInvoiceCreateData({
        projectId:     data.projectId,
        clientId:      data.clientId,
        budgetId:      data.budgetId ?? null,
        number,
        kind:          data.kind,
        title:         data.title,
        issueDate:     dates.issueDate,
        dueDate:       dates.dueDate,
        lineItems:     data.lineItems,
        taxPct:        data.taxPct,
        discountCents: data.discountCents,
        notes:         data.notes,
        terms:         data.terms,
        defaultTerms:  workspace?.defaultInvoiceTerms,
        paymentTerms:  data.paymentTerms,
        poNumber:      data.poNumber,
        createdById:   user.id,
      }) as unknown as Parameters<typeof scopedDb.invoice.create>[0]['data'],
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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
    // Money data — Invoices permission on this project (server actions are callable directly).
    if (!(await requireMoneyPermission({ invoiceId }, 'invoices', 'VIEW')).ok) return null
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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

/**
 * Delete an invoice of any status. Drafts delete on a plain confirm; anything
 * sent, void or paid needs the invoice number typed (checked here, not just in
 * the dialog). Views cascade; PaymentAttempt rows are kept for reconciliation.
 */
export async function deleteInvoice(invoiceId: string, opts: { confirm?: string } = {}): Promise<ActionResult> {
  try {
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    const invoice = await scopedDb.invoice.findFirst({
      where: { id: invoiceId },
      select: {
        workspaceId: true, status: true, projectId: true, number: true, title: true,
        totalCents: true, amountPaidCents: true, sentAt: true,
      },
    })

    if (!invoice) return { success: false, error: 'Invoice not found' }

    if (deleteNeedsTypedConfirm(invoice) && !matchesInvoiceNumber(opts.confirm, invoice.number)) {
      return { success: false, error: `Type ${invoice.number} to confirm.` }
    }

    // A checkout that's mid-flight would settle onto a missing invoice.
    const attempts = await scopedDb.paymentAttempt.findMany({
      where:  { invoiceId, status: 'INITIATED' },
      select: { status: true, createdAt: true },
    })
    if (paymentInProgress(attempts)) {
      return { success: false, error: 'A payment on this invoice is in progress — try again in a little while.' }
    }

    const res = await scopedDb.invoice.deleteMany({ where: { id: invoiceId } })
    if (res.count === 0) return { success: false, error: 'Invoice not found' }

    await logAuditEvent({
      workspaceId: invoice.workspaceId as string,
      actorId:     user.id,
      action:      'invoice.deleted',
      entityType:  'Invoice',
      entityId:    invoiceId,
      metadata:    {
        number: invoice.number, title: invoice.title, status: invoice.status, projectId: invoice.projectId,
        totalCents: invoice.totalCents, amountPaidCents: invoice.amountPaidCents,
        sentAt: invoice.sentAt?.toISOString() ?? null,
      },
    })

    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath(`/projects/${invoice.projectId}/invoices`)
    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[deleteInvoice]', err)
    return { success: false, error: 'Failed to delete invoice' }
  }
}

/** Archive hides an invoice from the lists; totals still count it. */
export async function setInvoiceArchived(invoiceId: string, archived: boolean): Promise<ActionResult> {
  try {
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
    if (!gate.ok) return gate.error

    const [scopedDb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const invoice = await scopedDb.invoice.findFirst({
      where:  { id: invoiceId },
      select: { workspaceId: true, projectId: true, number: true },
    })
    if (!invoice) return { success: false, error: 'Invoice not found' }

    const res = await scopedDb.invoice.updateMany({
      where: { id: invoiceId, archivedAt: archived ? null : { not: null } },
      data:  archived ? { archivedAt: new Date(), archivedById: user.id } : { archivedAt: null, archivedById: null },
    })
    if (res.count > 0) {
      await logAuditEvent({
        workspaceId: invoice.workspaceId as string,
        actorId:     user.id,
        action:      archived ? 'invoice.archived' : 'invoice.unarchived',
        entityType:  'Invoice',
        entityId:    invoiceId,
        metadata:    { number: invoice.number },
      })
    }

    revalidatePath(`/projects/${invoice.projectId}`)
    revalidatePath(`/projects/${invoice.projectId}/invoices`)
    revalidatePath('/invoices')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[setInvoiceArchived]', err)
    return { success: false, error: archived ? 'Failed to archive invoice' : 'Failed to unarchive invoice' }
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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
    const gate = await requireMoneyPermission({ invoiceId }, 'invoices', 'EDIT')
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
