'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { getSceneColor } from '@/lib/schedule-colors'
import { createScene, updateScene, createLocation } from '@/server/actions/schedule'
import type { IntExt, TimeOfDay } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SceneRow {
  id: string
  sceneNumber: string | null
  setting: string
  description: string | null
  synopsis: string | null
  intExt: IntExt
  timeOfDay: TimeOfDay
  pageCount: string | null
  pageEighths: number | null
  estimatedDuration: number | null
  locationId: string | null
  location: { id: string; name: string } | null
  notes: string | null
  castContactIds: string[]
  colorOverride: string | null
  archived: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (sceneId: string) => void
  projectId: string
  scene?: SceneRow | null
  locations: { id: string; name: string; address: string | null }[]
  defaultShootDayId?: string | null
}

const INTEXT_OPTIONS: { value: IntExt; label: string }[] = [
  { value: 'INT', label: 'INT' },
  { value: 'EXT', label: 'EXT' },
  { value: 'INT_EXT', label: 'INT/EXT' },
  { value: 'CONTINUOUS', label: 'CONTINUOUS' },
]

const TIMEOFDAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'EVENING', label: 'Evening' },
  { value: 'DUSK', label: 'Dusk' },
  { value: 'DAWN', label: 'Dawn' },
]

function parseFraction(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Formats: "3", "3/8", "2 5/8", "2.5"
  const parts = trimmed.split(' ')
  if (parts.length === 2) {
    const whole = parseInt(parts[0]!)
    const frac = parts[1]!.split('/')
    if (frac.length === 2) {
      const num = parseInt(frac[0]!)
      const den = parseInt(frac[1]!)
      if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) {
        return whole * den + num
      }
    }
  }
  if (parts.length === 1) {
    if (trimmed.includes('/')) {
      const frac = trimmed.split('/')
      const num = parseInt(frac[0]!)
      const den = parseInt(frac[1]!)
      if (!isNaN(num) && !isNaN(den) && den !== 0) return Math.round(num * 8 / den)
    }
    const val = parseFloat(trimmed)
    if (!isNaN(val)) return Math.round(val * 8)
  }
  return null
}

export function SceneModal({ open, onClose, onSaved, projectId, scene, locations, defaultShootDayId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sceneNumber, setSceneNumber]         = useState('')
  const [setting, setSetting]                 = useState('')
  const [description, setDescription]         = useState('')
  const [synopsis, setSynopsis]               = useState('')
  const [intExt, setIntExt]                   = useState<IntExt>('INT')
  const [timeOfDay, setTimeOfDay]             = useState<TimeOfDay>('DAY')
  const [pageCount, setPageCount]             = useState('')
  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [locationId, setLocationId]           = useState<string>('')
  const [notes, setNotes]                     = useState('')
  const [colorOverride, setColorOverride]     = useState('')
  const [newLocationName, setNewLocationName] = useState('')
  const [showNewLoc, setShowNewLoc]           = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    if (scene) {
      setSceneNumber(scene.sceneNumber ?? '')
      setSetting(scene.setting)
      setDescription(scene.description ?? '')
      setSynopsis(scene.synopsis ?? '')
      setIntExt(scene.intExt)
      setTimeOfDay(scene.timeOfDay)
      setPageCount(scene.pageCount ?? '')
      setEstimatedDuration(scene.estimatedDuration != null ? String(scene.estimatedDuration) : '')
      setLocationId(scene.locationId ?? '')
      setNotes(scene.notes ?? '')
      setColorOverride(scene.colorOverride ?? '')
    } else {
      setSceneNumber('')
      setSetting('')
      setDescription('')
      setSynopsis('')
      setIntExt('INT')
      setTimeOfDay('DAY')
      setPageCount('')
      setEstimatedDuration('')
      setLocationId('')
      setNotes('')
      setColorOverride('')
    }
    setError(null)
    setShowNewLoc(false)
    setNewLocationName('')
  }, [open, scene])

  const previewColor = getSceneColor(intExt, timeOfDay, colorOverride || null)

  function handlePageCountBlur() {
    if (!pageCount.trim()) return
    const eighths = parseFraction(pageCount)
    if (eighths != null && !estimatedDuration) {
      setEstimatedDuration(String(Math.round(eighths * 7.5)))
    }
  }

  function handleSubmit() {
    if (!setting.trim()) { setError('Setting is required'); return }
    setError(null)

    startTransition(async () => {
      let resolvedLocationId: string | null = locationId || null

      if (showNewLoc && newLocationName.trim()) {
        const locResult = await createLocation({ name: newLocationName.trim() })
        if ('error' in locResult) { setError(locResult.error); return }
        resolvedLocationId = locResult.data.id
      }

      const pageEighths = parseFraction(pageCount)
      const dur = estimatedDuration.trim() ? parseInt(estimatedDuration) : undefined
      const input = {
        sceneNumber: sceneNumber.trim() || undefined,
        setting: setting.trim(),
        description: description.trim() || undefined,
        synopsis: synopsis.trim() || undefined,
        intExt,
        timeOfDay,
        pageCount: pageCount.trim() || undefined,
        pageEighths: pageEighths ?? undefined,
        estimatedDuration: (!isNaN(dur!) && dur! > 0) ? dur : undefined,
        locationId: resolvedLocationId,
        notes: notes.trim() || undefined,
        colorOverride: colorOverride.trim() || null,
      }

      if (scene) {
        const result = await updateScene(scene.id, input)
        if ('error' in result) { setError(result.error); return }
        onSaved(scene.id)
      } else {
        const result = await createScene(projectId, input)
        if ('error' in result) { setError(result.error); return }
        onSaved(result.data.id)
      }
    })
  }

  if (!mounted || !open) return null

  const modal = (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header strip with live color preview */}
        <div
          className="flex items-center justify-between rounded-t-2xl px-5 py-3 border-b"
          style={{ background: previewColor.bg, color: previewColor.text, borderColor: previewColor.border }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">
              {intExt.replace('_', '/')}
            </span>
            <span className="text-xs font-medium opacity-70">·</span>
            <span className="text-xs font-medium opacity-70">{timeOfDay}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <h2 className="text-base font-semibold">{scene ? 'Edit Scene' : 'New Scene'}</h2>

          {/* Row 1: Scene # + Setting */}
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <Label className="text-xs mb-1 block">Scene #</Label>
              <Input value={sceneNumber} onChange={e => setSceneNumber(e.target.value)} placeholder="1A" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Setting <span className="text-destructive">*</span></Label>
              <Input
                value={setting}
                onChange={e => setSetting(e.target.value)}
                placeholder="INT. COFFEE SHOP"
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          </div>

          {/* Row 2: INT/EXT + Time of Day */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">INT/EXT</Label>
              <Select value={intExt} onValueChange={v => setIntExt(v as IntExt)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTEXT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Time of Day</Label>
              <Select value={timeOfDay} onValueChange={v => setTimeOfDay(v as TimeOfDay)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEOFDAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Page Count + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Page Count</Label>
              <Input
                value={pageCount}
                onChange={e => setPageCount(e.target.value)}
                onBlur={handlePageCountBlur}
                placeholder='2 5/8'
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Duration (min)</Label>
              <Input
                type="number"
                min={0}
                value={estimatedDuration}
                onChange={e => setEstimatedDuration(e.target.value)}
                placeholder="20"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <Label className="text-xs mb-1 block">Location</Label>
            {showNewLoc ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newLocationName}
                  onChange={e => setNewLocationName(e.target.value)}
                  placeholder="Location name"
                  className="h-8 text-sm flex-1"
                />
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowNewLoc(false); setNewLocationName('') }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={locationId || '__none__'}
                  onValueChange={v => setLocationId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {locations.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}{l.address ? ` — ${l.address}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                  onClick={() => setShowNewLoc(true)}
                >
                  + New
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs mb-1 block">Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Short description of what happens in the scene"
              className="text-sm min-h-[64px] resize-none"
            />
          </div>

          {/* Synopsis */}
          <div>
            <Label className="text-xs mb-1 block">Synopsis</Label>
            <Textarea
              value={synopsis}
              onChange={e => setSynopsis(e.target.value)}
              placeholder="Longer synopsis..."
              className="text-sm min-h-[52px] resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs mb-1 block">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-sm" placeholder="Production notes" />
          </div>

          {/* Color override */}
          <div className="flex items-center gap-3">
            <Label className="text-xs">Color override</Label>
            <input
              type="color"
              value={colorOverride || previewColor.bg}
              onChange={e => setColorOverride(e.target.value)}
              className="h-7 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
            {colorOverride && (
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setColorOverride('')}>
                Reset
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          <Button onClick={handleSubmit} size="sm" disabled={isPending}>
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {scene ? 'Save' : 'Create Scene'}
          </Button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
