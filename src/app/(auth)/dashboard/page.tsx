import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics'
import { RecentProjects } from '@/components/dashboard/RecentProjects'
import { InvoiceTracker } from '@/components/dashboard/InvoiceTracker'
import { ProposalQueue } from '@/components/dashboard/ProposalQueue'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { getAccess } from '@/lib/access'
import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const [workspaceId, user, access] = await Promise.all([getWorkspaceId(), getCurrentUser(), getAccess()])
  // Without "Dashboard money" no money at all — the financial queries below
  // aren't even run, so nothing reaches the payload (not merely hidden in the
  // UI). An ASSIGNED-scope role only lists the projects they're on.
  const isCollaborator = !access.can('dashboardMoney')
  const assignedOnly   = !access.isOwner && access.projectScope === 'ASSIGNED'

  // ── Parallel fetches ─────────────────────────────────────────────────────────
  // invoicesAll  → lightweight, no relations, used for metric calculations
  // invoicesWidget → includes relations, limited to 5, used for the tracker widget
  const [projectsRaw, invoicesAll, invoicesWidget, proposals, primaryPhases, scopeByProject] = await Promise.all([
    db.project.findMany({
      where:   {
        workspaceId, archivedAt: null,
        ...(assignedOnly ? { assignments: { some: { userId: user.id } } } : {}),
      },
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
    isCollaborator ? Promise.resolve([]) : db.invoice.findMany({
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
    isCollaborator ? Promise.resolve([]) : db.invoice.findMany({
      where:   { workspaceId },
      include: { client: true, project: true },
      orderBy: { dueDate: 'asc' },
      take:    5,
    }),
    isCollaborator ? Promise.resolve([]) : db.proposal.findMany({
      where:   { workspaceId, status: { in: ['SENT', 'VIEWED', 'APPROVED'] } },
      include: { project: { include: { client: true } } },
      orderBy: { updatedAt: 'desc' },
      take:    5,
    }),

    // ── Primary phase gross totals (net + markup + tax) for the "Value" column ──
    // Same calc as the Projects grid cards (src/app/(auth)/projects/page.tsx),
    // so the numbers agree across the app.
    isCollaborator ? Promise.resolve([]) : db.phase.findMany({
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

    // ── Added scope billed on top of each project's budget (invoice-first) ──
    isCollaborator ? Promise.resolve([]) : db.invoice.groupBy({
      by:    ['projectId'],
      where: { workspaceId, isScopeAddition: true, status: { not: 'VOID' } },
      _sum:  { totalCents: true },
    }),
  ])

  // budgetTotalCents: GROSS total (net + markup + tax) from each project's primary
  // phase, plus any added scope invoiced on top — the project's value.
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
  // Project value = budget + added scope (src/lib/project-value.ts).
  for (const row of scopeByProject) {
    budgetTotalByProject.set(row.projectId, (budgetTotalByProject.get(row.projectId) ?? 0) + (row._sum.totalCents ?? 0))
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

  if (isCollaborator) {
    return (
      <div className="space-y-6">
        <RecentProjects projects={projects} showValue={false} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardMetrics projects={projects} invoices={invoicesAll} proposals={proposals} />
      <RecentProjects projects={projects} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InvoiceTracker invoices={invoicesWidget} />
        <ProposalQueue proposals={proposals} />
      </div>
    </div>
  )
}
