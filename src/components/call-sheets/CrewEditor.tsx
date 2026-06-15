'use client'

import { Plus, X, ChevronDown, ChevronRight, BookUser, Check, Link2 } from 'lucide-react'
import { useState } from 'react'
import type { CrewDept, CrewMember } from '@/server/actions/call-sheets'
import { createContact, patchContactField } from '@/server/actions/rolodex'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { RolodexNameInput, type RolodexContact } from './RolodexNameInput'
import { formatTime, type TimeFormat } from '@/lib/time-format'

// ── Add-to-Rolodex button (free-text rows only) ────────────────────────────────

function RolodexBtn({ name, role, phone, email }: { name: string; role: string; phone?: string; email?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  if (!name.trim()) return <span className="w-6" />

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    if (state !== 'idle') return
    setState('loading')
    await createContact({
      name: name.trim(),
      primaryRole: role.trim() || 'Crew',
      secondaryRoles: [],
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      instagram: null,
      website: null,
      notes: null,
      avatarUrl: null,
      defaultRateCents: null,
      defaultRateUnit: 'DAY',
    })
    setState('done')
    setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      title={state === 'done' ? 'Added to Rolodex' : 'Add to Rolodex'}
      className={`opacity-0 group-hover/member:opacity-100 rounded p-0.5 transition-all ${
        state === 'done'
          ? 'text-green-600 opacity-100'
          : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
      }`}
    >
      {state === 'done'
        ? <Check className="h-3 w-3" />
        : <BookUser className="h-3 w-3" />
      }
    </button>
  )
}

// ── Linked-contact badge (rows with contactId) ────────────────────────────────
// Shows a chain icon indicating this row is linked to a Rolodex contact.
// Clicking it syncs the row's current phone + email back to the contact.

interface LinkedBtnProps {
  member: CrewMember
  onSyncRequest: (contactId: string, contactName: string, phone: string | null, email: string | null) => void
}

function LinkedBtn({ member, onSyncRequest }: LinkedBtnProps) {
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault()
        onSyncRequest(
          member.contactId!,
          member.name,
          member.phone?.trim() || null,
          member.email?.trim() || null,
        )
      }}
      title="Linked to Rolodex — click to sync phone/email"
      className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50 transition-colors opacity-0 group-hover/member:opacity-100"
    >
      <Link2 className="h-3 w-3" />
    </button>
  )
}

interface Props {
  crew:             CrewDept[]
  onChange:         (crew: CrewDept[]) => void
  readonly?:        boolean
  rolodexContacts?: RolodexContact[]
  timeFormat?:      TimeFormat
}

export function CrewEditor({ crew, onChange, readonly = false, rolodexContacts = [], timeFormat = '12H' }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const { confirm, ConfirmDialog } = useConfirm()

  function toggleCollapse(i: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function addDept() {
    onChange([...crew, { dept: 'New Department', members: [{ name: '', role: '', callTime: '' }] }])
  }

  function removeDept(i: number) {
    onChange(crew.filter((_, idx) => idx !== i))
  }

  function updateDeptName(i: number, name: string) {
    onChange(crew.map((d, idx) => idx === i ? { ...d, dept: name } : d))
  }

  function addMember(deptIdx: number) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? { ...d, members: [...d.members, { name: '', role: '', callTime: '' }] }
      : d
    ))
  }

  function removeMember(deptIdx: number, memberIdx: number) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? { ...d, members: d.members.filter((_, mIdx) => mIdx !== memberIdx) }
      : d
    ))
  }

  function updateMember(deptIdx: number, memberIdx: number, field: keyof CrewMember, value: string) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? {
          ...d,
          members: d.members.map((m, mIdx) => mIdx === memberIdx ? { ...m, [field]: value } : m),
        }
      : d
    ))
  }

  function selectFromRolodex(deptIdx: number, memberIdx: number, contact: RolodexContact) {
    onChange(crew.map((d, idx) => idx === deptIdx
      ? {
          ...d,
          members: d.members.map((m, mIdx) => mIdx === memberIdx
            ? {
                ...m,
                name:      contact.name,
                role:      m.role || contact.primaryRole,
                phone:     m.phone || contact.phone || '',
                email:     m.email || contact.email || '',
                contactId: contact.id,
              }
            : m
          ),
        }
      : d
    ))
  }

  async function handleSyncRequest(
    contactId: string,
    contactName: string,
    phone: string | null,
    email: string | null,
  ) {
    const ok = await confirm(
      `Push this row's phone/email to ${contactName}'s Rolodex entry?`,
      { title: 'Sync to Rolodex?', confirmLabel: 'Update contact', key: 'sync-contact' },
    )
    if (!ok) return
    await patchContactField(contactId, 'phone', phone)
    await patchContactField(contactId, 'email', email)
  }

  if (readonly) {
    return (
      <div className="space-y-4">
        {crew.map((dept, i) => (
          <div key={i}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{dept.dept}</p>
            <div className="divide-y rounded-lg border">
              {dept.members.map((m, mi) => (
                <div key={mi} className="flex items-center justify-between px-3 py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{m.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
                      {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-foreground">
                      {m.callTime ? formatTime(m.callTime, timeFormat) : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {crew.map((dept, deptIdx) => {
        const isCollapsed = collapsed.has(deptIdx)
        return (
          <div key={deptIdx} className="rounded-lg border border-border/70 overflow-hidden">
            {/* Dept header */}
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
              <button
                type="button"
                onClick={() => toggleCollapse(deptIdx)}
                className="text-muted-foreground hover:text-foreground"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </button>
              <input
                value={dept.dept}
                onChange={e => updateDeptName(deptIdx, e.target.value)}
                className="flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:outline-none focus:text-foreground"
              />
              <button
                type="button"
                onClick={() => removeDept(deptIdx)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Members */}
            {!isCollapsed && (
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1fr_72px_1fr_1fr_24px_24px] gap-2 px-3 py-1.5 border-b bg-muted/20 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Name</span>
                  <span>Role</span>
                  <span>Call</span>
                  <span>Phone</span>
                  <span>Email</span>
                  <span />
                  <span />
                </div>

                {dept.members.map((m, memberIdx) => (
                  <div
                    key={memberIdx}
                    className="group/member grid grid-cols-[1fr_1fr_72px_1fr_1fr_24px_24px] gap-2 px-3 py-1.5 border-b last:border-0 items-center"
                  >
                    <RolodexNameInput
                      value={m.name}
                      contacts={rolodexContacts}
                      onChange={v => updateMember(deptIdx, memberIdx, 'name', v)}
                      onSelect={c => selectFromRolodex(deptIdx, memberIdx, c)}
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      placeholder="Role"
                      value={m.role}
                      onChange={e => updateMember(deptIdx, memberIdx, 'role', e.target.value)}
                      className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      type="time"
                      value={m.callTime}
                      onChange={e => updateMember(deptIdx, memberIdx, 'callTime', e.target.value)}
                      className="w-full bg-transparent text-sm font-mono text-foreground focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      placeholder="Phone"
                      value={m.phone ?? ''}
                      onChange={e => updateMember(deptIdx, memberIdx, 'phone', e.target.value)}
                      className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <input
                      placeholder="Email"
                      type="email"
                      value={m.email ?? ''}
                      onChange={e => updateMember(deptIdx, memberIdx, 'email', e.target.value)}
                      className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
                    />
                    <button
                      type="button"
                      onClick={() => removeMember(deptIdx, memberIdx)}
                      className="opacity-0 group-hover/member:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {m.contactId
                      ? <LinkedBtn member={m} onSyncRequest={handleSyncRequest} />
                      : <RolodexBtn name={m.name} role={m.role} phone={m.phone} email={m.email} />
                    }
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addMember(deptIdx)}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add member
                </button>
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={addDept}
        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add department
      </button>

      {ConfirmDialog}
    </div>
  )
}
