'use client'

import { Plus, X, BookUser, Check, Link2 } from 'lucide-react'
import { useState } from 'react'
import type { TalentMember } from '@/server/actions/call-sheets'
import { createContact, patchContactField } from '@/server/actions/rolodex'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { RolodexNameInput, type RolodexContact } from './RolodexNameInput'

function RolodexBtn({ name, role, phone, email }: { name: string; role: string; phone?: string; email?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  if (!name.trim()) return <span className="w-6" />

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    if (state !== 'idle') return
    setState('loading')
    await createContact({
      name: name.trim(),
      primaryRole: role.trim() || 'Talent',
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
      className={`opacity-0 group-hover/row:opacity-100 rounded p-0.5 transition-all ${
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

interface LinkedBtnProps {
  member: TalentMember
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
      className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50 transition-colors opacity-0 group-hover/row:opacity-100"
    >
      <Link2 className="h-3 w-3" />
    </button>
  )
}

interface Props {
  talent:           TalentMember[]
  onChange:         (talent: TalentMember[]) => void
  readonly?:        boolean
  rolodexContacts?: RolodexContact[]
}

const blank = (): TalentMember => ({ name: '', role: '', callTime: '', phone: '', email: '' })

export function TalentEditor({ talent, onChange, readonly = false, rolodexContacts = [] }: Props) {
  const { confirm, ConfirmDialog } = useConfirm()

  function add() {
    onChange([...talent, blank()])
  }

  function remove(i: number) {
    onChange(talent.filter((_, idx) => idx !== i))
  }

  function update(i: number, field: keyof TalentMember, value: string) {
    onChange(talent.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  function selectFromRolodex(i: number, contact: RolodexContact) {
    onChange(talent.map((t, idx) => idx === i
      ? {
          ...t,
          name:      contact.name,
          role:      t.role || contact.primaryRole,
          phone:     t.phone || contact.phone || '',
          email:     t.email || contact.email || '',
          contactId: contact.id,
        }
      : t
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

  // ── Readonly view ──────────────────────────────────────────────────────────
  if (readonly) {
    if (talent.length === 0) return null
    return (
      <div className="divide-y rounded-lg border">
        {talent.map((t, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t.name || '—'}</p>
              {t.role && <p className="text-xs text-muted-foreground">{t.role}</p>}
              <div className="flex flex-wrap gap-x-3 mt-0.5">
                {t.phone && <p className="text-xs text-muted-foreground">{t.phone}</p>}
                {t.email && <p className="text-xs text-muted-foreground">{t.email}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono font-semibold text-foreground">{t.callTime || '—'}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Editable view ──────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-lg border border-border/70 overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_1fr_72px_1fr_1fr_24px_24px] gap-2 px-3 py-1.5 bg-muted/20 border-b text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Name</span>
          <span>Role / Character</span>
          <span>Call</span>
          <span>Phone</span>
          <span>Email</span>
          <span />
          <span />
        </div>

        {talent.map((t, i) => (
          <div
            key={i}
            className="group/row grid grid-cols-[1fr_1fr_72px_1fr_1fr_24px_24px] gap-2 px-3 py-1.5 border-b last:border-0 items-center"
          >
            <RolodexNameInput
              value={t.name}
              contacts={rolodexContacts}
              onChange={v => update(i, 'name', v)}
              onSelect={c => selectFromRolodex(i, c)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
            />
            <input
              placeholder="Role / character"
              value={t.role ?? ''}
              onChange={e => update(i, 'role', e.target.value)}
              className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
            />
            <input
              type="time"
              value={t.callTime}
              onChange={e => update(i, 'callTime', e.target.value)}
              className="w-full bg-transparent text-sm font-mono text-foreground focus:outline-none border-b border-transparent focus:border-input"
            />
            <input
              placeholder="Phone"
              value={t.phone ?? ''}
              onChange={e => update(i, 'phone', e.target.value)}
              className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
            />
            <input
              placeholder="Email"
              type="email"
              value={t.email ?? ''}
              onChange={e => update(i, 'email', e.target.value)}
              className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="opacity-0 group-hover/row:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
            {t.contactId
              ? <LinkedBtn member={t} onSyncRequest={handleSyncRequest} />
              : <RolodexBtn name={t.name} role={t.role ?? ''} phone={t.phone} email={t.email} />
            }
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add talent
        </button>
      </div>

      {ConfirmDialog}
    </>
  )
}
