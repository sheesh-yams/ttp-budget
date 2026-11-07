import { projectsWithArea } from '@/lib/money-access'
import { getScopedDb } from '@/lib/db-scoped'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { getAccess } from '@/lib/access'
import type { Prisma } from '@prisma/client'
import { ProjectsTableClient } from '@/components/projects/table/ProjectsTableClient'
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

  const [projects, clients, templates, primaryPhases, editableIds, teamEditableIds] = await Promise.all([
    sdb.project.findMany({ where: visibilityWhere, orderBy: { updatedAt: 'desc' }, select: PROJECT_SELECT }),
    // For NewProjectModal
    db.client.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.budgetTemplate.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true, shootType: true, description: true } }),
    // Phase has no workspaceId (not auto-scoped) — scope it through its budget.
    canSeeFin ? sdb.phase.findMany({ where: { isPrimary: true, budget: { workspaceId } }, select: PRIMARY_PHASE_TOTALS_SELECT }) : Promise.resolve([]),
    projectsWithArea('overview', 'EDIT'),
    projectsWithArea('projectTeam', 'EDIT'),
  ])

  const budgetTotal = primaryPhaseTotals(primaryPhases as unknown as PrimaryPhaseRow[])

  // ── Rows ──────────────────────────────────────────────────────────────────
  const rows: ProjectRow[] = projects.map(p => {
    const won       = p.proposals.find(pr => pr.status === 'APPROVED') ?? null
    const proposed  = p.proposals.some(pr => pr.status === 'SENT' || pr.status === 'VIEWED')
    const budget    = budgetTotal.get(p.id) ?? 0
    const expected  = (budget > 0 ? budget : (won?.approvedTotalCents ?? 0)) + addedScopeCents(p.invoices)
    const collected = p.invoices.reduce((s, i) => s + (i.status === 'VOID' ? 0 : i.amountPaidCents), 0)
    const sent      = p.invoices.filter(i => i.status !== 'VOID' && i.status !== 'DRAFT')
    const invoiced  = sent.reduce((s, i) => s + i.totalCents, 0)
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
      billing: sent.length > 0,
      overdueInvoices: sent.filter(i => i.status !== 'PAID' && i.amountPaidCents < i.totalCents && i.dueDate < now).length,
      // Value never shows less than what's been billed (invoice-first
      // projects have no budget to compare against).
      money: canSeeFin ? { valueCents: Math.max(expected, invoiced), invoicedCents: invoiced, collectedCents: collected, won: !!won, wonAt: iso(won?.approvedAt ?? null), proposed } : null,
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

  return (
    <ProjectsTableClient
      rows={rows}
      showMoney={canSeeFin}
      canManageProjects={access.can('projects', 'EDIT')}
      isOwner={access.isOwner}
      clients={clients}
      templates={templates}
    />
  )
}
