import { redirect } from 'next/navigation'
import { getCurrentRole } from '@/lib/auth'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

/**
 * Workspace settings are OWNER-only. Producers and Collaborators are bounced
 * to the dashboard before any settings data is fetched or rendered (server-side
 * gate — not just hidden in the UI).
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole()
  if (role !== 'OWNER') redirect('/')

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace, branding, and payments.
        </p>
      </div>
      <SettingsTabs />
      {children}
    </div>
  )
}
