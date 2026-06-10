import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getProjectMembers, seedTeamFromBudget } from '@/server/actions/project-members'
import { ProjectTeam } from '@/components/projects/ProjectTeam'

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
  return { title: project ? `Team — ${project.name} — TTP Budget` : 'Team' }
}

export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  // Verify project exists + belongs to this workspace
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  // Auto-seed team from CREW rate cards if team is empty (no-op if already seeded)
  await seedTeamFromBudget(id)

  const members = await getProjectMembers(id)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Team</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Crew and talent assigned to this project. Add from your Rolodex or enter manually.
        </p>
      </div>

      <ProjectTeam projectId={id} members={members} />
    </div>
  )
}
