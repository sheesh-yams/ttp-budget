/**
 * schedule-colors.ts
 *
 * Industry-standard production strip colors keyed by intExt + timeOfDay.
 * Returns { bg, text, border } CSS hex values.
 *
 * Color rule:
 *   INT  + DAY/MORNING/EVENING → White
 *   EXT  + DAY/MORNING/EVENING → Yellow
 *   INT  + NIGHT               → Blue
 *   EXT  + NIGHT               → Green
 *   any  + DUSK                → Red
 *   any  + DAWN                → Orange
 *   INT_EXT                    → 50/50 blend of INT + EXT for the same timeOfDay
 *   CONTINUOUS                 → sentinel; caller uses previous entry's color
 */

import type { IntExt, TimeOfDay } from '@prisma/client'

export interface StripColor {
  bg:     string
  text:   string
  border: string
}

const CONTINUOUS_SENTINEL: StripColor = { bg: 'transparent', text: 'inherit', border: 'transparent' }

// Base palettes per time-of-day category
function baseColor(timeOfDay: TimeOfDay, isInt: boolean): StripColor {
  if (timeOfDay === 'DUSK') return { bg: '#FEE2E2', text: '#7f1d1d', border: '#fca5a5' }
  if (timeOfDay === 'DAWN') return { bg: '#FFEDD5', text: '#7c2d12', border: '#fdba74' }
  if (timeOfDay === 'NIGHT') {
    return isInt
      ? { bg: '#DBEAFE', text: '#1e3a5f', border: '#93c5fd' }
      : { bg: '#DCFCE7', text: '#14532d', border: '#86efac' }
  }
  // DAY / MORNING / EVENING
  return isInt
    ? { bg: '#FFFFFF', text: '#1a1a1a', border: '#e5e7eb' }
    : { bg: '#FEF9C3', text: '#713f12', border: '#fde047' }
}

/** Blend two hex colors at 50/50 */
function blendHex(a: string, b: string): string {
  const r = (c: string) => parseInt(c.slice(1), 16)
  const toR = (n: number) => `#${((n >> 16) & 0xff).toString(16).padStart(2, '0')}${((n >> 8) & 0xff).toString(16).padStart(2, '0')}${(n & 0xff).toString(16).padStart(2, '0')}`
  const av = r(a), bv = r(b)
  const rr = Math.round(((av >> 16) + (bv >> 16)) / 2)
  const gr = Math.round((((av >> 8) & 0xff) + ((bv >> 8) & 0xff)) / 2)
  const br = Math.round(((av & 0xff) + (bv & 0xff)) / 2)
  return toR((rr << 16) | (gr << 8) | br)
}

export function getSceneColor(
  intExt: IntExt,
  timeOfDay: TimeOfDay,
  colorOverride?: string | null,
): StripColor {
  if (colorOverride) return { bg: colorOverride, text: '#1a1a1a', border: colorOverride }
  if (intExt === 'CONTINUOUS') return CONTINUOUS_SENTINEL

  if (intExt === 'INT_EXT') {
    const intC = baseColor(timeOfDay, true)
    const extC = baseColor(timeOfDay, false)
    return {
      bg:     blendHex(intC.bg, extC.bg),
      text:   intC.text,
      border: blendHex(intC.border, extC.border),
    }
  }

  return baseColor(timeOfDay, intExt === 'INT')
}

// Banner colors by type
export const BANNER_COLORS: Record<string, StripColor> = {
  MEAL_BREAK:    { bg: '#4a1942', text: '#f3e8f5', border: '#7b2f72' },  // maroon/purple
  COMPANY_MOVE:  { bg: '#1e3a5f', text: '#dbeafe', border: '#3b6fa0' },  // dark blue
  COFFEE_BREAK:  { bg: '#3f2a14', text: '#fdf4e7', border: '#7a5328' },  // brown
  NOTE:          { bg: '#374151', text: '#f3f4f6', border: '#6b7280' },  // gray
  CUSTOM:        { bg: '#374151', text: '#f3f4f6', border: '#6b7280' },  // gray
}
