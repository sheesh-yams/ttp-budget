import { notFound } from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { loadShotList } from '@/lib/shot-list-load'
import { ShotListClient } from '@/components/shot-list/ShotListClient'

export const metadata = { title: 'Shot List' }

export default async function ShotListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  await requireProjectAccess(projectId)
  const access = await requireProjectArea(projectId, 'shotList')
  const workspaceId = await getWorkspaceId()

  const project = await db.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true, name: true } })
  if (!project) notFound()

  const loaded = await loadShotList(projectId, workspaceId)
  return (
    <ShotListClient
      projectId={projectId}
      projectName={project.name}
      canEdit={access.can('shotList', 'EDIT')}
      list={loaded.list}
      scenes={loaded.scenes}
      days={loaded.days}
    />
  )
}
