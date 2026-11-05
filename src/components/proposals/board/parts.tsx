'use client'

// Small pieces shared by the /proposals list and board (approved mockup v4).

import Link from 'next/link'
import { Check, MoreHorizontal } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SL } from '@/components/shot-list/styles'
import { monogram } from '@/lib/projects-table'
import { STATUS_LABEL, stage, type DealRow, type Tone } from '@/lib/proposals-board'
import { canReopenProposal } from '@/lib/proposal-expiry'

export interface DealActions {
  now:        Date
  copiedKey:  string | null
  pendingKey: string | null
  copyLink:   (r: DealRow) => void
  draft:      (r: DealRow) => void
  reopen:     (r: DealRow) => void
  markWon:    (r: DealRow) => void
  markLost:   (r: DealRow) => void
  deleteDraft:(r: DealRow) => void
}

const PILL: Record<string, string> = {
  NONE:           'border border-dashed border-[#D5D2CC] bg-white text-[#9A9A9A]',
  DRAFT:          'bg-[#F0EFEC] text-[#4B4B4B]',
  SENT:           'bg-[#E8EFFD] text-[#1E40AF]',
  VIEWED:         'bg-primary/10 text-primary',
  CHANGES_NEEDED: 'bg-[#FEF3E2] text-[#B45309]',
  APPROVED:       'bg-[#DFFFF7] text-[#003D31]',
  DECLINED:       'bg-[#FEECEB] text-[#B42318]',
  EXPIRED:        'bg-[#F6F1EA] text-[#7A5A2B]',
  LOST:           'bg-[#FFF1F2] text-[#9F1239]',
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-[3px] pl-2 pr-2.5 text-[12.5px] font-medium ${PILL[status] ?? PILL.DRAFT}`}>
      <i className="block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export const TONE_TEXT: Record<Tone, string> = {
  grey: 'text-[#6B6B6B]', amber: 'text-[#B45309]', violet: 'text-primary', green: 'text-[#027A48]', blue: 'text-[#1E40AF]',
}

const BADGE: Record<Tone, string> = {
  grey:   'bg-[#F0EFEC] text-[#5F5B54]',
  amber:  'bg-[#FEF3E2] text-[#B45309]',
  violet: 'bg-primary/10 text-primary',
  green:  'bg-[#E8F6EE] text-[#027A48]',
  blue:   'bg-[#EAF0FD] text-[#2F5BC9]',
}

/** Notion-style tag: soft tint, small square corners. */
export function Badge({ text, tone }: { text: string; tone: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-[4px] px-[7px] py-px text-xs leading-[18px] ${BADGE[tone]}`}>{text}</span>
}

function initials(name: string | null, email: string) {
  const src = (name ?? email).trim()
  const w = src.split(/\s+/)
  return (w.length > 1 ? w[0][0] + w[1][0] : src.slice(0, 2)).toUpperCase()
}

export function OwnerAvatar({ owner }: { owner: DealRow['owner'] }) {
  if (!owner) return <span className={SL.mut}>—</span>
  const c = monogram(owner.name ?? owner.email, owner.userId)
  return (
    <span title={`Account manager · ${owner.name ?? owner.email}`} className="grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-full text-[10.5px] font-semibold text-white" style={{ background: c.fg }}>
      {owner.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={owner.avatarUrl} alt="" className="h-full w-full object-cover" />
        : initials(owner.name, owner.email)}
    </span>
  )
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 ${SL.mut}`} aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/** ⋯ menu for a deal. Edit actions only when the person can edit this project's proposals. */
export function DealMenu({ row, actions, size = 30 }: { row: DealRow; actions: DealActions; size?: number }) {
  const p = row.proposal
  const st = stage(row, actions.now)
  const reopenable = !!p && canReopenProposal(p, actions.now)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button" onClick={e => e.stopPropagation()} aria-label={`Actions for ${row.project.name}`}
          className={`grid flex-none place-items-center rounded-full border border-[#E2E0DC] bg-white ${SL.t2} hover:border-[#C9C6C0] hover:text-[#1A1A1A]`}
          style={{ width: size, height: size }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-[4px]" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem asChild><Link href={`/projects/${row.project.id}`}>Open project</Link></DropdownMenuItem>
        {p && <DropdownMenuItem asChild><a href={`/p/${p.token}`} target="_blank" rel="noopener noreferrer">Open client link</a></DropdownMenuItem>}
        {p && <DropdownMenuItem onSelect={() => actions.copyLink(row)}>Copy client link</DropdownMenuItem>}
        {row.canEdit && (
          <>
            {(reopenable || st === 'out' || (p && p.status === 'DRAFT')) && <DropdownMenuSeparator />}
            {reopenable && <DropdownMenuItem onSelect={() => actions.reopen(row)}>Reopen…</DropdownMenuItem>}
            {st === 'out' && <DropdownMenuItem onSelect={() => actions.markWon(row)}>Mark won…</DropdownMenuItem>}
            {st === 'out' && <DropdownMenuItem onSelect={() => actions.markLost(row)}>Mark lost…</DropdownMenuItem>}
            {p?.status === 'DRAFT' && <DropdownMenuItem onSelect={() => actions.deleteDraft(row)} className="text-[#B42318] focus:text-[#B42318]">Delete draft…</DropdownMenuItem>}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The pill button beside the ⋯ menu in the list: Copy link, or the lead's next move. */
export function PrimaryAction({ row, actions }: { row: DealRow; actions: DealActions }) {
  const cls = `inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E2E0DC] bg-white px-2.5 text-[12.5px] ${SL.t2} hover:border-[#C9C6C0] hover:text-[#1A1A1A]`
  if (!row.proposal) {
    if (!row.canEdit) return null
    return <button type="button" className={cls} onClick={e => { e.stopPropagation(); actions.draft(row) }}>{row.hasBudget ? 'Draft proposal' : 'Build budget'}</button>
  }
  const copied = actions.copiedKey === row.key
  return (
    <button type="button" className={cls} onClick={e => { e.stopPropagation(); actions.copyLink(row) }}>
      {copied ? <><Check className="h-3.5 w-3.5 text-[#027A48]" /> Copied</> : 'Copy link'}
    </button>
  )
}
