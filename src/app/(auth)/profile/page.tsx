import { getCurrentUser } from '@/lib/auth'
import { MyProfileCard } from '@/components/settings/MyProfileCard'

export const metadata = { title: 'My profile' }

/** Your own avatar and appearance — open to everyone signed in (no Settings permission needed). */
export default async function ProfilePage() {
  const user = await getCurrentUser()
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">My profile</h1>
      <MyProfileCard user={{
        name: user.name ?? '',
        avatarUrl: user.avatarUrl ?? null,
        themePreference: (user as unknown as { themePreference?: string }).themePreference ?? 'LIGHT',
      }} />
    </div>
  )
}
