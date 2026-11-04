// Shot list — shared types, presets and pure rules. Plain module (no
// 'use server'), safe on client and server; unit-tested in
// src/lib/__tests__/shot-list.test.ts.

import { getSceneColor } from '@/lib/schedule-colors'

export type ShotStatusValue = 'TO_SHOOT' | 'DONE' | 'SKIPPED'
export const SHOT_STATUSES: readonly ShotStatusValue[] = ['TO_SHOOT', 'DONE', 'SKIPPED']

// ─── Presets (suggestions only — every field also takes free text) ───────────

export const SHOT_SIZES = [
  'EWS — Extreme wide', 'WS — Wide', 'MWS — Medium wide', 'MS — Medium', 'MCU — Medium close-up',
  'CU — Close-up', 'ECU — Extreme close-up', 'OTS — Over the shoulder', 'Insert', 'Two shot',
] as const
export const SHOT_ANGLES     = ['Eye level', 'High', 'Low', 'Overhead', "Bird's eye", 'Dutch', 'POV', 'Shoulder level', 'Hip level', 'Ground level'] as const
export const SHOT_MOVEMENTS  = ['Static', 'Pan', 'Tilt', 'Push in', 'Pull out', 'Dolly', 'Truck', 'Crane up', 'Crane down', 'Handheld', 'Orbit', 'Zoom', 'Whip pan', 'Tracking'] as const
export const SHOT_EQUIPMENT  = ['Sticks', 'Slider', 'Dolly', 'Gimbal', 'Steadicam', 'Handheld', 'Crane / jib', 'Drone', 'Overhead rig', 'Car mount'] as const
export const SHOT_SOUND      = ['Sync', 'MOS', 'VO', 'Wild track'] as const
export const SHOT_LENSES     = ['14mm', '18mm', '24mm', '35mm', '50mm', '65mm', '85mm', '100mm macro', '135mm'] as const
export const SHOT_FRAME_RATES = ['23.98 fps', '24 fps', '25 fps', '30 fps', '48 fps', '60 fps', '120 fps'] as const
export const SHOT_ASPECTS    = ['16:9', '9:16', '4:5', '1:1', '2.39:1'] as const

/** Stored size for a preset: "MCU — Medium close-up" → "MCU". */
export function sizeValue(preset: string): string {
  const i = preset.indexOf(' — ')
  return i > 0 ? preset.slice(0, i) : preset
}

// ─── Columns ──────────────────────────────────────────────────────────────────

/** Shot fields a person can type into (all free text except estMinutes). */
export const SHOT_TEXT_FIELDS = [
  'description', 'subject', 'size', 'angle', 'movement', 'lens', 'equipment',
  'camera', 'frameRate', 'aspect', 'sound', 'setup', 'cast', 'location', 'notes',
] as const
export type ShotTextField = (typeof SHOT_TEXT_FIELDS)[number]

/** What updateShot accepts — any subset of the editable fields. */
export type ShotPatch = Partial<Record<ShotTextField, string>> & { estMinutes?: number | null }

export const CORE_COLUMNS = [
  { key: 'size',      label: 'Size' },
  { key: 'angle',     label: 'Angle' },
  { key: 'movement',  label: 'Movement' },
  { key: 'lens',      label: 'Lens' },
  { key: 'equipment', label: 'Equipment' },
] as const

export const OPTIONAL_COLUMNS = [
  { key: 'camera',     label: 'Camera' },
  { key: 'frameRate',  label: 'Frame rate' },
  { key: 'aspect',     label: 'Aspect' },
  { key: 'sound',      label: 'Sound' },
  { key: 'setup',      label: 'Setup #' },
  { key: 'estMinutes', label: 'Est. time' },
  { key: 'cast',       label: 'Cast' },
  { key: 'location',   label: 'Location' },
  { key: 'notes',      label: 'Notes' },
] as const
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]['key']
const OPTIONAL_KEYS = OPTIONAL_COLUMNS.map(c => c.key) as readonly string[]

export interface ColumnPrefs { visible: OptionalColumn[] }

/** Read stored prefs: unknown keys dropped, order follows OPTIONAL_COLUMNS. */
export function readColumnPrefs(json: unknown): ColumnPrefs {
  const v = (json && typeof json === 'object' ? (json as { visible?: unknown }).visible : null)
  const set = new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [])
  return { visible: OPTIONAL_COLUMNS.map(c => c.key).filter(k => set.has(k)) }
}

// ─── Client-facing shapes ─────────────────────────────────────────────────────

export interface ShotReferenceView {
  id:         string
  kind:       'UPLOAD' | 'LINK'
  imageUrl:   string | null
  sourceUrl:  string | null
  sourceHost: string | null
}

export interface ShotView {
  id:          string
  sectionId:   string
  status:      ShotStatusValue
  description: string
  subject:     string | null
  size:        string | null
  angle:       string | null
  movement:    string | null
  lens:        string | null
  equipment:   string | null
  camera:      string | null
  frameRate:   string | null
  aspect:      string | null
  sound:       string | null
  setup:       string | null
  estMinutes:  number | null
  cast:        string | null
  location:    string | null
  notes:       string | null
  /** In order; the first is the ★ thumbnail. */
  references:  ShotReferenceView[]
}

export interface ShotSceneInfo {
  id:          string
  sceneNumber: string | null
  heading:     string        // "INT. KITCHEN — MORNING"
  color:       string        // swatch hex
  dayKey:      string | null // shoot day id
  dayLabel:    string | null // "Day 1 · Tue 18 Nov"
}

export interface ShotSectionView {
  id:      string
  title:   string
  code:    string | null
  sceneId: string | null
  shots:   ShotView[]
}

export interface ShotListView {
  id:             string | null   // null until the first edit creates it
  publicToken:    string | null
  shareEnabled:   boolean
  shareExpiresAt: string | null   // ISO; null when sharing is off
  columnPrefs:    ColumnPrefs
  sections:       ShotSectionView[]
}

// ─── Scene headings and shoot days ────────────────────────────────────────────

const INT_EXT_LABEL: Record<string, string> = { INT: 'INT.', EXT: 'EXT.', INT_EXT: 'INT./EXT.', CONTINUOUS: 'CONT.' }

export interface SceneLike {
  id:            string
  sceneNumber:   string | null
  setting:       string
  intExt:        'INT' | 'EXT' | 'INT_EXT' | 'CONTINUOUS'
  timeOfDay:     'DAY' | 'NIGHT' | 'DUSK' | 'DAWN' | 'MORNING' | 'EVENING'
  colorOverride: string | null
}

/** "INT. KITCHEN — MORNING" */
export function sceneHeading(s: Pick<SceneLike, 'intExt' | 'setting' | 'timeOfDay'>): string {
  const setting = s.setting.trim().toUpperCase() || 'UNTITLED'
  return `${INT_EXT_LABEL[s.intExt] ?? ''} ${setting} — ${s.timeOfDay}`.trim()
}

/** Swatch colour: the strip border (more visible than the strip fill). */
export function sceneSwatch(s: Pick<SceneLike, 'intExt' | 'timeOfDay' | 'colorOverride'>): string {
  const c = getSceneColor(s.intExt, s.timeOfDay, s.colorOverride)
  // White strips (INT day) have a near-invisible border — use a neutral grey instead.
  return c.border === 'transparent' || c.bg.toUpperCase() === '#FFFFFF' ? '#BDB8C4' : c.border
}

/** Title stored on a section when a scene is linked (survives the scene's deletion). */
export function sceneSectionTitle(s: Pick<SceneLike, 'sceneNumber' | 'intExt' | 'setting' | 'timeOfDay'>): string {
  return `${s.sceneNumber ? `Sc. ${s.sceneNumber} · ` : ''}${sceneHeading(s)}`
}

/** "Day 1 · Tue 18 Nov" — dates are @db.Date (UTC midnight). */
export function dayLabel(index: number, date: Date): string {
  const d = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `Day ${index + 1} · ${d.replace(',', '')}`
}

/**
 * Scene → its first shoot day on the primary schedule. `shootDays` must be in
 * project order (orderIndex, date); entries are the primary schedule's.
 */
export function sceneDayMap(
  entries:   { sceneId: string | null; shootDayId: string | null }[],
  shootDays: { id: string; date: Date }[],
): Map<string, { dayKey: string; dayLabel: string }> {
  const index = new Map(shootDays.map((d, i) => [d.id, i]))
  const best  = new Map<string, number>()
  for (const e of entries) {
    if (!e.sceneId || !e.shootDayId) continue
    const i = index.get(e.shootDayId)
    if (i === undefined) continue
    const cur = best.get(e.sceneId)
    if (cur === undefined || i < cur) best.set(e.sceneId, i)
  }
  const out = new Map<string, { dayKey: string; dayLabel: string }>()
  for (const [sceneId, i] of best) out.set(sceneId, { dayKey: shootDays[i].id, dayLabel: dayLabel(i, shootDays[i].date) })
  return out
}

// ─── Numbering ────────────────────────────────────────────────────────────────

/** Default prefix for a new free section: its title's first letter, else "S". */
export function defaultSectionCode(title: string): string {
  const m = title.trim().match(/[A-Za-z]/)
  return m ? m[0].toUpperCase() : 'S'
}

/**
 * The shot's number as shown: "{scene}.{n}" in a scene section ("1.2"); a
 * scene with no number uses the section's position; free sections use their
 * code ("B1"). `index` and `sectionIndex` are 0-based.
 */
export function shotCode(
  section: { sceneId: string | null; code: string | null; title: string },
  scene:   { sceneNumber: string | null } | null,
  sectionIndex: number,
  index: number,
): string {
  const n = index + 1
  if (section.sceneId && scene) return `${scene.sceneNumber?.trim() || sectionIndex + 1}.${n}`
  return `${section.code?.trim() || defaultSectionCode(section.title)}${n}`
}

// ─── Counts and the share link ────────────────────────────────────────────────

export interface ShotCounts { total: number; done: number; skipped: number; toShoot: number; planned: number }

/** `planned` excludes skipped shots — "2 of 8 done" reads against it. */
export function shotCounts(shots: { status: ShotStatusValue }[]): ShotCounts {
  let done = 0, skipped = 0
  for (const s of shots) {
    if (s.status === 'DONE') done++
    else if (s.status === 'SKIPPED') skipped++
  }
  const total = shots.length
  return { total, done, skipped, toShoot: total - done - skipped, planned: total - skipped }
}

const DAY_MS = 86_400_000

/**
 * When a share link stops working: 14 days after the project's last shoot day,
 * or — with no shoot days, or when that is already past — 30 days after it was
 * turned on. Null while sharing is off.
 */
export function shareExpiry(shareEnabledAt: Date | null, lastShootDate: Date | null): Date | null {
  if (!shareEnabledAt) return null
  const fromEnable = new Date(shareEnabledAt.getTime() + 30 * DAY_MS)
  if (!lastShootDate) return fromEnable
  const fromShoot = new Date(lastShootDate.getTime() + 15 * DAY_MS) // end of day +14
  return fromShoot > shareEnabledAt ? fromShoot : fromEnable
}
