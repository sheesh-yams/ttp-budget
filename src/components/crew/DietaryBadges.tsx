// Dietary restriction chips for a person (from their Rolodex contact).
// Internal planning info — used on the Crew page and in the call sheet
// editor, never on the call sheet that's sent to crew.

import { AlertTriangle, Utensils } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALLERGY_TAGS, dietaryLabel, hasDietary, summarizeDietary, type Dietary } from '@/lib/dietary'

export function DietaryBadges({ tags, notes, className, compact = false }: Dietary & { className?: string; compact?: boolean }) {
  if (!hasDietary({ tags, notes })) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {tags.map(t => (
        <span
          key={t}
          className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            ALLERGY_TAGS.has(t) ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {dietaryLabel(t)}
        </span>
      ))}
      {notes?.trim() && (
        compact ? (
          <span title={notes} className="inline-flex items-center text-amber-600" aria-label={`Dietary note: ${notes}`}>
            <AlertTriangle className="h-3 w-3" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="h-3 w-3 shrink-0" /> {notes}
          </span>
        )
      )}
    </div>
  )
}

/** "Dietary · 2 Vegetarian · 1 Nut allergy" for a group of people; nothing if none. */
export function DietarySummary({ people, label = 'Dietary', className }: { people: Dietary[]; label?: string; className?: string }) {
  const line = summarizeDietary(people.filter(hasDietary))
  if (!line) return null
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Utensils className="h-3.5 w-3.5 shrink-0" />
      <span><span className="font-medium text-foreground">{label}</span> · {line}</span>
    </p>
  )
}
