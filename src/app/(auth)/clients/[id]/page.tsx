import { notFound } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { getAccess } from '@/lib/access'
import { requireWorkspaceArea } from '@/lib/project-access'
import { projectsWithArea } from '@/lib/money-access'
import { loadClientPage } from '@/lib/client-page'
import { loadDeals } from '@/lib/proposals-deals'
import { stage, closedAt, effectiveStatus } from '@/lib/proposals-board'
import { canCreateProjectFromInvoice } from '@/lib/invoice-first'
import { ClientDetail, type ClientDeal, type ClientPipeline } from '@/components/clients/ClientDetail'

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  // No name in the tab title without Clients access.
  const [workspaceId, acc] = await Promise.all([getWorkspaceId(), getAccess()])
  if (!acc.can('clients')) return { title: 'Client' }
  const c = await db.client.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: c?.name ?? 'Client' }
}

export default async function ClientPage({ params }: Props) {
  const { id } = await params
  // Same gate as the /clients list.
  const access = await requireWorkspaceArea('clients')
  const [workspaceId, user, acc] = await Promise.all([getWorkspaceId(), getCurrentUser(), getAccess()])

  // Margin-blind roles: no money figures at all (same gate as Projects).
  const showMoney = acc.can('dashboardMoney')
  const projectWhere: Prisma.ProjectWhereInput =
    !acc.isOwner && acc.projectScope === 'ASSIGNED' ? { assignments: { some: { userId: user.id } } } : {}

  const canInvoices  = acc.can('invoices')
  const canProposals = acc.can('proposals')
  const [invoiceIds, invoiceEditIds, proposalIds, proposalEditIds, deliveryIds] = await Promise.all([
    canInvoices  ? projectsWithArea('invoices')         : Promise.resolve(false as const),
    canInvoices  ? projectsWithArea('invoices', 'EDIT') : Promise.resolve(false as const),
    canProposals ? projectsWithArea('proposals')        : Promise.resolve(false as const),
    canProposals ? projectsWithArea('proposals', 'EDIT'): Promise.resolve(false as const),
    projectsWithArea('delivery'),
  ])

  const data = await loadClientPage(db, workspaceId, id, {
    projectWhere, showMoney, invoices: invoiceIds, proposals: proposalIds, delivery: deliveryIds,
  })
  if (!data) notFound()

  // Proposals: the same deal rows as /proposals (archived projects excluded),
  // limited to projects the person can open.
  const openable = new Set(data.projects.map(p => p.id))
  const now = new Date()
  const deals = proposalIds === false ? [] : (await loadDeals(db, workspaceId, {
    visible: proposalIds, editable: proposalEditIds === false ? [] : proposalEditIds, showMoney, clientId: id,
  })).filter(r => openable.has(r.project.id))

  const proposals: ClientDeal[] = deals.flatMap(r => r.proposal ? [{
    key: r.key, projectId: r.project.id, projectName: r.project.name,
    title: r.proposal.title, status: effectiveStatus(r, now), stage: stage(r, now),
    version: r.proposal.version, viewCount: r.proposal.viewCount,
    sentAt: r.proposal.sentAt, decidedAt: closedAt(r, now), token: r.proposal.token,
    valueCents: r.valueCents,
  }] : [])

  let pipeline: ClientPipeline | null = null
  if (showMoney && proposalIds !== false) {
    const won    = proposals.filter(p => p.stage === 'won')
    const lost   = proposals.filter(p => p.stage === 'lost')
    const open   = proposals.filter(p => p.stage === 'out')
    const wonSum = won.reduce((s, p) => s + (p.valueCents ?? 0), 0)
    pipeline = {
      openCents: open.reduce((s, p) => s + (p.valueCents ?? 0), 0),
      openCount: open.length,
      wonCount: won.length,
      decidedCount: won.length + lost.length,
      avgWonCents: won.length ? Math.round(wonSum / won.length) : null,
    }
  }

  // New project / New invoice, preselected to this client.
  const canCreateProjects = acc.can('projects', 'EDIT') && !data.client.archived
  const canNewInvoice     = invoiceEditIds !== false && !data.client.archived
  const [templates, billable, workspace] = await Promise.all([
    canCreateProjects
      ? db.budgetTemplate.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true, shootType: true, description: true } })
      : Promise.resolve([]),
    canNewInvoice
      ? db.project.findMany({
          where:   { workspaceId, clientId: id, archivedAt: null, status: { not: 'ARCHIVED' }, ...(invoiceEditIds ? { id: { in: invoiceEditIds } } : {}) },
          orderBy: { updatedAt: 'desc' },
          select:  { id: true, name: true, proposals: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 } },
        })
      : Promise.resolve([]),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { invoiceExpiryDays: true } }),
  ])
  const canCreateFromInvoice = canNewInvoice && canCreateProjectFromInvoice(acc)

  return (
    <ClientDetail
      data={data}
      proposals={canProposals ? proposals : null}
      showInvoices={canInvoices}
      pipeline={pipeline}
      canEdit={access.can('clients', 'EDIT')}
      newProject={canCreateProjects ? { templates } : null}
      newInvoice={canNewInvoice && (billable.length > 0 || canCreateFromInvoice) ? {
        projects: billable.map(p => ({ id: p.id, name: p.name, clientName: data.client.name, won: p.proposals.length > 0 })),
        canCreateProject: canCreateFromInvoice,
        invoiceExpiryDays: workspace?.invoiceExpiryDays ?? 30,
      } : null}
    />
  )
}
