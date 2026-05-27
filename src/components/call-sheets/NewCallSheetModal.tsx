'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCallSheet } from '@/server/actions/call-sheets'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  defaultDate?: string // ISO date string from project.shootStartDate
}

export function NewCallSheetModal({ open, onOpenChange, projectId, projectName, defaultDate }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const today = new Date().toISOString().split('T')[0]

  const [title,       setTitle]       = useState('')
  const [shootDate,   setShootDate]   = useState(defaultDate ?? today)
  const [generalCall, setGeneralCall] = useState('07:00')
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(`${projectName} — Call Sheet`)
    setShootDate(defaultDate ?? today)
    setGeneralCall('07:00')
    setError('')
  }, [open, projectName, defaultDate, today])

  function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    if (!shootDate)    { setError('Shoot date is required'); return }
    setError('')

    startTransition(async () => {
      const result = await createCallSheet(projectId, {
        title: title.trim(),
        shootDate,
        generalCall,
      })
      if (result.success) {
        onOpenChange(false)
        router.push(`/projects/${projectId}/call-sheets/${result.data.id}`)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>New Call Sheet</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cs-title">Title</Label>
            <Input
              id="cs-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cs-date">Shoot date</Label>
              <Input
                id="cs-date"
                type="date"
                value={shootDate}
                onChange={e => setShootDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cs-call">General call</Label>
              <Input
                id="cs-call"
                type="time"
                value={generalCall}
                onChange={e => setGeneralCall(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? 'Creating…' : 'Create Call Sheet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
