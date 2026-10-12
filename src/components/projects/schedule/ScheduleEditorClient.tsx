'use client'

import { useState, useEffect, useTransition, useRef, useMemo, useCallback, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  Clapperboard, Plus, GripVertical, MoreHorizontal, Pencil, Trash2,
  ArrowRight, Archive, ArchiveRestore, ChevronDown, FilePlus, Clock,
  Check, Star, Columns3, ArrowUpDown, MapPin, CornerDownRight, Pin, RotateCcw, Shapes,
} from 'lucide-react'
import { getSceneColor, BANNER_COLORS } from '@/lib/schedule-colors'
import { computeEntryTimes, dayWrapTime, parseHHmm, formatHHmm as formatClock, overlapFlags, sceneLocationLabel } from '@/lib/schedule-compute'
import { SceneModal } from './SceneModal'
import type { SceneRow } from './SceneModal'
import { BannerMenu, BANNER_PRESETS } from './BannerMenu'
import type { BannerPreset } from './BannerMenu'
import { LocationsModal } from './LocationsModal'
import { SortDialog } from './SortDialog'
import type { SortField, SortDir } from './SortDialog'
import {
  createSchedule,
  renameSchedule,
  setPrimarySchedule,
  deleteSchedule,
  updateColumnPrefs,
  applyScheduleChanges,
} from '@/server/actions/schedule'
import type { SceneInput } from '@/server/actions/schedule'
import { SaveScope, SaveStatusLine, useSaveGeneration, useSaveQueue, useSaveScope } from '@/components/autosave/SaveScope'
import {
  applyScheduleOps, newScheduleId, moveOrder,
  type ScheduleEntryRow, type ScheduleOp, type ScheduleOpBody, type SceneOpInput, type ScheduleState,
} from '@/lib/schedule-ops'
import { createCallSheet } from '@/server/actions/call-sheets'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { parseLocalDate } from '@/lib/time-format'
import type { BannerType } from '@prisma/client'

// ── Column definitions ───────────────────────────────────────────────────────

export const COLUMN_DEFS: { key: string; label: string }[] = [
  { key: 'ie',        label: 'I/E' },
  { key: 'location',  label: 'Location' },
  { key: 'pages',     label: 'Pages' },
  { key: 'timeOfDay',  label: 'Time of Day' },
  { key: 'duration',  label: 'Duration' },
]

export const DEFAULT_COLUMN_PREFS: Record<string, boolean> = {
  ie: true,
  location: true,
  pages: true,
  timeOfDay: false,
  duration: false,
}

/** How long the pointer must rest on a new spot before rows make room. */
const DRAG_SETTLE_MS = 180

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShootDayRow {
  id: string
  date: string
  orderIndex: number
  label: string | null
  startTime: string | null
  primaryLocation: { id: string; name: string } | null
}

type EntryRow = ScheduleEntryRow

interface Props {
  projectId: string
  projectName: string
  /** schedule EDIT on this project */
  canEdit: boolean
  /** callSheets EDIT — offer "Create Call Sheet" from a shoot day */
  canCreateCallSheet?: boolean
  shootDays: ShootDayRow[]
  schedules: { id: string; name: string; isPrimary: boolean; columnPrefs: Record<string, boolean> }[]
  activeScheduleId: string | null
  initialEntries: EntryRow[]
  allScenes: SceneRow[]
  locations: { id: string; name: string; address: string | null }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = parseLocalDate(iso)
  return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
}

function formatHHmm(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  if (h === undefined || m === undefined) return hhmm
  const suffix = (h % 24) >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

function pageEighthsToDisplay(eighths: number | null): string {
  if (!eighths) return ''
  const pages = Math.floor(eighths / 8)
  const rem = eighths % 8
  if (rem === 0) return `${pages} pg`
  if (pages === 0) return `${rem}/8`
  return `${pages} ${rem}/8`
}

// ── Main component ─────────────────────────────────────────────────────────────

/** The stripboard. Changes show instantly and are saved together ~2.5s after
 *  the last one (src/lib/schedule-ops.ts → applyScheduleChanges). */
export function ScheduleEditorClient(props: Props) {
  return <SaveScope><ScheduleEditorInner {...props} /></SaveScope>
}

function ScheduleEditorInner({
  projectId,
  projectName,
  canEdit,
  canCreateCallSheet = true,
  shootDays,
  schedules,
  activeScheduleId,
  initialEntries,
  allScenes,
  locations: initialLocations,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const { flushAll } = useSaveScope()

  // ── Pending changes ─────────────────────────────────────────────────────────
  // What's on screen = the server's copy + every change not yet in it, so a
  // change shows at once and a refresh can't wipe one still saving. `pending`
  // = unsaved or saving; `confirmed` = saved, kept until the next server copy
  // (ops are idempotent, so applying one the server already has is harmless).
  // Each op remembers the schedule it was made on (switching schedules keeps
  // this component mounted — only the search param changes).
  type Logged = { scheduleId: string; op: ScheduleOp }
  const pending   = useRef(new Map<number, Logged>())
  const confirmed = useRef(new Map<number, Logged>())
  const seqRef    = useRef(0)
  const [opsVersion, setOpsVersion] = useState(0)
  const bump = useCallback(() => setOpsVersion(v => v + 1), [])

  const serverState = useMemo<ScheduleState>(
    () => ({ entries: initialEntries, scenes: allScenes, locations: initialLocations }),
    [initialEntries, allScenes, initialLocations],
  )
  useEffect(() => { confirmed.current.clear(); bump() }, [serverState, bump])
  const opsCtx = useMemo(() => ({
    scheduleId: activeScheduleId ?? '',
    dayStart: new Map(shootDays.map(d => [d.id, d.startTime])),
  }), [activeScheduleId, shootDays])
  const display = useMemo(
    () => applyScheduleOps(serverState,
      [...confirmed.current.values(), ...pending.current.values()].filter(l => l.scheduleId === activeScheduleId).map(l => l.op),
      opsCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opsVersion tracks the refs
    [serverState, opsCtx, opsVersion],
  )
  const entries = display.entries
  const scenes = display.scenes as SceneRow[]
  const locations = display.locations

  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const [sceneError, setSceneError] = useState<string | null>(null)
  const reopenedFor = useRef(new Set<number>())

  const queue = useSaveQueue<Record<string, Logged>>(async patch => {
    const logged = Object.values(patch).sort((a, b) => a.op.seq - b.op.seq)
    // Strictly in the order made (scene edits are project-wide, so order
    // matters across schedules): runs of one schedule, in chunks the server
    // accepts; stop at a failure (what saved stays saved — replays are harmless).
    const runs: { scheduleId: string; ops: ScheduleOp[] }[] = []
    for (const l of logged) {
      const last = runs[runs.length - 1]
      if (last && last.scheduleId === l.scheduleId && last.ops.length < 200) last.ops.push(l.op)
      else runs.push({ scheduleId: l.scheduleId, ops: [l.op] })
    }
    let error: string | null = null
    let failedOps: ScheduleOp[] = []
    for (const [r, run] of runs.entries()) {
      const { scheduleId } = run
      {
        const chunk = run.ops
        // A dropped connection throws — treat it like any other failed save.
        const res = await applyScheduleChanges(scheduleId, chunk).catch((err: unknown) =>
          ({ success: false as const, error: err instanceof Error ? err.message : 'Couldn’t reach the server' }))
        if (res.success) {
          for (const op of chunk) {
            const l = pending.current.get(op.seq)
            pending.current.delete(op.seq)
            if (l) confirmed.current.set(op.seq, l)
          }
          bump()
        } else {
          error = (res as { success: false; error: string }).error
          failedOps = runs.slice(r).flatMap(x => x.ops)
        }
      }
      if (error) break
    }
    if (!error) return { success: true }

    if (!mountedRef.current) {
      window.alert(`Your schedule changes weren’t saved: ${error}`)
    } else {
      // A scene typed in the pop-up: reopen it with what was typed + the error
      // — once per change, and never over a pop-up that's already open.
      const sceneOp = [...failedOps].reverse().find(o => o.type === 'createScene' || o.type === 'updateScene')
      if (sceneOp && (sceneOp.type === 'createScene' || sceneOp.type === 'updateScene') && !reopenedFor.current.has(sceneOp.seq)) {
        reopenedFor.current.add(sceneOp.seq)
        reopenSceneRef.current?.(sceneOp.sceneId, error)
      }
    }
    return { success: false, error }
  })

  // Switching schedules: save the old one's changes straight away.
  const lastScheduleId = useRef(activeScheduleId)
  useEffect(() => {
    if (lastScheduleId.current === activeScheduleId) return
    lastScheduleId.current = activeScheduleId
    void queue.flush()
  }, [activeScheduleId, queue])

  // Discard (from the status line) drops everything unsaved.
  const generation = useSaveGeneration()
  const lastGeneration = useRef(generation)
  useEffect(() => {
    if (generation === lastGeneration.current) return
    lastGeneration.current = generation
    pending.current.clear()
    confirmed.current.clear()
    reopenedFor.current.clear()
    bump()
  }, [generation, bump])

  /** Records a change: on screen now, saved with the rest after a pause. */
  function commit(body: ScheduleOpBody) {
    if (!canEdit || !activeScheduleId) return
    const op = { ...body, seq: ++seqRef.current } as ScheduleOp
    const logged = { scheduleId: activeScheduleId, op }
    pending.current.set(op.seq, logged)
    bump()
    queue.queue({ [`s${op.seq}`]: logged })
  }

  /** A move, recorded with the target day's resulting order. */
  function commitMove(ids: string[], toShootDayId: string | null, beforeEntryId: string | null, resetConcurrent?: boolean) {
    commit({
      type: 'move', entryIds: ids, toShootDayId,
      order: moveOrder(entries, ids, toShootDayId, beforeEntryId),
      ...(resetConcurrent ? { resetConcurrent } : {}),
    })
  }

  /** Saves pending changes before an action that reads the saved schedule. */
  async function saveFirst(): Promise<boolean> {
    if (await flushAll()) return true
    window.alert('Your latest schedule changes haven’t saved yet — Retry or Discard them (top right) first.')
    return false
  }
  const reopenSceneRef = useRef<((sceneId: string, error: string) => void) | null>(null)
  const [activeTab, setActiveTab]       = useState<string | 'boneyard'>(
    shootDays[0]?.id ?? 'boneyard'
  )
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [sceneModalOpen, setSceneModalOpen] = useState(false)
  const [editingScene, setEditingScene] = useState<SceneRow | null>(null)
  const [bannerEdit, setBannerEdit]     = useState<{ entry: EntryRow; label: string; dur: string } | null>(null)
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [newScheduleName, setNewScheduleName]   = useState('')
  const [locationsModalOpen, setLocationsModalOpen] = useState(false)
  const [sortDialogOpen, setSortDialogOpen]         = useState(false)

  const activeSchedule = schedules.find(s => s.id === activeScheduleId) ?? null
  const [columnPrefs, setColumnPrefs] = useState<Record<string, boolean>>(
    () => ({ ...DEFAULT_COLUMN_PREFS, ...(activeSchedule?.columnPrefs ?? {}) })
  )
  useEffect(() => {
    setColumnPrefs({ ...DEFAULT_COLUMN_PREFS, ...(activeSchedule?.columnPrefs ?? {}) })
  }, [activeScheduleId, activeSchedule?.columnPrefs])

  function toggleColumn(key: string) {
    if (!canEdit || !activeScheduleId) return
    const next = { ...columnPrefs, [key]: !columnPrefs[key] }
    setColumnPrefs(next)
    startTransition(async () => { await updateColumnPrefs(activeScheduleId, next) })
  }

  async function switchSchedule(id: string) {
    if (!(await saveFirst())) return
    router.push(`/projects/${projectId}/schedule?scheduleId=${id}`)
  }

  async function handleRenameSchedule(id: string, name: string) {
    if (!name.trim()) return
    await renameSchedule(id, name.trim())
    onMutated()
  }

  async function handleSetPrimarySchedule(id: string) {
    if (!(await saveFirst())) return
    await setPrimarySchedule(projectId, id)
    onMutated()
  }

  async function handleDeleteSchedule(id: string, name: string) {
    const ok = await confirm(
      `"${name}" and all its scheduled entries will be removed. This can't be undone.`,
      { title: 'Delete schedule?', key: 'delete-schedule', confirmLabel: 'Delete' },
    )
    if (!ok) return
    if (!(await saveFirst())) return
    const result = await deleteSchedule(id)
    if ('error' in result && result.error) {
      window.alert(result.error)
      return
    }
    if (id === activeScheduleId) router.push(`/projects/${projectId}/schedule`)
    else onMutated()
  }

  // Drag state
  const dragItem = useRef<{ id: string; multiIds?: string[] } | null>(null)
  const tabHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDragKey = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dropAbove, setDropAbove] = useState(true)

  // Live preview: entries during drag. It only moves once the pointer has
  // settled on a new spot (DRAG_SETTLE_MS), so rows don't reshuffle under the
  // cursor while it passes over them — and the drop lands exactly where the
  // preview shows (previewTarget), not wherever the pointer is at release.
  const [previewEntries, setPreviewEntries] = useState<EntryRow[] | null>(null)
  const previewTarget = useRef<{ dayId: string | null; order: string[] } | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayEntries = previewEntries ?? entries
  const draggingIds = useMemo(() => new Set(previewEntries ? (dragItem.current?.multiIds ?? [dragItem.current?.id ?? '']) : []), [previewEntries])

  function entriesForDay(dayId: string | null) {
    return displayEntries.filter(e => e.shootDayId === dayId).sort((a, b) => a.orderIndex - b.orderIndex)
  }

  function onMutated() { router.refresh() }

  // ── Selection ───────────────────────────────────────────────────────────────

  function toggleSelect(id: string, e: React.MouseEvent) {
    if (!canEdit) return
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────

  function handleDragStart(entry: EntryRow, event: React.DragEvent<HTMLElement>) {
    if (!canEdit) return
    const ids = selectedIds.has(entry.id) && selectedIds.size > 1
      ? [...selectedIds]
      : [entry.id]
    dragItem.current = { id: entry.id, multiIds: ids.length > 1 ? ids : undefined }
    event.dataTransfer.effectAllowed = 'move'

    if (ids.length > 1) {
      const ghost = document.createElement('div')
      ghost.style.cssText = 'position:fixed;top:-200px;left:0;background:#5D00A4;color:white;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;font-family:system-ui,sans-serif;box-shadow:2px 2px 0 #4A007E;white-space:nowrap;'
      ghost.textContent = `${ids.length} scenes`
      document.body.appendChild(ghost)
      event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 18)
      requestAnimationFrame(() => document.body.removeChild(ghost))
    } else {
      const row = event.currentTarget.closest('tr')
      if (row) event.dataTransfer.setDragImage(row, 0, 0)
    }
  }

  function clearSettle() {
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null }
  }

  function handleDragEnd() {
    dragItem.current = null
    lastDragKey.current = null
    previewTarget.current = null
    clearSettle()
    setDragOverId(null)
    setPreviewEntries(null)
    if (tabHoverTimer.current) clearTimeout(tabHoverTimer.current)
  }

  function handleDragOverRow(targetEntry: EntryRow, event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    if (!dragItem.current) return
    // Over the row being dragged (already shown where it will land): stay put.
    const moving = dragItem.current.multiIds ?? [dragItem.current.id]
    if (moving.includes(targetEntry.id)) { clearSettle(); return }

    const rect = event.currentTarget.getBoundingClientRect()
    const relY = event.clientY - rect.top
    // Wide dead zone on the row already targeted: it only flips once the
    // pointer is well into the other half.
    const isSameRow = dragOverId === targetEntry.id
    const above = isSameRow
      ? (dropAbove ? relY < rect.height * 0.75 : relY < rect.height * 0.25)
      : relY < rect.height / 2

    const key = `${targetEntry.id}:${above}`
    if (key === lastDragKey.current) { clearSettle(); return }   // back where the preview is
    if (settleTimer.current && key === pendingKey.current) return // already waiting for this spot
    pendingKey.current = key
    clearSettle()
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null
      if (!dragItem.current) return
      lastDragKey.current = key
      setDragOverId(targetEntry.id)
      setDropAbove(above)
      buildPreview(targetEntry.id, above, targetEntry.shootDayId)
    }, DRAG_SETTLE_MS)
  }
  const pendingKey = useRef<string | null>(null)

  function handleDropOnRow(targetEntry: EntryRow, event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    if (!dragItem.current) return
    const { id, multiIds } = dragItem.current
    // Land exactly where the preview shows.
    if (dropOnPreview(multiIds ?? [id])) return
    const rect = event.currentTarget.getBoundingClientRect()
    const above = event.clientY < rect.top + rect.height / 2
    const beforeId = above ? targetEntry.id : null

    // Find the next entry id when dropping below
    const dayEntries = entries.filter(e => e.shootDayId === targetEntry.shootDayId).sort((a, b) => a.orderIndex - b.orderIndex)
    const idx = dayEntries.findIndex(e => e.id === targetEntry.id)
    const resolvedBeforeId = above ? targetEntry.id : (dayEntries[idx + 1]?.id ?? null)

    applyDrop(multiIds ?? [id], targetEntry.shootDayId, resolvedBeforeId)
  }

  function handleDropOnDay(dayId: string | null, event: React.DragEvent<Element>) {
    event.preventDefault()
    if (!dragItem.current) return
    const { id, multiIds } = dragItem.current
    // Inside the day's table, below the last row: where the preview shows (if any).
    if (previewTarget.current?.dayId === dayId && dropOnPreview(multiIds ?? [id])) return
    applyDrop(multiIds ?? [id], dayId, null)
  }

  /** Commits the move the preview is showing; false if there's no preview. */
  function dropOnPreview(ids: string[]): boolean {
    const target = previewTarget.current
    if (!target) return false
    lastDragKey.current = null
    previewTarget.current = null
    clearSettle()
    setDragOverId(null)
    setPreviewEntries(null)
    setSelectedIds(new Set())
    commit({ type: 'move', entryIds: ids, toShootDayId: target.dayId, order: target.order })
    return true
  }

  function buildPreview(targetId: string, above: boolean, targetDayId: string | null) {
    if (!dragItem.current) return
    const { id, multiIds } = dragItem.current
    const movingIds = new Set(multiIds ?? [id])
    const movingEntries = entries.filter(e => movingIds.has(e.id))
    const dayEntries = entries.filter(e => e.shootDayId === targetDayId && !movingIds.has(e.id)).sort((a, b) => a.orderIndex - b.orderIndex)
    const insertIdx = above
      ? Math.max(0, dayEntries.findIndex(e => e.id === targetId))
      : dayEntries.findIndex(e => e.id === targetId) + 1

    const newDayOrder = [
      ...dayEntries.slice(0, Math.max(0, insertIdx)),
      ...movingEntries.map(e => ({ ...e, shootDayId: targetDayId })),
      ...dayEntries.slice(Math.max(0, insertIdx)),
    ]

    // Recompute times for preview
    const day = shootDays.find(d => d.id === targetDayId)
    const fakeEntries = newDayOrder.map(e => ({
      id: e.id,
      kind: e.kind,
      concurrentWithPrevious: e.concurrentWithPrevious,
      fixedStartTime: e.fixedStartTime,
      bannerDurationMin: e.bannerDurationMin,
      scene: e.scene ? { estimatedDuration: e.scene.estimatedDuration } : null,
    }))
    const timeUpdates = computeEntryTimes(fakeEntries, day?.startTime ?? null)
    const timeMap = new Map(timeUpdates.map(u => [u.id, u]))

    previewTarget.current = { dayId: targetDayId, order: newDayOrder.map(e => e.id) }
    const otherEntries = entries.filter(e => e.shootDayId !== targetDayId && !movingIds.has(e.id))
    setPreviewEntries([
      ...otherEntries,
      ...newDayOrder.map((e, i) => ({
        ...e,
        orderIndex: i,
        computedStartTime: timeMap.get(e.id)?.computedStartTime ?? e.computedStartTime,
        computedEndTime: timeMap.get(e.id)?.computedEndTime ?? e.computedEndTime,
      })),
    ])
  }

  function applyDrop(ids: string[], toShootDayId: string | null, beforeEntryId: string | null) {
    lastDragKey.current = null
    previewTarget.current = null
    clearSettle()
    setDragOverId(null)
    setPreviewEntries(null)
    setSelectedIds(new Set())
    commitMove(ids, toShootDayId, beforeEntryId)
  }

  // ── Sort dialog ───────────────────────────────────────────────────────────────

  function handleSortEntries(field: SortField, dir: SortDir) {
    if (!canEdit || activeTab === 'boneyard') return
    const dayId = activeTab
    const dayEntries = entries.filter(e => e.shootDayId === dayId).sort((a, b) => a.orderIndex - b.orderIndex)
    if (dayEntries.length < 2) return

    function key(e: EntryRow): string | number {
      switch (field) {
        case 'sceneNumber': return e.scene?.sceneNumber ?? '￿'
        case 'pages':        return e.scene?.pageEighths ?? 0
        case 'intExt':       return e.scene?.intExt ?? '￿'
        case 'timeOfDay':    return e.scene?.timeOfDay ?? '￿'
        case 'location':     return sceneLocationLabel(e.scene?.location?.name, e.scene?.locationDetail) ?? '￿'
      }
    }
    const sorted = [...dayEntries].sort((a, b) => {
      const ka = key(a), kb = key(b)
      const cmp = ka < kb ? -1 : ka > kb ? 1 : 0
      return dir === 'asc' ? cmp : -cmp
    })

    // Sorting changes every row's neighbour, so "alongside" flags are dropped.
    commitMove(sorted.map(e => e.id), dayId, null, true)
  }

  // ── Call sheet creation ──────────────────────────────────────────────────────

  function handleCreateCallSheet(dayId: string) {
    const dayIndex = shootDays.findIndex(d => d.id === dayId)
    const day = shootDays[dayIndex]
    if (!day) return
    startTransition(async () => {
      // The call sheet copies the saved schedule — save what's on screen first.
      if (!(await saveFirst())) return
      const result = await createCallSheet(projectId, {
        title: `${projectName} — Day ${dayIndex + 1}`,
        shootDate: day.date.slice(0, 10),
        shootDayId: dayId,
      })
      if ('data' in result && result.data) {
        router.push(`/projects/${projectId}/call-sheets/${result.data.id}`)
      } else if ('error' in result) {
        window.alert(result.error)
      }
    })
  }

  // ── Tab hover for cross-day drop ─────────────────────────────────────────────

  function handleTabDragEnter(dayId: string) {
    if (tabHoverTimer.current) clearTimeout(tabHoverTimer.current)
    tabHoverTimer.current = setTimeout(() => {
      setActiveTab(dayId)
    }, 400)
  }

  function handleTabDragLeave() {
    if (tabHoverTimer.current) clearTimeout(tabHoverTimer.current)
  }

  // ── Scene actions ────────────────────────────────────────────────────────────

  function openNewScene() {
    setEditingScene(null)
    setSceneError(null)
    setSceneModalOpen(true)
  }

  /** The full scene (with synopsis, notes…) when we have it; else what the row shows. */
  function sceneRowFor(sceneId: string, entry?: EntryRow): SceneRow | null {
    const full = scenes.find(sc => sc.id === sceneId)
    if (full) return full
    const snap = entry?.scene
    if (!snap) return null
    return {
      id: snap.id, sceneNumber: snap.sceneNumber, setting: snap.setting, description: snap.description,
      synopsis: null, intExt: snap.intExt, timeOfDay: snap.timeOfDay, pageCount: null, pageEighths: snap.pageEighths,
      estimatedDuration: snap.estimatedDuration, locationId: snap.location?.id ?? null, location: snap.location,
      locationDetail: snap.locationDetail, notes: null, castContactIds: snap.castContactIds, colorOverride: snap.colorOverride, archived: snap.archived,
    }
  }

  function openEditScene(entry: EntryRow) {
    if (!entry.scene) return
    setEditingScene(sceneRowFor(entry.scene.id, entry))
    setSceneError(null)
    setSceneModalOpen(true)
  }

  // A failed save that included a scene from the pop-up: reopen it on that
  // scene (it's on screen with what was typed) with the error.
  reopenSceneRef.current = (sceneId, error) => {
    if (sceneModalOpen) return
    const row = sceneRowFor(sceneId, entries.find(e => e.sceneId === sceneId))
    if (!row) return
    setEditingScene(row)
    setSceneError(error)
    setSceneModalOpen(true)
  }

  /** The pop-up closed straight away; the scene saves with the other changes. */
  function handleSceneSubmit(input: SceneInput, newLocationName: string | null) {
    setSceneModalOpen(false)
    setSceneError(null)
    const newLocation = newLocationName ? { locationId: newScheduleId(), name: newLocationName } : undefined
    const opInput: SceneOpInput = { ...input, ...(newLocation ? { locationId: newLocation.locationId } : {}) }
    if (editingScene) {
      commit({ type: 'updateScene', sceneId: editingScene.id, input: opInput, newLocation })
    } else {
      commit({
        type: 'createScene', sceneId: newScheduleId(), input: { ...opInput, setting: input.setting }, newLocation,
        // Added to the open day (or the Boneyard) of this schedule.
        entry: { entryId: newScheduleId(), shootDayId: activeTab !== 'boneyard' ? activeTab : null },
      })
    }
    setEditingScene(null)
  }

  // ── Banner actions ───────────────────────────────────────────────────────────

  function handleAddBanner(preset: BannerPreset, label: string, duration: number) {
    commit({
      type: 'addBanner', entryId: newScheduleId(),
      shootDayId: activeTab !== 'boneyard' ? activeTab : null,
      bannerType: preset.type, label, durationMin: Math.min(4320, Math.max(0, Math.round(duration) || 0)),
    })
  }

  function commitBannerEdit() {
    if (!bannerEdit) return
    const { entry, label, dur } = bannerEdit
    const duration = parseInt(dur)
    setBannerEdit(null)
    const patch = { bannerLabel: label, bannerDurationMin: isNaN(duration) ? 0 : Math.min(4320, Math.max(0, duration)) }
    if (patch.bannerLabel === entry.bannerLabel && patch.bannerDurationMin === (entry.bannerDurationMin ?? 0)) return
    commit({ type: 'updateEntry', entryId: entry.id, patch })
  }

  // ── Timing: run alongside / exact start time ─────────────────────────────────

  function handleToggleConcurrent(entry: EntryRow) {
    if (!entry.shootDayId) return
    commit({ type: 'updateEntry', entryId: entry.id, patch: { concurrentWithPrevious: !entry.concurrentWithPrevious } })
  }

  /** `time` = "HH:mm" to pin an exact start, null = back to automatic. */
  function handleSetStartTime(entry: EntryRow, time: string | null) {
    if (!entry.shootDayId || time === entry.fixedStartTime) return
    commit({ type: 'updateEntry', entryId: entry.id, patch: { fixedStartTime: time } })
  }

  /** Scene ↔ banner, or one banner type to another (keeps name and length). */
  function handleChangeType(entry: EntryRow, to: BannerType | 'SCENE') {
    commit({ type: 'changeEntryType', entryId: entry.id, to, ...(to === 'SCENE' ? { sceneId: newScheduleId() } : {}) })
  }

  // ── Delete / move ────────────────────────────────────────────────────────────

  async function handleDeleteEntry(entry: EntryRow) {
    const ok = await confirm(
      `Remove this ${entry.kind === 'SCENE' ? 'scene' : 'banner'} from the schedule?`,
      { key: 'delete-schedule-entry', confirmLabel: 'Remove' }
    )
    if (!ok) return
    setSelectedIds(prev => { const next = new Set(prev); next.delete(entry.id); return next })
    commit({ type: 'deleteEntry', entryId: entry.id })
  }

  function handleMoveEntryToBoneyard(entry: EntryRow) {
    commitMove([entry.id], null, null)
  }

  // ── Keyboard: escape clears selection ────────────────────────────────────────

  // ── No schedule empty state ───────────────────────────────────────────────

  if (!activeScheduleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        {ConfirmDialog}
        <Clapperboard className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <h2 className="text-lg font-semibold">No schedule yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Create a schedule to start building your stripboard.</p>
        </div>
        {canEdit && (
          creatingSchedule ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Schedule name"
                value={newScheduleName}
                onChange={e => setNewScheduleName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newScheduleName.trim()) {
                    startTransition(async () => {
                      await createSchedule(projectId, newScheduleName.trim())
                      setCreatingSchedule(false)
                      onMutated()
                    })
                  }
                  if (e.key === 'Escape') setCreatingSchedule(false)
                }}
              />
              <button
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white font-medium"
                onClick={() => {
                  if (!newScheduleName.trim()) return
                  startTransition(async () => {
                    await createSchedule(projectId, newScheduleName.trim())
                    setCreatingSchedule(false)
                    onMutated()
                  })
                }}
              >Create</button>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow"
              onClick={() => { setNewScheduleName('Schedule 1'); setCreatingSchedule(true) }}
            >
              <Plus className="h-4 w-4" /> Create Schedule
            </button>
          )
        )}
      </div>
    )
  }

  // ── No shoot days empty state ────────────────────────────────────────────────

  if (shootDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        {ConfirmDialog}
        <Clock className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <h2 className="text-lg font-semibold">No shoot days</h2>
          <p className="text-sm text-muted-foreground mt-1">Add shoot dates in the project edit modal first.</p>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const tabs: Array<{ id: string | 'boneyard'; label: string }> = [
    ...shootDays.map((d, i) => ({
      id: d.id,
      label: `Day ${i + 1} — ${formatDate(d.date)}`,
    })),
    { id: 'boneyard', label: '🗂 Boneyard' },
  ]

  return (
    <div className="flex flex-col gap-0 -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {ConfirmDialog}

      {/* Scene modal */}
      <SceneModal
        open={sceneModalOpen}
        onClose={() => { setSceneModalOpen(false); setEditingScene(null); setSceneError(null) }}
        onSaved={() => onMutated()}
        onSubmitDeferred={handleSceneSubmit}
        initialError={sceneError}
        projectId={projectId}
        scene={editingScene}
        locations={locations}
      />

      {/* Locations modal */}
      <LocationsModal
        open={locationsModalOpen}
        onClose={() => setLocationsModalOpen(false)}
        locations={locations}
        canEdit={canEdit}
        onMutated={onMutated}
        projectId={projectId}
      />

      {/* Sort dialog */}
      <SortDialog
        open={sortDialogOpen}
        onClose={() => setSortDialogOpen(false)}
        onApply={(field, dir) => { handleSortEntries(field, dir); setSortDialogOpen(false) }}
      />

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-4 w-4 text-muted-foreground" />
          {creatingSchedule ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Schedule name"
                value={newScheduleName}
                onChange={e => setNewScheduleName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newScheduleName.trim()) {
                    startTransition(async () => {
                      const result = await createSchedule(projectId, newScheduleName.trim())
                      setCreatingSchedule(false)
                      if ('data' in result && result.data) switchSchedule(result.data.id)
                      else onMutated()
                    })
                  }
                  if (e.key === 'Escape') setCreatingSchedule(false)
                }}
              />
              <button
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white font-medium"
                onClick={() => {
                  if (!newScheduleName.trim()) return
                  startTransition(async () => {
                    const result = await createSchedule(projectId, newScheduleName.trim())
                    setCreatingSchedule(false)
                    if ('data' in result && result.data) switchSchedule(result.data.id)
                    else onMutated()
                  })
                }}
              >Create</button>
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setCreatingSchedule(false)}
              >Cancel</button>
            </div>
          ) : (
          <ScheduleSwitcher
            schedules={schedules}
            activeScheduleId={activeScheduleId}
            canEdit={canEdit}
            onSwitch={switchSchedule}
            onRename={handleRenameSchedule}
            onSetPrimary={handleSetPrimarySchedule}
            onDelete={handleDeleteSchedule}
            onCreateNew={() => { setNewScheduleName(`Schedule ${schedules.length + 1}`); setCreatingSchedule(true) }}
          />
          )}
        </div>
        <div className="flex items-center gap-2">
          <SaveStatusLine className="mr-1" />
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setLocationsModalOpen(true)}
          >
            <MapPin className="h-3.5 w-3.5" /> Locations
          </button>
          {activeTab !== 'boneyard' && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setSortDialogOpen(true)}
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> Sort
            </button>
          )}
          <ColumnsMenu columnPrefs={columnPrefs} onToggle={toggleColumn} canEdit={canEdit} />
          {canEdit && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
              onClick={() => openNewScene()}
            >
              <Plus className="h-3.5 w-3.5" /> Add Scene
            </button>
          )}
        </div>
      </div>

      {/* ── Shoot day tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-0 px-6 pt-4 border-b border-border overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={[
              'px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors rounded-t-md -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
            onDragEnter={() => tab.id !== 'boneyard' && handleTabDragEnter(typeof tab.id === 'string' ? tab.id : tab.id)}
            onDragLeave={handleTabDragLeave}
            onDragOver={e => { e.preventDefault() }}
            onDrop={e => handleDropOnDay(tab.id === 'boneyard' ? null : tab.id, e)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4">
        {activeTab === 'boneyard' ? (
          <BoneyardView
            entries={entriesForDay(null)}
            allScenes={scenes}
            canEdit={canEdit}
            onEditEntry={openEditScene}
            onDeleteEntry={handleDeleteEntry}
            onRestoreScene={id => commit({ type: 'setSceneArchived', sceneId: id, archived: false })}
            onArchiveScene={id => commit({ type: 'setSceneArchived', sceneId: id, archived: true })}
          />
        ) : (
          <ShootDayView
            dayId={activeTab}
            day={shootDays.find(d => d.id === activeTab)!}
            entries={entriesForDay(activeTab)}
            allDays={shootDays}
            scheduleId={activeScheduleId}
            canEdit={canEdit}
            columnPrefs={columnPrefs}
            selectedIds={selectedIds}
            dragOverId={dragOverId}
            dropAbove={dropAbove}
            draggingIds={draggingIds}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOverRow={handleDragOverRow}
            onDropRow={handleDropOnRow}
            onDropOnDay={e => handleDropOnDay(activeTab, e)}
            onToggleSelect={toggleSelect}
            onEditEntry={openEditScene}
            onDeleteEntry={handleDeleteEntry}
            onMoveToBoneyard={handleMoveEntryToBoneyard}
            onToggleConcurrent={handleToggleConcurrent}
            onChangeType={handleChangeType}
            onSetStartTime={handleSetStartTime}
            onMoveToDay={(entryId, dayId) => commitMove([entryId], dayId, null)}
            onAddScene={() => openNewScene()}
            onAddBanner={handleAddBanner}
            onCreateCallSheet={canCreateCallSheet ? () => handleCreateCallSheet(activeTab) : undefined}
            bannerEdit={bannerEdit}
            onStartBannerEdit={entry => setBannerEdit({ entry, label: entry.bannerLabel ?? '', dur: String(entry.bannerDurationMin ?? 0) })}
            onCommitBannerEdit={commitBannerEdit}
            onCancelBannerEdit={() => setBannerEdit(null)}
            onBannerEditChange={(label, dur) => {
              if (bannerEdit) setBannerEdit({ ...bannerEdit, label, dur })
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleSwitcher
// ─────────────────────────────────────────────────────────────────────────────

function ScheduleSwitcher({
  schedules, activeScheduleId, canEdit, onSwitch, onRename, onSetPrimary, onDelete, onCreateNew,
}: {
  schedules: { id: string; name: string; isPrimary: boolean; columnPrefs: Record<string, boolean> }[]
  activeScheduleId: string | null
  canEdit: boolean
  onSwitch: (id: string) => void
  onRename: (id: string, name: string) => void
  onSetPrimary: (id: string) => void
  onDelete: (id: string, name: string) => void
  onCreateNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = schedules.find(s => s.id === activeScheduleId) ?? null

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
      setRenamingId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function openMenu() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4 + window.scrollY, left: rect.left + window.scrollX })
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-muted transition-colors"
        onClick={openMenu}
      >
        <span className="text-sm font-semibold text-foreground">{active?.name ?? 'Schedule'}</span>
        {active?.isPrimary && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">Primary</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {mounted && open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999, width: 240 }}
          className="rounded-xl border border-border bg-popover shadow-xl py-1 text-foreground"
        >
          {schedules.map(s => (
            <div key={s.id} className="group/sched flex items-center px-1">
              {renamingId === s.id ? (
                <input
                  autoFocus
                  className="flex-1 m-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onRename(s.id, renameValue); setRenamingId(null) }
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => { onRename(s.id, renameValue); setRenamingId(null) }}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 px-2 py-2 text-sm hover:bg-muted rounded-lg transition-colors text-left min-w-0"
                    onClick={() => { onSwitch(s.id); setOpen(false) }}
                  >
                    {s.id === activeScheduleId
                      ? <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      : <span className="w-3.5 flex-shrink-0" />}
                    <span className="truncate">{s.name}</span>
                    {s.isPrimary && <Star className="h-3 w-3 text-primary flex-shrink-0" />}
                  </button>
                  {canEdit && (
                    <div className="flex items-center opacity-0 group-hover/sched:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        type="button"
                        title="Rename"
                        className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {!s.isPrimary && (
                        <button
                          type="button"
                          title="Set as primary"
                          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                          onClick={() => onSetPrimary(s.id)}
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      )}
                      {!s.isPrimary && (
                        <button
                          type="button"
                          title="Delete"
                          className="rounded p-1 hover:bg-muted text-destructive"
                          onClick={() => { setOpen(false); onDelete(s.id, s.name) }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {canEdit && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-foreground"
                onClick={() => { setOpen(false); onCreateNew() }}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" /> New schedule
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ColumnsMenu
// ─────────────────────────────────────────────────────────────────────────────

function ColumnsMenu({
  columnPrefs, onToggle, canEdit,
}: {
  columnPrefs: Record<string, boolean>
  onToggle: (key: string) => void
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function openMenu() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4 + window.scrollY, left: rect.right - 192 + window.scrollX })
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        onClick={openMenu}
      >
        <Columns3 className="h-3.5 w-3.5" /> Columns
      </button>

      {mounted && open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999, width: 192 }}
          className="rounded-xl border border-border bg-popover shadow-xl py-1 text-foreground"
        >
          {COLUMN_DEFS.map(col => (
            <button
              key={col.key}
              type="button"
              disabled={!canEdit}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onToggle(col.key)}
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-border">
                {columnPrefs[col.key] && <Check className="h-3 w-3 text-primary" />}
              </span>
              {col.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ShootDayView
// ─────────────────────────────────────────────────────────────────────────────

interface ShootDayViewProps {
  dayId: string
  day: ShootDayRow
  entries: EntryRow[]
  allDays: ShootDayRow[]
  scheduleId: string
  canEdit: boolean
  columnPrefs: Record<string, boolean>
  selectedIds: Set<string>
  dragOverId: string | null
  dropAbove: boolean
  /** Rows being dragged — shown highlighted where they'll land. */
  draggingIds: Set<string>
  onDragStart: (entry: EntryRow, e: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOverRow: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
  onDropRow: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
  onDropOnDay: (e: React.DragEvent<HTMLDivElement>) => void
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  onEditEntry: (entry: EntryRow) => void
  onDeleteEntry: (entry: EntryRow) => void
  onMoveToBoneyard: (entry: EntryRow) => void
  onToggleConcurrent: (entry: EntryRow) => void
  onChangeType: (entry: EntryRow, to: BannerType | 'SCENE') => void
  onSetStartTime: (entry: EntryRow, time: string | null) => void
  onMoveToDay: (entryId: string, dayId: string) => void
  onAddScene: () => void
  onAddBanner: (preset: BannerPreset, label: string, duration: number) => void
  onCreateCallSheet?: () => void
  bannerEdit: { entry: EntryRow; label: string; dur: string } | null
  onStartBannerEdit: (entry: EntryRow) => void
  onCommitBannerEdit: () => void
  onCancelBannerEdit: () => void
  onBannerEditChange: (label: string, dur: string) => void
}

function ShootDayView({
  dayId, day, entries, allDays, scheduleId, canEdit, columnPrefs,
  selectedIds, dragOverId, dropAbove, draggingIds,
  onDragStart, onDragEnd, onDragOverRow, onDropRow, onDropOnDay,
  onToggleSelect, onEditEntry, onDeleteEntry, onMoveToBoneyard, onToggleConcurrent, onChangeType, onSetStartTime, onMoveToDay,
  onAddScene, onAddBanner, onCreateCallSheet,
  bannerEdit, onStartBannerEdit, onCommitBannerEdit, onCancelBannerEdit, onBannerEditChange,
}: ShootDayViewProps) {
  // Compute totals. With concurrent items the day's length is call → wrap
  // (the latest end), not the sum of durations.
  const totalPageEighths = entries.reduce((sum, e) => sum + (e.scene?.pageEighths ?? 0), 0)
  const sceneCount = entries.filter(e => e.kind === 'SCENE').length
  const wrapTime = dayWrapTime(entries)
  // A hand-set time can start before the first row, so use the earliest start.
  const starts = entries.flatMap(e => e.computedStartTime ? [parseHHmm(e.computedStartTime)] : [])
  const totalMinutes = wrapTime && starts.length ? Math.max(0, parseHHmm(wrapTime) - Math.min(...starts)) : 0
  const overlaps = overlapFlags(entries)
  const overlapping = overlaps.filter(Boolean).length

  const otherDays = allDays.filter(d => d.id !== dayId)

  return (
    <div>
      {/* Day header */}
      <div className="flex items-center gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Day {allDays.findIndex(d => d.id === dayId) + 1}
            {day.label ? ` — ${day.label}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {parseLocalDate(day.date)?.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {day.primaryLocation && ` · ${day.primaryLocation.name}`}
            {day.startTime && ` · Call ${day.startTime}`}
          </p>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border border-border overflow-hidden"
        onDragOver={e => { e.preventDefault() }}
        // A drop on a row is handled there (it calls preventDefault); one in the
        // gaps lands where the preview shows, or at the end of the day.
        onDrop={e => { if (!e.defaultPrevented) onDropOnDay(e) }}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              {canEdit && <th className="w-8 py-2" />}
              <th className="w-8 py-2" />
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-12">#</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setting / Label</th>
              {columnPrefs.ie && <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">I/E</th>}
              {columnPrefs.timeOfDay && <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Time</th>}
              {columnPrefs.location && <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-36">Location</th>}
              {columnPrefs.pages && <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Pages</th>}
              {columnPrefs.duration && <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Dur</th>}
              <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Start</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">End</th>
              <th className="w-8 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={
                    (canEdit ? 1 : 0) + 6 +
                    Object.values(columnPrefs).filter(Boolean).length
                  }
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No scenes scheduled for this day.
                  {canEdit && <> <button className="text-primary hover:underline ml-1" onClick={onAddScene}>Add one</button>.</>}
                </td>
              </tr>
            )}
            {entries.map((entry, i) => (
              <ScheduleEntryRow
                key={entry.id}
                entry={entry}
                isFirst={i === 0}
                overlaps={overlaps[i] ?? false}
                onToggleConcurrent={onToggleConcurrent}
                onChangeType={onChangeType}
                onSetStartTime={onSetStartTime}
                canEdit={canEdit}
                columnPrefs={columnPrefs}
                isSelected={selectedIds.has(entry.id)}
                isDragOver={dragOverId === entry.id}
                isDragging={draggingIds.has(entry.id)}
                dropAbove={dropAbove}
                otherDays={otherDays}
                bannerEdit={bannerEdit?.entry.id === entry.id ? bannerEdit : null}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOverRow}
                onDrop={onDropRow}
                onToggleSelect={onToggleSelect}
                onEdit={onEditEntry}
                onDelete={onDeleteEntry}
                onMoveToBoneyard={onMoveToBoneyard}
                onMoveToDay={onMoveToDay}
                onStartBannerEdit={onStartBannerEdit}
                onCommitBannerEdit={onCommitBannerEdit}
                onCancelBannerEdit={onCancelBannerEdit}
                onBannerEditChange={onBannerEditChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add entry row */}
      {canEdit && (
        <div className="flex items-center gap-3 mt-3 px-1">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            onClick={onAddScene}
          >
            <FilePlus className="h-3.5 w-3.5" /> Add Scene
          </button>
          <BannerMenu onSelect={onAddBanner} />
        </div>
      )}

      {/* End-of-day footer */}
      <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground">{sceneCount}</span> scenes</span>
            {totalPageEighths > 0 && (
              <span><span className="font-semibold text-foreground">{pageEighthsToDisplay(totalPageEighths)}</span> pages</span>
            )}
            <span>
              <span className="font-semibold text-foreground">{totalMinutes}m</span> total
              {overlapping > 0 && <> · {overlapping} overlapping</>}
            </span>
            {wrapTime && (
              <span>Wrap <span className="font-semibold text-foreground">{formatHHmm(wrapTime)}</span></span>
            )}
          </div>
          {onCreateCallSheet && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              onClick={onCreateCallSheet}
            >
              <FilePlus className="h-3.5 w-3.5" /> Create Call Sheet
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleEntryRow
// ─────────────────────────────────────────────────────────────────────────────

interface RowProps {
  entry: EntryRow
  /** First entry of its day — nothing above to run alongside. */
  isFirst: boolean
  /** Runs during the rows above (flagged, or a hand-set time inside them). */
  overlaps: boolean
  onToggleConcurrent: (entry: EntryRow) => void
  onChangeType: (entry: EntryRow, to: BannerType | 'SCENE') => void
  onSetStartTime: (entry: EntryRow, time: string | null) => void
  canEdit: boolean
  columnPrefs: Record<string, boolean>
  isSelected: boolean
  isDragOver: boolean
  isDragging: boolean
  dropAbove: boolean
  otherDays: ShootDayRow[]
  bannerEdit: { entry: EntryRow; label: string; dur: string } | null
  onDragStart: (entry: EntryRow, e: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
  onDrop: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  onEdit: (entry: EntryRow) => void
  onDelete: (entry: EntryRow) => void
  onMoveToBoneyard: (entry: EntryRow) => void
  onMoveToDay: (entryId: string, dayId: string) => void
  onStartBannerEdit: (entry: EntryRow) => void
  onCommitBannerEdit: () => void
  onCancelBannerEdit: () => void
  onBannerEditChange: (label: string, dur: string) => void
}

function ScheduleEntryRow({
  entry, isFirst, overlaps, onToggleConcurrent, onChangeType, onSetStartTime, canEdit, columnPrefs, isSelected, isDragOver, isDragging, dropAbove, otherDays, bannerEdit,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onToggleSelect, onEdit, onDelete, onMoveToBoneyard, onMoveToDay,
  onStartBannerEdit, onCommitBannerEdit, onCancelBannerEdit, onBannerEditChange,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos]   = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted]   = useState(false)
  // Inline exact-start editor ("HH:mm" for the time input — 25:30 shows as 01:30)
  const [startDraft, setStartDraft] = useState<string | null>(null)
  // Opened from "Set start time…": pin even if the time is unchanged.
  const pinAsIs = useRef(false)
  const menuRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const isScene = entry.kind === 'SCENE'
  const alongside = overlaps

  function openStartEdit(explicit = false) {
    pinAsIs.current = explicit
    const current = entry.fixedStartTime ?? entry.computedStartTime ?? '08:00'
    setStartDraft(formatClock(parseHHmm(current) % (24 * 60)))
  }
  function commitStartEdit() {
    if (startDraft === null) return
    const draft = startDraft
    setStartDraft(null)
    if (!draft) return
    // Re-entering the automatic time on an automatic row doesn't pin it.
    const auto = entry.computedStartTime ? formatClock(parseHHmm(entry.computedStartTime) % (24 * 60)) : null
    if (!entry.fixedStartTime && draft === auto && !pinAsIs.current) return
    onSetStartTime(entry, draft)
  }
  const color = isScene && entry.scene
    ? getSceneColor(entry.scene.intExt, entry.scene.timeOfDay, entry.scene.colorOverride)
    : (BANNER_COLORS[entry.bannerType ?? 'CUSTOM'] ?? BANNER_COLORS['CUSTOM']!)

  return (
    <tr
      id={`entry-${entry.id}`}
      onDragOver={e => onDragOver(entry, e)}
      onDrop={e => onDrop(entry, e)}
      className={[
        'border-b border-border/40 group/row transition-colors cursor-default select-none',
        isSelected ? 'ring-1 ring-inset ring-primary/40' : '',
        // The dragged row already sits where it will land (live preview), so
        // it's highlighted there; the neighbour borders only show without one.
        isDragging ? 'relative z-10 outline outline-2 -outline-offset-2 outline-primary shadow-lg opacity-90' : '',
        !isDragging && isDragOver && dropAbove ? 'border-t-2 border-t-primary' : '',
        !isDragging && isDragOver && !dropAbove ? 'border-b-2 border-b-primary' : '',
      ].join(' ')}
      style={{ background: isSelected ? `${color.bg}cc` : color.bg, color: color.text }}
    >
      {/* Checkbox */}
      {canEdit && (
        <td className="pl-2 w-8">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            onClick={e => onToggleSelect(entry.id, e)}
            className="h-3.5 w-3.5 rounded accent-primary cursor-pointer opacity-0 group-hover/row:opacity-100 transition-opacity"
            style={{ opacity: isSelected ? 1 : undefined }}
          />
        </td>
      )}

      {/* Drag handle — only this cell is draggable, matching BudgetEditor's account-row pattern */}
      <td
        className="w-8 pl-1 cursor-grab active:cursor-grabbing"
        draggable={canEdit}
        onDragStart={e => onDragStart(entry, e)}
        onDragEnd={onDragEnd}
      >
        {canEdit && (
          <GripVertical className="h-3.5 w-3.5 opacity-0 group-hover/row:opacity-40" />
        )}
      </td>

      {/* Scene # */}
      <td className="px-3 py-2 w-12">
        <span className="text-xs font-mono font-semibold opacity-70">
          {isScene ? (entry.scene?.sceneNumber ?? '—') : ''}
        </span>
      </td>

      {/* Setting / banner label */}
      <td className="px-3 py-2 max-w-0">
        {bannerEdit ? (
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              className="rounded border border-current/20 bg-transparent px-1.5 py-0.5 text-xs outline-none w-32"
              value={bannerEdit.label}
              onChange={e => onBannerEditChange(e.target.value, bannerEdit.dur)}
              onKeyDown={e => { if (e.key === 'Enter') onCommitBannerEdit(); if (e.key === 'Escape') onCancelBannerEdit() }}
            />
            <input
              type="number"
              min={0}
              className="rounded border border-current/20 bg-transparent px-1.5 py-0.5 text-xs outline-none w-14"
              value={bannerEdit.dur}
              onChange={e => onBannerEditChange(bannerEdit.label, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onCommitBannerEdit(); if (e.key === 'Escape') onCancelBannerEdit() }}
              onBlur={onCommitBannerEdit}
            />
            <span className="text-xs opacity-60">min</span>
          </div>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {alongside && (
              <CornerDownRight
                className="h-3.5 w-3.5 shrink-0 opacity-60"
                aria-label="Runs during the item above"
              >
                <title>Runs during the item above</title>
              </CornerDownRight>
            )}
            <span className="truncate">
              {isScene ? entry.scene?.setting : (entry.bannerLabel || entry.bannerType?.replace('_', ' '))}
            </span>
          </span>
        )}
      </td>

      {/* I/E badge */}
      {columnPrefs.ie && (
        <td className="px-2 py-2 text-center w-20">
          {isScene && entry.scene && (
            <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-black/10">
              {entry.scene.intExt.replace('_', '/')}
            </span>
          )}
        </td>
      )}

      {/* Time of day */}
      {columnPrefs.timeOfDay && (
        <td className="px-2 py-2 w-20">
          <span className="text-xs opacity-70 truncate block">
            {isScene ? entry.scene?.timeOfDay ?? '' : ''}
          </span>
        </td>
      )}

      {/* Location */}
      {columnPrefs.location && (
        <td className="px-2 py-2 w-36">
          {(() => {
            const label = isScene ? (sceneLocationLabel(entry.scene?.location?.name, entry.scene?.locationDetail) ?? '') : ''
            return <span className="text-xs opacity-70 truncate block max-w-[136px]" title={label || undefined}>{label}</span>
          })()}
        </td>
      )}

      {/* Pages */}
      {columnPrefs.pages && (
        <td className="px-2 py-2 text-center w-16">
          <span className="text-xs tabular-nums opacity-70">
            {isScene && entry.scene?.pageEighths ? pageEighthsToDisplay(entry.scene.pageEighths) : ''}
            {!isScene && entry.bannerDurationMin ? `${entry.bannerDurationMin}m` : ''}
          </span>
        </td>
      )}

      {/* Duration */}
      {columnPrefs.duration && (
        <td className="px-2 py-2 text-center w-16">
          <span className="text-xs tabular-nums opacity-70">
            {isScene ? (entry.scene?.estimatedDuration ? `${entry.scene.estimatedDuration}m` : '') : (entry.bannerDurationMin ? `${entry.bannerDurationMin}m` : '')}
          </span>
        </td>
      )}

      {/* Start time — click to set an exact start (📌); automatic otherwise */}
      <td className="px-2 py-2 text-right w-24">
        {startDraft !== null ? (
          <input
            type="time"
            autoFocus
            value={startDraft}
            onChange={e => setStartDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitStartEdit(); if (e.key === 'Escape') setStartDraft(null) }}
            onBlur={commitStartEdit}
            onClick={e => e.stopPropagation()}
            className="w-[6.5rem] rounded border border-current/20 bg-background/80 px-1 py-0.5 text-xs font-mono text-foreground outline-none"
            aria-label="Exact start time"
          />
        ) : canEdit ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); openStartEdit(false) }}
            title={entry.fixedStartTime ? 'Exact start time — click to change' : 'Click to set an exact start time'}
            className="inline-flex items-center gap-1 rounded px-1 text-xs font-mono tabular-nums opacity-80 whitespace-nowrap hover:bg-black/10 hover:opacity-100"
          >
            {entry.fixedStartTime && <Pin className="h-3 w-3 shrink-0" aria-label="Exact start time" />}
            {entry.computedStartTime ? formatHHmm(entry.computedStartTime) : '—'}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums opacity-80 whitespace-nowrap">
            {entry.fixedStartTime && <Pin className="h-3 w-3 shrink-0" aria-label="Exact start time" />}
            {entry.computedStartTime ? formatHHmm(entry.computedStartTime) : '—'}
          </span>
        )}
      </td>

      {/* End time */}
      <td className="px-3 py-2 text-right w-24">
        <span className="text-xs font-mono tabular-nums opacity-80 whitespace-nowrap">
          {entry.computedEndTime ? formatHHmm(entry.computedEndTime) : '—'}
        </span>
      </td>

      {/* Kebab */}
      <td className="px-1 py-2 w-8">
        {canEdit && (
          <button
            ref={triggerRef}
            type="button"
            className="rounded p-1 opacity-0 group-hover/row:opacity-60 hover:!opacity-100 transition-opacity"
            onClick={e => {
              e.stopPropagation()
              if (!menuOpen && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect()
                setMenuPos({ top: rect.bottom + 4 + window.scrollY, left: rect.right - 176 + window.scrollX })
              }
              setMenuOpen(v => !v)
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
      {mounted && menuOpen && menuPos && createPortal(
        <EntryKebabMenu
          ref={menuRef}
          pos={menuPos}
          entry={entry}
          otherDays={otherDays}
          onClose={() => setMenuOpen(false)}
          onEdit={onEdit}
          onDelete={onDelete}
          onMoveToBoneyard={onMoveToBoneyard}
          onMoveToDay={onMoveToDay}
          onEditBanner={onStartBannerEdit}
          onToggleConcurrent={isFirst || entry.fixedStartTime ? undefined : onToggleConcurrent}
          onSetStartTime={entry.shootDayId ? () => openStartEdit(true) : undefined}
          onClearStartTime={entry.fixedStartTime ? () => onSetStartTime(entry, null) : undefined}
          onChangeType={to => onChangeType(entry, to)}
        />,
        document.body,
      )}
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EntryKebabMenu
// ─────────────────────────────────────────────────────────────────────────────

const EntryKebabMenu = forwardRef<HTMLDivElement, {
  pos: { top: number; left: number }
  entry: EntryRow
  otherDays: ShootDayRow[]
  onClose: () => void
  onEdit: (e: EntryRow) => void
  onDelete: (e: EntryRow) => void
  onMoveToBoneyard: (e: EntryRow) => void
  onMoveToDay: (id: string, dayId: string) => void
  onEditBanner: (e: EntryRow) => void
  onChangeType: (to: BannerType | 'SCENE') => void
  /** Absent on a day's first entry, or when an exact start is set. */
  onToggleConcurrent?: (e: EntryRow) => void
  onSetStartTime?: () => void
  /** Present only when an exact start is set. */
  onClearStartTime?: () => void
}>(function EntryKebabMenu({
  pos, entry, otherDays, onClose, onEdit, onDelete, onMoveToBoneyard, onMoveToDay, onEditBanner, onToggleConcurrent,
  onSetStartTime, onClearStartTime, onChangeType,
}, ref) {
  const [moveDayOpen, setMoveDayOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const current: BannerType | 'SCENE' = entry.kind === 'SCENE' ? 'SCENE' : (entry.bannerType ?? 'CUSTOM')
  const typeOptions: { value: BannerType | 'SCENE'; label: string; swatch: string }[] = [
    { value: 'SCENE' as const, label: 'Scene', swatch: '#ffffff' },
    ...BANNER_PRESETS.map(p => ({ value: p.type, label: p.label, swatch: (BANNER_COLORS[p.type] ?? BANNER_COLORS['CUSTOM']!).bg })),
  ].filter(o => o.value !== current)

  function item(onClick: () => void, children: React.ReactNode, danger = false) {
    return (
      <button
        type="button"
        className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left ${danger ? 'text-destructive' : 'text-foreground'}`}
        onClick={() => { onClick(); onClose() }}
      >
        {children}
      </button>
    )
  }

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999, width: 176 }}
      className="rounded-xl border border-border bg-popover shadow-xl py-1 text-foreground"
    >
      {entry.kind === 'SCENE'
        ? item(() => onEdit(entry), <><Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit scene</>)
        : item(() => onEditBanner(entry), <><Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit banner</>)
      }
      {onToggleConcurrent && item(
        () => onToggleConcurrent(entry),
        <><CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
          {entry.concurrentWithPrevious ? 'Run after the item above' : 'Run alongside the item above'}</>,
      )}
      {onSetStartTime && item(
        onSetStartTime,
        <><Pin className="h-3.5 w-3.5 text-muted-foreground" /> {entry.fixedStartTime ? 'Change start time…' : 'Set start time…'}</>,
      )}
      {onClearStartTime && item(
        onClearStartTime,
        <><RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /> Back to automatic time</>,
      )}
      <div className="relative">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
          onClick={() => { setTypeOpen(v => !v); setMoveDayOpen(false) }}
        >
          <Shapes className="h-3.5 w-3.5 text-muted-foreground" /> Change type
          <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
        </button>
        {typeOpen && (
          <div className="absolute right-full top-0 mr-1 w-44 rounded-xl border border-border bg-popover shadow-xl py-1 z-40">
            {typeOptions.map(o => (
              <button
                key={o.value}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                onClick={() => { onChangeType(o.value); onClose() }}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm border border-border" style={{ background: o.swatch }} />
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {otherDays.length > 0 && (
        <div className="relative">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
            onClick={() => { setMoveDayOpen(v => !v); setTypeOpen(false) }}
          >
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> Move to day
            <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
          </button>
          {moveDayOpen && (
            <div className="absolute left-full top-0 ml-1 w-48 rounded-xl border border-border bg-popover shadow-xl py-1 z-40">
              {otherDays.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                  onClick={() => { onMoveToDay(entry.id, d.id); onClose() }}
                >
                  Day {i + 1} — {parseLocalDate(d.date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {item(() => onMoveToBoneyard(entry), <><Archive className="h-3.5 w-3.5 text-muted-foreground" /> Move to Boneyard</>)}
      <div className="my-1 border-t border-border" />
      {item(() => onDelete(entry), <><Trash2 className="h-3.5 w-3.5" /> Remove from schedule</>, true)}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// BoneyardView
// ─────────────────────────────────────────────────────────────────────────────

function BoneyardView({
  entries, allScenes, canEdit,
  onEditEntry, onDeleteEntry, onRestoreScene, onArchiveScene,
}: {
  entries: EntryRow[]
  allScenes: SceneRow[]
  canEdit: boolean
  onEditEntry: (e: EntryRow) => void
  onDeleteEntry: (e: EntryRow) => void
  onRestoreScene: (id: string) => void
  onArchiveScene: (id: string) => void
}) {
  const scheduledSceneIds = new Set(entries.map(e => e.sceneId).filter(Boolean))
  const archivedScenes = allScenes.filter(s => s.archived)
  const unscheduledScenes = allScenes.filter(s => !s.archived && !scheduledSceneIds.has(s.id))

  return (
    <div className="space-y-8">
      {/* Unscheduled entries (boneyard ScheduleEntries) */}
      {entries.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Unscheduled</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {entries.map(entry => {
                  const color = entry.scene
                    ? getSceneColor(entry.scene.intExt, entry.scene.timeOfDay, entry.scene.colorOverride)
                    : BANNER_COLORS['CUSTOM']!
                  return (
                    <tr key={entry.id} className="border-b border-border/40 last:border-0" style={{ background: color.bg, color: color.text }}>
                      <td className="px-3 py-2 text-xs font-mono opacity-60">{entry.scene?.sceneNumber ?? '—'}</td>
                      <td className="px-3 py-2 font-medium">{entry.scene?.setting ?? entry.bannerLabel}</td>
                      <td className="px-3 py-2 text-xs opacity-60">{entry.scene?.intExt}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => onEditEntry(entry)} className="rounded p-1 hover:bg-black/10 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => onDeleteEntry(entry)} className="rounded p-1 hover:bg-black/10 transition-colors text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unscheduled scenes (no entries anywhere) */}
      {unscheduledScenes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Not Yet Scheduled</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {unscheduledScenes.map(scene => {
                  const color = getSceneColor(scene.intExt, scene.timeOfDay, scene.colorOverride)
                  return (
                    <tr key={scene.id} className="border-b border-border/40 last:border-0" style={{ background: color.bg, color: color.text }}>
                      <td className="px-3 py-2 text-xs font-mono opacity-60">{scene.sceneNumber ?? '—'}</td>
                      <td className="px-3 py-2 font-medium">{scene.setting}</td>
                      <td className="px-3 py-2 text-xs opacity-60">{scene.intExt} · {scene.timeOfDay}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => onArchiveScene(scene.id)}
                            className="rounded p-1 hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
                            title="Archive scene"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Archived scenes */}
      {archivedScenes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Archived (Boneyard)</h3>
          <div className="rounded-xl border border-border/40 overflow-hidden bg-muted/20">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {archivedScenes.map(scene => (
                  <tr key={scene.id} className="border-b border-border/30 last:border-0 opacity-60">
                    <td className="px-3 py-2 text-xs font-mono">{scene.sceneNumber ?? '—'}</td>
                    <td className="px-3 py-2 font-medium line-through">{scene.setting}</td>
                    <td className="px-3 py-2 text-xs">{scene.intExt}</td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => onRestoreScene(scene.id)}
                          className="rounded p-1 hover:bg-muted transition-colors opacity-100"
                          title="Restore scene"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5 text-primary" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {entries.length === 0 && unscheduledScenes.length === 0 && archivedScenes.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">The boneyard is empty — all scenes are scheduled.</p>
        </div>
      )}
    </div>
  )
}
