'use client'

// /proposals list: one table with column dividers, grouped into grey band rows
// by last activity (approved mockup v4). Phones get stacked rows instead.

import Link from 'next/link'
import { Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { SL } from '@/components/shot-list/styles'
import { ClientLogo } from '@/components/projects/table/ProjectsTable'
import { formatMoney } from '@/lib/money'
import { BANDS, badges, band, effectiveStatus, nextLine, shortDate, stage, type BandKey, type DealRow } from '@/lib/proposals-board'
import { DealMenu, OwnerAvatar, PrimaryAction, StatusPill, Badge, TONE_TEXT, type DealActions } from './parts'

const TH = `whitespace-nowrap border-b border-[#EEEDEA] px-3.5 py-3 text-left text-[13.5px] font-normal ${SL.t2} [&+th]:border-l [&+th]:border-[#EEEDEA]`
const TD = 'border-b border-[#EEEDEA] px-3.5 py-3 align-middle text-sm [&+td]:border-l [&+td]:border-[#EEEDEA]'
const DAY = 86_400_000

function ViewsCell({ row }: { row: DealRow }) {
  const p = row.proposal
  if (!p || p.status === 'DRAFT') return <span className={SL.mut}>—</span>
  if (p.viewCount === 0) return <span className={SL.mut}>Not opened</span>
  const lit = Math.min(6, Math.ceil(p.viewCount / 2))
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={`block w-[3px] rounded-[1px] ${i < lit ? 'bg-primary' : 'bg-[#E3DFF0]'}`} style={{ height: 5 + i * 1.6 }} />)}
      </span>
      {p.viewCount}×{p.lastViewedAt && <span className={SL.mut}>· {shortDate(p.lastViewedAt)}</span>}
    </span>
  )
}

function ExpiresCell({ row, now }: { row: DealRow; now: Date }) {
  const p = row.proposal
  if (!p?.expiresAt || stage(row, now) !== 'out') return <span className={SL.mut}>—</span>
  const left = Math.ceil((new Date(p.expiresAt).getTime() - now.getTime()) / DAY)
  return (
    <div className={`whitespace-nowrap ${left <= 14 ? 'text-[#B45309]' : ''}`}>
      {shortDate(p.expiresAt)}
      <small className={`mt-0.5 block text-[12.5px] ${SL.t2}`}>{left <= 0 ? 'today' : `in ${left} ${left === 1 ? 'day' : 'days'}`}</small>
    </div>
  )
}

function VersionCell({ row }: { row: DealRow }) {
  const p = row.proposal
  if (!p) return <span className={SL.mut}>—</span>
  return (
    <span className={`whitespace-nowrap text-[13px] ${SL.t2}`}>
      v{p.version}
      {p.draftAbove ? <span className={SL.mut}> · v{p.draftAbove} draft</span> : p.otherVersions > 0 ? <span className={SL.mut}> · {p.otherVersions} earlier</span> : null}
    </span>
  )
}

export function ProposalsList({ rows, showMoney, actions, collapsed, onToggleBand }: {
  rows: DealRow[]
  showMoney: boolean
  actions: DealActions
  collapsed: Set<BandKey>
  onToggleBand: (k: BandKey) => void
}) {
  const router = useRouter()
  const { now } = actions
  const groups = BANDS.map(b => ({ ...b, rows: rows.filter(r => band(r, now) === b.key) })).filter(g => g.rows.length > 0)
  const cols = showMoney ? 8 : 7

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-[32%] pl-10`}>Proposal</th>
              <th className={TH}>Status</th>
              {showMoney && <th className={`${TH} text-right`}>Value</th>}
              <th className={TH}>Version</th>
              <th className={TH}>Views</th>
              <th className={TH}>Expires</th>
              <th className={TH}>Owner</th>
              <th className={`${TH} pr-7 text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const closed = collapsed.has(g.key)
              const total = g.rows.reduce((s, r) => s + (r.valueCents ?? 0), 0)
              const Icon = g.key === 'ns' ? FileText : CalendarDays
              return (
                <Fragment key={g.key}>
                  <tr className="cursor-pointer" onClick={() => onToggleBand(g.key)}>
                    <td colSpan={cols} className={`border-b border-[#EEEDEA] ${SL.band} py-2.5 pl-10 pr-7 text-sm`}>
                      <div className="flex items-center gap-2.5">
                        {closed ? <ChevronRight className={`h-4 w-4 ${SL.t2}`} /> : <ChevronDown className={`h-4 w-4 ${SL.t2}`} />}
                        <Icon className={`h-[15px] w-[15px] ${SL.t2}`} />
                        <span className="font-medium">{g.label}</span>
                        <span className={`rounded-full bg-[#F0EFEC] px-2 text-xs ${SL.t2}`}>{g.rows.length}</span>
                        {showMoney && <span className={`ml-auto text-[13px] ${SL.t2}`}>{formatMoney(total)}</span>}
                      </div>
                    </td>
                  </tr>
                  {!closed && g.rows.map(r => {
                    const line = nextLine(r, now)
                    const status = effectiveStatus(r, now)
                    return (
                      <tr key={r.key} onClick={() => router.push(`/projects/${r.project.id}`)} className={`cursor-pointer hover:bg-[#FCFBFA] ${actions.pendingKey === r.key ? 'opacity-50' : ''}`}>
                        <td className={`${TD} pl-10`}>
                          <div className="flex min-w-[250px] items-center gap-3">
                            <ClientLogo client={r.client} size={36} />
                            <div className="min-w-0">
                              <Link href={`/projects/${r.project.id}`} onClick={e => e.stopPropagation()} className="block truncate text-[15px] hover:underline">{r.project.name}</Link>
                              <span className={`block truncate text-[12.5px] ${SL.t2}`}>{r.client.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className={TD}>
                          <StatusPill status={status} />
                          {line.text && <div className={`mt-1 whitespace-nowrap text-[12.5px] ${TONE_TEXT[line.tone]}`}>{line.text}</div>}
                        </td>
                        {showMoney && (
                          <td className={`${TD} whitespace-nowrap text-right`}>
                            <b className="font-medium">{r.valueCents ? formatMoney(r.valueCents) : '—'}</b>
                            {!r.proposal && r.valueCents ? <small className={`mt-0.5 block text-[12.5px] ${SL.t2}`}>budget</small> : null}
                          </td>
                        )}
                        <td className={TD}><VersionCell row={r} /></td>
                        <td className={TD}><ViewsCell row={r} /></td>
                        <td className={TD}><ExpiresCell row={r} now={now} /></td>
                        <td className={TD}><OwnerAvatar owner={r.owner} /></td>
                        <td className={`${TD} pr-7`}>
                          <div className="flex justify-end gap-1.5"><PrimaryAction row={r} actions={actions} /><DealMenu row={r} actions={actions} /></div>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked rows */}
      <div className="md:hidden">
        {groups.map(g => (
          <Fragment key={g.key}>
            <div className={`flex items-center gap-2 border-b border-[#EEEDEA] ${SL.band} px-4 py-2 text-[13px]`}>
              <span className="font-medium">{g.label}</span>
              <span className={`rounded-full bg-[#F0EFEC] px-2 text-xs ${SL.t2}`}>{g.rows.length}</span>
            </div>
            {g.rows.map(r => (
              <Link key={r.key} href={`/projects/${r.project.id}`} className="flex items-start gap-3 border-b border-[#EEEDEA] px-4 py-3">
                <ClientLogo client={r.client} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px]">{r.project.name}</span>
                    {showMoney && r.valueCents ? <span className="ml-auto whitespace-nowrap text-sm font-medium">{formatMoney(r.valueCents)}</span> : null}
                  </div>
                  <span className={`block truncate text-[12.5px] ${SL.t2}`}>{r.client.name}</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{badges(r, now).map(b => <Badge key={b.text} {...b} />)}</div>
                </div>
              </Link>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  )
}
