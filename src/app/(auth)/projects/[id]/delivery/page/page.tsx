import { notFound }                    from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
import { db }                          from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
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
  await requireProjectAccess(id)
  const projectAccess = await requireProjectArea(id, 'delivery')
  const canEdit = projectAccess.can('delivery', 'EDIT')
  const workspaceId = await getWorkspaceId()

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
      sections:        { select: { id: true } },
    },
  })

  // Reshape to what ClientPagePreview expects
  const page = deliveryPage
    ? { ...deliveryPage, sectionCount: deliveryPage.sections.length, sections: undefined }
    : null

  return (
    // View-only: every control disabled (the server refuses writes regardless).
    <fieldset disabled={!canEdit} className="contents">
      {!canEdit && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can view the client delivery page but not change it.
        </p>
      )}
      <ClientPagePreview
        project={project}
        deliveryPage={page}
      />
    </fieldset>
  )
}
