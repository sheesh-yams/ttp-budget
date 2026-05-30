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
    // has a chance to insert the DB row. Instead of bouncing them to /sign-in,
    // we create the DB user on-the-fly from the Clerk session data.
    const clerkUser = await currentUser()
    if (!clerkUser) redirect('/sign-in')

    const email = clerkUser.emailAddresses[0]?.emailAddress
    if (!email) redirect('/sign-in?error=no-email')

    const workspace = await db.workspace.findFirst()
    if (!workspace) redirect('/sign-in?error=no-workspace')

    user = await db.user.upsert({
      where: { clerkId: userId },
      update: {
        email,
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
        avatarUrl: clerkUser.imageUrl ?? null,
      },
      create: {
        clerkId: userId,
        email,
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
        avatarUrl: clerkUser.imageUrl ?? null,
        workspaceId: workspace.id,
        role: 'PRODUCER',
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
