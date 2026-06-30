'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clapperboard, Plus, GripVertical, MoreHorizontal, Pencil, Trash2,
  ArrowRight, Archive, ArchiveRestore, ChevronDown, FilePlus, Clock,
} from 'lucide-react'
import { getSceneColor, BANNER_COLORS } from '@/lib/schedule-colors'
import { computeEntryTimes } from '@/lib/schedule-compute'
import { SceneModal } from './SceneModal'
import type { SceneRow } from './SceneModal'
import { BannerMenu } from './BannerMenu'
import type { BannerPreset } from './BannerMenu'
import {
  createSchedule,
  createScheduleEntry,
  updateScheduleEntry,
  moveScheduleEntry,
  moveScheduleEntries,
  deleteScheduleEntry,
  archiveScene,
  unarchiveScene,
  deleteScene,
} from '@/server/actions/schedule'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { IntExt, TimeOfDay, BannerType, UserRole } from '@prisma/client'

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
  schedules: { id: string; name: string; isPrimary: boolean }[]
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

  // Drag state
  const dragItem = useRef<{ id: string; multiIds?: string[] } | null>(null)
  const tabHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dropAbove, setDropAbove] = useState(true)

  // Live preview: entries during drag
  const [previewEntries, setPreviewEntries] = useState<EntryRow[] | null>(null)
  const displayEntries = previewEntries ?? entries

  function entriesForDay(dayId: string | null) {
    return displayEntries.filter(e => e.shootDayId === dayId).sort((a, b) => a.orderIndex - b.orderIndex)
  }

  const schedule = schedules.find(s => s.id === activeScheduleId) ?? null

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

  function handleDragStart(entry: EntryRow, event: React.DragEvent<HTMLTableRowElement>) {
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
    }
  }

  function handleDragEnd() {
    dragItem.current = null
    setDragOverId(null)
    setPreviewEntries(null)
    if (tabHoverTimer.current) clearTimeout(tabHoverTimer.current)
  }

  function handleDragOverRow(targetEntry: EntryRow, event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const above = event.clientY < rect.top + rect.height / 2
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

  function handleSceneSaved(sceneId: string) {
    setSceneModalOpen(false)
    if (!editingScene && activeScheduleId && activeTab !== 'boneyard') {
      startTransition(async () => {
        await createScheduleEntry(activeScheduleId, {
          kind: 'SCENE',
          sceneId,
          shootDayId: activeTab,
        })
        onMutated()
      })
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
      />

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{schedule?.name ?? 'Schedule'}</span>
          {schedule?.isPrimary && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">Primary</span>
          )}
        </div>
        {canEdit && (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
            onClick={() => openNewScene()}
          >
            <Plus className="h-3.5 w-3.5" /> Add Scene
          </button>
        )}
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
// ShootDayView
// ─────────────────────────────────────────────────────────────────────────────

interface ShootDayViewProps {
  dayId: string
  day: ShootDayRow
  entries: EntryRow[]
  allDays: ShootDayRow[]
  scheduleId: string
  canEdit: boolean
  selectedIds: Set<string>
  dragOverId: string | null
  dropAbove: boolean
  onDragStart: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
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
  bannerEdit: { entry: EntryRow; label: string; dur: string } | null
  onStartBannerEdit: (entry: EntryRow) => void
  onCommitBannerEdit: () => void
  onCancelBannerEdit: () => void
  onBannerEditChange: (label: string, dur: string) => void
}

function ShootDayView({
  dayId, day, entries, allDays, scheduleId, canEdit,
  selectedIds, dragOverId, dropAbove,
  onDragStart, onDragEnd, onDragOverRow, onDropRow, onDropOnDay,
  onToggleSelect, onEditEntry, onDeleteEntry, onMoveToBoneyard, onMoveToDay,
  onAddScene, onAddBanner,
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
              <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">I/E</th>
              <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Location</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Pages</th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Start</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">End</th>
              <th className="w-8 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 10 : 9} className="py-10 text-center text-sm text-muted-foreground">
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
            onClick={() => {
              window.location.href = `/projects/${allDays[0]?.id ?? ''}/call-sheets/new?shootDayId=${dayId}`
            }}
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
  isSelected: boolean
  isDragOver: boolean
  dropAbove: boolean
  otherDays: ShootDayRow[]
  bannerEdit: { entry: EntryRow; label: string; dur: string } | null
  onDragStart: (entry: EntryRow, e: React.DragEvent<HTMLTableRowElement>) => void
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
  entry, canEdit, isSelected, isDragOver, dropAbove, otherDays, bannerEdit,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onToggleSelect, onEdit, onDelete, onMoveToBoneyard, onMoveToDay,
  onStartBannerEdit, onCommitBannerEdit, onCancelBannerEdit, onBannerEditChange,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isScene = entry.kind === 'SCENE'
  const color = isScene && entry.scene
    ? getSceneColor(entry.scene.intExt, entry.scene.timeOfDay, entry.scene.colorOverride)
    : (BANNER_COLORS[entry.bannerType ?? 'CUSTOM'] ?? BANNER_COLORS['CUSTOM']!)

  return (
    <tr
      id={`entry-${entry.id}`}
      draggable={canEdit}
      onDragStart={e => onDragStart(entry, e)}
      onDragEnd={onDragEnd}
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

      {/* Drag handle */}
      <td className="w-8 pl-1">
        {canEdit && (
          <GripVertical className="h-3.5 w-3.5 opacity-0 group-hover/row:opacity-40 cursor-grab active:cursor-grabbing" />
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
      <td className="px-2 py-2 text-center w-20">
        {isScene && entry.scene && (
          <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-black/10">
            {entry.scene.intExt.replace('_', '/')}
          </span>
        )}
      </td>

      {/* Location */}
      <td className="px-2 py-2 w-24">
        <span className="text-xs opacity-70 truncate block max-w-[80px]">
          {isScene ? (entry.scene?.location?.name ?? '') : ''}
        </span>
      </td>

      {/* Pages */}
      <td className="px-2 py-2 text-center w-16">
        <span className="text-xs tabular-nums opacity-70">
          {isScene && entry.scene?.pageEighths ? pageEighthsToDisplay(entry.scene.pageEighths) : ''}
          {!isScene && entry.bannerDurationMin ? `${entry.bannerDurationMin}m` : ''}
        </span>
      </td>

      {/* Start time */}
      <td className="px-2 py-2 text-right w-20">
        <span className="text-xs font-mono tabular-nums opacity-80">
          {entry.computedStartTime ? formatHHmm(entry.computedStartTime) : '—'}
        </span>
      </td>

      {/* End time */}
      <td className="px-3 py-2 text-right w-20">
        <span className="text-xs font-mono tabular-nums opacity-80">
          {entry.computedEndTime ? formatHHmm(entry.computedEndTime) : '—'}
        </span>
      </td>

      {/* Kebab */}
      <td className="px-1 py-2 w-8">
        {canEdit && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="rounded p-1 opacity-0 group-hover/row:opacity-60 hover:!opacity-100 transition-opacity"
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <EntryKebabMenu
                entry={entry}
                otherDays={otherDays}
                onClose={() => setMenuOpen(false)}
                onEdit={onEdit}
                onDelete={onDelete}
                onMoveToBoneyard={onMoveToBoneyard}
                onMoveToDay={onMoveToDay}
                onEditBanner={onStartBannerEdit}
              />
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EntryKebabMenu
// ─────────────────────────────────────────────────────────────────────────────

function EntryKebabMenu({
  entry, otherDays, onClose, onEdit, onDelete, onMoveToBoneyard, onMoveToDay, onEditBanner,
}: {
  entry: EntryRow
  otherDays: ShootDayRow[]
  onClose: () => void
  onEdit: (e: EntryRow) => void
  onDelete: (e: EntryRow) => void
  onMoveToBoneyard: (e: EntryRow) => void
  onMoveToDay: (id: string, dayId: string) => void
  onEditBanner: (e: EntryRow) => void
}) {
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
    <div className="absolute right-0 top-6 z-30 w-44 rounded-xl border border-border bg-popover shadow-xl py-1 text-foreground">
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
}

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
