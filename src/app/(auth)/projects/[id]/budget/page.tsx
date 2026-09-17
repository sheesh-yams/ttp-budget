import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { canSeeFinancials, stripBudgetForRole } from '@/lib/budget-visibility'
import { BudgetEditor } from '@/components/projects/BudgetEditor'
import { BudgetEmptyState } from '@/components/projects/BudgetEmptyState'
import { BudgetPageClient } from '@/components/projects/BudgetPageClient'

const phaseInclude = {
  sections: {
    orderBy: { orderIndex: 'asc' as const },
    select: { id: true, title: true, description: true, orderIndex: true },
  },
  accounts: {
    where: { parentId: null as null },
    orderBy: { order: 'asc' as const },
    include: {
      lineItems: { orderBy: { order: 'asc' as const } },
      children: {
        orderBy: { order: 'asc' as const },
        include: {
          lineItems: { orderBy: { order: 'asc' as const } },
          children: {
            orderBy: { order: 'asc' as const },
            include: { lineItems: { orderBy: { order: 'asc' as const } } },
          },
        },
      },
    },
  },
}

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ budgetId?: string }>
}) {
  const { id: projectId } = await params
  const { budgetId: qBudgetId } = await searchParams

  const [workspaceId, currentUser] = await Promise.all([getWorkspaceId(), getCurrentUser()])
  const canSeeFin = canSeeFinancials(currentUser.role)

  // ── RBAC: Collaborators must be assigned to this project ────────────────────
  if (currentUser.role === 'COLLABORATOR') {
    const assignment = await db.projectAssignment.findUnique({
      where: { projectId_userId: { projectId, userId: currentUser.id } },
      select: { id: true },
    })
    if (!assignment) notFound()
  }

  // ── Fetch all budgets for this project (full tree for editor) ───────────────
  const rawBudgets = await db.budget.findMany({
    where: { projectId, workspaceId },
    orderBy: { createdAt: 'asc' },
    include: { phases: { orderBy: { order: 'asc' }, include: phaseInclude } },
  })

  if (rawBudgets.length === 0) {
    const templates = await db.budgetTemplate.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shootType: true, description: true },
    })
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-foreground">Budget</h1>
        </div>
        <BudgetEmptyState projectId={projectId} templates={templates} canManage={canSeeFin} />
      </div>
    )
  }

  // Strip margin data for Collaborators
  const budgets = rawBudgets.map(b => stripBudgetForRole(b, currentUser.role))

  // ── Fetch proposals to determine primary budget ──────────────────────────────
  const proposals = await db.proposal.findMany({
    where: { projectId, workspaceId },
    select: { budgetId: true, status: true, createdAt: true, version: true, title: true },
    orderBy: { createdAt: 'desc' },
  })

  // Primary budget: latest APPROVED proposal's budget → latest proposal's budget → latest created budget
  const approvedProposal = proposals.find(p => p.status === 'APPROVED')
  const latestProposal   = proposals[0]
  const primaryBudgetId  =
    approvedProposal?.budgetId ??
    latestProposal?.budgetId ??
    budgets[budgets.length - 1].id

  // ── Resolve which budget to display ─────────────────────────────────────────
  const activeBudgetId = (qBudgetId && budgets.find(b => b.id === qBudgetId))
    ? qBudgetId
    : primaryBudgetId

  const activeBudget = budgets.find(b => b.id === activeBudgetId) ?? budgets[0]

  // Build status pills: map each budget to its most-recent proposal status
  const budgetStatusMap: Record<string, string | null> = {}
  for (const b of budgets) {
    const prop = proposals.find(p => p.budgetId === b.id)
    budgetStatusMap[b.id] = prop?.status ?? null
  }

  if (budgets.length === 1) {
    // ── Single budget — no switcher needed ──────────────────────────────────
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-foreground">Budget</h1>
        </div>
        <BudgetEditor
          budget={activeBudget as never}
          projectId={projectId}
          canSeeFinancials={canSeeFin}
          readOnly={!canSeeFin}
        />
      </div>
    )
  }

  // ── Multiple budgets — tab switcher ─────────────────────────────────────────
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Budget</h1>
      </div>
      <BudgetPageClient
        projectId={projectId}
        budgets={budgets as never}
        activeBudgetId={activeBudget.id}
        budgetStatusMap={budgetStatusMap}
        canSeeFin={canSeeFin}
      />
    </div>
  )
}
