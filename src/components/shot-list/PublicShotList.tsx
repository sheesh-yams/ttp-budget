'use client'

import { useState } from 'react'
import { Download, LayoutGrid, Rows3 } from 'lucide-react'
import { shotCounts, type ShotView } from '@/lib/shot-list'
import { StoryCard, Thumb } from './ShotViews'
import { StatusBox } from './StatusBox'
import { SL } from './styles'

export interface PublicSection {
  id: string; label: string; color: string; dayLabel: string | null
  shots: { shot: ShotView; code: string }[]
}

/** The view-only share page body: storyboard (default) or table, read-only. */
export function PublicShotList({ sections, pdfHref }: { sections: PublicSection[]; pdfHref: string }) {
  const [view, setView] = useState<'board' | 'table'>('board')
  const all = sections.flatMap(s => s.shots.map(x => x.shot))
  const c = shotCounts(all)
  return (
    <div>
      <div className={`flex flex-wrap items-center gap-2 border-y border-[#EEEDEA] ${SL.band} px-5 py-3 md:px-10`}>
        <span className={`text-sm ${SL.t2}`}><b className="font-medium text-primary">{c.done}</b> of {c.planned} shots done{c.skipped ? ` · ${c.skipped} skipped` : ''}</span>
        <div className="ml-auto flex gap-2">
          <a href={pdfHref} target="_blank" rel="noopener noreferrer" className={SL.btn}><Download className="h-4 w-4" /> PDF</a>
          <button type="button" title="Storyboard" aria-pressed={view === 'board'} onClick={() => setView('board')} className={`${SL.iconBtn} ${view === 'board' ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-[#E2E0DC] text-[#6B6B6B]'}`}><LayoutGrid className="h-4 w-4" /></button>
          <button type="button" title="Table" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`${SL.iconBtn} ${view === 'table' ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-[#E2E0DC] text-[#6B6B6B]'}`}><Rows3 className="h-4 w-4" /></button>
        </div>
      </div>
      {sections.map(sec => (
        <section key={sec.id}>
          <div className={`flex min-h-[44px] items-center gap-2.5 border-b border-[#EEEDEA] ${SL.band} px-5 py-2 md:px-10`}>
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: sec.color }} />
            <b className="font-medium">{sec.label}</b>
            {sec.dayLabel && <span className="whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-xs text-primary">{sec.dayLabel}</span>}
          </div>
          {view === 'board' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 px-5 py-5 md:px-10">
              {sec.shots.map(({ shot, code }) => <StoryCard key={shot.id} shot={shot} code={code} />)}
            </div>
          ) : (
            <div>
              {sec.shots.map(({ shot, code }) => (
                <div key={shot.id} className="flex items-center gap-4 border-b border-[#EEEDEA] px-5 py-3 md:px-10">
                  <StatusBox status={shot.status} />
                  <Thumb shot={shot} className="w-[88px] shrink-0" />
                  <b className="w-12 shrink-0 text-sm font-medium">{code}</b>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{shot.description}</p>
                    <p className={`mt-0.5 text-[13px] ${SL.t2}`}>{[shot.size, shot.angle, shot.movement, shot.lens, shot.equipment].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
