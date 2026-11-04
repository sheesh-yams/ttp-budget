'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Columns3, Copy, Download, ExternalLink, LayoutGrid, Link2, Plus, Rows3, Search, Unlink, Trash2, Pencil } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SaveScope, SaveStatusLine, useSaveScope } from '@/components/autosave/SaveScope'
import {
  addShot, addShotSection, deleteShot, deleteShotSection, moveShot, reorderShotSections, setShotListColumns,
  setShotListShare, setShotStatus, unlinkShotSectionScene, updateShotSection,
} from '@/server/actions/shot-list'
import {
  OPTIONAL_COLUMNS, shotCode, shotCounts,
  type ColumnPrefs, type OptionalColumn, type ShotListView, type ShotSceneInfo, type ShotSectionView, type ShotStatusValue, type ShotView,
} from '@/lib/shot-list'
import { ShotDrawer, type DrawerShot } from './ShotDrawer'
import { SectionMenuButton, ShotStoryboard, ShotTable, type SectionRow } from './ShotViews'
import { SL } from './styles'

export interface ShotListClientProps {
  projectId:   string
  projectName: string
  canEdit:     boolean
  list:        ShotListView
  scenes:      Record<string, ShotSceneInfo>
  days:        { key: string; label: string }[]
}

export function ShotListClient(props: ShotListClientProps) {
  return <SaveScope><ShotListInner {...props} /></SaveScope>
}

type StatusFilter = 'ALL' | ShotStatusValue
const errorOf = (r: { success: boolean }) => (r as { success: false; error: string }).error

function ShotListInner({ projectId, projectName, canEdit, list, scenes, days }: ShotListClientProps) {
  const scope = useSaveScope()
  const { confirm, ConfirmDialog } = useConfirm()
  const [sections, setSections] = useState<ShotSectionView[]>(list.sections)
  const [prefs, setPrefs]       = useState<ColumnPrefs>(list.columnPrefs)
  const [share, setShare]       = useState({ token: list.publicToken, enabled: list.shareEnabled, expiresAt: list.shareExpiresAt })
  const [view, setView]         = useState<'table' | 'board'>('table')
  const [tab, setTab]           = useState<string>('all')
  const [filter, setFilter]     = useState<StatusFilter>('ALL')
  const [q, setQ]               = useState('')
  const [openId, setOpenId]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  // ─── Derived ────────────────────────────────────────────────────────────────

  const metaOf = (sec: ShotSectionView) => {
    const scene = sec.sceneId ? scenes[sec.sceneId] : undefined
    return {
      scene,
      label: scene ? `${scene.sceneNumber ? `Sc. ${scene.sceneNumber} · ` : ''}${scene.heading}` : sec.title,
      color: scene?.color ?? '#CFCBC5',
      dayKey: scene?.dayKey ?? null,
      dayLabel: scene?.dayLabel ?? null,
    }
  }

  const codes = useMemo(() => {
    const m = new Map<string, string>()
    sections.forEach((sec, si) => {
      const scene = sec.sceneId ? scenes[sec.sceneId] ?? null : null
      sec.shots.forEach((s, i) => m.set(s.id, shotCode(sec, scene, si, i)))
    })
    return m
  }, [sections, scenes])

  const inTab = (sec: ShotSectionView) => {
    if (tab === 'all') return true
    const d = metaOf(sec).dayKey
    return tab === 'none' ? !d : d === tab
  }
  const tabSections = sections.filter(inTab)
  const tabShots = tabSections.flatMap(s => s.shots)
  const counts = shotCounts(tabShots)
  const refCount = tabShots.reduce((n, s) => n + s.references.length, 0)

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const sec of sections) {
      const k = (sec.sceneId && scenes[sec.sceneId]?.dayKey) || 'none'
      m.set(k, (m.get(k) ?? 0) + sec.shots.length)
    }
    return m
  }, [sections, scenes])

  const needle = q.trim().toLowerCase()
  const filtering = filter !== 'ALL' || !!needle
  const rows: SectionRow[] = tabSections.map(sec => {
    const meta = metaOf(sec)
    const shots = sec.shots
      .filter(s => filter === 'ALL' || s.status === filter)
      .filter(s => !needle || [codes.get(s.id), s.description, s.subject, s.size, s.angle, s.movement, s.lens, s.equipment, s.cast, s.location]
        .some(v => v?.toLowerCase().includes(needle)))
      .map(shot => ({ shot, code: codes.get(shot.id) ?? '' }))
    return { id: sec.id, label: meta.label, color: meta.color, dayLabel: meta.dayLabel, meta: null, isScene: !!meta.scene, total: sec.shots.length, shots }
  }).filter(r => !filtering || r.shots.length > 0)

  const openShot: DrawerShot | null = (() => {
    if (!openId) return null
    for (const sec of sections) {
      const shot = sec.shots.find(s => s.id === openId)
      if (shot) { const m = metaOf(sec); return { shot, code: codes.get(shot.id) ?? '', sectionLabel: m.label, sectionColor: m.color } }
    }
    return null
  })()

  // ─── Mutations (optimistic; errors show inline) ─────────────────────────────

  const patchShot = (id: string, patch: Partial<ShotView>) =>
    setSections(prev => prev.map(sec => ({ ...sec, shots: sec.shots.map(s => (s.id === id ? { ...s, ...patch } : s)) })))

  async function run<T extends { success: boolean }>(p: Promise<T>, undo?: () => void): Promise<T> {
    const res = await scope.track(p)
    if (!res.success) { setError(errorOf(res)); undo?.() } else setError(null)
    return res
  }

  function onStatus(id: string, status: ShotStatusValue) {
    const before = sections.flatMap(s => s.shots).find(s => s.id === id)?.status
    patchShot(id, { status })
    void run(setShotStatus(id, status), () => before && patchShot(id, { status: before }))
  }

  async function onAddShot(sectionId: string) {
    const res = await run(addShot(sectionId))
    if (!res.success) return
    setSections(prev => prev.map(sec => (sec.id === sectionId ? { ...sec, shots: [...sec.shots, res.data] } : sec)))
    setOpenId(res.data.id)
  }

  async function onNewShot() {
    const target = rows.at(-1)?.id ?? tabSections.at(-1)?.id ?? sections.at(-1)?.id
    if (target) return onAddShot(target)
    const sec = await run(addShotSection(projectId, { title: 'Shots' }))
    if (!sec.success) return
    setSections(prev => [...prev, sec.data])
    await onAddShot(sec.data.id)
  }

  // Undo reverses only the failed change, never a whole snapshot — edits made
  // while the call was in flight (a new shot, drawer typing) are kept.
  const findShot = (list: ShotSectionView[], id: string) => {
    for (const sec of list) {
      const i = sec.shots.findIndex(s => s.id === id)
      if (i >= 0) return { shot: sec.shots[i], sectionId: sec.id, index: i }
    }
    return null
  }
  const withoutShot = (list: ShotSectionView[], id: string) => list.map(sec => ({ ...sec, shots: sec.shots.filter(s => s.id !== id) }))
  const withShot = (list: ShotSectionView[], shot: ShotView, sectionId: string, index: number) => list.map(sec => {
    if (sec.id !== sectionId) return sec
    const shots = [...sec.shots]
    shots.splice(Math.min(Math.max(index, 0), shots.length), 0, { ...shot, sectionId })
    return { ...sec, shots }
  })

  async function onDeleteShot(id: string) {
    // The panel is modal (it blocks clicks outside it), so close it before
    // asking — and reopen it if the delete is cancelled.
    const reopen = openId === id
    setOpenId(null)
    if (!await confirm('Delete this shot and its references?', { title: 'Delete shot', confirmLabel: 'Delete shot' })) {
      if (reopen) setOpenId(id)
      return
    }
    const at = findShot(sections, id)
    if (!at) return
    setSections(prev => withoutShot(prev, id))
    void run(deleteShot(id), () => setSections(prev => (findShot(prev, id) ? prev : withShot(prev, at.shot, at.sectionId, at.index))))
  }

  function onMoveShot(shotId: string, toSectionId: string, beforeShotId: string | null) {
    const from = findShot(sections, shotId)
    if (!from) return
    const without = withoutShot(sections, shotId)
    const target = without.find(s => s.id === toSectionId)
    if (!target) return
    const i = beforeShotId ? target.shots.findIndex(s => s.id === beforeShotId) : -1
    const next = withShot(without, from.shot, toSectionId, i < 0 ? target.shots.length : i)
    setSections(next)
    const ids = next.find(s => s.id === toSectionId)!.shots.map(s => s.id)
    void run(moveShot(shotId, toSectionId, ids), () => setSections(prev => {
      const now = findShot(prev, shotId)
      return now ? withShot(withoutShot(prev, shotId), now.shot, from.sectionId, from.index) : prev
    }))
  }

  async function onAddSection(input: { title?: string; sceneId?: string }) {
    const res = await run(addShotSection(projectId, input))
    if (res.success) setSections(prev => [...prev, res.data])
  }

  function onMoveSection(id: string, dir: -1 | 1) {
    const i = sections.findIndex(s => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= sections.length) return
    const otherId = sections[j].id
    const swap = (list: ShotSectionView[]) => {
      const a = list.findIndex(s => s.id === id), b = list.findIndex(s => s.id === otherId)
      if (a < 0 || b < 0) return list
      const out = [...list]
      ;[out[a], out[b]] = [out[b], out[a]]
      return out
    }
    const next = swap(sections)
    setSections(next)
    void run(reorderShotSections(projectId, next.map(s => s.id)), () => setSections(swap))
  }

  async function onDeleteSection(id: string) {
    const sec = sections.find(s => s.id === id)
    if (!sec) return
    const n = sec.shots.length
    if (!await confirm(n ? `Delete “${metaOf(sec).label}” and its ${n} ${n === 1 ? 'shot' : 'shots'}?` : `Delete “${metaOf(sec).label}”?`, { title: 'Delete section', confirmLabel: 'Delete section' })) return
    const index = sections.indexOf(sec)
    setSections(prev => prev.filter(s => s.id !== id))
    void run(deleteShotSection(id), () => setSections(prev => {
      if (prev.some(s => s.id === id)) return prev
      const out = [...prev]
      out.splice(Math.min(index, out.length), 0, sec)
      return out
    }))
  }

  async function onUnlink(id: string) {
    const res = await run(unlinkShotSectionScene(id))
    if (res.success) setSections(prev => prev.map(s => (s.id === id ? { ...s, sceneId: null, code: res.data.code } : s)))
  }

  function onRenameSection(id: string, patch: { title?: string; code?: string }) {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, ...(patch.title ? { title: patch.title } : {}), ...(patch.code !== undefined ? { code: patch.code.toUpperCase() || null } : {}) } : s)))
    void run(updateShotSection(id, patch))
  }

  async function onColumns(key: OptionalColumn) {
    const visible = prefs.visible.includes(key) ? prefs.visible.filter(k => k !== key) : [...prefs.visible, key]
    const before = prefs
    setPrefs({ visible: OPTIONAL_COLUMNS.map(c => c.key).filter(k => visible.includes(k)) })
    if (canEdit) void run(setShotListColumns(projectId, visible), () => setPrefs(before))
  }

  async function onShare(on: boolean) {
    const res = await run(setShotListShare(projectId, on))
    if (res.success) setShare({ token: res.data.publicToken, enabled: res.data.shareEnabled, expiresAt: res.data.shareExpiresAt })
  }

  const linkedSceneIds = new Set(sections.map(s => s.sceneId).filter(Boolean))
  const unlinkedScenes = Object.values(scenes).filter(s => !linkedSceneIds.has(s.id))

  const sectionMenu = (id: string) => {
    if (!canEdit) return null
    const sec = sections.find(s => s.id === id)
    if (!sec) return null
    const i = sections.indexOf(sec)
    return (
      <SectionMenu
        sec={sec} first={i === 0} last={i === sections.length - 1}
        onRename={p => onRenameSection(id, p)} onMove={d => onMoveSection(id, d)}
        onUnlink={sec.sceneId ? () => onUnlink(id) : undefined} onDelete={() => onDeleteSection(id)}
      />
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'all', label: 'All shots', count: sections.reduce((n, s) => n + s.shots.length, 0) },
    ...days.filter(d => dayCounts.has(d.key)).map(d => ({ key: d.key, label: d.label, count: dayCounts.get(d.key) ?? 0 })),
    ...(dayCounts.has('none') && dayCounts.size > 1 ? [{ key: 'none', label: 'No shoot day', count: dayCounts.get('none') ?? 0 }] : []),
  ]
  const empty = sections.length === 0

  return (
    // Flush white page, Ramp-style: escape the content padding (p-4 / md:p-6).
    <div className="-mx-4 min-h-[calc(100vh-52px)] bg-white pb-24 text-[#1A1A1A] md:-m-6 md:pb-10">
      {ConfirmDialog}

      {/* Header */}
      <div className="px-4 pt-6 md:px-10 md:pt-8">
        <div className={`text-[15px] ${SL.t2}`}>{projectName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="mr-auto text-[34px] font-medium leading-tight tracking-[-0.035em] md:text-[44px]">Shot list</h1>
          <SaveStatusLine />
          <a href={`/api/pdf/shot-list/${projectId}`} target="_blank" rel="noopener noreferrer" className={SL.btn}><Download className="h-4 w-4" /> <span className="hidden sm:inline">Download PDF</span><span className="sm:hidden">PDF</span></a>
          {canEdit && <SharePopover share={share} onShare={onShare} />}
          {canEdit && <button type="button" onClick={() => void onNewShot()} className={SL.btnPrimary}><Plus className="h-4 w-4" /> New shot</button>}
        </div>

        {tabs.length > 1 && (
          <div className="mt-5 flex gap-7 overflow-x-auto border-b border-[#EEEDEA]">
            {tabs.map(t => (
              <button
                key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-0.5 pb-3 pt-2 text-[15px] ${tab === t.key ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'}`}
              >
                {t.label}
                <span className={`rounded-full px-2 text-xs ${tab === t.key ? 'bg-accent font-medium text-accent-foreground' : 'bg-[#F0EFEC] text-[#6B6B6B]'}`}>{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {!empty && (
        <div className="flex flex-wrap gap-x-14 gap-y-4 px-4 py-6 md:px-10 md:py-7">
          <Stat label="Shots done">
            <span className="text-primary">{counts.done}</span> <span className="text-lg font-normal tracking-normal text-[#9A9A9A]">of {counts.planned}</span>
            <div className="mt-2.5 flex h-1 w-44 overflow-hidden rounded-full bg-[#F0EFEC]">
              <i className="block bg-primary" style={{ width: `${counts.total ? (counts.done / counts.total) * 100 : 0}%` }} />
              <i className="block bg-[#D7D3DD]" style={{ width: `${counts.total ? (counts.skipped / counts.total) * 100 : 0}%` }} />
            </div>
          </Stat>
          <Stat label="Skipped">{counts.skipped}</Stat>
          <Stat label="Still to shoot">{counts.toShoot}</Stat>
          <Stat label="References">{refCount}</Stat>
        </div>
      )}

      {/* Toolbar */}
      {!empty && (
        <div className={`flex flex-wrap items-center gap-2 border-y border-[#EEEDEA] ${SL.band} px-4 py-3 md:px-10`}>
          <label className="flex w-full items-center gap-2 rounded-full border border-[#E2E0DC] bg-white px-4 py-2 sm:w-64">
            <Search className={`h-4 w-4 ${SL.mut}`} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search shots…" className="w-full bg-transparent text-sm placeholder:text-[#9A9A9A] focus:outline-none" />
          </label>
          {(['ALL', 'TO_SHOOT', 'DONE', 'SKIPPED'] as const).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`${SL.chip} ${filter === f ? SL.chipOn : SL.chipOff}`}>
              {f === 'ALL' ? 'All' : f === 'TO_SHOOT' ? 'To shoot' : f === 'DONE' ? 'Done' : 'Skipped'}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button type="button" title="Table" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`${SL.iconBtn} ${view === 'table' ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-[#E2E0DC] text-[#6B6B6B]'}`}><Rows3 className="h-4 w-4" /></button>
            <button type="button" title="Storyboard" aria-pressed={view === 'board'} onClick={() => setView('board')} className={`${SL.iconBtn} ${view === 'board' ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-[#E2E0DC] text-[#6B6B6B]'}`}><LayoutGrid className="h-4 w-4" /></button>
            <ColumnsPopover prefs={prefs} onToggle={onColumns} />
          </div>
        </div>
      )}

      {error && <p className="border-b border-[#EEEDEA] bg-amber-50 px-4 py-2 text-sm text-amber-800 md:px-10" role="alert">{error}</p>}

      {/* Body */}
      {empty ? (
        <EmptyState canEdit={canEdit} scenes={unlinkedScenes} onAddSection={onAddSection} onNewShot={onNewShot} />
      ) : rows.length === 0 ? (
        <p className={`px-4 py-12 text-center text-sm md:px-10 ${SL.t2}`}>No shots match.</p>
      ) : view === 'table' ? (
        <ShotTable rows={rows} columns={prefs.visible} canEdit={canEdit} canReorder={!filtering} onOpen={setOpenId} onStatus={onStatus} onAddShot={onAddShot} onMoveShot={onMoveShot} sectionMenu={sectionMenu} />
      ) : (
        <ShotStoryboard rows={rows} canEdit={canEdit} onOpen={setOpenId} onStatus={onStatus} onAddShot={onAddShot} sectionMenu={sectionMenu} />
      )}

      {!empty && canEdit && (
        <div className="px-4 py-5 md:px-10">
          <AddSectionPopover scenes={unlinkedScenes} onAdd={onAddSection} />
        </div>
      )}

      <ShotDrawer
        open={!!openShot} current={openShot} canEdit={canEdit}
        onClose={() => setOpenId(null)} onLocalChange={patchShot} onStatus={onStatus} onDelete={onDeleteShot}
      />
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-[13.5px] ${SL.t2}`}>{label}</div>
      <div className="mt-1 text-[32px] font-medium leading-tight tracking-[-0.03em]">{children}</div>
    </div>
  )
}

function ColumnsPopover({ prefs, onToggle }: { prefs: ColumnPrefs; onToggle: (k: OptionalColumn) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Columns" className={`${SL.iconBtn} hidden border-[#E2E0DC] text-[#6B6B6B] md:grid`}><Columns3 className="h-4 w-4" /></button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 rounded-[4px] p-1.5">
        <p className={`px-2 pb-1.5 pt-1 text-xs ${SL.mut}`}>Extra columns in the table</p>
        {OPTIONAL_COLUMNS.map(c => {
          const on = prefs.visible.includes(c.key)
          return (
            <button key={c.key} type="button" onClick={() => onToggle(c.key)} className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-[#FAF9F7]">
              <span className={`grid h-4 w-4 place-items-center rounded-[3px] border ${on ? 'border-primary bg-primary text-white' : 'border-[#CFCBC5]'}`}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
              {c.label}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function SharePopover({ share, onShare }: { share: { token: string | null; enabled: boolean; expiresAt: string | null }; onShare: (on: boolean) => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const url = share.token && typeof window !== 'undefined' ? `${window.location.origin}/sl/${share.token}` : ''
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={SL.btn}><Link2 className="h-4 w-4" /> <span className="hidden sm:inline">Share link</span>{share.enabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}</button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-[4px] p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={share.enabled} disabled={busy}
            onChange={async e => { setBusy(true); await onShare(e.target.checked); setBusy(false) }} />
          <span>
            <span className="block text-sm font-medium">View-only link</span>
            <span className={`block text-xs leading-relaxed ${SL.t2}`}>Anyone with the link sees the storyboard and each shot’s status — never notes, prices or crew details. Turning it off cancels the link; turning it back on makes a new one.</span>
          </span>
        </label>
        {share.enabled && url && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-1.5">
              <input readOnly value={url} className={`${SL.input} text-xs`} onFocus={e => e.target.select()} />
              <button type="button" className={SL.btn} onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className={`flex items-center justify-between text-xs ${SL.t2}`}>
              <span>{copied ? 'Copied' : share.expiresAt ? `Works until ${new Date(share.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[#1A1A1A]">Open <ExternalLink className="h-3 w-3" /></a>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function AddSectionPopover({ scenes, onAdd, trigger }: { scenes: ShotSceneInfo[]; onAdd: (i: { title?: string; sceneId?: string }) => Promise<void>; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? <button type="button" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add section, or link a scene from the Schedule</button>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-[4px] p-0">
        <form className="flex gap-1.5 border-b border-[#EEEDEA] p-3" onSubmit={async e => { e.preventDefault(); if (!title.trim()) return; await onAdd({ title }); setTitle(''); setOpen(false) }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="New section, e.g. Product / B-roll" className={SL.input} autoFocus />
          <button type="submit" className={SL.btnPrimary} disabled={!title.trim()}>Add</button>
        </form>
        <div className="max-h-72 overflow-y-auto p-1.5">
          <p className={`px-2 pb-1 pt-1 text-xs ${SL.mut}`}>{scenes.length ? 'Or link a scene from the Schedule' : 'Every scheduled scene is already linked.'}</p>
          {scenes.map(s => (
            <button key={s.id} type="button" onClick={async () => { await onAdd({ sceneId: s.id }); setOpen(false) }} className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-[#FAF9F7]">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
              <span className="truncate">{s.sceneNumber ? `Sc. ${s.sceneNumber} · ` : ''}{s.heading}</span>
              {s.dayLabel && <span className={`ml-auto shrink-0 text-xs ${SL.mut}`}>{s.dayLabel.split(' · ')[0]}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SectionMenu({ sec, first, last, onRename, onMove, onUnlink, onDelete }: {
  sec: ShotSectionView; first: boolean; last: boolean
  onRename: (p: { title?: string; code?: string }) => void
  onMove: (d: -1 | 1) => void; onUnlink?: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(sec.title)
  const [code, setCode] = useState(sec.code ?? '')
  const item = 'flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-[#FAF9F7] disabled:opacity-40'
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) { setTitle(sec.title); setCode(sec.code ?? '') } }}>
      <PopoverTrigger asChild><SectionMenuButton /></PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-[4px] p-1.5" onClick={e => e.stopPropagation()}>
        {!sec.sceneId && (
          <form className="space-y-1.5 border-b border-[#EEEDEA] p-1.5 pb-2.5" onSubmit={e => { e.preventDefault(); onRename({ title: title.trim() || sec.title, code }); setOpen(false) }}>
            <label className={`block text-xs ${SL.mut}`}>Section name</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className={SL.input} />
            <div className="flex items-end gap-1.5">
              <div className="w-24">
                <label className={`block text-xs ${SL.mut}`}>Shot prefix</label>
                <input value={code} onChange={e => setCode(e.target.value.slice(0, 4))} placeholder="B" className={`${SL.input} uppercase`} />
              </div>
              <button type="submit" className={`${SL.btn} ml-auto`}><Pencil className="h-3.5 w-3.5" /> Save</button>
            </div>
          </form>
        )}
        <div className="pt-1">
          <button type="button" className={item} disabled={first} onClick={() => { onMove(-1); setOpen(false) }}><ArrowUp className="h-4 w-4" /> Move up</button>
          <button type="button" className={item} disabled={last} onClick={() => { onMove(1); setOpen(false) }}><ArrowDown className="h-4 w-4" /> Move down</button>
          {onUnlink && <button type="button" className={item} onClick={() => { onUnlink(); setOpen(false) }}><Unlink className="h-4 w-4" /> Unlink scene</button>}
          <button type="button" className={`${item} text-destructive`} onClick={() => { setOpen(false); onDelete() }}><Trash2 className="h-4 w-4" /> Delete section</button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function EmptyState({ canEdit, scenes, onAddSection, onNewShot }: {
  canEdit: boolean; scenes: ShotSceneInfo[]
  onAddSection: (i: { title?: string; sceneId?: string }) => Promise<void>; onNewShot: () => Promise<void>
}) {
  return (
    <div className="mx-4 my-10 rounded-[4px] border border-dashed border-[#D3D0CB] px-6 py-14 text-center md:mx-10">
      <p className="text-lg font-medium">No shots yet</p>
      <p className={`mx-auto mt-1.5 max-w-md text-sm ${SL.t2}`}>
        {canEdit
          ? 'Link scenes from the Schedule to group shots by scene and shoot day, or start a free section for product shots and B-roll.'
          : 'Nobody has added shots to this project yet.'}
      </p>
      {canEdit && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <AddSectionPopover scenes={scenes} onAdd={onAddSection} trigger={<button type="button" className={SL.btn}><Plus className="h-4 w-4" /> Add a section or scene</button>} />
          <button type="button" onClick={() => void onNewShot()} className={SL.btnPrimary}><Plus className="h-4 w-4" /> New shot</button>
        </div>
      )}
    </div>
  )
}
