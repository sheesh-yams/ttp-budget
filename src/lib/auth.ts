import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  let user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { workspace: true },
  })

  if (!user) {
    // Race condition: OAuth providers (e.g. Google) redirect the user to the app
    // immediately after Clerk creates their account, before the user.created webhook
    // has a chance to insert the DB row. Create the workspace + user on-the-fly
    // using the same logic as the webhook so the experience is seamless.
    const clerkUser = await currentUser()
    if (!clerkUser) redirect('/sign-in')

    const email = clerkUser.emailAddresses[0]?.emailAddress
    if (!email) redirect('/sign-in?error=no-email')

    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null
    const defaultWorkspaceName = displayName
      ? `${displayName}'s Workspace`
      : `${email.split('@')[0]}'s Workspace`

    // Create a fresh workspace (mirrors user.created webhook logic).
    // If the webhook already ran and created the user, upsert hits the update branch
    // and leaves workspaceId unchanged — the new workspace is orphaned but harmless.
    const workspace = await db.workspace.create({
      data: { name: defaultWorkspaceName },
    })

    user = await db.user.upsert({
      where: { clerkId: userId },
      update: {
        email,
        name: displayName,
        avatarUrl: clerkUser.imageUrl ?? null,
      },
      create: {
        clerkId: userId,
        email,
        name: displayName,
        avatarUrl: clerkUser.imageUrl ?? null,
        workspaceId: workspace.id,
        role: 'OWNER',
        onboarded: false,
      },
      include: { workspace: true },
    })
  }

  return user
})

export const getWorkspaceId = cache(async () => {
  const user = await getCurrentUser()
  return user.workspaceId
})

export const getWorkspaceAndUser = cache(async () => {
  const user = await getCurrentUser()
  return { workspace: user.workspace, user }
})
