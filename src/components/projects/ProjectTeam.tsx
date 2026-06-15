'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  Plus, Mail, Phone, Clock, Edit2, Trash2,
  BookUser, FileText, Search, X, UserPlus,
} from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import {
  removeProjectMember,
  updateProjectMember,
  type ProjectMemberRow,
  type MemberFormData,
} from '@/server/actions/project-members'
import { searchContacts, type ContactSearchResult } from '@/server/actions/rolodex'
import { AddMemberModal } from './AddMemberModal'

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIT_SHORT: Record<string, string> = {
  HOUR:     '/hr',
  HALF_DAY: '/½d',
  DAY:      '/day',
  WEEK:     '/wk',
  FLAT:     ' flat',
  EACH:     '/ea',
  MILE:     '/mi',
}

const RATE_UNITS = [
  { value: 'HOUR',     label: 'per hour' },
  { value: 'HALF_DAY', label: 'per half-day' },
  { value: 'DAY',      label: 'per day' },
  { value: 'WEEK',     label: 'per week' },
  { value: 'FLAT',     label: 'flat' },
]

const DEPARTMENTS = [
  'Production', 'Camera', 'G&E', 'Sound', 'Art / Props',
  'Hair & Makeup', 'Talent', 'Post Production', 'Other',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUnassigned(m: ProjectMemberRow) {
  return m.name === 'Unassigned'
}

function groupByDepartment(members: ProjectMemberRow[]): { dept: string | null; members: ProjectMemberRow[] }[] {
  const map = new Map<string, ProjectMemberRow[]>()
  for (const m of members) {
    const key = m.department ?? ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  const result: { dept: string | null; members: ProjectMemberRow[] }[] = []
  const namedKeys = [...map.keys()].filter(k => k !== '').sort()
  for (const key of namedKeys) result.push({ dept: key, members: map.get(key)! })
  if (map.has('')) result.push({ dept: null, members: map.get('')! })
  return result
}

function formatRate(rateCents: number, rateUnit: string) {
  return `${(rateCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}${UNIT_SHORT[rateUnit] ?? ''}`
}

function Initials({ name }: { name: string }) {
  const letters = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: 'var(--brand-primary, #5D00A4)' }}
    >
      {letters}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId:          string
  members:            ProjectMemberRow[]
  seedProposalTitle?: string | null
}

export function ProjectTeam({ projectId, members: initial, seedProposalTitle }: Props) {
  const [members,   setMembers]   = useState(initial)
  const [adding,    setAdding]    = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const grouped  = groupByDepartment(members)
  const hasDepts = members.some(m => m.department)
  const assigned = members.filter(m => !isUnassigned(m)).length

  function handleAdded() { window.location.reload() }
  function handleRemoved(id: string) { setMembers(prev => prev.filter(m => m.id !== id)) }
  function handleUpdated(updated: ProjectMemberRow) {
    setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {members.length === 0
            ? 'No crew assigned yet.'
            : `${assigned} of ${members.length} position${members.length === 1 ? '' : 's'} filled.`
          }
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/rolodex"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookUser className="h-3.5 w-3.5" />
            Rolodex
          </Link>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add crew
          </button>
        </div>
      </div>

      {/* Empty state */}
      {members.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <p className="font-medium text-foreground">No crew assigned</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add crew from your Rolodex or enter manually.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add first crew member
          </button>
        </div>
      )}

      {/* Card grid — grouped by department/account */}
      {members.length > 0 && (
        <div className="space-y-8">
          {grouped.map(({ dept, members: deptMembers }) => (
            <div key={dept ?? '__none__'}>
              {/* Department header */}
              {hasDepts && (
                <div className="mb-4 flex items-center gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {dept ?? 'No Department'}
                  </h3>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-muted-foreground/60">
                    {deptMembers.filter(m => !isUnassigned(m)).length}/{deptMembers.length}
                  </span>
                </div>
              )}

              {/* Card grid */}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
              >
                {deptMembers.map(member =>
                  editingId === member.id ? (
                    // Edit card spans full width
                    <div key={member.id} style={{ gridColumn: '1 / -1' }}>
                      <EditCard
                        member={member}
                        projectId={projectId}
                        onSaved={(updated) => { handleUpdated(updated); setEditingId(null) }}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  ) : isUnassigned(member) ? (
                    <PlaceholderCard
                      key={member.id}
                      member={member}
                      projectId={projectId}
                      onAssign={() => setEditingId(member.id)}
                      onRemoved={() => handleRemoved(member.id)}
                    />
                  ) : (
                    <MemberCard
                      key={member.id}
                      member={member}
                      projectId={projectId}
                      onEdit={() => setEditingId(member.id)}
                      onRemoved={() => handleRemoved(member.id)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seed attribution */}
      {seedProposalTitle && (
        <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          Positions pulled from <span className="font-medium text-foreground">{seedProposalTitle}</span>
        </p>
      )}

      {adding && (
        <AddMemberModal
          projectId={projectId}
          onClose={() => setAdding(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  )
}

// ── Placeholder card (Unassigned position) ────────────────────────────────────

function PlaceholderCard({
  member,
  projectId,
  onAssign,
  onRemoved,
}: {
  member:    ProjectMemberRow
  projectId: string
  onAssign:  () => void
  onRemoved: () => void
}) {
  const [removing, startTransition] = useTransition()
  const { confirm, ConfirmDialog }  = useConfirm()

  async function handleRemove() {
    const ok = await confirm(`Remove the ${member.role} placeholder?`, {
      confirmLabel: 'Remove',
      key: 'team-remove-placeholder',
    })
    if (!ok) return
    startTransition(async () => {
      await removeProjectMember(member.id, projectId)
      onRemoved()
    })
  }

  return (
    <>
      {ConfirmDialog}
      <div className="group relative flex min-h-[148px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 p-4 text-center transition-colors hover:border-primary/25 hover:bg-primary/[0.03]">
        {/* Remove */}
        <button
          onClick={handleRemove}
          disabled={removing}
          title="Remove placeholder"
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground/30 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Empty avatar ring */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/20 bg-muted/40 text-muted-foreground/40">
          <UserPlus className="h-4 w-4" />
        </div>

        {/* Role + rate */}
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground/70">{member.role}</p>
          {member.rateCents != null && (
            <p className="text-xs text-muted-foreground/60">
              {formatRate(member.rateCents, member.rateUnit)}
            </p>
          )}
        </div>

        {/* Assign CTA */}
        <button
          onClick={onAssign}
          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:border-primary hover:bg-primary/5"
        >
          <UserPlus className="h-3 w-3" />
          Assign crew member
        </button>
      </div>
    </>
  )
}

// ── Filled member card ────────────────────────────────────────────────────────

function MemberCard({
  member,
  projectId,
  onEdit,
  onRemoved,
}: {
  member:    ProjectMemberRow
  projectId: string
  onEdit:    () => void
  onRemoved: () => void
}) {
  const [removing, startTransition] = useTransition()
  const { confirm, ConfirmDialog }  = useConfirm()

  async function handleRemove() {
    const ok = await confirm(`Remove ${member.name} from this project?`, {
      confirmLabel: 'Remove',
      key: 'team-remove-member',
    })
    if (!ok) return
    startTransition(async () => {
      await removeProjectMember(member.id, projectId)
      onRemoved()
    })
  }

  return (
    <>
      {ConfirmDialog}
      <div className="group relative flex flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
        {/* Action buttons */}
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            title="Edit"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            title="Remove"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Avatar row */}
        <div className="mb-3 flex items-center gap-2">
          <Initials name={member.name} />
          {member.contactId && (
            <Link
              href="/rolodex"
              title="In Rolodex"
              className="rounded-full bg-primary/10 p-1 text-primary hover:bg-primary/20 transition-colors"
            >
              <BookUser className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Name + role */}
        <p className="text-sm font-semibold text-foreground leading-tight truncate pr-12">
          {member.name}
        </p>
        <p className="mt-0.5 text-xs font-medium text-primary truncate">
          {member.role}
        </p>

        {/* Contact + meta */}
        <div className="mt-3 space-y-1.5">
          {member.rateCents != null && (
            <p className="text-xs text-muted-foreground">
              {formatRate(member.rateCents, member.rateUnit)}
            </p>
          )}
          {member.callTime && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              {member.callTime}
            </p>
          )}
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{member.email}</span>
            </a>
          )}
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone className="h-3 w-3 shrink-0" />
              {member.phone}
            </a>
          )}
        </div>
      </div>
    </>
  )
}

// ── Inline edit card (full-width) ─────────────────────────────────────────────

function EditCard({
  member,
  projectId,
  onSaved,
  onCancel,
}: {
  member:    ProjectMemberRow
  projectId: string
  onSaved:   (updated: ProjectMemberRow) => void
  onCancel:  () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name,       setName]       = useState(isUnassigned(member) ? '' : member.name)
  const [contactId,  setContactId]  = useState<string | null>(member.contactId ?? null)
  const [role,       setRole]       = useState(member.role)
  const [department, setDepartment] = useState(member.department ?? '')
  const [email,      setEmail]      = useState(member.email ?? '')
  const [phone,      setPhone]      = useState(member.phone ?? '')
  const [callTime,   setCallTime]   = useState(member.callTime ?? '')
  const [rateCents,  setRateCents]  = useState(
    member.rateCents != null ? String(member.rateCents / 100) : ''
  )
  const [rateUnit, setRateUnit] = useState<MemberFormData['rateUnit']>(
    (member.rateUnit as MemberFormData['rateUnit']) ?? 'DAY'
  )

  // Rolodex name search
  const [nameResults,  setNameResults]  = useState<ContactSearchResult[]>([])
  const [nameOpen,     setNameOpen]     = useState(false)
  const [namePos,      setNamePos]      = useState<{ top: number; left: number; width: number } | null>(null)
  const [mounted,      setMounted]      = useState(false)
  const nameInputRef  = useRef<HTMLInputElement>(null)
  const namePortalRef = useRef<HTMLDivElement>(null)
  const nameDebounce  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!nameOpen) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (nameInputRef.current?.contains(t)) return
      if (namePortalRef.current?.contains(t)) return
      setNameOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [nameOpen])

  function handleNameChange(v: string) {
    setName(v)
    setContactId(null)
    if (nameDebounce.current) clearTimeout(nameDebounce.current)
    if (!v.trim()) { setNameResults([]); setNameOpen(false); return }
    nameDebounce.current = setTimeout(async () => {
      const results = await searchContacts(v)
      setNameResults(results)
      if (results.length > 0 && nameInputRef.current) {
        const rect = nameInputRef.current.getBoundingClientRect()
        setNamePos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) })
        setNameOpen(true)
      }
    }, 200)
  }

  function selectContact(c: ContactSearchResult) {
    setName(c.name)
    setContactId(c.id)
    if (!role.trim() || role === 'Unassigned') setRole(c.primaryRole)
    if (!email.trim()) setEmail(c.email ?? '')
    if (!phone.trim()) setPhone(c.phone ?? '')
    if (!rateCents.trim() && c.defaultRateCents != null) {
      setRateCents(String(c.defaultRateCents / 100))
      setRateUnit((c.defaultRateUnit as MemberFormData['rateUnit']) ?? 'DAY')
    }
    setNameResults([])
    setNameOpen(false)
  }

  function handleSave() {
    startTransition(async () => {
      const data: MemberFormData = {
        contactId,
        name:       name.trim() || member.name,
        role:       role.trim(),
        department: department.trim() || null,
        email:      email.trim() || null,
        phone:      phone.trim() || null,
        callTime:   callTime.trim() || null,
        rateCents:  rateCents.trim() ? Math.round(parseFloat(rateCents) * 100) : null,
        rateUnit,
        order:      member.order,
      }
      await updateProjectMember(member.id, projectId, data)
      onSaved({ ...member, ...data, rateCents: data.rateCents ?? null } as ProjectMemberRow)
    })
  }

  const nameDropdown = mounted && nameOpen && namePos && nameResults.length > 0
    ? createPortal(
        <div
          ref={namePortalRef}
          style={{ position: 'fixed', top: namePos.top, left: namePos.left, width: namePos.width, zIndex: 9999 }}
          className="rounded-lg border bg-card shadow-xl overflow-hidden"
        >
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5"
            style={{ background: 'var(--brand-primary, #5D00A4)' }}
          >
            <BookUser className="h-3 w-3 text-white/70" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white">Rolodex</span>
          </div>
          {nameResults.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectContact(c) }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors ${i > 0 ? 'border-t border-border/30' : ''}`}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: 'var(--brand-primary, #5D00A4)' }}
              >
                {c.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground leading-tight">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">{c.primaryRole}</p>
              </div>
              {c.defaultRateCents != null && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  ${(c.defaultRateCents / 100).toLocaleString()}/{c.defaultRateUnit.toLowerCase()}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )
    : null

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.02] p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-primary">
        {isUnassigned(member) ? `Assign — ${member.role}` : `Edit — ${member.name}`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Name — full row, with Rolodex search */}
        <div className="sm:col-span-2 md:col-span-3 lg:col-span-4">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Name
            {contactId && (
              <span className="ml-2 normal-case text-[9px] font-normal text-primary/70 inline-flex items-center gap-0.5">
                <BookUser className="h-2.5 w-2.5" /> Linked to Rolodex
              </span>
            )}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={nameInputRef}
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Search Rolodex or type a name…"
              className="w-full rounded-lg border bg-background pl-8 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {contactId && (
              <button
                type="button"
                title="Unlink"
                onClick={() => setContactId(null)}
                className="absolute inset-y-0 right-2 my-auto text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {nameDropdown}
        </div>

        {/* Role */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Role</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Department */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Department</label>
          <select
            value={department}
            onChange={e => setDepartment(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
          >
            <option value="">None</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Rate */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Rate ($)</label>
          <input
            type="number"
            value={rateCents}
            onChange={e => setRateCents(e.target.value)}
            min="0" step="0.01"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Unit */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Unit</label>
          <select
            value={rateUnit}
            onChange={e => setRateUnit(e.target.value as MemberFormData['rateUnit'])}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
          >
            {RATE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>

        {/* Call time */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Call time</label>
          <input
            type="time"
            value={callTime}
            onChange={e => setCallTime(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Email */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
