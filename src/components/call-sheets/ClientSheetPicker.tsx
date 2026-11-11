'use client'

// Call sheet editor: which client people are on the sheet, and whether the
// crew's copy shows each one's phone and email. Their email is still used to
// send them the sheet when it's hidden.

import type { ClientContactPick, ClientPerson } from '@/lib/client-people'

export function ClientSheetPicker({ people, picks, onChange }: {
  people:   ClientPerson[]
  picks:    ClientContactPick[]
  onChange: (next: ClientContactPick[]) => void
}) {
  const pickOf = (id: string) => picks.find(p => p.id === id)
  const toggle = (id: string) => onChange(pickOf(id) ? picks.filter(p => p.id !== id) : [...picks, { id }])
  const set = (id: string, patch: Partial<ClientContactPick>) => onChange(picks.map(p => (p.id === id ? { ...p, ...patch } : p)))

  return (
    <ul className="space-y-2">
      {people.map(person => {
        const pick = pickOf(person.id)
        return (
          <li key={person.id}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={!!pick} onChange={() => toggle(person.id)} />
              <span className="min-w-0">
                <span className="font-medium">{person.name}</span>
                {person.title && <span className="ml-1.5 text-xs text-muted-foreground">{person.title}</span>}
                {!pick && (
                  <span className="block text-xs text-muted-foreground">{[person.phone, person.email].filter(Boolean).join(' · ') || 'no phone or email'}</span>
                )}
              </span>
            </label>
            {pick && (person.phone || person.email) && (
              <div className="ml-6 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {person.phone && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!pick.hidePhone} onChange={e => set(person.id, { hidePhone: !e.target.checked })} />
                    <span className={pick.hidePhone ? 'text-muted-foreground line-through' : ''}>Phone {person.phone}</span>
                  </label>
                )}
                {person.email && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!pick.hideEmail} onChange={e => set(person.id, { hideEmail: !e.target.checked })} />
                    <span className={pick.hideEmail ? 'text-muted-foreground line-through' : ''}>Email {person.email}</span>
                  </label>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
