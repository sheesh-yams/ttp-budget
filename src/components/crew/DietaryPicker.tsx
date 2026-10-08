'use client'

// Dietary quick picks + note — the same editor in the Rolodex contact form and
// the Crew page edit card. Both save to the person's Rolodex contact, so the
// latest edit from either place is what everyone sees.

import { ALLERGY_TAGS, DIETARY_TAGS } from '@/lib/dietary'

export function DietaryPicker({ tags, notes, onTags, onNotes, disabled }: {
  tags:    string[]
  notes:   string
  onTags:  (tags: string[]) => void
  onNotes: (notes: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {DIETARY_TAGS.map(t => {
          const on = tags.includes(t.key)
          return (
            <button
              key={t.key} type="button" disabled={disabled}
              onClick={() => onTags(on ? tags.filter(x => x !== t.key) : [...tags, t.key])}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${on
                ? (ALLERGY_TAGS.has(t.key) ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700')
                : 'border-border text-muted-foreground hover:bg-muted/60'}`}
              aria-pressed={on}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <input
        type="text" value={notes} disabled={disabled} maxLength={1000}
        onChange={e => onNotes(e.target.value)}
        placeholder="Anything else — e.g. severe peanut, carries EpiPen"
        className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
      />
    </div>
  )
}
