'use client'

import { useState, useTransition } from 'react'
import { leaveWorkspace, deleteWorkspace } from '@/server/actions/workspace'

export function DangerZone({
  workspaceName,
  userRole,
}: {
  workspaceName: string
  userRole: string
}) {
  const isOwner = userRole === 'OWNER'

  return (
    <div className="mt-8 rounded-xl border border-red-500/20 bg-card p-6 shadow-sm">
      <div className="mb-5 border-b border-red-500/20 pb-4">
        <h2 className="text-base font-semibold text-red-500">Danger zone</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Irreversible actions. Proceed with caution.
        </p>
      </div>

      <div className="space-y-5">
        {/* Producers can leave; Owners can delete. These are mutually exclusive. */}
        {!isOwner && <LeaveSection />}
        {isOwner  && <DeleteSection workspaceName={workspaceName} />}
      </div>
    </div>
  )
}

// =============================================================================
// Leave workspace (PRODUCER)
// =============================================================================

function LeaveSection() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function confirm() {
    setError('')
    startTransition(async () => {
      const result = await leaveWorkspace()
      if (result && 'error' in result) setError(result.error)
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Leave workspace</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          You will lose access to all projects, budgets, and data in this workspace.
        </p>
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
      <button
        onClick={() => setOpen(true)}
        className="flex-shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:border-red-500/70 hover:bg-red-500/5"
      >
        Leave workspace
      </button>

      {open && (
        <ConfirmDialog
          title="Leave workspace?"
          description="You will immediately lose access to all data in this workspace. This cannot be undone."
          confirmLabel={isPending ? 'Leaving…' : 'Leave workspace'}
          onCancel={() => setOpen(false)}
          onConfirm={confirm}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// =============================================================================
// Delete workspace (OWNER)
// =============================================================================

function DeleteSection({ workspaceName }: { workspaceName: string }) {
  const [open, setOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const matches = confirmInput.trim().toLowerCase() === workspaceName.trim().toLowerCase()

  function confirm() {
    if (!matches) return
    setError('')
    startTransition(async () => {
      const result = await deleteWorkspace(confirmInput)
      if (result && 'error' in result) setError(result.error)
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Delete workspace</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Permanently delete this workspace and all its data. This action cannot be undone.
        </p>
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
      <button
        onClick={() => setOpen(true)}
        className="flex-shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:border-red-500/70 hover:bg-red-500/5"
      >
        Delete workspace
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-[400px] rounded-xl border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Delete workspace?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This will permanently delete <span className="font-medium text-foreground">{workspaceName}</span> and
              all its projects, budgets, proposals, invoices, and templates. There is no going back.
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Type <span className="font-semibold text-foreground">{workspaceName}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                autoFocus
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-red-500/50"
                placeholder={workspaceName}
              />
              {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                onClick={() => { setOpen(false); setConfirmInput('') }}
                className="flex-1 rounded-lg border py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={!matches || isPending}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition-opacity hover:bg-red-700 disabled:opacity-40"
              >
                {isPending ? 'Deleting…' : 'Delete workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Shared confirm dialog
// =============================================================================

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  isPending,
}: {
  title: string
  description: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-[360px] rounded-xl border bg-card p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition-opacity hover:bg-red-700 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
