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

/**
 * "No restrictions" — someone has actually checked and there's nothing to
 * plan for (vs never asked). Stored as a tag; any real restriction wins over
 * it, and it never counts as a dietary need.
 */
export const NO_RESTRICTIONS = 'NONE'

const LABEL = new Map<string, string>([...DIETARY_TAGS.map(t => [t.key, t.label] as const), [NO_RESTRICTIONS, 'No restrictions']])
const ORDER = new Map<string, number>(DIETARY_TAGS.map((t, i) => [t.key, i]))

/** Allergies are flagged more strongly in the UI. */
export const ALLERGY_TAGS = new Set<string>(['NUT_ALLERGY', 'SHELLFISH'])

export function dietaryLabel(tag: string): string {
  return LABEL.get(tag) ?? tag
}

/** Known tags only, de-duplicated, in the standard order (server-side clean-up).
 *  "No restrictions" is dropped when a real restriction is there too. */
export function normalizeDietaryTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const known = [...new Set(tags.filter((t): t is string => typeof t === 'string' && LABEL.has(t)))]
  const real = known.filter(t => t !== NO_RESTRICTIONS)
  if (real.length === 0) return known   // [] or ['NONE']
  return real.sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0))
}

export interface Dietary { tags: string[]; notes: string | null }

/** Same tags (any order) and same trimmed note — used to send dietary only when it changed. */
export function sameDietary(a: Dietary, b: Dietary): boolean {
  const at = new Set(a.tags), bt = new Set(b.tags)
  return at.size === bt.size && [...at].every(t => bt.has(t)) && (a.notes?.trim() || null) === (b.notes?.trim() || null)
}

/** Has something to plan for (a restriction or a note) — not "No restrictions". */
export function hasDietary(d: Dietary | null | undefined): boolean {
  return !!d && (d.tags.some(t => t !== NO_RESTRICTIONS) || !!d.notes?.trim())
}

/** Checked, and nothing to plan for. */
export function hasNoRestrictions(d: Dietary | null | undefined): boolean {
  return !!d && d.tags.includes(NO_RESTRICTIONS) && !hasDietary(d)
}

/**
 * The count line for catering — "2 Vegetarian · 1 Nut allergy · 1 other note".
 * Each person counts once per tag.
 */
export function summarizeDietary(people: Dietary[]): string {
  const counts = new Map<string, number>()
  let notesOnly = 0
  let none = 0
  for (const p of people) {
    if (hasNoRestrictions(p)) { none++; continue }
    const real = p.tags.filter(t => t !== NO_RESTRICTIONS)
    for (const t of new Set(real)) counts.set(t, (counts.get(t) ?? 0) + 1)
    if (real.length === 0 && p.notes?.trim()) notesOnly++
  }
  const parts = [...counts.entries()]
    .sort((a, b) => (ORDER.get(a[0]) ?? 99) - (ORDER.get(b[0]) ?? 99))
    .map(([t, n]) => `${n} ${dietaryLabel(t)}`)
  if (notesOnly) parts.push(`${notesOnly} other note${notesOnly === 1 ? '' : 's'}`)
  if (none) parts.push(`${none} no restrictions`)
  return parts.join(' · ')
}
