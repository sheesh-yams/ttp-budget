'use client'

import { useState, useEffect, useTransition, useRef, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  Clapperboard, Plus, GripVertical, MoreHorizontal, Pencil, Trash2,
  ArrowRight, Archive, ArchiveRestore, ChevronDown, FilePlus, Clock,
  Check, Star, Columns3, ArrowUpDown, MapPin,
} from 'lucide-react'
import { getSceneColor, BANNER_COLORS } from '@/lib/schedule-colors'
import { computeEntryTimes } from '@/lib/schedule-compute'
import { SceneModal } from './SceneModal'
import type { SceneRow } from './SceneModal'
import { BannerMenu } from './BannerMenu'
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
  createScheduleEntry,
  updateScheduleEntry,
  moveScheduleEntry,
  moveScheduleEntries,
  deleteScheduleEntry,
  archiveScene,
  unarchiveScene,
  deleteScene,
} from '@/server/actions/schedule'
import type { SceneEntryPayload } from '@/server/actions/schedule'
import { createCallSheet } from '@/server/actions/call-sheets'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { IntExt, TimeOfDay, BannerType, UserRole } from '@prisma/client'

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShootDayRow {
  id: string
  date: string
  orderIndex: number
  label: string | null
  startTime: string | null
  primaryLocation: { id: string; name: string } | null
}

interface EntryRow {
  id: string
  scheduleId: string
  shootDayId: string | null
  orderIndex: number
  kind: 'SCENE' | 'BANNER'
  computedStartTime: string | null
  computedEndTime: string | null
  sceneId: string | null
  scene: {
    id: string
    sceneNumber: string | null
    setting: string
    description: string | null
    intExt: IntExt
    timeOfDay: TimeOfDay
    pageEighths: number | null
    estimatedDuration: number | null
    colorOverride: string | null
    castContactIds: string[]
    archived: boolean
    location: { id: string; name: string } | null
  } | null
  bannerType: BannerType | null
  bannerLabel: string | null
  bannerDurationMin: number | null
  bannerNote: string | null
}

interface Props {
  projectId: string
  projectName: string
  userRole: UserRole
  shootDays: ShootDayRow[]
  schedules: { id: string; name: string; isPrimary: boolean; columnPrefs: Record<string, boolean> }[]
  activeScheduleId: string | null
  initialEntries: EntryRow[]
  allScenes: SceneRow[]
  locations: { id: string; name: string; address: string | null }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

export function ScheduleEditorClient({
  projectId,
  projectName,
  userRole,
  shootDays,
  schedules,
  activeScheduleId,
  initialEntries,
  allScenes,
  locations,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const canEdit = userRole === 'OWNER' || userRole === 'PRODUCER'

  const [entries, setEntries]           = useState<EntryRow[]>(initialEntries)
  useEffect(() => { setEntries(initialEntries) }, [initialEntries])
  const [activeTab, setActiveTab]       = useState<string | 'boneyard'>(
    shootDays[0]?.id ?? 'boneyard'
  )
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [sceneModalOpen, setSceneModalOpen] = useState(false)
  const [editingScene, setEditingScene] = useState<SceneRow | null>(null)
  const [editingEntry, setEditingEntry] = useState<EntryRow | null>(null)
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

  function switchSchedule(id: string) {
    router.push(`/projects/${projectId}/schedule?scheduleId=${id}`)
  }

  async function handleRenameSchedule(id: string, name: string) {
    if (!name.trim()) return
    await renameSchedule(id, name.trim())
    onMutated()
  }

  async function handleSetPrimarySchedule(id: string) {
    await setPrimarySchedule(projectId, id)
    onMutated()
  }

  async function handleDeleteSchedule(id: string, name: string) {
    const ok = await confirm(
      `"${name}" and all its scheduled entries will be removed. This can't be undone.`,
      { title: 'Delete schedule?', key: 'delete-schedule', confirmLabel: 'Delete' },
    )
    if (!ok) return
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

  // Live preview: entries during drag
  const [previewEntries, setPreviewEntries] = useState<EntryRow[] | null>(null)
  const displayEntries = previewEntries ?? entries

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

  function handleDragEnd() {
    dragItem.current = null
    lastDragKey.current = null
    setDragOverId(null)
    setPreviewEntries(null)
    if (tabHoverTimer.current) clearTimeout(tabHoverTimer.current)
  }

  function handleDragOverRow(targetEntry: EntryRow, event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const relY = event.clientY - rect.top
    // Hysteresis band when already hovering this row: avoid flip-flopping right at the
    // midpoint, which otherwise reorders rows under the cursor and re-triggers itself.
    const isSameRow = dragOverId === targetEntry.id
    const above = isSameRow
      ? (dropAbove ? relY < rect.height * 0.6 : relY < rect.height * 0.4)
      : relY < rect.height / 2

    const key = `${targetEntry.id}:${above}`
    if (key === lastDragKey.current) return
    lastDragKey.current = key

    setDragOverId(targetEntry.id)
    setDropAbove(above)
    buildPreview(targetEntry.id, above, targetEntry.shootDayId)
  }

  function handleDropOnRow(targetEntry: EntryRow, event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    if (!dragItem.current) return
    const { id, multiIds } = dragItem.current
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
    applyDrop(multiIds ?? [id], dayId, null)
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
      bannerDurationMin: e.bannerDurationMin,
      scene: e.scene ? { estimatedDuration: e.scene.estimatedDuration } : null,
    }))
    const timeUpdates = computeEntryTimes(fakeEntries, day?.startTime ?? null)
    const timeMap = new Map(timeUpdates.map(u => [u.id, u]))

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
    setDragOverId(null)
    setPreviewEntries(null)

    // Optimistic: move entries locally
    const movingSet = new Set(ids)
    const dayEntries = entries.filter(e => e.shootDayId === toShootDayId && !movingSet.has(e.id)).sort((a, b) => a.orderIndex - b.orderIndex)
    const movingEntries = ids.map(i => entries.find(e => e.id === i)!).filter(Boolean)
    const insertIdx = beforeEntryId ? Math.max(0, dayEntries.findIndex(e => e.id === beforeEntryId)) : dayEntries.length
    const newDayOrder = [...dayEntries.slice(0, insertIdx), ...movingEntries, ...dayEntries.slice(insertIdx)]
    const others = entries.filter(e => e.shootDayId !== toShootDayId && !movingSet.has(e.id))
    setEntries([
      ...others,
      ...newDayOrder.map((e, i) => ({ ...e, shootDayId: toShootDayId, orderIndex: i })),
    ])
    setSelectedIds(new Set())

    startTransition(async () => {
      const action = ids.length > 1 ? moveScheduleEntries : moveScheduleEntry
      if (ids.length > 1) {
        await moveScheduleEntries({ entryIds: ids, toShootDayId, beforeEntryId })
      } else {
        await moveScheduleEntry({ entryId: ids[0]!, toShootDayId, beforeEntryId })
      }
      onMutated()
    })
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
        case 'location':     return e.scene?.location?.name ?? '￿'
      }
    }
    const sorted = [...dayEntries].sort((a, b) => {
      const ka = key(a), kb = key(b)
      const cmp = ka < kb ? -1 : ka > kb ? 1 : 0
      return dir === 'asc' ? cmp : -cmp
    })

    setEntries(prev => {
      const others = prev.filter(e => e.shootDayId !== dayId)
      return [...others, ...sorted.map((e, i) => ({ ...e, orderIndex: i }))]
    })

    startTransition(async () => {
      await moveScheduleEntries({ entryIds: sorted.map(e => e.id), toShootDayId: dayId, beforeEntryId: null })
      onMutated()
    })
  }

  // ── Call sheet creation ──────────────────────────────────────────────────────

  function handleCreateCallSheet(dayId: string) {
    const dayIndex = shootDays.findIndex(d => d.id === dayId)
    const day = shootDays[dayIndex]
    if (!day) return
    startTransition(async () => {
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

  function openNewScene(dayId?: string) {
    setEditingScene(null)
    setSceneModalOpen(true)
  }

  function openEditScene(entry: EntryRow) {
    if (!entry.scene) return
    setEditingScene({
      id: entry.scene.id,
      sceneNumber: entry.scene.sceneNumber,
      setting: entry.scene.setting,
      description: entry.scene.description,
      synopsis: null,
      intExt: entry.scene.intExt,
      timeOfDay: entry.scene.timeOfDay,
      pageCount: null,
      pageEighths: entry.scene.pageEighths,
      estimatedDuration: entry.scene.estimatedDuration,
      locationId: entry.scene.location?.id ?? null,
      location: entry.scene.location,
      notes: null,
      castContactIds: entry.scene.castContactIds,
      colorOverride: entry.scene.colorOverride,
      archived: entry.scene.archived,
    })
    setEditingEntry(entry)
    setSceneModalOpen(true)
  }

  function handleSceneSaved(sceneId: string, entry?: SceneEntryPayload) {
    setSceneModalOpen(false)
    if (entry) {
      // Fast path: createSceneWithEntry already returned the fully-formed entry,
      // so render it immediately instead of waiting on a full page refresh.
      setEntries(prev => [...prev, entry])
      router.refresh()
    } else {
      onMutated()
    }
  }

  // ── Banner actions ───────────────────────────────────────────────────────────

  function handleAddBanner(preset: BannerPreset, label: string, duration: number) {
    if (!activeScheduleId || !canEdit) return
    const shootDayId = activeTab !== 'boneyard' ? activeTab : null
    startTransition(async () => {
      await createScheduleEntry(activeScheduleId, {
        kind: 'BANNER',
        shootDayId,
        bannerType: preset.type,
        bannerLabel: label,
        bannerDurationMin: duration,
      })
      onMutated()
    })
  }

  function commitBannerEdit() {
    if (!bannerEdit) return
    const { entry, label, dur } = bannerEdit
    const duration = parseInt(dur)
    setBannerEdit(null)
    startTransition(async () => {
      await updateScheduleEntry(entry.id, {
        bannerLabel: label,
        bannerDurationMin: isNaN(duration) ? 0 : duration,
      })
      onMutated()
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDeleteEntry(entry: EntryRow) {
    const ok = await confirm(
      `Remove this ${entry.kind === 'SCENE' ? 'scene' : 'banner'} from the schedule?`,
      { key: 'delete-schedule-entry' }
    )
    if (!ok) return
    startTransition(async () => {
      await deleteScheduleEntry(entry.id)
      onMutated()
    })
  }

  async function handleMoveEntryToBoneyard(entry: EntryRow) {
    startTransition(async () => {
      await moveScheduleEntry({ entryId: entry.id, toShootDayId: null, beforeEntryId: null })
      onMutated()
    })
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
    <div className="flex flex-col gap-0 -mx-6 -mt-6">
      {ConfirmDialog}

      {/* Scene modal */}
      <SceneModal
        open={sceneModalOpen}
        onClose={() => { setSceneModalOpen(false); setEditingScene(null); setEditingEntry(null) }}
        onSaved={handleSceneSaved}
        projectId={projectId}
        scene={editingScene}
        locations={locations}
        scheduleContext={
          !editingScene && activeScheduleId && activeTab !== 'boneyard'
            ? { scheduleId: activeScheduleId, shootDayId: activeTab }
            : null
        }
      />

      {/* Locations modal */}
      <LocationsModal
        open={locationsModalOpen}
        onClose={() => setLocationsModalOpen(false)}
        locations={locations}
        canEdit={canEdit}
        onMutated={onMutated}
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
            allScenes={allScenes}
            canEdit={canEdit}
            onEditEntry={openEditScene}
            onDeleteEntry={handleDeleteEntry}
            onRestoreScene={id => {
              startTransition(async () => { await unarchiveScene(id); onMutated() })
            }}
            onArchiveScene={id => {
              startTransition(async () => { await archiveScene(id); onMutated() })
            }}
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOverRow={handleDragOverRow}
            onDropRow={handleDropOnRow}
            onDropOnDay={e => handleDropOnDay(activeTab, e)}
            onToggleSelect={toggleSelect}
            onEditEntry={openEditScene}
            onDeleteEntry={handleDeleteEntry}
            onMoveToBoneyard={handleMoveEntryToBoneyard}
            onMoveToDay={(entryId, dayId) => {
              startTransition(async () => {
                await moveScheduleEntry({ entryId, toShootDayId: dayId, beforeEntryId: null })
                onMutated()
              })
            }}
            onAddScene={() => openNewScene(activeTab)}
            onAddBanner={handleAddBanner}
            onCreateCallSheet={() => handleCreateCallSheet(activeTab)}
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
  onDragStart: (entry: EntryRow, e: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOverRow: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
  onDropRow: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
  onDropOnDay: (e: React.DragEvent<HTMLDivElement>) => void
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  onEditEntry: (entry: EntryRow) => void
  onDeleteEntry: (entry: EntryRow) => void
  onMoveToBoneyard: (entry: EntryRow) => void
  onMoveToDay: (entryId: string, dayId: string) => void
  onAddScene: () => void
  onAddBanner: (preset: BannerPreset, label: string, duration: number) => void
  onCreateCallSheet: () => void
  bannerEdit: { entry: EntryRow; label: string; dur: string } | null
  onStartBannerEdit: (entry: EntryRow) => void
  onCommitBannerEdit: () => void
  onCancelBannerEdit: () => void
  onBannerEditChange: (label: string, dur: string) => void
}

function ShootDayView({
  dayId, day, entries, allDays, scheduleId, canEdit, columnPrefs,
  selectedIds, dragOverId, dropAbove,
  onDragStart, onDragEnd, onDragOverRow, onDropRow, onDropOnDay,
  onToggleSelect, onEditEntry, onDeleteEntry, onMoveToBoneyard, onMoveToDay,
  onAddScene, onAddBanner, onCreateCallSheet,
  bannerEdit, onStartBannerEdit, onCommitBannerEdit, onCancelBannerEdit, onBannerEditChange,
}: ShootDayViewProps) {
  // Compute totals
  const totalMinutes = entries.reduce((sum, e) => {
    if (e.kind === 'SCENE') return sum + (e.scene?.estimatedDuration ?? 0)
    return sum + (e.bannerDurationMin ?? 0)
  }, 0)
  const totalPageEighths = entries.reduce((sum, e) => sum + (e.scene?.pageEighths ?? 0), 0)
  const sceneCount = entries.filter(e => e.kind === 'SCENE').length
  const wrapTime = entries.length > 0 ? entries[entries.length - 1]!.computedEndTime : null

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
            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {day.primaryLocation && ` · ${day.primaryLocation.name}`}
            {day.startTime && ` · Call ${day.startTime}`}
          </p>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border border-border overflow-hidden"
        onDragOver={e => { e.preventDefault() }}
        onDrop={e => { if (!dragOverId) onDropOnDay(e) }}
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
              {columnPrefs.location && <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Location</th>}
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
            {entries.map(entry => (
              <ScheduleEntryRow
                key={entry.id}
                entry={entry}
                canEdit={canEdit}
                columnPrefs={columnPrefs}
                isSelected={selectedIds.has(entry.id)}
                isDragOver={dragOverId === entry.id}
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
            <span><span className="font-semibold text-foreground">{totalMinutes}m</span> total</span>
            {wrapTime && (
              <span>Wrap <span className="font-semibold text-foreground">{formatHHmm(wrapTime)}</span></span>
            )}
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            onClick={onCreateCallSheet}
          >
            <FilePlus className="h-3.5 w-3.5" /> Create Call Sheet
          </button>
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
  canEdit: boolean
  columnPrefs: Record<string, boolean>
  isSelected: boolean
  isDragOver: boolean
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
  entry, canEdit, columnPrefs, isSelected, isDragOver, dropAbove, otherDays, bannerEdit,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onToggleSelect, onEdit, onDelete, onMoveToBoneyard, onMoveToDay,
  onStartBannerEdit, onCommitBannerEdit, onCancelBannerEdit, onBannerEditChange,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos]   = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted]   = useState(false)
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
        isDragOver && dropAbove ? 'border-t-2 border-t-primary' : '',
        isDragOver && !dropAbove ? 'border-b-2 border-b-primary' : '',
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
          <span className="text-sm font-medium truncate block">
            {isScene ? entry.scene?.setting : (entry.bannerLabel || entry.bannerType?.replace('_', ' '))}
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
        <td className="px-2 py-2 w-24">
          <span className="text-xs opacity-70 truncate block max-w-[80px]">
            {isScene ? (entry.scene?.location?.name ?? '') : ''}
          </span>
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

      {/* Start time */}
      <td className="px-2 py-2 text-right w-24">
        <span className="text-xs font-mono tabular-nums opacity-80 whitespace-nowrap">
          {entry.computedStartTime ? formatHHmm(entry.computedStartTime) : '—'}
        </span>
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
}>(function EntryKebabMenu({
  pos, entry, otherDays, onClose, onEdit, onDelete, onMoveToBoneyard, onMoveToDay, onEditBanner,
}, ref) {
  const [moveDayOpen, setMoveDayOpen] = useState(false)

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
      {otherDays.length > 0 && (
        <div className="relative">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
            onClick={() => setMoveDayOpen(v => !v)}
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
                  Day {i + 1} — {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
