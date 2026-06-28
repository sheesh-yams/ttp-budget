import { notFound }                    from 'next/navigation'
import { db }                          from '@/lib/db'
import { getWorkspaceId, requireRole } from '@/lib/auth'

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
    where: { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-sm font-medium text-foreground">Deliverables</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Coming soon — manage and track individual deliverable assets here.
      </p>
    </div>
  )
}
