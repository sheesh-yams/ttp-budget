import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProjectsPageClient } from '@/components/projects/ProjectsPageClient'

export const metadata = { title: 'Projects — TTP Budget' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const { archived } = await searchParams
  const showArchived = archived === '1'
  const workspaceId  = await getWorkspaceId()

  const [projects, clients, templates] = await Promise.all([
    db.project.findMany({
      where: {
        workspaceId,
        status: showArchived ? 'ARCHIVED' : { not: 'ARCHIVED' },
      },
      orderBy: showArchived ? { archivedAt: 'desc' } : { createdAt: 'desc' },
      include: {
        client: { select: { name: true } },
        _count: { select: { budgets: true, proposals: true, invoices: true } },
      },
    }),
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
  ])

  return (
    <ProjectsPageClient
      projects={projects}
      clients={clients}
      templates={templates}
      showArchived={showArchived}
    />
  )
}
