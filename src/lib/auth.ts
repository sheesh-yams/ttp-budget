import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { workspace: true },
  })

  if (!user) {
    redirect('/sign-in?error=user-not-found')
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
