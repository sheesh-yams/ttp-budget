import { notFound }                    from 'next/navigation'
import { db }                          from '@/lib/db'
import { getWorkspaceId, requireRole } from '@/lib/auth'
import { ClientPagePreview }           from '@/components/delivery/ClientPagePreview'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `${project.name} | Client Page` : 'Client Page' }
}

export default async function DeliveryClientPage({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return <p className="text-sm text-muted-foreground">Access denied.</p>

  const project = await db.project.findFirst({
    where:  { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  const deliveryPage = await db.deliveryPage.findUnique({
    where:  { projectId: id },
    select: {
      id:              true,
      publicToken:     true,
      status:          true,
      title:           true,
      subtitle:        true,
      customMessage:   true,
      coverImageUrl:   true,
      lastPublishedAt: true,
      _count: { select: { sections: true } },
    },
  })

  return (
    <ClientPagePreview
      project={project}
      deliveryPage={deliveryPage}
    />
  )
}
