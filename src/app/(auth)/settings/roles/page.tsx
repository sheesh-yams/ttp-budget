import { redirect } from 'next/navigation'
import { listRoles } from '@/server/actions/roles'
import { RolesManager } from '@/components/settings/roles/RolesManager'
import { requireTeamViewer } from '@/lib/access'
import { ViewOnly } from '@/components/ui/view-only'

export const metadata = { title: 'Roles' }

export default async function RolesSettingsPage() {
  // Team & roles (roles 2c): View to see roles, Edit to change them.
  const gate = await requireTeamViewer()
  if (!gate.ok) redirect('/settings')
  const res = await listRoles()
  if (!res.success) redirect('/settings')
  return (
    <ViewOnly readOnly={!gate.canEdit} what="roles">
      <RolesManager workspaceRoles={res.data.workspaceRoles} projectRoles={res.data.projectRoles} />
    </ViewOnly>
  )
}
