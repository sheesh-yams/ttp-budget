'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { deleteProject, getProjectDeletePreview } from '@/server/actions/projects'
import { deleteNameMatches, describeDeletePreview, type ProjectDeletePreview } from '@/lib/project-delete'
import { formatMoney } from '@/lib/money'
import { forgetLastProject } from '@/lib/last-project'

/**
 * Permanent delete of an archived project (owners only). Lists what goes,
 * and the person types the project's name to confirm.
 */
export function DeleteProjectDialog({ projectId, projectName, open, onClose, onDeleted }: {
  projectId:   string
  projectName: string
  open:        boolean
  onClose:     () => void
  onDeleted:   () => void
}) {
  const [preview, setPreview] = useState<ProjectDeletePreview | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setTyped(''); setError(null); setPreview(null)
    getProjectDeletePreview(projectId).then(res => {
      if (res.success) setPreview(res.data)
      else setError((res as { success: false; error: string }).error)
    }).catch(() => setError('Couldn’t load the project.'))
  }, [open, projectId])

  const matches = deleteNameMatches(typed, projectName)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteProject(projectId, typed)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      forgetLastProject(projectId)
      onDeleted()
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isPending) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{projectName}” permanently?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            This removes the project and everything in it. It can’t be undone — unlike archiving, there’s no restore.
          </p>
          {preview ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-foreground">{describeDeletePreview(preview)}</p>
          ) : !error && (
            <p className="text-muted-foreground">Loading what will be deleted…</p>
          )}
          {preview && preview.paidCents > 0 && (
            <p className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Its invoices recorded <strong>{formatMoney(preview.paidCents)}</strong> paid. Those invoices and their
                payment records will be deleted. No money is refunded.
              </span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="delete-project-name">Type <span className="font-semibold text-foreground">{projectName}</span> to confirm</Label>
            <Input
              id="delete-project-name" value={typed} autoComplete="off" disabled={!preview || isPending}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && matches && preview) handleDelete() }}
            />
          </div>
          {error && <p className="text-destructive">{error}</p>}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!preview || !matches || isPending}>
            {isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
