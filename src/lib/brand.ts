/**
 * brand.ts
 *
 * Utilities for turning workspace hex brand colors into the CSS variable
 * overrides injected by the auth layout.
 *
 * shadcn/ui tokens use raw HSL channels (no hsl() wrapper), e.g.:
 *   --primary: 275 100% 32%
 * so we convert hex → [h, s%, l%] and format accordingly.
 */

/** Parse a 6-char hex color (#RRGGBB or RRGGBB) → [r, g, b] 0–255 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const int   = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/** RGB 0–255 → HSL channels as [h 0–360, s 0–100, l 0–100] */
function rgbToHslChannels(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break
    case gn: h = ((bn - rn) / d + 2) / 6; break
    case bn: h = ((rn - gn) / d + 4) / 6; break
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/** Hex → shadcn HSL token string, e.g. "#5D00A4" → "275 100% 32%" */
export function hexToShadcnHsl(hex: string): string {
  try {
    const [r, g, b] = hexToRgb(hex)
    const [h, s, l] = rgbToHslChannels(r, g, b)
    return `${h} ${s}% ${l}%`
  } catch {
    return '275 100% 32%' // fallback to default violet
  }
}

/** Lighten a hex color by mixing it toward white (0–1) */
function lighten(hex: string, amount: number): string {
  try {
    const [r, g, b] = hexToRgb(hex)
    const mix = (c: number) => Math.round(c + (255 - c) * amount)
    return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return hex
  }
}

/** Darken a hex color by mixing it toward black (0–1) */
function darken(hex: string, amount: number): string {
  try {
    const [r, g, b] = hexToRgb(hex)
    const mix = (c: number) => Math.round(c * (1 - amount))
    return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return hex
  }
}

/**
 * Build the <style> tag content that overrides brand CSS variables
 * for the entire authenticated app shell.
 *
 * primaryColor  → violet role  (sidebar, buttons, headings, active states)
 * accentColor   → mint role    (CTAs, active nav indicator, highlights)
 */
export function buildBrandStyles(primaryColor: string, accentColor: string): string {
  const primaryHsl     = hexToShadcnHsl(primaryColor)
  const accentHsl      = hexToShadcnHsl(accentColor)

  // Derive tints / shades from the raw hex
  const primaryLight   = lighten(primaryColor, 0.92)  // card tint
  const primaryMid     = lighten(primaryColor, 0.35)  // hover state
  const primaryDark    = darken(primaryColor, 0.55)   // deep dark
  const accentDark     = darken(accentColor, 0.75)    // text on accent bg
  const accentHover    = darken(accentColor, 0.15)    // hover

  // Border: very light tint of primary
  const borderHsl      = hexToShadcnHsl(lighten(primaryColor, 0.70))
  const secondaryHsl   = hexToShadcnHsl(primaryLight)

  return `
:root {
  /* shadcn/ui tokens — override defaults in globals.css */
  --primary:            ${primaryHsl};
  --primary-foreground: 0 0% 100%;
  --accent:             ${accentHsl};
  --accent-foreground:  ${hexToShadcnHsl(accentDark)};
  --secondary:          ${secondaryHsl};
  --secondary-foreground: ${hexToShadcnHsl(primaryDark)};
  --ring:               ${primaryHsl};
  --border:             ${borderHsl};
  --input:              ${borderHsl};

  /* Direct brand hex tokens — used in inline styles & sidebar */
  --brand-primary:      ${primaryColor};
  --brand-primary-mid:  ${primaryMid};
  --brand-primary-light:${primaryLight};
  --brand-primary-dark: ${primaryDark};
  --brand-accent:       ${accentColor};
  --brand-accent-hover: ${accentHover};
  --brand-accent-dark:  ${accentDark};

  /* Keep legacy names in sync so existing code that references them still works */
  --color-violet:       ${primaryColor};
  --color-violet-mid:   ${primaryMid};
  --color-violet-hover: ${lighten(primaryColor, 0.20)};
  --color-violet-tint:  ${primaryLight};
  --color-violet-dark:  ${primaryDark};
  --color-mint:         ${accentColor};
  --color-mint-hover:   ${accentHover};
  --color-mint-dark:    ${accentDark};
}
`.trim()
}
