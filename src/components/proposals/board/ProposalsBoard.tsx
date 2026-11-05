'use client'

// /proposals board: flush square columns with grey header bands, plain white
// cards with Notion-style badges (approved mockup v4). Status changes go
// through the card menu — no drag-and-drop, since dropping into "Sent" would
// mark a proposal sent without sending it.

import { useRouter } from 'next/navigation'
import { SL } from '@/components/shot-list/styles'
import { ClientLogo } from '@/components/projects/table/ProjectsTable'
import { formatMoney } from '@/lib/money'
import { BOARD_COLUMNS, badges, boardColumn, shortDate, stage, type DealRow } from '@/lib/proposals-board'
import { Badge, DealMenu, EyeIcon, type DealActions } from './parts'

export function ProposalsBoard({ rows, showMoney, actions, onDraftNew }: {
  rows: DealRow[]
  showMoney: boolean
  actions: DealActions
  /** "+ Draft a proposal" under Not started; omitted when nothing is draftable. */
  onDraftNew?: () => void
}) {
  const router = useRouter()
  const { now } = actions

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[1100px] grid-cols-5">
        {BOARD_COLUMNS.map(col => {
          const cards = rows.filter(r => boardColumn(r, now) === col.key)
          const total = cards.reduce((s, r) => s + (r.valueCents ?? 0), 0)
          return (
            <div key={col.key} className="min-h-[460px] border-r border-[#EEEDEA] last:border-r-0">
              <div className={`flex items-center gap-2 whitespace-nowrap border-b border-[#EEEDEA] ${SL.band} px-4 py-3.5 text-sm`}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: col.dot }} />
                {col.label(now)}
                <span className={`rounded-full bg-[#F0EFEC] px-2 text-xs ${SL.t2}`}>{cards.length}</span>
                {showMoney && <span className={`ml-auto text-[13px] ${SL.t2}`}>{formatMoney(total)}</span>}
              </div>

              {cards.map(r => {
                const p = r.proposal
                const st = stage(r, now)
                return (
                  <div
                    key={r.key} role="link" tabIndex={0}
                    onClick={() => router.push(`/projects/${r.project.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter') router.push(`/projects/${r.project.id}`) }}
                    className={`m-2.5 cursor-pointer rounded-[4px] border border-[#EEEDEA] bg-white p-3 hover:border-[#D9D5CE] hover:bg-[#FCFBFA] ${actions.pendingKey === r.key ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ClientLogo client={r.client} size={28} />
                      <div className="min-w-0">
                        <span className="block text-sm leading-snug">{r.project.name}</span>
                        <span className={`block truncate text-[12.5px] ${SL.t2}`}>{r.client.name}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-baseline justify-between">
                      <span className="text-base font-medium tracking-[-0.02em]">{showMoney ? (r.valueCents ? formatMoney(r.valueCents) : '—') : ''}</span>
                      <span className={`text-[12.5px] ${SL.t2}`}>{p ? `v${p.version}` : r.hasBudget ? 'budget' : ''}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">{badges(r, now).map(b => <Badge key={b.text} {...b} />)}</div>
                    <div className={`mt-2.5 flex items-center gap-2 whitespace-nowrap border-t border-[#EEEDEA] pt-2 text-xs ${SL.t2}`}>
                      {!p ? <span>{r.hasBudget ? 'Budget ready' : 'No budget yet'}</span>
                        : p.status === 'DRAFT' ? <span>Not sent</span>
                        : p.viewCount > 0 ? <span className="flex items-center gap-1"><EyeIcon />{p.viewCount}×</span>
                        : <span>Sent {shortDate(p.sentAt)}</span>}
                      <span className="flex-1" />
                      {p?.expiresAt && st === 'out' && <span>Exp {shortDate(p.expiresAt)}</span>}
                      <DealMenu row={r} actions={actions} size={24} />
                    </div>
                  </div>
                )
              })}

              {col.key === 'ns' && onDraftNew && (
                <button type="button" onClick={onDraftNew} className="m-2.5 block px-0.5 py-1 text-[13.5px] text-primary hover:underline">＋ Draft a proposal</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
