'use server'

// Invoice-first billing: start from the invoice.
//   • New project — creates the client (if new), a won project whose budget
//     matches the invoice, an approved proposal and the invoice, in one
//     transaction.
//   • Existing project — bills any project; on a won project the invoice is
//     added scope, counted in the project's value (src/lib/project-value.ts).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getAccess } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'
import { requireMoneyPermission } from '@/lib/money-access'
import { generateInvoiceNumber } from '@/lib/invoice-numbering'
import { logAuditEvent } from '@/lib/audit'
import { generatePublicToken } from '@/lib/secure-token'
import { buildInvoiceCreateData, invoiceLineItemSchema, resolveInvoiceDates } from '@/lib/invoice-create'
import { budgetTaxFraction, canCreateProjectFromInvoice, normalizeInvoiceLines, INVOICE_FIRST_MILESTONE } from '@/lib/invoice-first'
import { PHASE_TREE_INCLUDE, BUDGET_SNAPSHOT_SELECT, buildBudgetSnapshot, buildProposalContent, type SnapshotPhase } from '@/lib/proposal-snapshot'
import { applyProposalWonEffects } from '@/lib/proposal-won'
import type { ActionResult } from '@/types'

const invoiceFields = {
  title:         z.string().trim().min(1).max(300),
  /** YYYY-MM-DD; defaults to today. */
  issueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  lineItems:     z.array(invoiceLineItemSchema).min(1).max(500),
  taxPct:        z.number().min(0).max(100),
  discountCents: z.number().int().min(0).optional(),
  notes:         z.string().max(5000).optional(),
  poNumber:      z.string().max(100).optional(),
}

const newSchema = z.object({
  mode:        z.literal('new'),
  clientId:    z.string().min(1).optional(),
  clientName:  z.string().trim().max(200).optional(),
  projectName: z.string().trim().min(1).max(200),
  ...invoiceFields,
})
const existingSchema = z.object({
  mode:      z.literal('existing'),
  projectId: z.string().min(1),
  /** On a won project: false = billing part of the agreed total (e.g. a
   *  reissued invoice), not extra scope. Defaults to true. */
  scopeAddition: z.boolean().optional(),
  ...invoiceFields,
})
const schema = z.discriminatedUnion('mode', [newSchema, existingSchema])

type NewInput      = z.infer<typeof newSchema>
type ExistingInput = z.infer<typeof existingSchema>
export type CreateInvoiceFirstInput = NewInput | ExistingInput

export async function createInvoiceFirst(
  input: CreateInvoiceFirstInput,
): Promise<ActionResult<{ invoiceId: string; number: string; projectId: string; scopeAddition: boolean }>> {
  try {
    const parsed = schema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Check the invoice details and try again.' }
    const data = parsed.data

    const lines = normalizeInvoiceLines(data.lineItems)
    if ('error' in lines) return { success: false, error: lines.error }
    const dates = resolveInvoiceDates(data.issueDate, data.dueDate)
    if ('error' in dates) return { success: false, error: dates.error }

    return data.mode === 'new'
      ? await createWithNewProject(data as NewInput, lines.lines, dates)
      : await createOnExistingProject(data as ExistingInput, lines.lines, dates)
  } catch (err) {
    if (err instanceof NotFound) return { success: false, error: 'Not found' }
    console.error('[createInvoiceFirst]', err)
    return { success: false, error: 'Failed to create invoice' }
  }
}

type Lines = z.infer<typeof invoiceLineItemSchema>[]
type Dates = { issueDate: Date; dueDate: Date }
type Result = ActionResult<{ invoiceId: string; number: string; projectId: string; scopeAddition: boolean }>

// ─── New project ─────────────────────────────────────────────────────────────

async function createWithNewProject(
  data: NewInput, lines: Lines, dates: Dates,
): Promise<Result> {
  const access = await getAccess()
  if (!canCreateProjectFromInvoice(access)) {
    return { success: false, error: 'Creating a project from an invoice needs Projects, Budget, Proposals and Invoices edit access.' }
  }
  const tax = budgetTaxFraction(data.taxPct)
  if ('error' in tax) return { success: false, error: tax.error }
  if (!data.clientId && !data.clientName?.trim()) return { success: false, error: 'Choose a client or enter a new client name.' }

  const user        = await getCurrentUser()
  const workspaceId = access.workspaceId
  const ws          = await db.workspace.findUnique({ where: { id: workspaceId }, select: { defaultInvoiceTerms: true } })

  // Raw db inside the transaction: every row is written with the session's
  // workspaceId, and every lookup filters on it (the scoped client can't
  // join a transaction).
  const created = await db.$transaction(async tx => {
    let clientId = data.clientId ?? null
    if (clientId) {
      const client = await tx.client.findFirst({ where: { id: clientId, workspaceId }, select: { id: true } })
      if (!client) throw new NotFound()
    } else {
      clientId = (await tx.client.create({ data: { workspaceId, name: data.clientName!.trim() }, select: { id: true } })).id
    }

    const project = await tx.project.create({
      data: {
        workspaceId, clientId, name: data.projectName,
        status: 'ACTIVE', createdById: user.id,
      },
      select: { id: true },
    })
    // A creator whose role only opens assigned projects is put on this one —
    // otherwise they'd create a project they can't open (createProjectWithBudget).
    if (!access.isOwner && access.projectScope === 'ASSIGNED') {
      await tx.projectAssignment.create({ data: { workspaceId, projectId: project.id, userId: user.id } })
    }

    // Budget = the invoice: fee 0, the invoice's tax and discount, its lines.
    const discount = Math.min(data.discountCents ?? 0, lines.reduce((s, l) => s + l.lineTotalCents, 0))
    const budget = await tx.budget.create({
      data: {
        workspaceId, projectId: project.id, name: 'Main Budget', createdById: user.id,
        markupPct: 0, taxPct: tax.fraction,
        ...(discount > 0 ? { discountType: 'flat', discountLabel: 'Discount', discountValueCents: discount } : {}),
      },
      select: { id: true },
    })
    const phase   = await tx.phase.create({ data: { workspaceId, budgetId: budget.id, name: 'v1 Estimate', order: 0, isPrimary: true }, select: { id: true } })
    const section = await tx.budgetSection.create({ data: { workspaceId, phaseId: phase.id, title: 'Main', orderIndex: 0 }, select: { id: true } })
    const account = await tx.account.create({
      data: { workspaceId, phaseId: phase.id, sectionId: section.id, name: 'Invoiced work', code: '100', order: 0 },
      select: { id: true },
    })
    await tx.lineItem.createMany({
      data: lines.map((l, i) => ({
        workspaceId, accountId: account.id, description: l.description, quantity: l.quantity,
        unit: l.unit as Prisma.LineItemCreateManyInput['unit'], rateCents: l.rateCents, notes: l.notes ?? null, order: i,
      })),
    })

    const number  = await generateInvoiceNumber(workspaceId, tx)
    const invoice = await tx.invoice.create({
      data: {
        workspaceId,
        ...buildInvoiceCreateData({
          projectId: project.id, clientId, budgetId: budget.id, number, kind: 'STANDALONE',
          title: data.title, issueDate: dates.issueDate, dueDate: dates.dueDate, lineItems: lines,
          taxPct: data.taxPct, discountCents: discount, notes: data.notes, poNumber: data.poNumber,
          defaultTerms: ws?.defaultInvoiceTerms, createdById: user.id,
        }),
      } as unknown as Prisma.InvoiceUncheckedCreateInput,
      select: { id: true, number: true, totalCents: true },
    })

    // The won proposal: frozen from the budget just written, approved at the
    // invoice total on the invoice date.
    const [budgetRow, phases] = await Promise.all([
      tx.budget.findFirst({ where: { id: budget.id, workspaceId }, select: BUDGET_SNAPSHOT_SELECT }),
      tx.phase.findMany({ where: { budgetId: budget.id, workspaceId }, orderBy: { order: 'asc' }, include: PHASE_TREE_INCLUDE }),
    ])
    const snapshot = buildBudgetSnapshot(budgetRow, phases as unknown as SnapshotPhase[])
    if (snapshot.budgetSnapshot.totalCents !== invoice.totalCents) {
      // Guard: the project's value must equal what was billed.
      throw new Error(`budget total ${snapshot.budgetSnapshot.totalCents} ≠ invoice total ${invoice.totalCents}`)
    }
    const content = buildProposalContent({
      overview: '', about: '', deliverables: [], milestones: [INVOICE_FIRST_MILESTONE], totalCents: invoice.totalCents,
    })
    const proposal = await tx.proposal.create({
      data: {
        workspaceId, projectId: project.id, budgetId: budget.id,
        title: `${data.projectName} — Invoiced work`,
        publicToken: generatePublicToken(),
        content: { ...content, budgetSnapshot: snapshot.budgetSnapshot } as object,
        status: 'APPROVED', approvedAt: dates.issueDate, approvedTotalCents: invoice.totalCents,
        createdById: user.id,
      },
      select: { id: true },
    })

    return { clientId, projectId: project.id, invoice, proposalId: proposal.id, newClient: !data.clientId }
  }, { maxWait: 10_000, timeout: 30_000 })

  // Same side effects as a manual Won (team placeholders from crew lines).
  const sdb = await getScopedDb()
  await applyProposalWonEffects(sdb, created.proposalId, created.projectId)

  await logAuditEvent({
    workspaceId, actorId: user.id, action: 'project.created_from_invoice', entityType: 'Project', entityId: created.projectId,
    metadata: { invoiceId: created.invoice.id, number: created.invoice.number, totalCents: created.invoice.totalCents, newClient: created.newClient },
  })
  await logAuditEvent({
    workspaceId, actorId: user.id, action: 'proposal.approved', entityType: 'Proposal', entityId: created.proposalId,
    metadata: { via: 'invoice', invoiceId: created.invoice.id },
  })
  await logAuditEvent({
    workspaceId, actorId: user.id, action: 'invoice.created', entityType: 'Invoice', entityId: created.invoice.id,
    metadata: { number: created.invoice.number, totalCents: created.invoice.totalCents, via: 'invoice-first:new' },
  })

  revalidatePath('/invoices')
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { success: true, data: { invoiceId: created.invoice.id, number: created.invoice.number, projectId: created.projectId, scopeAddition: false } }
}

// ─── Existing project ────────────────────────────────────────────────────────

async function createOnExistingProject(
  data: ExistingInput, lines: Lines, dates: Dates,
): Promise<Result> {
  const gate = await requireMoneyPermission({ projectId: data.projectId }, 'invoices', 'EDIT')
  if (!gate.ok) return gate.error

  const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
  const project = await sdb.project.findFirst({
    where:  { id: data.projectId },
    select: {
      id: true, clientId: true,
      budgets:   { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      proposals: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 },
    },
  })
  if (!project) return { success: false, error: 'Not found' }

  // Billed on top of a won project's agreed total → added scope, unless the
  // user says it's part of the agreed total (a reissue).
  const scopeAddition = project.proposals.length > 0 && data.scopeAddition !== false
  const ws = await db.workspace.findUnique({ where: { id: gate.workspaceId }, select: { defaultInvoiceTerms: true } })

  const number  = await generateInvoiceNumber(gate.workspaceId)
  const invoice = await sdb.invoice.create({
    data: buildInvoiceCreateData({
      projectId: project.id, clientId: project.clientId, budgetId: project.budgets[0]?.id ?? null,
      number, kind: 'STANDALONE', title: data.title, issueDate: dates.issueDate, dueDate: dates.dueDate,
      lineItems: lines, taxPct: data.taxPct, discountCents: data.discountCents, notes: data.notes,
      poNumber: data.poNumber, defaultTerms: ws?.defaultInvoiceTerms, isScopeAddition: scopeAddition,
      createdById: user.id,
    }) as unknown as Parameters<typeof sdb.invoice.create>[0]['data'],
    select: { id: true, number: true, totalCents: true },
  })

  await logAuditEvent({
    workspaceId: gate.workspaceId, actorId: user.id, action: 'invoice.created', entityType: 'Invoice', entityId: invoice.id,
    metadata: { number: invoice.number, totalCents: invoice.totalCents, scopeAddition, via: 'invoice-first:existing' },
  })

  revalidatePath('/invoices')
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${project.id}`)
  revalidatePath(`/projects/${project.id}/invoices`)
  return { success: true, data: { invoiceId: invoice.id, number: invoice.number, projectId: project.id, scopeAddition } }
}

/** A client id that isn't in this workspace — rolls the transaction back, answers "Not found". */
class NotFound extends Error {}
