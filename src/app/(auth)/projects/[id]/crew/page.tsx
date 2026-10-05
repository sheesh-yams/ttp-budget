import { getAccess } from '@/lib/access'
import { notFound } from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getProjectMembers, seedTeamFromBudget } from '@/server/actions/project-members'
import { ProjectTeam, type CrewDealMemoRef } from '@/components/projects/ProjectTeam'
import type { TimeFormat } from '@/lib/time-format'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: { name: true },
  })
  return { title: project ? `${project.name} | Team` : 'Team' }
}

export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireProjectAccess(id)
  const projectAccess = await requireProjectArea(id, 'crew')
  const workspaceId = await getWorkspaceId()

  // Verify project exists + belongs to this workspace
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  // Auto-seed team from proposal crew if team is empty (no-op if already
  // seeded). Seeding is a crew edit — viewers just see what's there.
  const [seedResult, members, workspace] = await Promise.all([
    projectAccess.can('crew', 'EDIT')
      ? seedTeamFromBudget(id)
      : Promise.resolve({ success: false as const, error: 'view only' }),
    getProjectMembers(id),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { callTimeFormat: true } }),
  ])

  // Deal memo pill per crew member (dealMemos VIEW — memos reveal vendor
  // rates). A confirmed memo wins; otherwise an open bid for the same person.
  let dealMemos: Record<string, CrewDealMemoRef> | undefined
  if (projectAccess.can('dealMemos')) {
    const memos = await db.dealMemo.findMany({
      where:   { projectId: id, workspaceId, status: { in: ['CONFIRMED', 'BID'] } },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, status: true, projectMemberId: true, contactId: true, signedAt: true },
    })
    dealMemos = {}
    for (const m of members) {
      const mine = memos.filter(x => x.projectMemberId === m.id || (m.contactId && x.contactId === m.contactId))
      const pick = mine.find(x => x.status === 'CONFIRMED') ?? mine[0]
      if (pick) dealMemos[m.id] = { memoId: pick.id, status: pick.status, signed: !!pick.signedAt }
    }
  }

  const proposalTitle =
    seedResult.success && seedResult.data.count > 0
      ? seedResult.data.proposalTitle
      : null

  const timeFormat = (workspace?.callTimeFormat as TimeFormat | null) ?? '12H'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Team</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Crew and talent assigned to this project. Add from your Rolodex or enter manually.
        </p>
      </div>

      <ProjectTeam
        projectId={id} members={members} seedProposalTitle={proposalTitle} timeFormat={timeFormat} dealMemos={dealMemos}
        canEdit={projectAccess.can('crew', 'EDIT')}
        canSetRates={projectAccess.can('dealMemos', 'EDIT')}
        canOpenRolodex={(await getAccess()).can('rolodex')}
      />
    </div>
  )
}
