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
import { sumAccount, calcBudgetTotals, type AccountInput } from '@/lib/totals'
import { ProjectInvoicesPage } from '@/components/projects/ProjectInvoicesPage'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `Invoices — ${project.name}` : 'Invoices' }
}

export default async function InvoicesSubPage({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const project = await db.project.findFirst({
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
        },
      },
    },
  })

  if (!project) notFound()

  const budget  = project.budgets[0] ?? null
  const proposal = project.proposals[0] ?? null

  // Compute budget grand total (for milestone amount calculations)
  let budgetTotalCents = 0
  if (budget) {
    const primaryPhase = budget.phases.find(p => (p as unknown as { isPrimary: boolean }).isPrimary) ?? budget.phases[0]
    if (primaryPhase) {
      const markupPct = Number(budget.markupPct ?? 0)
      const taxPct    = Number(budget.taxPct ?? 0)
      if (markupPct > 0 || taxPct > 0) {
        const totals = calcBudgetTotals(primaryPhase.accounts as unknown as AccountInput[], markupPct, taxPct)
        budgetTotalCents = totals.grandTotalCents
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
    dueDate: inv.dueDate.toISOString(),
    sentAt:  inv.sentAt?.toISOString() ?? null,
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
      invoices={serializedInvoices}
    />
  )
}
