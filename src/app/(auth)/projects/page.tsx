import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProjectsPageClient } from '@/components/projects/ProjectsPageClient'

export const metadata = { title: 'Projects — TTP Budget' }

export default async function ProjectsPage() {
  const workspaceId = await getWorkspaceId()

  const [projects, clients, templates] = await Promise.all([
    db.project.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
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
    />
  )
}
