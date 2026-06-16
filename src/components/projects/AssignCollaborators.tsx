'use client'

import { useState, useTransition } from 'react'
import { UserPlus, Check, Loader2, Users } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  getProjectAssignees,
  setProjectAssignment,
  type AssignableCollaborator,
} from '@/server/actions/assignments'

interface Props {
  projectId: string
}

function initials(name: string | null, email: string): string {
  return (name ?? email).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function AssignCollaborators({ projectId }: Props) {
  const [open, setOpen]   = useState(false)
  const [rows, setRows]   = useState<AssignableCollaborator[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function load() {
    setRows(null)
    setError(null)
    getProjectAssignees(projectId).then(res => {
      if (res.success) setRows(res.data)
      else setError((res as { success: false; error: string }).error)
    })
  }

  function onOpenChange(v: boolean) {
    setOpen(v)
    if (v) load()
  }

  function toggle(row: AssignableCollaborator) {
    const next = !row.assigned
    setPendingId(row.id)
    // Optimistic flip.
    setRows(prev => prev?.map(r => (r.id === row.id ? { ...r, assigned: next } : r)) ?? null)
    startTransition(async () => {
      const res = await setProjectAssignment(projectId, row.id, next)
      if (!res.success) {
        // Revert on failure.
        setRows(prev => prev?.map(r => (r.id === row.id ? { ...r, assigned: !next } : r)) ?? null)
        setError((res as { success: false; error: string }).error)
      }
      setPendingId(null)
    })
  }

  const assignedCount = rows?.filter(r => r.assigned).length ?? 0

  return (
    <>
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => onOpenChange(true)}>
        <UserPlus className="mr-1.5 h-3.5 w-3.5" />
        Assign
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Assign collaborators</DialogTitle>
          </DialogHeader>

          <p className="-mt-1 text-xs text-muted-foreground">
            Collaborators can only open projects they&rsquo;re assigned to, and see
            budgets without margins.
          </p>

          <div className="mt-2 max-h-[320px] overflow-y-auto">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            {rows === null && !error ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : rows && rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="mb-2 h-7 w-7 text-muted-foreground/30" />
                <p className="text-[13px] font-medium text-foreground">No collaborators yet</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground max-w-[280px]">
                  Invite people as Collaborators from the Team page, then assign them here.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {rows?.map(row => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => toggle(row)}
                      disabled={pendingId === row.id}
                      className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
                    >
                      {row.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.avatarUrl} alt={row.name ?? row.email} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold uppercase text-violet-700">
                          {initials(row.name, row.email) || '?'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{row.name ?? row.email}</p>
                        {row.name && <p className="truncate text-xs text-muted-foreground">{row.email}</p>}
                      </div>
                      <span
                        className={[
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                          row.assigned ? 'border-violet-600 bg-violet-600 text-white' : 'border-border bg-transparent',
                        ].join(' ')}
                      >
                        {pendingId === row.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : row.assigned && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {rows && rows.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {assignedCount} of {rows.length} assigned
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
