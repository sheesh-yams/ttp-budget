import { redirect } from 'next/navigation'
import { listTeamMembers, getPendingInvitations } from '@/server/actions/team'
import { TeamPageClient } from '@/components/team/TeamPageClient'
import { getActiveWorkspace } from '@/lib/auth'
import { requireTeamAdmin } from '@/lib/access'
import { listRoles } from '@/server/actions/roles'

export const metadata = { title: 'Team' }

export default async function TeamPage() {
  // Member management (requireTeamAdmin: Team & roles EDIT, and Owner while the
  // workspace pages are on the legacy role) — server-side, not just hidden.
  if (!(await requireTeamAdmin()).ok) redirect('/')

  const [members, pending, workspace, rolesRes] = await Promise.all([
    listTeamMembers(),
    getPendingInvitations(),
    getActiveWorkspace(),
    listRoles(),
  ])
  const roles = rolesRes.success
    ? rolesRes.data.workspaceRoles.map(r => ({ id: r.id, name: r.name, systemKey: r.systemKey }))
    : []

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
        isOwner={true}
        roles={roles}
      />
    </div>
  )
}
