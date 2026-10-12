// Dietary restriction chips for a person (from their Rolodex contact).
// Internal planning info — used on the Crew page and in the call sheet
// editor, never on the call sheet that's sent to crew.

import { AlertTriangle, Check, Utensils } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALLERGY_TAGS, NO_RESTRICTIONS, dietaryLabel, hasDietary, hasNoRestrictions, summarizeDietary, type Dietary } from '@/lib/dietary'

export function DietaryBadges({ tags, notes, className, compact = false }: Dietary & { className?: string; compact?: boolean }) {
  if (hasNoRestrictions({ tags, notes })) {
    return (
      <div className={cn('flex items-center', className)}>
        <span className="inline-flex items-center gap-0.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Check className="h-2.5 w-2.5" /> No restrictions
        </span>
      </div>
    )
  }
  if (!hasDietary({ tags, notes })) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {tags.filter(t => t !== NO_RESTRICTIONS).map(t => (
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

/** "Dietary · 2 Vegetarian · 1 Nut allergy · 3 no restrictions" for a group
 *  of people; nothing if nobody has anything on file. */
export function DietarySummary({ people, label = 'Dietary', className }: { people: Dietary[]; label?: string; className?: string }) {
  const line = summarizeDietary(people.filter(p => hasDietary(p) || hasNoRestrictions(p)))
  if (!line) return null
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Utensils className="h-3.5 w-3.5 shrink-0" />
      <span><span className="font-medium text-foreground">{label}</span> · {line}</span>
    </p>
  )
}
