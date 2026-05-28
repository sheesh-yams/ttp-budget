'use client'

import { Plus, X } from 'lucide-react'
import type { OtherContact } from '@/server/actions/call-sheets'

interface Props {
  contacts: OtherContact[]
  onChange: (contacts: OtherContact[]) => void
  readonly?: boolean
}

const blank = (): OtherContact => ({ name: '', role: '', company: '', phone: '', email: '' })

export function OtherContactsEditor({ contacts, onChange, readonly = false }: Props) {
  function add() { onChange([...contacts, blank()]) }
  function remove(i: number) { onChange(contacts.filter((_, idx) => idx !== i)) }
  function update(i: number, field: keyof OtherContact, value: string) {
    onChange(contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  if (readonly) {
    if (contacts.length === 0) return null
    return (
      <div className="divide-y rounded-lg border">
        {contacts.map((c, i) => (
          <div key={i} className="px-3 py-2">
            <p className="text-sm font-medium text-foreground">{c.name || '—'}</p>
            {(c.role || c.company) && (
              <p className="text-xs text-muted-foreground">
                {[c.role, c.company].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap gap-x-3 mt-0.5">
              {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
              {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_24px] gap-2 px-3 py-1.5 bg-muted/20 border-b text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Name</span>
        <span>Role</span>
        <span>Company</span>
        <span>Phone</span>
        <span>Email</span>
        <span />
      </div>

      {contacts.map((c, i) => (
        <div
          key={i}
          className="group/row grid grid-cols-[1fr_1fr_1fr_1fr_1fr_24px] gap-2 px-3 py-1.5 border-b last:border-0 items-center"
        >
          <input
            placeholder="Name"
            value={c.name}
            onChange={e => update(i, 'name', e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
          />
          <input
            placeholder="Venue Manager, AD…"
            value={c.role ?? ''}
            onChange={e => update(i, 'role', e.target.value)}
            className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
          />
          <input
            placeholder="Company"
            value={c.company ?? ''}
            onChange={e => update(i, 'company', e.target.value)}
            className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
          />
          <input
            placeholder="Phone"
            value={c.phone ?? ''}
            onChange={e => update(i, 'phone', e.target.value)}
            className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
          />
          <input
            placeholder="Email"
            type="email"
            value={c.email ?? ''}
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
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add contact
      </button>
    </div>
  )
}
