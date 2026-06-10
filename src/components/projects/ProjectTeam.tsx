'use client'

import { useState, useTransition } from 'react'
import { Plus, Mail, Phone, Clock, Edit2, Trash2, BookUser } from 'lucide-react'
import Link from 'next/link'
import { removeProjectMember, updateProjectMember, type ProjectMemberRow, type MemberFormData } from '@/server/actions/project-members'
import { AddMemberModal } from './AddMemberModal'

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

interface Props {
  projectId: string
  members:   ProjectMemberRow[]
}

export function ProjectTeam({ projectId, members: initial }: Props) {
  const [members,   setMembers]   = useState(initial)
  const [adding,    setAdding]    = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Group by department
  const grouped = groupByDepartment(members)
  const hasDepts = members.some(m => m.department)

  function handleAdded() {
    // Trigger a full reload — simplest approach since we're server-side paginating
    window.location.reload()
  }

  function handleRemoved(id: string) {
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  function handleUpdated(updated: ProjectMemberRow) {
    setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {members.length === 0
              ? 'No crew assigned yet.'
              : `${members.length} crew member${members.length === 1 ? '' : 's'} on this project.`
            }
          </p>
        </div>
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

      {/* Member list — grouped if departments exist */}
      {members.length > 0 && (
        <div className="space-y-6">
          {grouped.map(({ dept, members: deptMembers }) => (
            <div key={dept ?? '__none__'}>
              {hasDepts && (
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dept ?? 'No Department'}
                </h3>
              )}
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Role</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Rate</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Call</th>
                      <th className="px-4 py-2.5 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {deptMembers.map(member => (
                      editingId === member.id
                        ? (
                          <EditRow
                            key={member.id}
                            member={member}
                            projectId={projectId}
                            onSaved={(updated) => { handleUpdated(updated); setEditingId(null) }}
                            onCancel={() => setEditingId(null)}
                          />
                        )
                        : (
                          <MemberRow
                            key={member.id}
                            member={member}
                            projectId={projectId}
                            onEdit={() => setEditingId(member.id)}
                            onRemoved={() => handleRemoved(member.id)}
                          />
                        )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add member modal */}
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

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({
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

  function handleRemove() {
    if (!confirm(`Remove ${member.name} from this project?`)) return
    startTransition(async () => {
      await removeProjectMember(member.id, projectId)
      onRemoved()
    })
  }

  const name = member.name
  const initials = name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <tr className="group bg-card hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: 'var(--brand-primary, #5D00A4)' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground leading-tight">{member.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {member.email && (
                <a href={`mailto:${member.email}`} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="h-2.5 w-2.5" />{member.email}
                </a>
              )}
              {member.phone && (
                <a href={`tel:${member.phone}`} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="h-2.5 w-2.5" />{member.phone}
                </a>
              )}
            </div>
          </div>
          {member.contactId && (
            <Link
              href="/rolodex"
              title="In Rolodex"
              className="flex-shrink-0 rounded-full bg-primary/10 p-1 text-primary hover:bg-primary/20 transition-colors"
            >
              <BookUser className="h-3 w-3" />
            </Link>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs font-medium text-primary hidden sm:table-cell">{member.role}</td>
      <td className="px-4 py-3 text-right text-xs hidden md:table-cell">
        {member.rateCents != null
          ? <>{(member.rateCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}<span className="text-muted-foreground/60">{UNIT_SHORT[member.rateUnit]}</span></>
          : <span className="text-muted-foreground/50">—</span>
        }
      </td>
      <td className="px-4 py-3 text-center hidden md:table-cell">
        {member.callTime
          ? <span className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{member.callTime}</span>
          : <span className="text-xs text-muted-foreground/40">—</span>
        }
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Edit">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleRemove} disabled={removing} className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-muted transition-colors disabled:opacity-40" title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Inline edit row ───────────────────────────────────────────────────────────

function EditRow({
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
  const [role,       setRole]       = useState(member.role)
  const [department, setDepartment] = useState(member.department ?? '')
  const [email,      setEmail]      = useState(member.email ?? '')
  const [phone,      setPhone]      = useState(member.phone ?? '')
  const [callTime,   setCallTime]   = useState(member.callTime ?? '')
  const [rateCents,  setRateCents]  = useState(member.rateCents != null ? String(member.rateCents / 100) : '')
  const [rateUnit, setRateUnit] = useState<MemberFormData['rateUnit']>(
    (member.rateUnit as MemberFormData['rateUnit']) ?? 'DAY'
  )

  function handleSave() {
    startTransition(async () => {
      const data: MemberFormData = {
        contactId:  member.contactId,
        name:       member.name,
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

  return (
    <tr className="bg-primary/4">
      <td colSpan={5} className="px-4 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Role</label>
            <input value={role} onChange={e => setRole(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none">
              <option value="">None</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Rate ($)</label>
            <input type="number" value={rateCents} onChange={e => setRateCents(e.target.value)} min="0" step="0.01" className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Unit</label>
            <select value={rateUnit} onChange={e => setRateUnit(e.target.value as MemberFormData['rateUnit'])} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none">
              {RATE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Call time</label>
            <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={onCancel} className="rounded border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={isPending} className="rounded bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40">
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Grouping helper ───────────────────────────────────────────────────────────

function groupByDepartment(members: ProjectMemberRow[]): { dept: string | null; members: ProjectMemberRow[] }[] {
  const map = new Map<string, ProjectMemberRow[]>()
  for (const m of members) {
    const key = m.department ?? ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }

  const result: { dept: string | null; members: ProjectMemberRow[] }[] = []
  // Named departments first, then ungrouped
  const namedKeys = [...map.keys()].filter(k => k !== '').sort()
  for (const key of namedKeys) result.push({ dept: key, members: map.get(key)! })
  if (map.has('')) result.push({ dept: null, members: map.get('')! })
  return result
}
