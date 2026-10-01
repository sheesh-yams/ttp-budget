import { notFound } from 'next/navigation'
import { requireProjectAccess } from '@/lib/project-access'
import { db } from '@/lib/db'
import { getCurrentRole, getWorkspaceId } from '@/lib/auth'
import { getProjectAccess } from '@/lib/access'
import { ProjectSubNav, type ProjectTabKey } from '@/components/projects/ProjectSubNav'

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
  const [workspaceId, role, projectAccess] = await Promise.all([getWorkspaceId(), getCurrentRole(), getProjectAccess(id)])
  if (!projectAccess) notFound()

  // Roles Phase 2 is converting area by area. A converted area's tab follows
  // the new permission alone; a not-yet-converted one also needs the legacy
  // role its page still checks, so a tab never links to a page that 404s.
  const legacyMoney = role !== 'COLLABORATOR'
  const can = (area: Parameters<typeof projectAccess.can>[0]) => projectAccess.can(area)
  const tabs: Record<ProjectTabKey, boolean> = {
    budget:     can('budget.lines'),
    contract:   legacyMoney && can('contract'),
    actuals:    legacyMoney && can('actuals'),
    receipts:   legacyMoney && can('actuals'),
    invoices:   legacyMoney && can('invoices'),
    crew:       can('crew'),
    dealMemos:  legacyMoney && can('dealMemos'),
    schedule:   can('schedule'),
    callSheets: can('callSheets'),
    delivery:   legacyMoney && can('delivery'),
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

  return (
    // -mx-6 -my-6 escapes the auth layout's p-6 padding so the sidebar can run
    // flush to the edges of the main scroll container.
    <div className="flex -mx-6 -my-6 min-h-[calc(100vh-52px)]">
      {/* ── Secondary sidebar ───────────────────────────────────────────────── */}
      <aside
        className="w-44 shrink-0 border-r border-foreground/8 sticky top-0 self-start h-[calc(100vh-52px)] overflow-y-auto"
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
      <div className="flex-1 min-w-0 p-6">
        {children}
      </div>
    </div>
  )
}
