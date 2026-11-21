'use client'

import { useState } from 'react'
import { ImageUploader } from '@/components/ui/ImageUploader'
import { AppearancePicker } from '@/components/theme/AppearancePicker'
import { updateUserAvatar } from '@/server/actions/workspace'

/**
 * Your own avatar and appearance — used on Settings → My profile and on
 * /profile (which everyone can open, whatever their Settings permission).
 */
export function MyProfileCard({ user }: { user: { name: string; avatarUrl: string | null; themePreference: string } }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
      <div className="mt-6 border-t pt-5">
        <AppearancePicker initial={user.themePreference} />
      </div>
    </div>
  )
}
