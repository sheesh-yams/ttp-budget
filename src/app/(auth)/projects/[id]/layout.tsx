import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProjectSubNav } from '@/components/projects/ProjectSubNav'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  // Lightweight fetch — just what the sidebar needs
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: {
      id:   true,
      name: true,
      client: { select: { name: true } },
    },
  })

  if (!project) notFound()

  return (
    // -mx-6 -my-6 escapes the auth layout's p-6 padding so the sidebar can run
    // flush to the edges of the main scroll container.
    <div className="flex -mx-6 -my-6">
      {/* ── Secondary sidebar ───────────────────────────────────────────────── */}
      <aside
        className="w-44 shrink-0 border-r border-foreground/8 sticky top-0 self-start h-[calc(100vh-52px)] overflow-y-auto"
        style={{ background: 'hsl(270 40% 97%)' }}
      >
        <ProjectSubNav
          projectId={project.id}
          projectName={project.name}
          clientName={project.client.name}
        />
      </aside>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 p-6">
        {children}
      </div>
    </div>
  )
}
