import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  // Gate: send un-onboarded users to the setup wizard.
  if (!user.onboarded) {
    redirect('/onboarding')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F7F4FA' }}>
      <Sidebar workspaceName={user.workspace.name} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
