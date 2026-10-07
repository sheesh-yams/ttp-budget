import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser, getActiveWorkspace } from '@/lib/auth'
import { getAccess } from '@/lib/access'
import { atLeast } from '@/lib/permissions'
import { canCreateProjectFromInvoice } from '@/lib/invoice-first'
import { db } from '@/lib/db'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileTopBar, MobileTabBar } from '@/components/layout/MobileNav'
import { buildBrandStyles } from '@/lib/brand'

// viewport-fit=cover so the phone shell can pad for the notch / home
// indicator with env(safe-area-inset-*). Scoped to the signed-in app.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0612',
}

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
  const [workspace, access] = await Promise.all([getActiveWorkspace(), getAccess()])
  const brandStyles = buildBrandStyles(
    workspace.primaryColor || '#5D00A4',
    workspace.accentColor  || '#04FFCC',
  )
  const areas = {
    proposals: access.can('proposals'), invoices: access.can('invoices'),
    clients: access.can('clients'), rolodex: access.can('rolodex'),
    library: access.can('library'),
    // Settings opens on Roles alone for Team & roles without Settings.
    settings: access.can('settings') || access.can('team'),
    team: access.can('team'),
  }
  const canCreateProject = access.can('projects', 'EDIT')
  // Mobile "+" → Invoice: offered when /invoices will have a New invoice button
  // (Invoices edit by default, or a new project from an invoice).
  const canCreateInvoice = access.can('invoices') && (atLeast(access.baseline.invoices, 'EDIT') || canCreateProjectFromInvoice(access))

  return (
    <>
      {/* Inject workspace brand colors as CSS variable overrides */}
      <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
      {/* dvh: the visible height on phones, where 100vh runs under the browser bar. */}
      <div className="flex h-[100dvh] overflow-hidden" style={{ background: 'var(--color-canvas, #F7F4FA)' }}>
        {/* Desktop (md+): sidebar + top bar. Phones: MobileTopBar + MobileTabBar. */}
        <Sidebar workspaceName={workspace.name} logoUrl={workspace.logoUrl ?? null} areas={areas} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopBar canCreateProject={canCreateProject} />
          <MobileTopBar workspaceName={workspace.name} logoUrl={workspace.logoUrl ?? null} />
          {/* Phones: room at the bottom for the fixed tab bar. */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 max-w-[1400px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar workspaceId={workspace.id} areas={areas} canCreateProject={canCreateProject} canCreateInvoice={canCreateInvoice} />
    </>
  )
}
