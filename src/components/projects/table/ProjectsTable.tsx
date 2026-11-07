'use client'

// The /projects table body (desktop) and compact list (phones), with the
// Phase / Status / money cells. State lives in ProjectsTableClient.

import Link from 'next/link'
import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, MoreVertical, ArrowDown, ArrowUp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SL } from '@/components/shot-list/styles'
import { formatMoney } from '@/lib/money'
import { PHASES, phaseIndex, phaseLabel, type PhaseKey } from '@/lib/project-phase'
import { monogram, type ProjectRow, type SortDir, type SortKey } from '@/lib/projects-table'
import { shootTypeLabel } from './labels'

export type ColumnKey = 'client' | 'phase' | 'status' | 'shoot' | 'budget' | 'team'

export const COLUMNS: { key: ColumnKey; label: string; sort?: SortKey; money?: boolean }[] = [
  { key: 'client', label: 'Client', sort: 'client' },
  { key: 'phase',  label: 'Phase',  sort: 'phase' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'shoot',  label: 'Shoot',  sort: 'shoot' },
  { key: 'budget', label: 'Budget', sort: 'value', money: true },
  { key: 'team',   label: 'Team' },
]

export interface RowActions {
  onPhase:   (row: ProjectRow, phase: PhaseKey) => void
  onWrap:    (row: ProjectRow) => void
  onArchive: (row: ProjectRow) => void
  onRestore: (row: ProjectRow) => void
  onTeam:    (row: ProjectRow) => void
  /** Owners only: permanently delete an archived project. */
  onDelete?: (row: ProjectRow) => void
  canManageProjects: boolean
}

// ─── Small formatters ────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const md = (k: string) => `${MON[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`

export function shootRange(start: string | null, end: string | null): string | null {
  if (!start) return null
  if (!end || end === start) return md(start)
  return start.slice(0, 7) === end.slice(0, 7) ? `${md(start)} – ${Number(end.slice(8, 10))}` : `${md(start)} – ${md(end)}`
}

export function relativeDay(start: string | null, end: string | null, todayKey: string): string | null {
  if (!start) return null
  const d = (k: string) => Math.round((Date.parse(`${k}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000)
  const s = d(start), e = d(end ?? start)
  if (s > 0) return s === 1 ? 'tomorrow' : s < 14 ? `in ${s} days` : s < 60 ? `in ${Math.round(s / 7)} weeks` : `in ${Math.round(s / 30)} mo`
  if (e >= 0) return 'shooting now'
  const a = -e
  return a === 1 ? 'yesterday' : a < 14 ? `${a} days ago` : a < 60 ? `${Math.round(a / 7)} weeks ago` : `${Math.round(a / 30)} mo ago`
}

const TONE_DOT: Record<string, string> = {
  red: 'bg-[#E5484D]', amber: 'bg-[#F59E0B]', violet: 'bg-primary', green: 'bg-[#12B76A]', grey: 'bg-[#C9C6C0]',
}

// ─── Cells ───────────────────────────────────────────────────────────────────

export function ClientLogo({ client, size = 40 }: { client: ProjectRow['client']; size?: number }) {
  const m = monogram(client.name, client.id)
  return (
    <span
      className="grid flex-none place-items-center overflow-hidden rounded-full border border-[#EEEDEA] bg-white font-semibold tracking-[-0.02em]"
      style={{ width: size, height: size, fontSize: size * 0.34, ...(client.logoUrl ? {} : { background: m.bg, color: m.fg }) }}
      aria-hidden
    >
      {client.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={client.logoUrl} alt="" className="h-full w-full object-contain p-1.5" />
        : m.text}
    </span>
  )
}

export function PhaseTrack({ phase, dim = false, small = false }: { phase: string; dim?: boolean; small?: boolean }) {
  const n = phaseIndex(phase)
  return (
    <span className={`grid grid-cols-6 ${small ? 'w-[70px] gap-0.5' : 'gap-[3px]'}`} aria-hidden>
      {PHASES.map((p, i) => (
        <i key={p.key} className={`block ${small ? 'h-[3px]' : 'h-1'} rounded-sm ${i <= n ? (dim || phase === 'LEAD' ? 'bg-[#C9C3D3]' : 'bg-primary') : 'bg-[#EDEBE7]'}`} />
      ))}
    </span>
  )
}

function PhaseCell({ row, actions }: { row: ProjectRow; actions: RowActions }) {
  const [open, setOpen] = useState(false)
  const closed = row.status === 'WRAPPED' || row.status === 'ARCHIVED'
  const label = (
    <span className="flex min-w-[130px] flex-col gap-[7px]">
      <span className="flex items-center justify-between gap-2 text-sm">
        <span className={closed ? SL.t2 : ''}>
          {row.status === 'WRAPPED' ? 'Wrapped' : row.status === 'ARCHIVED' ? 'Archived' : phaseLabel(row.phase)}
          {row.canEdit && row.status !== 'ARCHIVED' && <ChevronDown className="ml-1 inline h-3 w-3 text-[#9A9A9A]" />}
        </span>
        <i className={`text-xs not-italic ${SL.mut}`}>{phaseIndex(row.phase) + 1}/6</i>
      </span>
      <PhaseTrack phase={row.phase} dim={closed} />
    </span>
  )
  if (!row.canEdit || row.status === 'ARCHIVED') return label
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()} className="-m-1.5 rounded-[4px] p-1.5 text-left hover:bg-[#FAF9F7]" aria-label={`Phase: ${phaseLabel(row.phase)}. Change`}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 rounded-[4px] p-1.5" onClick={e => e.stopPropagation()}>
        <p className={`px-2.5 pb-1 pt-1.5 text-xs ${SL.mut}`}>{row.status === 'WRAPPED' ? 'Picking a phase reopens the project' : 'Phase'}</p>
        {PHASES.map((p, i) => {
          const on = p.key === row.phase && row.status !== 'WRAPPED'
          return (
            <button
              key={p.key} type="button"
              onClick={() => { setOpen(false); if (!on) actions.onPhase(row, p.key) }}
              className={`flex w-full items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left text-sm hover:bg-[#FAF9F7] ${on ? 'bg-[#FAF9F7]' : ''}`}
            >
              <span className={`w-4 text-xs ${SL.mut}`}>{i + 1}</span>{p.label}
              {on && <span className="ml-auto text-primary">✓</span>}
            </button>
          )
        })}
        {row.status !== 'WRAPPED' && (
          <>
            <div className="my-1.5 h-px bg-[#EEEDEA]" />
            <button type="button" onClick={() => { setOpen(false); actions.onWrap(row) }} className={`w-full rounded-[3px] px-2.5 py-2 text-left text-sm hover:bg-[#FAF9F7] ${SL.t2}`}>
              Wrap project…
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function StatusCell({ row, actions }: { row: ProjectRow; actions: RowActions }) {
  const { step } = row
  return (
    <div className="flex min-w-[190px] items-start gap-2">
      <span className={`mt-[7px] h-[7px] w-[7px] flex-none rounded-full ${TONE_DOT[step.tone]}`} />
      <div className="min-w-0">
        <div className={step.tone === 'red' ? 'text-[#B42318]' : ''}>{step.label}</div>
        {step.detail && <div className={`mt-0.5 text-[12.5px] ${SL.t2}`}>{step.detail}</div>}
        {row.suggested && row.canEdit && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); actions.onPhase(row, row.suggested!) }}
            className="mt-1.5 rounded-full border border-[#E2E0DC] bg-white px-2.5 py-0.5 text-xs text-primary hover:border-primary"
          >
            Move to {phaseLabel(row.suggested)}?
          </button>
        )}
      </div>
    </div>
  )
}

export function MoneyCell({ row }: { row: ProjectRow }) {
  const m = row.money
  if (!m) return null
  if (m.valueCents <= 0) return <span className={SL.mut}>—</span>
  const pct = m.valueCents > 0 ? Math.min(100, Math.round((m.collectedCents / m.valueCents) * 100)) : 0
  const sub = m.won ? `${pct}% collected` : m.proposed ? 'Proposed' : row.status === 'LEAD' ? 'Draft budget' : 'Budget'
  return (
    <div className="text-right">
      <div>{formatMoney(m.valueCents)}</div>
      <div className={`mt-0.5 text-[12.5px] ${SL.t2}`}>{sub}</div>
      {m.won && (
        <div className="ml-auto mt-1.5 h-[3px] w-24 overflow-hidden rounded-sm bg-[#EDEBE7]">
          <i className="block h-full bg-[#12B76A]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = { PROJECT_LEAD: 'Project lead', ACCOUNT_MANAGER: 'Account manager', PROJECT_MANAGER: 'Project manager' }

function initials(name: string | null, email: string) {
  const src = (name ?? email).trim()
  const w = src.split(/\s+/)
  return (w.length > 1 ? w[0][0] + w[1][0] : src.slice(0, 2)).toUpperCase()
}

export function TeamAvatars({ team }: { team: ProjectRow['team'] }) {
  if (!team.length) return <span className={SL.mut}>—</span>
  return (
    <span className="flex">
      {team.map((m, i) => {
        const c = monogram(m.name ?? m.email, m.userId)
        return (
          <span
            key={m.userId + i}
            title={`${m.name ?? m.email} · ${ROLE_LABEL[m.role] ?? m.role}`}
            className={`grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-full border-2 border-white text-[10px] font-semibold ${i ? '-ml-[7px]' : ''}`}
            style={{ background: c.fg, color: '#fff' }}
          >
            {m.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
              : initials(m.name, m.email)}
          </span>
        )
      })}
    </span>
  )
}

function RowMenu({ row, actions }: { row: ProjectRow; actions: RowActions }) {
  const archived = row.status === 'ARCHIVED'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()} className={`grid h-8 w-8 place-items-center rounded-[4px] ${SL.mut} hover:bg-[#F1F0ED] hover:text-[#1A1A1A]`} aria-label={`Actions for ${row.name}`}>
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-[4px]" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem asChild><Link href={`/projects/${row.id}`}>Open</Link></DropdownMenuItem>
        {row.canEditTeam && <DropdownMenuItem onSelect={() => actions.onTeam(row)}>Edit team</DropdownMenuItem>}
        {row.canEdit && !archived && row.status !== 'WRAPPED' && <DropdownMenuItem onSelect={() => actions.onWrap(row)}>Wrap project…</DropdownMenuItem>}
        {actions.canManageProjects && (
          <>
            <DropdownMenuSeparator />
            {archived
              ? <DropdownMenuItem onSelect={() => actions.onRestore(row)}>Restore</DropdownMenuItem>
              : <DropdownMenuItem onSelect={() => actions.onArchive(row)}>Archive…</DropdownMenuItem>}
          </>
        )}
        {archived && actions.onDelete && (
          <DropdownMenuItem onSelect={() => actions.onDelete!(row)} className="text-destructive focus:text-destructive">
            Delete permanently…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────

export interface Group { key: string; label: string; rows: ProjectRow[]; totalLabel: string | null }

interface TableProps {
  /** Flat list, or bands when grouped by phase. */
  rows:     ProjectRow[]
  groups:   Group[] | null
  columns:  ColumnKey[]
  sort:     SortKey
  dir:      SortDir
  onSort:   (k: SortKey) => void
  actions:  RowActions
  todayKey: string
  collapsed: Set<string>
  onToggleGroup: (k: string) => void
}

const TH = `whitespace-nowrap border-b border-[#EEEDEA] px-3.5 py-3 text-left text-[13.5px] font-normal ${SL.t2}`
const TD = 'border-b border-[#EEEDEA] px-3.5 py-3.5 align-middle text-sm'

export function ProjectsTable({ rows, groups, columns, sort, dir, onSort, actions, todayKey, collapsed, onToggleGroup }: TableProps) {
  const router = useRouter()
  const cols = COLUMNS.filter(c => columns.includes(c.key))
  const span = cols.length + 2

  const head = (label: string, key: SortKey | undefined, right = false, first = false) => (
    <th className={`${TH} ${first ? 'pl-4 md:pl-10' : 'border-l'} ${right ? 'text-right' : ''}`} aria-sort={key && sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {key ? (
        <button type="button" onClick={() => onSort(key)} className={`inline-flex items-center gap-1 hover:text-[#1A1A1A] ${sort === key ? 'text-[#1A1A1A]' : ''}`}>
          {label}
          {sort === key && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : label}
    </th>
  )

  const renderRow = (r: ProjectRow) => {
    const muted = r.status === 'ARCHIVED'
    return (
      <tr key={r.id} onClick={() => router.push(`/projects/${r.id}`)} className={`group cursor-pointer hover:bg-[#FCFBFA] ${muted ? 'text-[#9A9A9A]' : ''}`}>
        <td className={`${TD} pl-4 md:pl-10`}>
          <div className="flex min-w-[260px] items-center gap-3.5">
            <ClientLogo client={r.client} />
            <div className="min-w-0">
              <Link href={`/projects/${r.id}`} onClick={e => e.stopPropagation()} className="block text-[15px] leading-snug hover:underline">{r.name}</Link>
              <div className={`mt-0.5 text-[13px] ${SL.t2}`}>{shootTypeLabel(r.shootType)}</div>
            </div>
          </div>
        </td>
        {cols.map(c => (
          <td key={c.key} className={`${TD} border-l ${c.key === 'budget' ? 'text-right' : ''}`}>
            {c.key === 'client' && <span className="whitespace-nowrap text-[#3A3A3A]">{r.client.name}</span>}
            {c.key === 'phase'  && <PhaseCell row={r} actions={actions} />}
            {c.key === 'status' && <StatusCell row={r} actions={actions} />}
            {c.key === 'shoot'  && (r.shootStart
              ? <div className="whitespace-nowrap text-[#3A3A3A]">{shootRange(r.shootStart, r.shootEnd)}<div className={`mt-0.5 text-[12.5px] ${SL.t2}`}>{relativeDay(r.shootStart, r.shootEnd, todayKey)}</div></div>
              : <span className={SL.mut}>Not set</span>)}
            {c.key === 'budget' && <MoneyCell row={r} />}
            {c.key === 'team'   && <TeamAvatars team={r.team} />}
          </td>
        ))}
        <td className={`${TD} w-12 border-l pr-4 text-center md:pr-7`}><RowMenu row={r} actions={actions} /></td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head('Project', 'name', false, true)}
            {cols.map(c => <Fragment key={c.key}>{head(c.label, c.sort, c.key === 'budget')}</Fragment>)}
            <th className={`${TH} border-l`} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.map(g => (
                <Fragment key={g.key}>
                  <tr className="cursor-pointer bg-[#FAF9F7]" onClick={() => onToggleGroup(g.key)}>
                    <td colSpan={span} className="border-b border-[#EEEDEA] py-2.5 pl-4 pr-4 md:pl-10">
                      <span className="flex items-center gap-2.5">
                        {collapsed.has(g.key) ? <ChevronRight className="h-4 w-4 text-[#9A9A9A]" /> : <ChevronDown className="h-4 w-4 text-[#9A9A9A]" />}
                        <b className="font-medium">{g.label}</b>
                        <span className="rounded-full bg-[#F0EFEC] px-2 text-xs text-[#6B6B6B]">{g.rows.length}</span>
                        {g.totalLabel && <span className={`text-[13px] ${SL.mut}`}>{g.totalLabel}</span>}
                      </span>
                    </td>
                  </tr>
                  {!collapsed.has(g.key) && g.rows.map(renderRow)}
                </Fragment>
              ))
            : rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  )
}

// ─── Phones ──────────────────────────────────────────────────────────────────

export function ProjectsPhoneList({ rows }: { rows: ProjectRow[] }) {
  return (
    <ul>
      {rows.map(r => {
        const attention = r.step.tone === 'red' || r.step.tone === 'amber'
        return (
          <li key={r.id} className="border-b border-[#EEEDEA]">
            <Link href={`/projects/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-[#FAF9F7]">
              <ClientLogo client={r.client} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px]">{r.name}</div>
                <div className={`truncate text-[12.5px] ${attention ? (r.step.tone === 'red' ? 'text-[#B42318]' : 'text-[#B45309]') : SL.t2}`}>
                  {attention ? r.step.label : `${r.client.name} · ${r.status === 'WRAPPED' ? 'Wrapped' : r.status === 'ARCHIVED' ? 'Archived' : phaseLabel(r.phase)}`}
                </div>
                <div className="mt-1.5"><PhaseTrack phase={r.phase} small dim={r.status === 'WRAPPED' || r.status === 'ARCHIVED'} /></div>
              </div>
              <div className="flex-none text-right text-[13.5px]">
                {r.money && r.money.valueCents > 0 ? formatMoney(r.money.valueCents) : ''}
                <div className={`mt-0.5 text-xs ${SL.t2}`}>{r.shootStart ? shootRange(r.shootStart, null) : ''}</div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
