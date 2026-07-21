import { redirect } from 'next/navigation'
import { getCurrentUser, getActiveWorkspace } from '@/lib/auth'
import { db } from '@/lib/db'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { buildBrandStyles } from '@/lib/brand'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  // Gate: send un-onboarded users to the setup wizard — unless they have a
  // pending invitation waiting (e.g. they were invited to a workspace but
  // their sign-up landed on /dashboard instead of /invite/[token], perhaps
  // because Clerk dropped force_redirect_url after an OAuth round-trip).
  // Without this check they'd get stuck setting up a throwaway personal
  // workspace instead of joining the one they were actually invited to.
  if (!user.onboarded) {
    const pendingInvite = await db.workspaceInvitation.findFirst({
      where: {
        email:      user.email.toLowerCase(),
        acceptedAt: null,
        expiresAt:  { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select:  { token: true },
    })
    redirect(pendingInvite ? `/invite/${pendingInvite.token}` : '/onboarding')
  }

  // Fetch the active workspace for branding (may differ from user.workspace
  // when the user has switched to a non-home workspace).
  const workspace = await getActiveWorkspace()
  const brandStyles = buildBrandStyles(
    workspace.primaryColor || '#5D00A4',
    workspace.accentColor  || '#04FFCC',
  )

  return (
    <>
      {/* Inject workspace brand colors as CSS variable overrides */}
      <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-canvas, #F7F4FA)' }}>
        <Sidebar
          workspaceName={workspace.name}
          logoUrl={workspace.logoUrl ?? null}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6 max-w-[1400px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
