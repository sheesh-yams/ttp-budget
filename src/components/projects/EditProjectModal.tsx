'use client'

import { useState, useTransition, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateProject } from '@/server/actions/projects'

const SHOOT_TYPES = [
  { value: 'MUSIC_VIDEO',    label: 'Music Video' },
  { value: 'BRAND_CAMPAIGN', label: 'Brand Campaign' },
  { value: 'PRODUCT_SHOOT',  label: 'Product Shoot' },
  { value: 'EVENT_RECAP',    label: 'Event Recap' },
  { value: 'SOCIAL_CONTENT', label: 'Social Content' },
  { value: 'INFLUENCER',     label: 'Influencer' },
  { value: 'DOCUMENTARY',    label: 'Documentary' },
  { value: 'OTHER',          label: 'Other' },
]

const STATUSES = [
  { value: 'LEAD',     label: 'Lead' },
  { value: 'ACTIVE',   label: 'Active' },
  { value: 'WRAPPED',  label: 'Wrapped' },
  { value: 'ARCHIVED', label: 'Archived' },
]

function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toISOString().split('T')[0]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: {
    id: string
    name: string
    status: string
    shootType: string
    shootStartDate: string | Date | null
    shootEndDate: string | Date | null
  }
  onSaved: () => void
}

export function EditProjectModal({ open, onOpenChange, project, onSaved }: Props) {
  const [pending, startTransition] = useTransition()

  const [name,           setName]           = useState('')
  const [status,         setStatus]         = useState('')
  const [shootType,      setShootType]      = useState('')
  const [shootStartDate, setShootStartDate] = useState('')
  const [shootEndDate,   setShootEndDate]   = useState('')
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (!open) return
    setName(project.name)
    setStatus(project.status)
    setShootType(project.shootType)
    setShootStartDate(toDateInput(project.shootStartDate))
    setShootEndDate(toDateInput(project.shootEndDate))
    setError('')
  }, [open, project])

  function handleSave() {
    if (!name.trim()) { setError('Project name is required'); return }
    setError('')

    startTransition(async () => {
      const result = await updateProject(project.id, {
        name,
        status:         status as never,
        shootType:      shootType as never,
        shootStartDate: shootStartDate || null,
        shootEndDate:   shootEndDate   || null,
      })
      if (result.success) {
        onSaved()
        onOpenChange(false)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="ep-name">Project name</Label>
            <Input
              id="ep-name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Status + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Project type</Label>
              <Select value={shootType} onValueChange={setShootType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOOT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Shoot dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ep-start">Shoot start</Label>
              <Input
                id="ep-start"
                type="date"
                value={shootStartDate}
                onChange={e => setShootStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ep-end">Shoot end</Label>
              <Input
                id="ep-end"
                type="date"
                value={shootEndDate}
                min={shootStartDate}
                onChange={e => setShootEndDate(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
