'use client'

import { useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { ImageUploader } from '@/components/ui/ImageUploader'
import { AppearancePicker } from '@/components/theme/AppearancePicker'
import { updateUserAvatar } from '@/server/actions/workspace'

/**
 * Your own avatar and appearance — used on Settings → My profile and on
 * /profile (which everyone can open, whatever their Settings permission).
 */
export function MyProfileCard({ user }: { user: { name: string; avatarUrl: string | null; themePreference: string; email?: string } }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Sign-in email lives in Clerk; its own account window changes it (verified by code).
  const { openUserProfile } = useClerk()
  const { user: clerkUser } = useUser()
  const loginEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? ''

  async function saveAvatar(url: string) {
    setAvatarUrl(url || null)
    setState('saving')
    const res = await updateUserAvatar(url)
    setState(res.success ? 'saved' : 'error')
    setTimeout(() => setState('idle'), res.success ? 2000 : 3000)
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-5 border-b pb-4">
        <h2 className="text-base font-semibold text-foreground">My profile</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Your avatar and how SlateSuite looks for you. Only you can change these.</p>
      </div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <ImageUploader
          currentUrl={avatarUrl}
          onUploadComplete={url => { void saveAvatar(url) }}
          folder="avatars"
          size={96}
          fallback={<span className="select-none text-2xl font-bold text-muted-foreground">{user.name ? user.name[0].toUpperCase() : '?'}</span>}
        />
        <div className="space-y-1 pt-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{user.name || '—'}</p>
          <p>Click or drop an image to update your avatar.</p>
          <p className="text-xs">JPEG, PNG, or WebP · max 2 MB</p>
          {state === 'saved' && <p className="text-xs font-medium text-emerald-600">Avatar saved ✓</p>}
          {state === 'error' && <p className="text-xs text-destructive">Failed to save — try again.</p>}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Login email</p>
          <p className="truncate text-sm text-muted-foreground">{loginEmail || '—'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add your new address, verify it with the code we email, make it primary, then remove the old one.
          </p>
          {user.email && loginEmail && loginEmail.toLowerCase() !== user.email.toLowerCase() && (
            <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              SlateSuite still has {user.email} for you — refresh in a moment. If this stays, {loginEmail} is already on
              another SlateSuite account; ask us to remove that one.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => openUserProfile()}>Change login email…</Button>
      </div>
      <div className="mt-6 border-t pt-5">
        <AppearancePicker initial={user.themePreference} />
      </div>
    </div>
  )
}
