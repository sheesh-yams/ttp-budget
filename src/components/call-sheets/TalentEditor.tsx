'use client'

import { Plus, X } from 'lucide-react'
import type { TalentMember } from '@/server/actions/call-sheets'

interface Props {
  talent: TalentMember[]
  onChange: (talent: TalentMember[]) => void
  readonly?: boolean
}

const blank = (): TalentMember => ({ name: '', role: '', callTime: '', phone: '', email: '' })

export function TalentEditor({ talent, onChange, readonly = false }: Props) {
  function add() {
    onChange([...talent, blank()])
  }

  function remove(i: number) {
    onChange(talent.filter((_, idx) => idx !== i))
  }

  function update(i: number, field: keyof TalentMember, value: string) {
    onChange(talent.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
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
    <div className="rounded-lg border border-border/70 overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_1fr_72px_1fr_1fr_24px] gap-2 px-3 py-1.5 bg-muted/20 border-b text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Name</span>
        <span>Role / Character</span>
        <span>Call</span>
        <span>Phone</span>
        <span>Email</span>
        <span />
      </div>

      {talent.map((t, i) => (
        <div
          key={i}
          className="group/row grid grid-cols-[1fr_1fr_72px_1fr_1fr_24px] gap-2 px-3 py-1.5 border-b last:border-0 items-center"
        >
          <input
            placeholder="Name"
            value={t.name}
            onChange={e => update(i, 'name', e.target.value)}
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
  )
}
