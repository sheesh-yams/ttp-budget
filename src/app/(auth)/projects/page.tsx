import { projectsWithArea } from '@/lib/money-access'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { getAccess } from '@/lib/access'
import type { Prisma } from '@prisma/client'
import { ProjectsTableClient, type ProjectStats } from '@/components/projects/table/ProjectsTableClient'
import { addedScopeCents } from '@/lib/project-value'
import { primaryPhaseTotals, PRIMARY_PHASE_TOTALS_SELECT, type PrimaryPhaseRow } from '@/lib/primary-phase-totals'
import { effectivePhase, suggestedPhase } from '@/lib/project-phase'
import { needsAttention, nextStep } from '@/lib/project-next-step'
import type { ProjectRow } from '@/lib/projects-table'

export const metadata = { title: 'Projects' }

const PROJECT_SELECT = {
  id: true, name: true, shootType: true, status: true, phase: true,
  shootStartDate: true, shootEndDate: true, updatedAt: true,
  client: { select: { id: true, name: true, logoUrl: true } },
  proposals: {
    select: { status: true, approvedTotalCents: true, approvedAt: true, lastViewedAt: true, sentAt: true, expiresAt: true, viewCount: true },
  },
  invoices: {
    select: { number: true, kind: true, status: true, totalCents: true, amountPaidCents: true, dueDate: true, issueDate: true, isScopeAddition: true },
  },
  callSheets: { select: { status: true } },
  teamMembers: {
    // The PL / AM / PM chips — read from the project role.
    where:   { unassignedAt: null, projectRole: { systemKey: { in: ['PROJECT_LEAD', 'ACCOUNT_MANAGER', 'PROJECT_MANAGER'] as string[] } } },
    orderBy: { assignedAt: 'asc' },
    select:  { userId: true, projectRole: { select: { systemKey: true } }, user: { select: { name: true, email: true, avatarUrl: true } } },
  },
} as const

const iso = (d: Date | null) => (d ? d.toISOString() : null)
const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export default async function ProjectsPage() {
  const [workspaceId, currentUser, access] = await Promise.all([getWorkspaceId(), getCurrentUser(), getAccess()])

  // ASSIGNED-scope roles only list projects they're on.
  const visibilityWhere: Prisma.ProjectWhereInput =
    !access.isOwner && access.projectScope === 'ASSIGNED'
      ? { assignments: { some: { userId: currentUser.id } } }
      : {}

  // Margin-blind roles: every money figure is left out server-side — the
  // gross total next to a net budget they can see would give away markup.
  const canSeeFin = access.can('dashboardMoney')

  const sdb = await getScopedDb()
  const now = new Date()
  const todayKey = now.toISOString().slice(0, 10)
  const DAY = 86_400_000

  const qMonth     = Math.floor(now.getMonth() / 3) * 3
  const qStart     = new Date(now.getFullYear(), qMonth, 1)
  const qEnd       = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999)
  const prevQStart = new Date(now.getFullYear(), qMonth - 3, 1)
  const prevQEnd   = new Date(qStart.getTime() - 1)

  const [projects, clients, templates, wonThisQ, wonLastQ, primaryPhases, scopeThisQ, scopeLastQ, editableIds, teamEditableIds, pipelineProposals] = await Promise.all([
    sdb.project.findMany({ where: visibilityWhere, orderBy: { updatedAt: 'desc' }, select: PROJECT_SELECT }),
    // For NewProjectModal
    db.client.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.budgetTemplate.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true, shootType: true, description: true } }),
    sdb.proposal.aggregate({ where: { status: 'APPROVED', approvedAt: { gte: qStart, lte: qEnd }, project: { status: { not: 'ARCHIVED' } } }, _sum: { approvedTotalCents: true } }),
    sdb.proposal.aggregate({ where: { status: 'APPROVED', approvedAt: { gte: prevQStart, lte: prevQEnd }, project: { status: { not: 'ARCHIVED' } } }, _sum: { approvedTotalCents: true } }),
    canSeeFin ? sdb.phase.findMany({ where: { isPrimary: true }, select: PRIMARY_PHASE_TOTALS_SELECT }) : Promise.resolve([]),
    // Added scope billed this / last quarter counts as won when invoiced.
    sdb.invoice.aggregate({ where: { isScopeAddition: true, status: { not: 'VOID' }, issueDate: { gte: qStart, lte: qEnd }, project: { status: { not: 'ARCHIVED' } } }, _sum: { totalCents: true } }),
    sdb.invoice.aggregate({ where: { isScopeAddition: true, status: { not: 'VOID' }, issueDate: { gte: prevQStart, lte: prevQEnd }, project: { status: { not: 'ARCHIVED' } } }, _sum: { totalCents: true } }),
    projectsWithArea('overview', 'EDIT'),
    projectsWithArea('projectTeam', 'EDIT'),
    sdb.proposal.findMany({ where: { status: { in: ['SENT', 'VIEWED'] }, project: { status: { not: 'ARCHIVED' } } }, select: { projectId: true } }),
  ])

  const budgetTotal = primaryPhaseTotals(primaryPhases as unknown as PrimaryPhaseRow[])

  // ── Rows ──────────────────────────────────────────────────────────────────
  const rows: ProjectRow[] = projects.map(p => {
    const won       = p.proposals.find(pr => pr.status === 'APPROVED') ?? null
    const proposed  = p.proposals.some(pr => pr.status === 'SENT' || pr.status === 'VIEWED')
    const budget    = budgetTotal.get(p.id) ?? 0
    const expected  = (budget > 0 ? budget : (won?.approvedTotalCents ?? 0)) + addedScopeCents(p.invoices)
    const collected = p.invoices.reduce((s, i) => s + (i.status === 'VOID' ? 0 : i.amountPaidCents), 0)
    const invoices  = p.invoices.map(i => ({ ...i, invoiceNumber: i.number, dueDate: i.dueDate.toISOString(), issueDate: i.issueDate.toISOString() }))
    const shootStart = dayKey(p.shootStartDate)
    const step = nextStep({
      status: p.status, shootStart,
      proposals: p.proposals.map(pr => ({ ...pr, lastViewedAt: iso(pr.lastViewedAt), sentAt: iso(pr.sentAt), expiresAt: iso(pr.expiresAt) })),
      invoices, callSheets: p.callSheets,
      // Real figure even for margin-blind roles: only the paid-in-full yes/no
      // comes out of it; amounts stay out of `detail` when showMoney is off.
      expectedCents: expected,
    }, now, { showMoney: canSeeFin })
    const phase = effectivePhase(p.status, p.phase)
    const seen = new Set<string>()
    return {
      id: p.id, name: p.name, shootType: p.shootType, status: p.status, phase,
      client: p.client,
      shootStart, shootEnd: dayKey(p.shootEndDate),
      updatedAt: p.updatedAt.toISOString(),
      money: canSeeFin ? { valueCents: expected, collectedCents: collected, won: !!won, wonAt: iso(won?.approvedAt ?? null), proposed } : null,
      step,
      attention: needsAttention(step),
      suggested: suggestedPhase(phase, {
        status: p.status, shootStart, shootEnd: dayKey(p.shootEndDate), proposals: p.proposals, invoices, expectedCents: expected,
      }, todayKey),
      // One chip per built-in role — the earliest holder when several share it.
      team: p.teamMembers.flatMap(m => {
        const role = m.projectRole?.systemKey
        if (!role || seen.has(role)) return []
        seen.add(role)
        return [{ role, userId: m.userId, ...m.user }]
      }),
      canEdit:     editableIds === null || editableIds.includes(p.id),
      canEditTeam: teamEditableIds === null || teamEditableIds.includes(p.id),
    }
  })

  // ── Stats (non-archived) ──────────────────────────────────────────────────
  const live = rows.filter(r => r.status !== 'ARCHIVED')
  // Pipeline: projects with a sent / viewed proposal (one per project),
  // valued at the live budget total — as before the table.
  // Workspace-wide, as before the table (not limited to the projects listed).
  const pipelineIds = [...new Set(pipelineProposals.map(p => p.projectId).filter((id): id is string => !!id))]
  let outstanding = 0
  for (const r of live) if (r.money?.won) outstanding += Math.max(0, r.money.valueCents - r.money.collectedCents)
  // Not won yet but invoiced (invoice-first or ad hoc): unpaid balances.
  for (const p of projects) {
    if (p.status === 'ARCHIVED' || p.proposals.some(pr => pr.status === 'APPROVED')) continue
    for (const i of p.invoices) if (i.status !== 'VOID' && i.status !== 'PAID') outstanding += Math.max(0, i.totalCents - i.amountPaidCents)
  }
  const overdueCount = projects
    .filter(p => p.status !== 'ARCHIVED')
    .flatMap(p => p.invoices)
    .filter(i => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status) && i.amountPaidCents < i.totalCents && i.dueDate < now).length
  const soon = new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10)

  const stats: ProjectStats = {
    showMoney:      canSeeFin,
    pipelineCents:  canSeeFin ? pipelineIds.reduce((s, id) => s + (budgetTotal.get(id) ?? 0), 0) : 0,
    pipelineCount:  pipelineIds.length,
    outstandingCents: canSeeFin ? outstanding : 0,
    overdueCount,
    wonThisQuarterCents: canSeeFin ? (wonThisQ._sum.approvedTotalCents ?? 0) + (scopeThisQ._sum.totalCents ?? 0) : 0,
    wonLastQuarterCents: canSeeFin ? (wonLastQ._sum.approvedTotalCents ?? 0) + (scopeLastQ._sum.totalCents ?? 0) : 0,
    upcomingShoots: live.filter(r => r.shootStart && r.shootStart >= todayKey && r.shootStart <= soon).length,
  }

  return (
    <ProjectsTableClient
      rows={rows}
      stats={stats}
      canManageProjects={access.can('projects', 'EDIT')}
      clients={clients}
      templates={templates}
    />
  )
}
