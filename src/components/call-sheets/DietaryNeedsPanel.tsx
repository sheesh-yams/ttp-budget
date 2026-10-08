// Call sheet editor → Logistics: who on today's sheet has dietary needs, with a
// count line for the caterer. Internal planning info from each person's
// Rolodex contact — never rendered on the call sheet that's sent out.

import { Lock } from 'lucide-react'
import type { CrewDept, TalentMember } from '@/server/actions/call-sheets'
import { hasDietary, type Dietary } from '@/lib/dietary'
import { DietaryBadges, DietarySummary } from '@/components/crew/DietaryBadges'

export function DietaryNeedsPanel({ crew, talent, dietary }: {
  crew:    CrewDept[]
  talent:  TalentMember[]
  /** Rolodex contact id → dietary. */
  dietary: Record<string, Dietary>
}) {
  const seen = new Set<string>()
  const people: { key: string; name: string; role: string; d: Dietary }[] = []
  const add = (contactId: string | undefined, name: string, role: string | undefined) => {
    if (!contactId || seen.has(contactId)) return
    const d = dietary[contactId]
    if (!hasDietary(d)) return
    seen.add(contactId)
    people.push({ key: contactId, name: name || '—', role: role ?? '', d })
  }
  for (const t of talent) add(t.contactId, t.name, t.role || 'Talent')
  for (const dept of crew) for (const m of dept.members ?? []) add(m.contactId, m.name, m.role)

  const linkedCount = [...talent, ...crew.flatMap(d => d.members ?? [])].filter(p => p.contactId).length

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        Dietary needs
        <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
          <Lock className="h-3 w-3" /> internal — not shown on the sent call sheet
        </span>
      </p>
      {people.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {linkedCount === 0
            ? 'Link people to their Rolodex contacts to see dietary needs here.'
            : 'No dietary restrictions on file for the people on this sheet.'}
        </p>
      ) : (
        <>
          <DietarySummary className="mt-1" label="For catering" people={people.map(p => p.d)} />
          <ul className="mt-2 space-y-1.5">
            {people.map(p => (
              <li key={p.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-foreground">{p.name}</span>
                {p.role && <span className="text-xs text-muted-foreground">{p.role}</span>}
                <DietaryBadges tags={p.d.tags} notes={p.d.notes} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
