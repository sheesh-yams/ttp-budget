'use client'

import { Fragment, useState } from 'react'
import { GripVertical, ImagePlus, Link2, MoreHorizontal, Plus } from 'lucide-react'
import { OPTIONAL_COLUMNS, type OptionalColumn, type ShotStatusValue, type ShotView } from '@/lib/shot-list'
import { StatusBox } from './StatusBox'
import { SL } from './styles'

export interface SectionRow {
  id:        string
  label:     string
  color:     string
  dayLabel:  string | null
  meta:      string | null       // "Ritual flat" — not used yet, reserved for location
  isScene:   boolean
  total:     number              // all shots in the section (unfiltered)
  shots:     { shot: ShotView; code: string }[]  // after filters
}

interface Handlers {
  canEdit:      boolean
  onOpen:       (shotId: string) => void
  onStatus:     (shotId: string, s: ShotStatusValue) => void
  onAddShot:    (sectionId: string) => void
  onMoveShot:   (shotId: string, toSectionId: string, beforeShotId: string | null) => void
  sectionMenu:  (sectionId: string) => React.ReactNode
}

export function Thumb({ shot, className = 'w-[104px]', onEmpty }: { shot: ShotView; className?: string; onEmpty?: () => void }) {
  const hero = shot.references[0]
  const more = shot.references.length - 1
  const vertical = shot.aspect === '9:16' || shot.aspect === '4:5'
  if (!hero) {
    return (
      <button type="button" onClick={onEmpty} className={`grid aspect-video place-items-center rounded-[3px] border border-dashed border-[#D3D0CB] text-[11.5px] ${SL.mut} ${className}`}>
        <span className="inline-flex items-center gap-1"><ImagePlus className="h-3.5 w-3.5" /> Reference</span>
      </button>
    )
  }
  return (
    <div className={`relative overflow-hidden rounded-[3px] bg-[#F3F2EF] ${vertical ? 'aspect-[9/16] !w-[42px]' : 'aspect-video'} ${className}`}>
      {hero.imageUrl
        ? <img src={hero.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <div className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] ${SL.t2}`}><Link2 className="h-3.5 w-3.5" /><span className="max-w-full truncate px-1">{hero.sourceHost}</span></div>}
      {more > 0 && <span className="absolute bottom-1 right-1 rounded-[3px] bg-black/55 px-1.5 text-[10.5px] font-medium text-white">+{more}</span>}
    </div>
  )
}

function optionalCell(shot: ShotView, key: OptionalColumn): string {
  if (key === 'estMinutes') return shot.estMinutes != null ? `${shot.estMinutes} min` : ''
  return (shot[key] as string | null) ?? ''
}

const muted = (s: ShotStatusValue) => (s === 'DONE' ? 'text-[#9A9A9A]' : s === 'SKIPPED' ? 'text-[#BDBDBD] line-through' : '')

// ─── Table (desktop) + compact list (phones) ──────────────────────────────────

/** `canReorder` is off while a filter or search hides shots (a drop would land in the wrong place). */
export function ShotTable({ rows, columns, canReorder = true, ...h }: Handlers & { rows: SectionRow[]; columns: OptionalColumn[]; canReorder?: boolean }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const optional = OPTIONAL_COLUMNS.filter(c => columns.includes(c.key))
  const colCount = 9 + optional.length + (h.canEdit ? 1 : 0)

  function dropOn(sectionId: string, beforeShotId: string | null) {
    if (dragId && dragId !== beforeShotId) h.onMoveShot(dragId, sectionId, beforeShotId)
    setDragId(null); setOverKey(null)
  }

  const th = 'whitespace-nowrap border-b border-[#EEEDEA] px-3.5 py-3 text-left text-[13px] font-normal text-[#6B6B6B]'
  const td = 'border-b border-[#EEEDEA] px-3.5 py-3 align-middle text-sm'
  const vline = 'border-l border-[#EEEDEA]'

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {h.canEdit && <th className={`${th} w-6 pl-4 pr-0`} aria-label="Reorder" />}
              <th className={`${th} ${h.canEdit ? 'pl-2' : 'pl-10'}`}>Status</th>
              <th className={`${th} ${vline}`}>Reference</th>
              <th className={`${th} ${vline}`}>Shot</th>
              <th className={`${th} ${vline}`}>Description</th>
              <th className={`${th} ${vline}`}>Size</th>
              <th className={`${th} ${vline}`}>Angle</th>
              <th className={`${th} ${vline}`}>Movement</th>
              <th className={`${th} ${vline}`}>Lens</th>
              <th className={`${th} ${vline}`}>Equipment</th>
              {optional.map(c => <th key={c.key} className={`${th} ${vline}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(sec => (
              <Fragment key={sec.id}>
                <tr>
                  <td colSpan={colCount} className={`border-b border-[#EEEDEA] ${SL.band} py-0 pl-10 pr-3.5`}
                    onDragOver={e => { if (dragId) e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); dropOn(sec.id, sec.shots[0]?.shot.id ?? null) }}
                  >
                    <SectionHeaderInner sec={sec} menu={h.sectionMenu(sec.id)} />
                  </td>
                </tr>
                {sec.shots.map(({ shot, code }) => (
                  <tr
                    key={shot.id}
                    onClick={() => h.onOpen(shot.id)}
                    draggable={h.canEdit && canReorder}
                    onDragStart={e => { setDragId(shot.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setDragId(null); setOverKey(null) }}
                    onDragOver={e => { if (dragId) { e.preventDefault(); setOverKey(shot.id) } }}
                    onDrop={e => { e.preventDefault(); dropOn(sec.id, shot.id) }}
                    className={`cursor-pointer hover:bg-[#FCFBFA] ${dragId === shot.id ? 'opacity-40' : ''} ${overKey === shot.id && dragId !== shot.id ? 'shadow-[inset_0_2px_0_0_hsl(var(--primary))]' : ''}`}
                  >
                    {h.canEdit && <td className={`${td} w-6 pl-4 pr-0 text-[#C9C6C0] ${canReorder ? 'cursor-grab' : ''}`} onClick={e => e.stopPropagation()}>{canReorder && <GripVertical className="h-4 w-4" />}</td>}
                    <td className={`${td} ${h.canEdit ? 'pl-2' : 'pl-10'}`} onClick={e => e.stopPropagation()}>
                      <StatusBox status={shot.status} onChange={h.canEdit ? s => h.onStatus(shot.id, s) : undefined} />
                    </td>
                    <td className={`${td} ${vline}`}><Thumb shot={shot} onEmpty={() => h.onOpen(shot.id)} /></td>
                    <td className={`${td} ${vline} w-14 whitespace-nowrap font-medium ${muted(shot.status)}`}>{code}</td>
                    <td className={`${td} ${vline} max-w-[340px] leading-snug`}>
                      <span className={`block ${muted(shot.status)}`}>{shot.description || <span className={SL.mut}>No description</span>}</span>
                      {shot.subject && <span className={`mt-0.5 block text-[13px] ${SL.t2}`}>{shot.subject}</span>}
                    </td>
                    <td className={`${td} ${vline}`}>{shot.size && <span className={SL.sizeTag}>{shot.size}</span>}</td>
                    {(['angle', 'movement', 'lens', 'equipment'] as const).map(k => (
                      <td key={k} className={`${td} ${vline} whitespace-nowrap text-[#3A3A3A] ${muted(shot.status)}`}>{shot[k]}</td>
                    ))}
                    {optional.map(c => (
                      <td key={c.key} className={`${td} ${vline} ${c.key === 'notes' ? 'max-w-[240px] text-[13px]' : 'whitespace-nowrap'} text-[#3A3A3A] ${muted(shot.status)}`}>{optionalCell(shot, c.key)}</td>
                    ))}
                  </tr>
                ))}
                {h.canEdit && (
                  <tr
                    onDragOver={e => { if (dragId) { e.preventDefault(); setOverKey(`end:${sec.id}`) } }}
                    onDrop={e => { e.preventDefault(); dropOn(sec.id, null) }}
                  >
                    <td colSpan={colCount} className={`border-b border-[#EEEDEA] py-2.5 pl-10 ${overKey === `end:${sec.id}` ? 'shadow-[inset_0_2px_0_0_hsl(var(--primary))]' : ''}`}>
                      <button type="button" onClick={() => h.onAddShot(sec.id)} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                        <Plus className="h-3.5 w-3.5" /> Add shot
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: compact list for ticking shots on set */}
      <div className="md:hidden">
        {rows.map(sec => (
          <div key={sec.id}>
            <SectionHeader sec={sec} menu={h.sectionMenu(sec.id)} />
            {sec.shots.map(({ shot, code }) => (
              <div key={shot.id} onClick={() => h.onOpen(shot.id)} className="flex items-center gap-3 border-b border-[#EEEDEA] px-4 py-3">
                <div onClick={e => e.stopPropagation()}>
                  <StatusBox status={shot.status} size={24} onChange={h.canEdit ? s => h.onStatus(shot.id, s) : undefined} />
                </div>
                <Thumb shot={shot} className="w-[76px] shrink-0" onEmpty={() => h.onOpen(shot.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px]">
                    <b className={`font-medium ${muted(shot.status)}`}>{code}</b>
                    {shot.size && <span className={SL.sizeTag}>{shot.size}</span>}
                    <span className={`truncate ${SL.t2}`}>{[shot.movement, shot.lens].filter(Boolean).join(' · ')}</span>
                  </div>
                  <p className={`mt-0.5 line-clamp-2 text-sm leading-snug ${muted(shot.status)}`}>{shot.description || <span className={SL.mut}>No description</span>}</p>
                </div>
              </div>
            ))}
            {h.canEdit && (
              <button type="button" onClick={() => h.onAddShot(sec.id)} className="flex w-full items-center gap-1 border-b border-[#EEEDEA] px-4 py-3 text-sm text-primary">
                <Plus className="h-3.5 w-3.5" /> Add shot
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function SectionHeaderInner({ sec, menu }: { sec: SectionRow; menu: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center gap-2.5 py-2">
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: sec.color }} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
        <b className="font-medium text-[#1A1A1A]">{sec.label}</b>
        {sec.dayLabel && <span className="whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-xs text-primary">{sec.dayLabel}</span>}
        <span className={`whitespace-nowrap text-[13px] ${SL.mut}`}>{sec.total} {sec.total === 1 ? 'shot' : 'shots'}</span>
      </div>
      <span className="shrink-0">{menu}</span>
    </div>
  )
}

function SectionHeader({ sec, menu }: { sec: SectionRow; menu: React.ReactNode }) {
  return <div className={`border-b border-t border-[#EEEDEA] ${SL.band} px-4`}><SectionHeaderInner sec={sec} menu={menu} /></div>
}

export function SectionMenuButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label="Section options" {...props} className={`grid h-7 w-7 place-items-center rounded-[4px] ${SL.t2} hover:bg-white hover:text-[#1A1A1A]`}>
      <MoreHorizontal className="h-4 w-4" />
    </button>
  )
}

// ─── Storyboard ───────────────────────────────────────────────────────────────

export function ShotStoryboard({ rows, ...h }: Pick<Handlers, 'canEdit' | 'onOpen' | 'onStatus' | 'onAddShot' | 'sectionMenu'> & { rows: SectionRow[] }) {
  return (
    <div>
      {rows.map(sec => (
        <div key={sec.id}>
          <div className={`border-b border-t border-[#EEEDEA] ${SL.band} px-4 md:px-10`}><SectionHeaderInner sec={sec} menu={h.sectionMenu(sec.id)} /></div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 px-4 py-5 md:px-10">
            {sec.shots.map(({ shot, code }) => (
              <StoryCard key={shot.id} shot={shot} code={code} onOpen={() => h.onOpen(shot.id)} onStatus={h.canEdit ? s => h.onStatus(shot.id, s) : undefined} />
            ))}
            {h.canEdit && (
              <button type="button" onClick={() => h.onAddShot(sec.id)} className={`flex aspect-video items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-[#D3D0CB] text-sm ${SL.t2} hover:border-primary hover:text-primary`}>
                <Plus className="h-4 w-4" /> Add shot
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function StoryCard({ shot, code, onOpen, onStatus }: {
  shot: ShotView; code: string; onOpen?: () => void; onStatus?: (s: ShotStatusValue) => void
}) {
  const hero = shot.references[0]
  return (
    <div onClick={onOpen} className={`overflow-hidden rounded-[4px] border border-[#E2E0DC] bg-white ${onOpen ? 'cursor-pointer hover:border-[#C9C6C0]' : ''}`}>
      <div className="relative aspect-video border-b border-[#EEEDEA] bg-[#F6F5F2]">
        {hero?.imageUrl && <img src={hero.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {hero && !hero.imageUrl && <div className={`flex h-full items-center justify-center gap-1 text-xs ${SL.t2}`}><Link2 className="h-4 w-4" />{hero.sourceHost}</div>}
        <span className="absolute left-2 top-2" onClick={e => e.stopPropagation()}><StatusBox status={shot.status} onChange={onStatus} /></span>
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <div className={`flex flex-wrap items-center gap-2 text-[13px] ${SL.t2}`}>
          <b className="text-sm font-medium text-[#1A1A1A]">{code}</b>
          {shot.size && <span className={SL.sizeTag}>{shot.size}</span>}
          {[shot.movement, shot.lens].filter(Boolean).join(' · ')}
        </div>
        <p className={`mt-1.5 text-[13.5px] leading-snug ${muted(shot.status)}`}>{shot.description || <span className={SL.mut}>No description</span>}</p>
      </div>
    </div>
  )
}
