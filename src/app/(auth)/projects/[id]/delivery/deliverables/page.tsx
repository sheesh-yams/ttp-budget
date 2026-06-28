import { notFound }                    from 'next/navigation'
import { db }                          from '@/lib/db'
import { getWorkspaceId, requireRole } from '@/lib/auth'
import { DeliverablesManager }         from '@/components/delivery/DeliverablesManager'

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
  const workspaceId = await getWorkspaceId()

  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return <p className="text-sm text-muted-foreground">Access denied.</p>

  const project = await db.project.findFirst({
    where:  { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  // Load delivery page if it exists (null = not yet created)
  const deliveryPage = await db.deliveryPage.findUnique({
    where:  { projectId: id },
    select: {
      id:             true,
      publicToken:    true,
      title:          true,
      subtitle:       true,
      customMessage:  true,
      coverImageUrl:  true,
      status:         true,
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
              id:            true,
              title:         true,
              description:   true,
              type:          true,
              status:        true,
              publicToken:   true,
              orderIndex:    true,
              currentVersion: {
                select: {
                  id:               true,
                  versionNumber:    true,
                  provider:         true,
                  renderMode:       true,
                  thumbnailUrl:     true,
                  firstClientViewAt: true,
                },
              },
            },
          },
        },
      },
    },
  })

  // Check if project has an approved proposal (for Generate CTA)
  const approvedProposal = await db.proposal.findFirst({
    where:   { projectId: id, workspaceId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select:  { id: true },
  })

  return (
    <DeliverablesManager
      project={project}
      deliveryPage={deliveryPage}
      hasApprovedProposal={!!approvedProposal}
    />
  )
}
