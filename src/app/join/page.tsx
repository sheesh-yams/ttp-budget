import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { TaskChooseOrganization } from '@clerk/nextjs'
import { db } from '@/lib/db'
import { verifiedEmailsFor } from '@/lib/invitations'

export const metadata = { title: 'Choose a workspace' }

// Clerk's "choose-organization" session task lands here (ClerkProvider
// taskUrls) for an account that belongs to no organization yet — typically a
// brand-new sign-up. If someone invited them, send them to that invitation
// instead of asking them to create an org of their own; otherwise show
// Clerk's usual create/choose step.
export default async function JoinPage() {
  const { userId } = await auth({ treatPendingAsSignedOut: false })
  if (!userId) redirect('/sign-in')

  const emails = await verifiedEmailsFor(userId)
  const invite = emails.length > 0
    ? await db.workspaceInvitation.findFirst({
        where:   { email: { in: emails }, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select:  { token: true },
      })
    : null
  if (invite) redirect(`/invite/${invite.token}`)

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: '#0A0612' }}>
      <TaskChooseOrganization redirectUrlComplete="/dashboard" />
    </div>
  )
}
