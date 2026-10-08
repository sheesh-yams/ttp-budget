// Dietary restrictions on Rolodex contacts — quick-pick tags plus a note.
// Internal planning data: shown on the Crew page and in the call sheet
// editor, never on the call sheet that's sent out (allergies are health info).

export const DIETARY_TAGS = [
  { key: 'VEGETARIAN',   label: 'Vegetarian' },
  { key: 'VEGAN',        label: 'Vegan' },
  { key: 'PESCATARIAN',  label: 'Pescatarian' },
  { key: 'GLUTEN_FREE',  label: 'Gluten-free' },
  { key: 'DAIRY_FREE',   label: 'Dairy-free' },
  { key: 'NUT_ALLERGY',  label: 'Nut allergy' },
  { key: 'SHELLFISH',    label: 'Shellfish allergy' },
  { key: 'HALAL',        label: 'Halal' },
  { key: 'KOSHER',       label: 'Kosher' },
] as const

export type DietaryTag = typeof DIETARY_TAGS[number]['key']

const LABEL = new Map<string, string>(DIETARY_TAGS.map(t => [t.key, t.label]))
const ORDER = new Map<string, number>(DIETARY_TAGS.map((t, i) => [t.key, i]))

/** Allergies are flagged more strongly in the UI. */
export const ALLERGY_TAGS = new Set<string>(['NUT_ALLERGY', 'SHELLFISH'])

export function dietaryLabel(tag: string): string {
  return LABEL.get(tag) ?? tag
}

/** Known tags only, de-duplicated, in the standard order (server-side clean-up). */
export function normalizeDietaryTags(tags: unknown): DietaryTag[] {
  if (!Array.isArray(tags)) return []
  const known = [...new Set(tags.filter((t): t is string => typeof t === 'string' && LABEL.has(t)))]
  return known.sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)) as DietaryTag[]
}

export interface Dietary { tags: string[]; notes: string | null }

export function hasDietary(d: Dietary | null | undefined): boolean {
  return !!d && (d.tags.length > 0 || !!d.notes?.trim())
}

/**
 * The count line for catering — "2 Vegetarian · 1 Nut allergy · 1 other note".
 * Each person counts once per tag.
 */
export function summarizeDietary(people: Dietary[]): string {
  const counts = new Map<string, number>()
  let notesOnly = 0
  for (const p of people) {
    for (const t of new Set(p.tags)) counts.set(t, (counts.get(t) ?? 0) + 1)
    if (p.tags.length === 0 && p.notes?.trim()) notesOnly++
  }
  const parts = [...counts.entries()]
    .sort((a, b) => (ORDER.get(a[0]) ?? 99) - (ORDER.get(b[0]) ?? 99))
    .map(([t, n]) => `${n} ${dietaryLabel(t)}`)
  if (notesOnly) parts.push(`${notesOnly} other note${notesOnly === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
