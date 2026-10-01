import { redirect } from 'next/navigation'
import { listRoles } from '@/server/actions/roles'
import { RolesManager } from '@/components/settings/roles/RolesManager'

export const metadata = { title: 'Roles' }

export default async function RolesSettingsPage() {
  // listRoles needs Team & roles EDIT; the settings layout already limits
  // these pages to Owners.
  const res = await listRoles()
  if (!res.success) redirect('/settings')
  return <RolesManager workspaceRoles={res.data.workspaceRoles} projectRoles={res.data.projectRoles} />
}
