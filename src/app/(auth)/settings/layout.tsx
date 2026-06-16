import { redirect } from 'next/navigation'
import { getCurrentRole } from '@/lib/auth'

/**
 * Workspace settings are OWNER-only. Producers and Collaborators are bounced
 * to the dashboard before any settings data is fetched or rendered (server-side
 * gate — not just hidden in the UI).
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole()
  if (role !== 'OWNER') redirect('/')
  return <>{children}</>
}
