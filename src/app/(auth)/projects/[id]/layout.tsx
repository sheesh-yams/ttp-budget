import { notFound } from 'next/navigation'
import { requireProjectAccess } from '@/lib/project-access'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getProjectAccess } from '@/lib/access'
import { ProjectSubNav, type ProjectTabKey } from '@/components/projects/ProjectSubNav'
import { RememberProject } from '@/components/projects/RememberProject'
import { ProjectMobileHeader, ProjectMobileNav } from '@/components/projects/ProjectMobileNav'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Every page under here also calls requireProjectAccess itself — layouts
  // don't re-run on sibling navigation, so this is belt-and-braces only.
  await requireProjectAccess(id)
  const [workspaceId, projectAccess] = await Promise.all([getWorkspaceId(), getProjectAccess(id)])
  if (!projectAccess) notFound()

  // Each tab follows its area's permission (roles Phase 2), so a tab never
  // links to a page that 404s.
  const can = (area: Parameters<typeof projectAccess.can>[0]) => projectAccess.can(area)
  const tabs: Record<ProjectTabKey, boolean> = {
    budget:     can('budget.lines'),
    contract:   can('contract'),
    actuals:    can('actuals'),
    receipts:   can('actuals'),
    invoices:   can('invoices'),
    crew:       can('crew'),
    dealMemos:  can('dealMemos'),
    schedule:   can('schedule'),
    callSheets: can('callSheets'),
    delivery:   can('delivery'),
  }

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

  // What this person may create here — the phone "+" sheets offer only these.
  const canCreate = {
    dealMemos:  projectAccess.can('dealMemos', 'EDIT'),
    callSheets: projectAccess.can('callSheets', 'EDIT'),
    receipts:   projectAccess.can('actuals', 'EDIT'),
  }

  return (
    // The negative margins escape the auth layout's padding (p-4 on phones,
    // p-6 from md) so the sidebar can run flush to the main scroll container.
    <div className="flex -mx-4 -mt-4 md:-mx-6 md:-my-6 min-h-[calc(100vh-52px)]">
      <RememberProject
        workspaceId={workspaceId} id={project.id} name={project.name}
        can={canCreate}
      />
      {/* ── Secondary sidebar ───────────────────────────────────────────────── */}
      {/* Desktop only — phones get ProjectMobileHeader + ProjectMobileNav. */}
      <aside
        className="hidden md:block w-44 shrink-0 border-r border-foreground/8 sticky top-0 self-start h-[calc(100vh-52px)] overflow-y-auto"
        style={{ background: 'hsl(270 40% 97%)' }}
      >
        <ProjectSubNav
          projectId={project.id}
          projectName={project.name}
          clientName={project.client.name}
          tabs={tabs}
        />
      </aside>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 p-4 md:p-6">
        <ProjectMobileHeader projectName={project.name} clientName={project.client.name} />
        {children}
      </div>
      <ProjectMobileNav projectId={project.id} tabs={tabs} can={canCreate} />
    </div>
  )
}
