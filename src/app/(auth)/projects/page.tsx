import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProjectsPageClient } from '@/components/projects/ProjectsPageClient'
import type { ProjectForCard, ProjectMetrics, AttentionItem, UpcomingShoot, StatusCounts } from '@/components/projects/projects-types'

export const metadata = { title: 'Projects — TTP Budget' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; sort?: string }>
}) {
  const [resolvedParams, workspaceId] = await Promise.all([
    searchParams,
    getWorkspaceId(),
  ])

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
    archivedCount,
    clients,
    templates,
    wonThisQ,
    wonLastQ,
    outstandingInvoices,
    actualsSheets,
    primaryLineItems,
    pipelineProposals,
  ] = await Promise.all([

    // ── All non-archived projects with rich includes ──────────────────────────
    sdb.project.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      include: {
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
      },
    }),

    // ── Archived count (for pill) ─────────────────────────────────────────────
    sdb.project.count({ where: { status: 'ARCHIVED' } }),

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

    // ── Won this quarter ──────────────────────────────────────────────────────
    sdb.proposal.aggregate({
      where: {
        status: 'APPROVED',
        approvedAt: { gte: qStart, lte: qEnd },
      },
      _sum: { approvedTotalCents: true },
      _count: true,
    }),

    // ── Won last quarter ──────────────────────────────────────────────────────
    sdb.proposal.aggregate({
      where: {
        status: 'APPROVED',
        approvedAt: { gte: prevQStart, lte: prevQEnd },
      },
      _sum: { approvedTotalCents: true },
    }),

    // ── Outstanding invoices ──────────────────────────────────────────────────
    sdb.invoice.findMany({
      where: { status: { in: ['SENT', 'VIEWED', 'OVERDUE'] } },
      select: { id: true, totalCents: true, dueDate: true, status: true },
    }),

    // ── Actuals: sum of actualCents per project ───────────────────────────────
    // Each project can have at most one ActualSheet; we sum all entries for it.
    sdb.actualSheet.findMany({
      select: {
        projectId: true,
        entries:   { select: { actualCents: true } },
      },
    }),

    // ── Primary phase line items for budget total ─────────────────────────────
    // Used to show burn % on cards that have an actuals sheet.
    sdb.lineItem.findMany({
      where: { account: { phase: { isPrimary: true } } },
      select: { quantity: true, rateCents: true, account: { select: { phase: { select: { budget: { select: { projectId: true } } } } } } },
    }),

    // ── Pipeline proposals with phase line items ──────────────────────────────
    sdb.proposal.findMany({
      where: { status: { in: ['SENT', 'VIEWED'] } },
      select: {
        id: true,
        phaseId: true,
        budget: {
          select: {
            phases: {
              select: {
                id: true,
                isPrimary: true,
              },
            },
          },
        },
      },
    }),
  ])

  // ── Pipeline: resolve which phaseIds to sum ───────────────────────────────
  const pipelinePhaseIds: string[] = []
  for (const p of pipelineProposals) {
    if (p.phaseId) {
      pipelinePhaseIds.push(p.phaseId)
    } else {
      const primary = p.budget.phases.find(ph => ph.isPrimary)
      if (primary) pipelinePhaseIds.push(primary.id)
    }
  }

  // Fetch all line items in those phases (every account in a phase has phaseId set)
  const pipelineLineItems = pipelinePhaseIds.length > 0
    ? await sdb.lineItem.findMany({
        where: { account: { phaseId: { in: pipelinePhaseIds } } },
        select: { quantity: true, rateCents: true },
      })
    : []

  const pipelineValueCents = pipelineLineItems.reduce(
    (sum, li) => sum + Math.round(Number(li.quantity) * li.rateCents),
    0,
  )

  // ── Burn bar: merge actuals + budget totals into project cards ───────────────
  // actualSpentCents: sum of all ActualEntry.actualCents for the project's sheet
  const actualSpentByProject = new Map<string, number>()
  for (const sheet of actualsSheets) {
    const sum = sheet.entries.reduce((s, e) => s + e.actualCents, 0)
    actualSpentByProject.set(sheet.projectId, (actualSpentByProject.get(sheet.projectId) ?? 0) + sum)
  }

  // budgetTotalCents: crude sum of qty * rate on primary phase line items
  const budgetTotalByProject = new Map<string, number>()
  for (const li of primaryLineItems) {
    const projectId = li.account?.phase?.budget?.projectId
    if (!projectId) continue
    const lineCents = Math.round(Number(li.quantity) * li.rateCents)
    budgetTotalByProject.set(projectId, (budgetTotalByProject.get(projectId) ?? 0) + lineCents)
  }

  const projectsWithBurn = allProjects.map(p => ({
    ...p,
    actualSpentCents: actualSpentByProject.get(p.id) ?? 0,
    budgetTotalCents: budgetTotalByProject.get(p.id) ?? 0,
  }))

  // ── Metrics ───────────────────────────────────────────────────────────────────
  // "Open" = LEAD + ACTIVE (anything you're actively working or pitching)
  const openProjects        = allProjects.filter(p => p.status === 'LEAD' || p.status === 'ACTIVE')
  const upcomingShootCutoff = new Date(now.getTime() + 30 * msPerDay)
  const upcomingShootCount  = allProjects.filter(
    // Use startOfToday so projects with shootDate = today are included
    p => p.shootStartDate && p.shootStartDate >= startOfToday && p.shootStartDate <= upcomingShootCutoff,
  ).length

  const overdueCount = outstandingInvoices.filter(
    inv => inv.dueDate < now,
  ).length
  const outstandingCents = outstandingInvoices.reduce(
    (sum, inv) => sum + inv.totalCents,
    0,
  )

  // This-week stats
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
    pipelineValueCents,
    pipelineCount:            pipelineProposals.length,
    activeCount:              openProjects.length,
    upcomingShootCount,
    outstandingCents,
    overdueCount,
    wonThisQuarterCents:      wonThisQ._sum.approvedTotalCents ?? 0,
    wonLastQuarterCents:      wonLastQ._sum.approvedTotalCents ?? 0,
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
    archived: archivedCount,
  }

  // ── Normalise project data for the client ─────────────────────────────────────
  // Dates from Prisma are Date objects but Next.js serialises them to ISO strings
  // when passing through server → client boundary. Cast via JSON round-trip to be
  // explicit, or just let Next.js handle it.  Types in projects-types.ts use `string`
  // for dates so the client can use `new Date(...)`.

  return (
    <ProjectsPageClient
      projects={projectsWithBurn as unknown as ProjectForCard[]}
      metrics={metrics}
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
