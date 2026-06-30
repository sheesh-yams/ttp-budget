'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateProject, listShootDays } from '@/server/actions/projects'
import { parseLocalDate } from '@/lib/time-format'

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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: {
    id: string
    name: string
    status: string
    shootType: string
  }
  onSaved: () => void
}

export function EditProjectModal({ open, onOpenChange, project, onSaved }: Props) {
  const [pending, startTransition] = useTransition()

  const [name,         setName]         = useState('')
  const [status,       setStatus]       = useState('')
  const [shootType,    setShootType]    = useState('')
  const [shootDates,   setShootDates]   = useState<string[]>([])
  const [newDate,      setNewDate]      = useState('')
  const [loadingDates, setLoadingDates] = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    if (!open) return
    setName(project.name)
    setStatus(project.status)
    setShootType(project.shootType)
    setNewDate('')
    setError('')
    setShootDates([])
    setLoadingDates(true)
    listShootDays(project.id).then(result => {
      if (result.success) setShootDates(result.data.map(d => d.date))
      setLoadingDates(false)
    })
  }, [open, project])

  function addDate() {
    if (!newDate) return
    setShootDates(prev => prev.includes(newDate) ? prev : [...prev, newDate].sort())
    setNewDate('')
  }

  function removeDate(date: string) {
    setShootDates(prev => prev.filter(d => d !== date))
  }

  function handleSave() {
    if (!name.trim()) { setError('Project name is required'); return }
    setError('')

    startTransition(async () => {
      const result = await updateProject(project.id, {
        name,
        status:     status as never,
        shootType:  shootType as never,
        shootDates,
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

          {/* Shoot days */}
          <div className="grid gap-1.5">
            <Label>Shoot days</Label>
            {shootDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {shootDates.map(date => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                  >
                    {parseLocalDate(date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    <button
                      type="button"
                      onClick={() => removeDate(date)}
                      className="rounded-full p-0.5 hover:bg-background/60 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {shootDates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {loadingDates ? 'Loading…' : 'No shoot days yet.'}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addDate} disabled={!newDate}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Removing a day moves its scheduled scenes to the Boneyard — it doesn&apos;t delete them.
            </p>
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
