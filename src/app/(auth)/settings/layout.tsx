import { redirect } from 'next/navigation'
import { getAccess, requireTeamViewer } from '@/lib/access'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

/**
 * Workspace settings follow the Settings permission (roles 2b). Everyone else
 * is bounced to the dashboard before any settings data is fetched. Each page
 * checks again — layouts don't re-run on sibling navigation.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [access, teamViewer] = await Promise.all([getAccess(), requireTeamViewer()])
  // Open with Settings, or with Team & roles for the Roles tab alone.
  if (!access.can('settings') && !teamViewer.ok) redirect('/')

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace, branding, and payments.
        </p>
      </div>
      <SettingsTabs showRoles={teamViewer.ok} showSettings={access.can('settings')} />
      {children}
    </div>
  )
}
