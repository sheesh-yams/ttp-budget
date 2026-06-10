import { listTeamMembers, getPendingInvitations } from '@/server/actions/team'
import { TeamPageClient } from '@/components/team/TeamPageClient'
import { getActiveWorkspace } from '@/lib/auth'

export const metadata = { title: 'Team — TTP Budget' }

export default async function TeamPage() {
  const [members, pending, workspace] = await Promise.all([
    listTeamMembers(),
    getPendingInvitations(),
    getActiveWorkspace(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who has access to <strong>{workspace.name}</strong>.
        </p>
      </div>

      <TeamPageClient
        members={members.map(m => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        pendingInvitations={pending.map(p => ({
          ...p,
          expiresAt: p.expiresAt.toISOString(),
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
