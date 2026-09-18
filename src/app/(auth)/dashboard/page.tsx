import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics'
import { RecentProjects } from '@/components/dashboard/RecentProjects'
import { InvoiceTracker } from '@/components/dashboard/InvoiceTracker'
import { ProposalQueue } from '@/components/dashboard/ProposalQueue'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const workspaceId = await getWorkspaceId()

  // ── Parallel fetches ─────────────────────────────────────────────────────────
  // invoicesAll  → lightweight, no relations, used for metric calculations
  // invoicesWidget → includes relations, limited to 5, used for the tracker widget
  const [projectsRaw, invoicesAll, invoicesWidget, proposals, primaryPhases] = await Promise.all([
    db.project.findMany({
      where:   { workspaceId, archivedAt: null },
      include: {
        client:     true,
        // Grab the single most-recently-updated record from each related table
        budgets:     { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        proposals:   { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        invoices:    { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        callSheets:  { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        actualSheets:{ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    }),
    db.invoice.findMany({
      where:   { workspaceId },
      select:  {
        status:          true,
        totalCents:      true,
        amountPaidCents: true,
        dueDate:         true,
        paidAt:          true,
        updatedAt:       true,
      },
    }),
    db.invoice.findMany({
      where:   { workspaceId },
      include: { client: true, project: true },
      orderBy: { dueDate: 'asc' },
      take:    5,
    }),
    db.proposal.findMany({
      where:   { workspaceId, status: { in: ['SENT', 'VIEWED', 'APPROVED'] } },
      include: { project: { include: { client: true } } },
      orderBy: { updatedAt: 'desc' },
      take:    5,
    }),

    // ── Primary phase gross totals (net + markup + tax) for the "Value" column ──
    // Same calc as the Projects grid cards (src/app/(auth)/projects/page.tsx),
    // so the numbers agree across the app.
    db.phase.findMany({
      where: { isPrimary: true, workspaceId },
      select: {
        budget: {
          select: {
            projectId: true,
            markupPct: true,
            taxPct:    true,
            discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
          },
        },
        accounts: {
          where:  { parentId: null },
          select: {
            lineItems: { select: { quantity: true, rateCents: true, markupPct: true } },
            children:  {
              select: {
                lineItems: { select: { quantity: true, rateCents: true, markupPct: true } },
              },
            },
          },
        },
      },
    }),
  ])

  // budgetTotalCents: GROSS total (net + markup + tax) from each project's primary phase.
  const budgetTotalByProject = new Map<string, number>()
  for (const phase of primaryPhases) {
    const projectId = phase.budget?.projectId
    if (!projectId) continue
    const markupPct = phase.budget?.markupPct != null ? Number(phase.budget.markupPct) : 0
    const taxPct    = phase.budget?.taxPct    != null ? Number(phase.budget.taxPct)    : 0
    const discountConfig: BudgetDiscountConfig | null = phase.budget?.discountType ? {
      type:       phase.budget.discountType as 'flat' | 'pct',
      label:      phase.budget.discountLabel,
      valueCents: phase.budget.discountValueCents,
      valuePct:   phase.budget.discountValuePct != null ? Number(phase.budget.discountValuePct) : null,
    } : null
    const { grandTotalCents } = calcBudgetTotals(
      phase.accounts as unknown as AccountInput[],
      markupPct,
      taxPct,
      discountConfig,
    )
    budgetTotalByProject.set(projectId, grandTotalCents)
  }

  // Sort by most recent activity across the project + all related models
  const projects = projectsRaw
    .map(({ budgets, proposals: proj_proposals, invoices: proj_invoices, callSheets, actualSheets, ...p }) => {
      const candidates: Date[] = [
        p.updatedAt,
        budgets[0]?.updatedAt,
        proj_proposals[0]?.updatedAt,
        proj_invoices[0]?.updatedAt,
        callSheets[0]?.updatedAt,
        actualSheets[0]?.updatedAt,
      ].filter((d): d is Date => d != null)
      const lastActivity = candidates.reduce((max, d) => (d > max ? d : max), candidates[0])
      return { ...p, lastActivity, budgetTotalCents: budgetTotalByProject.get(p.id) ?? 0 }
    })
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <DashboardMetrics projects={projects} invoices={invoicesAll} proposals={proposals} />
      <RecentProjects projects={projects} />
      <div className="grid grid-cols-2 gap-4">
        <InvoiceTracker invoices={invoicesWidget} />
        <ProposalQueue proposals={proposals} />
      </div>
    </div>
  )
}
