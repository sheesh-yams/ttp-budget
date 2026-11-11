'use client'

// Pick who a document is for from the client's People list — one person
// (invoice bill-to) or several (proposal prepared-for, call sheet contacts).
// Role chips show why someone is suggested; editing people happens on the
// client page.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { normalizeRoles, ROLE_LABEL, type ClientPerson } from '@/lib/client-people'

export const SOMEONE_ELSE = '__other'

function describe(p: ClientPerson): string {
  const tags = [p.isMain ? 'Main' : null, ...normalizeRoles(p.roles).map(r => ROLE_LABEL[r])].filter(Boolean)
  return [p.title, tags.length ? tags.join(' · ') : null].filter(Boolean).join(' — ')
}

/** One person, or "Someone else" (a typed address). */
export function ClientPersonSelect({ people, value, onChange, otherLabel = 'Someone else (type an email)', id }: {
  people:      ClientPerson[]
  /** A person's id, or SOMEONE_ELSE. */
  value:       string
  onChange:    (person: ClientPerson | null) => void
  otherLabel?: string
  id?:         string
}) {
  return (
    <Select value={value} onValueChange={v => onChange(people.find(p => p.id === v) ?? null)}>
      <SelectTrigger id={id}><SelectValue placeholder="Choose a person…" /></SelectTrigger>
      <SelectContent>
        {people.map(p => (
          <SelectItem key={p.id} value={p.id}>
            <span className="font-medium">{p.name}</span>
            <span className="ml-1.5 text-muted-foreground">{p.email ?? 'no email'}{describe(p) ? ` · ${describe(p)}` : ''}</span>
          </SelectItem>
        ))}
        <SelectItem value={SOMEONE_ELSE}><span className="text-muted-foreground">{otherLabel}</span></SelectItem>
      </SelectContent>
    </Select>
  )
}

/** Several people, as checkboxes. */
export function ClientPeopleChecklist({ people, selected, onChange, disabled, emptyText = 'No people on this client yet — add them on the client page.' }: {
  people:     ClientPerson[]
  selected:   string[]
  onChange:   (ids: string[]) => void
  disabled?:  boolean
  emptyText?: string
}) {
  if (people.length === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  return (
    <ul className="space-y-1.5">
      {people.map(p => (
        <li key={p.id}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={selected.includes(p.id)} disabled={disabled} onChange={() => toggle(p.id)} />
            <span className="min-w-0">
              <span className="font-medium">{p.name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{[p.email, p.phone].filter(Boolean).join(' · ') || 'no email or phone'}</span>
              {describe(p) && <span className="block text-[11px] text-muted-foreground">{describe(p)}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
