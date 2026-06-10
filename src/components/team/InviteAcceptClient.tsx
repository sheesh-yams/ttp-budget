'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInvitation } from '@/server/actions/team'

export function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const result = await acceptInvitation(token)
      if (result.success) {
        setAccepted(true)
        // Give the webhook a moment to fire before redirecting
        setTimeout(() => router.push('/dashboard'), 1500)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  if (accepted) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-900/20 px-4 py-3 text-center">
        <p className="text-sm font-medium text-green-400">✓ You&rsquo;ve joined the workspace!</p>
        <p className="mt-1 text-xs text-green-400/60">Redirecting to dashboard…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-xl py-3 text-[14px] font-semibold transition-opacity disabled:opacity-60 hover:opacity-90"
        style={{ background: '#04FFCC', color: '#003D31' }}
      >
        {isPending ? 'Accepting…' : 'Accept and join workspace'}
      </button>
      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-900/20 px-3 py-2 text-center text-xs text-red-400">
          {error}
        </p>
      )}
      <p className="text-center text-[11px] text-white/30">
        You&rsquo;ll be able to switch between workspaces using the selector in the sidebar.
      </p>
    </div>
  )
}
