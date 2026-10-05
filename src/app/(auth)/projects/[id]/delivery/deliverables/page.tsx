import { notFound }                    from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
import { db }                          from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { generatePublicToken }         from '@/lib/secure-token'
import { DeliverablesManager }         from '@/components/delivery/DeliverablesManager'
import { getDeliveryAnalytics }        from '@/server/actions/delivery'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `${project.name} | Deliverables` : 'Deliverables' }
}

export default async function DeliveryDeliverablesPage({ params }: Props) {
  const { id } = await params
  await requireProjectAccess(id)
  const projectAccess = await requireProjectArea(id, 'delivery')
  const canEdit = projectAccess.can('delivery', 'EDIT')
  const workspaceId = await getWorkspaceId()

  const project = await db.project.findFirst({
    where:  { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  // Auto-create the delivery page on first visit so editors never see an
  // empty state. Viewers don't create anything by looking.
  if (canEdit) {
    await db.deliveryPage.upsert({
      where:  { projectId: id },
      create: { projectId: id, workspaceId, publicToken: generatePublicToken() },
      update: {},
    })
  }

  const deliveryPage = await db.deliveryPage.findUnique({
    where:  { projectId: id },
    select: {
      id:              true,
      publicToken:     true,
      title:           true,
      subtitle:        true,
      customMessage:   true,
      overview:        true,
      coverImageUrl:   true,
      status:          true,
      lastPublishedAt: true,
      sections: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id:          true,
          title:       true,
          description: true,
          orderIndex:  true,
          deliverables: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id:           true,
              title:        true,
              description:  true,
              type:         true,
              status:       true,
              reviewStatus: true,
              publicToken:  true,
              orderIndex:   true,
              currentVersion: {
                select: {
                  id:                true,
                  versionNumber:     true,
                  url:               true,
                  provider:          true,
                  renderMode:        true,
                  thumbnailUrl:      true,
                  firstClientViewAt: true,
                  isVertical:        true,
                },
              },
            },
          },
        },
      },
    },
  })

  const [approvedProposal, analyticsResult] = await Promise.all([
    db.proposal.findFirst({
      where:   { projectId: id, workspaceId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      select:  { id: true },
    }),
    deliveryPage
      ? getDeliveryAnalytics(deliveryPage.id)
      : Promise.resolve({ success: true as const, data: [] }),
  ])

  const analytics = analyticsResult.success ? analyticsResult.data : []

  return (
    // View-only: every control disabled (the server refuses writes regardless).
    <fieldset disabled={!canEdit} className="contents">
      {!canEdit && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can view the client delivery page but not change it.
        </p>
      )}
      <DeliverablesManager
        project={project}
        deliveryPage={deliveryPage}
        hasApprovedProposal={!!approvedProposal}
        analytics={analytics}
      />
    </fieldset>
  )
}
