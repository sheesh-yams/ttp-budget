'use client'

import { useState, useTransition } from 'react'
import { reseedWorkspace } from '@/server/actions/workspace'

export function WorkspaceDataSection() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [result, setResult]           = useState<{ ratesAdded: number; templatesAdded: number } | null>(null)
  const [error, setError]             = useState('')
  const [isPending, startTransition]  = useTransition()

  function handleConfirm() {
    setError('')
    setResult(null)
    startTransition(async () => {
      const res = await reseedWorkspace()
      setShowConfirm(false)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setResult(res.data)
    })
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 border-b border-border pb-4">
        <h2 className="text-base font-semibold text-foreground">Workspace data</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your workspace's rate cards and template library.
        </p>
      </div>

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-foreground">Reset workspace library</p>
          <p className="mt-0.5 text-sm text-muted-foreground max-w-sm">
            Adds any missing featured rate cards and templates from the global library.
            Existing items are never modified or removed.
          </p>
          {result && (
            <p className="mt-2 text-sm text-emerald-600 font-medium">
              ✓ Added {result.ratesAdded} rate card{result.ratesAdded !== 1 ? 's' : ''} and{' '}
              {result.templatesAdded} template{result.templatesAdded !== 1 ? 's' : ''}.
              {result.ratesAdded === 0 && result.templatesAdded === 0
                ? ' Your library is already complete.'
                : ''}
            </p>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={isPending}
          className="flex-shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isPending ? 'Restoring…' : 'Reset library'}
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          onClose={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
          isPending={isPending}
        />
      )}
    </div>
  )
}

function ConfirmDialog({
  onClose,
  onConfirm,
  isPending,
}: {
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[420px] rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-foreground">Reset workspace library?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This will add any missing featured rate cards and templates from the global library
          to your workspace. Existing items will{' '}
          <strong className="text-foreground">not</strong> be modified or removed.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: '#5D00A4' }}
          >
            {isPending ? 'Restoring…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
