/**
 * Pure hex-color helpers for per-workspace document branding.
 * Client- and server-safe (no deps). Used by the proposal/invoice web views,
 * the invoice PDF (react-pdf — no CSS variables), and the invoice email.
 */

const FALLBACK = '#5D00A4' // SlateSuite default — keeps unconfigured workspaces unchanged

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex ?? '').trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => clamp(x).toString(16).padStart(2, '0')).join('')
}

/** Mix `amt` (0–1) toward white. */
export function lighten(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex) ?? parseHex(FALLBACK)!
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
}

/** Mix `amt` (0–1) toward black. */
export function darken(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex) ?? parseHex(FALLBACK)!
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt))
}

/** Normalize to a valid #rrggbb, falling back to the SlateSuite default. */
export function safeHex(hex: string | null | undefined): string {
  return parseHex(hex ?? '') ? (hex as string) : FALLBACK
}
