import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { canSeeFinancials } from '@/lib/budget-visibility'
import type { Prisma } from '@prisma/client'
import { ProjectsPageClient } from '@/components/projects/ProjectsPageClient'
import type { ProjectForCard, ProjectMetrics, AttentionItem, UpcomingShoot, StatusCounts } from '@/components/projects/projects-types'
import { calcBudgetTotals, type AccountInput } from '@/lib/totals'

export const metadata = { title: 'Projects — SLATESUITE' }

// Shared project includes — used for both allProjects and archivedProjects queries
const PROJECT_INCLUDES = {
  client: { select: { id: true, name: true } },
  _count: { select: { budgets: true } },
  proposals: {
    select: {
      id: true,
      status: true,
      approvedTotalCents: true,
      lastViewedAt: true,
      sentAt: true,
      expiresAt: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  invoices: {
    select: {
      id: true,
      status: true,
      totalCents: true,
      amountPaidCents: true,
      dueDate: true,
      paidAt: true,
      issueDate: true,
    },
  },
  callSheets: {
    select: {
      id: true,
      status: true,
      shootDate: true,
    },
  },
} as const

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; sort?: string }>
}) {
  const [resolvedParams, workspaceId, currentUser] = await Promise.all([
    searchParams,
    getWorkspaceId(),
    getCurrentUser(),
  ])

  // ── RBAC: Collaborators only see projects they're explicitly assigned to.
  // Owners/Producers see the whole workspace. Merged into the scoped where so
  // it composes with the automatic workspaceId injection.
  const visibilityWhere: Prisma.ProjectWhereInput =
    currentUser.role === 'COLLABORATOR'
      ? { assignments: { some: { userId: currentUser.id } } }
      : {}

  // Collaborators are margin-blind — workspace-wide financial KPIs (pipeline,
  // outstanding, won) must not reach them. Zeroed server-side so the real
  // figures never enter the payload; the metrics strip is also hidden in the UI.
  const canSeeFin = canSeeFinancials(currentUser.role)

  const sdb         = await getScopedDb()
  const now         = new Date()
  const msPerDay    = 86_400_000
  // Use start-of-today so projects with shootStartDate = today are included.
  // Prisma stores dates as UTC midnight; comparing against `now` (mid-day) would
  // exclude shoots that are actually today.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // ── Quarter bounds ────────────────────────────────────────────────────────────
  const qMonth         = Math.floor(now.getMonth() / 3) * 3
  const qStart         = new Date(now.getFullYear(), qMonth, 1)
  const qEnd           = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999)
  const prevQStart     = new Date(now.getFullYear(), qMonth - 3, 1)
  const prevQEnd       = new Date(qStart.getTime() - 1)

  // ── Week bounds (Mon–Sun) ─────────────────────────────────────────────────────
  const dayOfWeek  = now.getDay() === 0 ? 6 : now.getDay() - 1   // Mon = 0
  const weekStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek)

  // ─────────────────────────────────────────────────────────────────────────────
  // Parallel fetch
  // ─────────────────────────────────────────────────────────────────────────────

  const [
    allProjects,
    archivedProjects,
    clients,
    templates,
    wonThisQ,
    wonLastQ,
    actualsSheets,
    primaryPhases,
    pipelineProposals,
  ] = await Promise.all([

    // ── All non-archived projects with rich includes ──────────────────────────
    sdb.project.findMany({
      where: { status: { not: 'ARCHIVED' }, ...visibilityWhere },
      orderBy: { updatedAt: 'desc' },
      include: PROJECT_INCLUDES,
    }),

    // ── Archived projects (passed to client for the Archived filter view) ─────
    sdb.project.findMany({
      where: { status: 'ARCHIVED', ...visibilityWhere },
      orderBy: { updatedAt: 'desc' },
      include: PROJECT_INCLUDES,
    }),

    // ── For NewProjectModal ───────────────────────────────────────────────────
    db.client.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.budgetTemplate.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shootType: true, description: true },
    }),

    // ── Won this quarter (non-archived projects only) ─────────────────────────
    sdb.proposal.aggregate({
      where: {
        status: 'APPROVED',
        approvedAt: { gte: qStart, lte: qEnd },
        project: { status: { not: 'ARCHIVED' } },
      },
      _sum: { approvedTotalCents: true },
      _count: true,
    }),

    // ── Won last quarter (non-archived projects only) ─────────────────────────
    sdb.proposal.aggregate({
      where: {
        status: 'APPROVED',
        approvedAt: { gte: prevQStart, lte: prevQEnd },
        project: { status: { not: 'ARCHIVED' } },
      },
      _sum: { approvedTotalCents: true },
    }),

    // ── Actuals: sum of actualCents per project ───────────────────────────────
    // Each project can have at most one ActualSheet; we sum all entries for it.
    sdb.actualSheet.findMany({
      select: {
        projectId: true,
        entries:   { select: { actualCents: true } },
      },
    }),

    // ── Primary phase gross totals (net + markup + tax) ──────────────────────
    // Used for burn bar denominator and "Proposed" / "Approved" amounts on cards.
    // Fetches account tree so calcBudgetTotals can apply per-item markup + budget
    // level markup + tax, matching what the proposal modal sends to the client.
    sdb.phase.findMany({
      where: { isPrimary: true },
      select: {
        budget: {
          select: {
            projectId: true,
            markupPct:  true,
            taxPct:     true,
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

    // ── Pipeline proposals (non-archived projects, deduped to one per project) ─
    // Ordered by sentAt desc so deduplication keeps the most-recently-sent proposal.
    // Value is computed from budgetTotalByProject (same gross calc as the cards),
    // so we only need the projectId to look it up.
    sdb.proposal.findMany({
      where: {
        status: { in: ['SENT', 'VIEWED'] },
        project: { status: { not: 'ARCHIVED' } },
      },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        projectId: true,
      },
    }),
  ])

  // ── Pipeline: deduplicate to one proposal per project (latest sent) ──────────
  // Multiple proposals for the same project should only count once in the metrics.
  const seenProjectIds = new Set<string>()
  const dedupedPipelineProposals = pipelineProposals.filter(p => {
    if (!p.projectId || seenProjectIds.has(p.projectId)) return false
    seenProjectIds.add(p.projectId)
    return true
  })

  // ── Pipeline value assigned after budgetTotalByProject (see below) ───────────

  // ── Burn bar: merge actuals + budget totals into project cards ───────────────
  // actualSpentCents: sum of all ActualEntry.actualCents for the project's sheet
  const actualSpentByProject = new Map<string, number>()
  for (const sheet of actualsSheets) {
    const sum = sheet.entries.reduce((s, e) => s + e.actualCents, 0)
    actualSpentByProject.set(sheet.projectId, (actualSpentByProject.get(sheet.projectId) ?? 0) + sum)
  }

  // budgetTotalCents: GROSS total (net + markup + tax) from primary phase.
  // Uses calcBudgetTotals so the number matches what the proposal modal shows.
  const budgetTotalByProject = new Map<string, number>()
  for (const phase of primaryPhases) {
    const projectId = phase.budget?.projectId
    if (!projectId) continue
    const markupPct = phase.budget?.markupPct != null ? Number(phase.budget.markupPct) : 0
    const taxPct    = phase.budget?.taxPct    != null ? Number(phase.budget.taxPct)    : 0
    const { grandTotalCents } = calcBudgetTotals(
      phase.accounts as unknown as AccountInput[],
      markupPct,
      taxPct,
    )
    budgetTotalByProject.set(projectId, grandTotalCents)
  }

  // ── Pipeline value: gross total for each project with a SENT/VIEWED proposal ─
  // Matches "Proposed $X" on the cards — same calcBudgetTotals source of truth.
  const pipelineValueCents = dedupedPipelineProposals.reduce((sum, p) => {
    if (!p.projectId) return sum
    return sum + (budgetTotalByProject.get(p.projectId) ?? 0)
  }, 0)

  // Attach burn data to both non-archived and archived projects
  const projectsWithBurn = allProjects.map(p => ({
    ...p,
    actualSpentCents: actualSpentByProject.get(p.id) ?? 0,
    budgetTotalCents: budgetTotalByProject.get(p.id) ?? 0,
  }))

  const archivedWithBurn = archivedProjects.map(p => ({
    ...p,
    actualSpentCents: actualSpentByProject.get(p.id) ?? 0,
    budgetTotalCents: budgetTotalByProject.get(p.id) ?? 0,
  }))

  // All projects for the client (non-archived first, then archived at the end)
  const allProjectsForClient = [...projectsWithBurn, ...archivedWithBurn]

  // ── Metrics ───────────────────────────────────────────────────────────────────
  // Metrics are computed from allProjects (non-archived) only.
  // "Open" = LEAD + ACTIVE (anything you're actively working or pitching)
  const openProjects        = allProjects.filter(p => p.status === 'LEAD' || p.status === 'ACTIVE')
  const upcomingShootCutoff = new Date(now.getTime() + 30 * msPerDay)
  const upcomingShootCount  = allProjects.filter(
    // Use startOfToday so projects with shootDate = today are included
    p => p.shootStartDate && p.shootStartDate >= startOfToday && p.shootStartDate <= upcomingShootCutoff,
  ).length

  // Overdue = open invoices (not VOID/PAID, not fully paid) past their due date.
  const overdueCount = projectsWithBurn
    .flatMap(p => p.invoices)
    .filter(inv =>
      ['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status) &&
      inv.amountPaidCents < inv.totalCents &&
      inv.dueDate < now,
    ).length

  // Outstanding = money owed but not yet collected.
  //
  // • WON projects: expected gross (live budgetTotalCents) minus all payments made so far.
  //   This captures approved-but-not-yet-invoiced amounts automatically.
  // • Non-WON projects: sum of unpaid balances on open (non-void, non-paid) invoices.
  let outstandingCents = 0
  for (const project of projectsWithBurn) {
    const wonProposal = project.proposals.find(p => p.status === 'APPROVED')
    if (wonProposal) {
      const expectedCents  = project.budgetTotalCents > 0
        ? project.budgetTotalCents
        : (wonProposal.approvedTotalCents ?? 0)
      const collectedCents = project.invoices.reduce((s, inv) => s + inv.amountPaidCents, 0)
      outstandingCents += Math.max(0, expectedCents - collectedCents)
    } else {
      for (const inv of project.invoices) {
        if (inv.status === 'VOID' || inv.status === 'PAID') continue
        outstandingCents += Math.max(0, inv.totalCents - inv.amountPaidCents)
      }
    }
  }

  // This-week stats (non-archived only)
  const thisWeekProposalsSent = allProjects
    .flatMap(p => p.proposals)
    .filter(pr => pr.sentAt && pr.sentAt >= weekStart).length

  const thisWeekInvoicesIssued = allProjects
    .flatMap(p => p.invoices)
    .filter(inv => inv.issueDate >= weekStart).length

  const thisWeekProjectsCreated = allProjects.filter(
    p => p.createdAt >= weekStart,
  ).length

  const metrics: ProjectMetrics = {
    pipelineValueCents:       canSeeFin ? pipelineValueCents : 0,
    pipelineCount:            dedupedPipelineProposals.length,
    activeCount:              openProjects.length,
    upcomingShootCount,
    outstandingCents:         canSeeFin ? outstandingCents : 0,
    overdueCount,
    wonThisQuarterCents:      canSeeFin ? (wonThisQ._sum.approvedTotalCents ?? 0) : 0,
    wonLastQuarterCents:      canSeeFin ? (wonLastQ._sum.approvedTotalCents ?? 0) : 0,
    thisWeekProposalsSent,
    thisWeekInvoicesIssued,
    thisWeekProjectsCreated,
  }

  // ── Attention items ───────────────────────────────────────────────────────────
  const attentionItems: AttentionItem[] = []
  const FIVE_DAYS  = 5 * msPerDay
  const FOUR_DAYS  = 4 * msPerDay
  const TWO_DAYS   = 2 * msPerDay

  for (const project of allProjects) {
    // 1. Proposals viewed >5 days ago with no response
    for (const pr of project.proposals) {
      if (
        pr.status === 'VIEWED' &&
        pr.lastViewedAt &&
        now.getTime() - pr.lastViewedAt.getTime() > FIVE_DAYS
      ) {
        const daysAgo = Math.floor((now.getTime() - pr.lastViewedAt.getTime()) / msPerDay)
        attentionItems.push({
          type:        'proposal-viewed',
          projectId:   project.id,
          projectName: project.name,
          label:       `Proposal viewed ${pr.viewCount}×, no response in ${daysAgo}d`,
          href:        `/projects/${project.id}`,
        })
        break // one alert per project
      }
    }

    // 2. Overdue invoices
    for (const inv of project.invoices) {
      if (
        ['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status) &&
        inv.dueDate < now
      ) {
        const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / msPerDay)
        attentionItems.push({
          type:        'invoice-overdue',
          projectId:   project.id,
          projectName: project.name,
          label:       `Invoice overdue by ${daysOverdue}d`,
          href:        `/projects/${project.id}`,
        })
        break
      }
    }

    // 3. Shoot in next 4 days with no SENT or FINAL call sheet
    if (
      project.shootStartDate &&
      project.shootStartDate >= startOfToday &&
      project.shootStartDate <= new Date(startOfToday.getTime() + FOUR_DAYS)
    ) {
      const hasSentSheet = project.callSheets.some(
        cs => cs.status === 'SENT' || cs.status === 'FINAL',
      )
      if (!hasSentSheet) {
        const daysUntil = Math.ceil(
          (project.shootStartDate.getTime() - now.getTime()) / msPerDay,
        )
        attentionItems.push({
          type:        'shoot-no-callsheet',
          projectId:   project.id,
          projectName: project.name,
          label:       `Shoot in ${daysUntil} day${daysUntil === 1 ? '' : 's'}, no call sheet sent`,
          href:        `/projects/${project.id}`,
        })
      }
    }

    // 4. Proposal expiring in next 2 days
    for (const pr of project.proposals) {
      if (
        ['SENT', 'VIEWED'].includes(pr.status) &&
        pr.expiresAt &&
        pr.expiresAt >= now &&
        pr.expiresAt <= new Date(now.getTime() + TWO_DAYS)
      ) {
        const daysLeft = Math.ceil((pr.expiresAt.getTime() - now.getTime()) / msPerDay)
        attentionItems.push({
          type:        'proposal-expiring',
          projectId:   project.id,
          projectName: project.name,
          label:       `Proposal expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          href:        `/projects/${project.id}`,
        })
        break
      }
    }
  }

  // ── Upcoming shoots (next 28 days, inclusive of today) ───────────────────────
  const upcomingCutoff = new Date(startOfToday.getTime() + 28 * msPerDay)
  const upcomingShoots: UpcomingShoot[] = allProjects
    .filter(p => p.shootStartDate && p.shootStartDate >= startOfToday && p.shootStartDate <= upcomingCutoff)
    .sort((a, b) => (a.shootStartDate!.getTime()) - (b.shootStartDate!.getTime()))
    .map(p => ({
      projectId:   p.id,
      projectName: p.name,
      clientName:  p.client.name,
      shootDate:   p.shootStartDate!,
    }))

  // ── Status counts (for filter pills) ──────────────────────────────────────────
  const statusCounts: StatusCounts = {
    lead:     allProjects.filter(p => p.status === 'LEAD').length,
    active:   allProjects.filter(p => p.status === 'ACTIVE').length,
    wrapped:  allProjects.filter(p => p.status === 'WRAPPED').length,
    archived: archivedProjects.length,
  }

  return (
    <ProjectsPageClient
      projects={allProjectsForClient as unknown as ProjectForCard[]}
      metrics={metrics}
      canSeeFinancials={canSeeFin}
      attentionItems={attentionItems}
      upcomingShoots={upcomingShoots}
      statusCounts={statusCounts}
      clients={clients}
      templates={templates}
      initialStatus={resolvedParams.status ?? 'all'}
      initialView={resolvedParams.view === 'list' ? 'list' : 'grid'}
      initialSort={resolvedParams.sort ?? 'shoot'}
    />
  )
}
