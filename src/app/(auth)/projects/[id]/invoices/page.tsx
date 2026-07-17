/**
 * /projects/[id]/invoices
 *
 * Invoice tracker for a project. Shows:
 *   1. Payment schedule — each milestone from the approved proposal,
 *      with invoice status (or a "Generate" button if not yet created).
 *   2. All existing invoices for this project.
 */

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { sumAccount, calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'
import { ProjectInvoicesPage } from '@/components/projects/ProjectInvoicesPage'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `${project.name} | Invoices` : 'Invoices' }
}

export default async function InvoicesSubPage({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const [project, workspaceDefaults] = await Promise.all([
  db.project.findFirst({
    where: { id, workspaceId },
    select: {
      id:       true,
      name:     true,
      clientId: true,
      client:   { select: { name: true } },
      budgets: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          id:        true,
          name:      true,
          markupPct: true,
          taxPct:    true,
          discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
          phases: {
            orderBy: { order: 'asc' },
            include: {
              accounts: {
                where:   { parentId: null },
                orderBy: { order: 'asc' },
                include: {
                  lineItems: { orderBy: { order: 'asc' } },
                  children: {
                    orderBy: { order: 'asc' },
                    include: {
                      lineItems: { orderBy: { order: 'asc' } },
                      children: {
                        orderBy: { order: 'asc' },
                        include: { lineItems: { orderBy: { order: 'asc' } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Most recent approved/sent proposal — source of payment milestones
      proposals: {
        where: { status: { in: ['APPROVED', 'SENT', 'VIEWED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id:      true,
          title:   true,
          status:  true,
          content: true,
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        select: {
          id:              true,
          number:          true,
          title:           true,
          status:          true,
          kind:            true,
          totalCents:      true,
          amountPaidCents: true,
          dueDate:         true,
          publicToken:     true,
          sentAt:          true,
          lineItems:       true,
          taxPct:          true,
          notes:           true,
        },
      },
    },
  }),
  db.workspace.findUnique({
    where: { id: workspaceId },
    select: { invoiceExpiryDays: true },
  }),
  ])

  if (!project) notFound()

  const budget  = project.budgets[0] ?? null
  const proposal = project.proposals[0] ?? null

  // Compute budget grand total (for milestone amount calculations) — net of discount.
  let budgetTotalCents    = 0
  let budgetDiscountCents = 0
  if (budget) {
    const primaryPhase = budget.phases.find(p => (p as unknown as { isPrimary: boolean }).isPrimary) ?? budget.phases[0]
    if (primaryPhase) {
      const markupPct = Number(budget.markupPct ?? 0)
      const taxPct    = Number(budget.taxPct ?? 0)
      const discountConfig: BudgetDiscountConfig | null = budget.discountType ? {
        type:       budget.discountType as 'flat' | 'pct',
        label:      budget.discountLabel,
        valueCents: budget.discountValueCents,
        valuePct:   budget.discountValuePct != null ? Number(budget.discountValuePct) : null,
      } : null
      if (markupPct > 0 || taxPct > 0 || discountConfig) {
        const totals = calcBudgetTotals(primaryPhase.accounts as unknown as AccountInput[], markupPct, taxPct, discountConfig)
        budgetTotalCents    = totals.grandTotalCents
        budgetDiscountCents = totals.discountCents
      } else {
        budgetTotalCents = primaryPhase.accounts.reduce(
          (sum, acc) => sum + sumAccount(acc as unknown as AccountInput), 0
        )
      }
    }
  }

  // Serialize dates for client component
  const serializedInvoices = project.invoices.map(inv => ({
    ...inv,
    dueDate:   inv.dueDate.toISOString(),
    sentAt:    inv.sentAt?.toISOString() ?? null,
    lineItems: inv.lineItems,
    taxPct:    Number(inv.taxPct ?? 0),
    notes:     inv.notes ?? null,
  }))

  return (
    <ProjectInvoicesPage
      project={{
        id:       project.id,
        name:     project.name,
        clientId: project.clientId,
      }}
      budget={budget ? { id: budget.id, name: budget.name } : null}
      proposal={proposal ? {
        id:      proposal.id,
        title:   proposal.title,
        status:  proposal.status,
        content: proposal.content,
        budgetId: budget?.id ?? '',
      } : null}
      budgetTotalCents={budgetTotalCents}
      budgetDiscountCents={budgetDiscountCents}
      invoices={serializedInvoices}
      invoiceExpiryDays={workspaceDefaults?.invoiceExpiryDays ?? 30}
    />
  )
}
