/**
 * Dark mode for hard-coded hex classes (`bg-[#EEEDEA]`, `text-[#888780]` …).
 *
 * Scans the signed-in app for Tailwind arbitrary-hex classes and writes one
 * dark rule per class into src/styles/dark-overrides.css, so light mode stays
 * pixel-identical and dark mode gets the matching dark colour. Rules only
 * apply under <html class="dark"> and never inside a client-facing
 * .light-scope.
 *
 *   npx tsx scripts/dark-overrides.ts          # regenerate
 *   npx tsx scripts/dark-overrides.ts --check  # fail if a colour has no dark
 *                                               # mapping or the file is stale
 *
 * New code should prefer tokens (bg-card, text-muted-foreground,
 * border-border, var(--…)); add a colour to DARK below only when a hex is
 * genuinely needed.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

const ROOTS = ['src/app/(auth)', 'src/components']
const OUT = 'src/styles/dark-overrides.css'

type Role = 'bg' | 'text' | 'border'

// Light hex → dark value, per role. Keys are upper-case 6-digit hex.
const DARK: Record<string, Partial<Record<Role, string>>> = {
  // ── Brand ──
  '#5D00A4': { bg: '#8A3FD4', text: '#C99AEC', border: '#A96AE0' },
  '#8B4FC3': { bg: '#8A3FD4', text: '#C99AEC', border: '#A96AE0' },
  '#04FFCC': { bg: '#04FFCC', text: '#04FFCC', border: '#04FFCC' },
  '#003D31': { bg: '#003D31', text: '#003D31', border: '#003D31' },   // text on mint stays dark
  '#DFFFF7': { bg: 'rgba(4, 255, 204, .12)', text: '#04FFCC' },
  '#C9A8F0': { bg: 'rgba(169, 106, 224, .30)', text: '#C99AEC', border: 'rgba(169, 106, 224, .45)' },
  // ── Violet tints (cards, rows, borders) ──
  '#F5EDFA': { bg: '#241B31', border: '#2A2238' },
  '#F1ECF6': { bg: '#1E1829', border: '#2A2238' },
  '#EEE8F4': { bg: '#1E1829', border: '#2A2238' },
  '#E3DFF0': { bg: '#241B31', border: '#2A2238' },
  '#E8E0F0': { bg: '#2A2238', border: '#2A2238', text: '#6B6477' },
  '#D7D3DD': { bg: '#2A2238', border: '#3A3049', text: '#6B6477' },
  '#C9C3D3': { bg: '#3A3049', border: '#3A3049', text: '#6B6477' },
  '#F7F4FA': { bg: '#0F0B16', border: '#2A2238' },
  // ── Warm neutrals: surfaces ──
  '#FFFFFF': { bg: '#17121F', text: '#FFFFFF', border: '#2A2238' },
  '#FCFBFA': { bg: '#17121F', border: '#2A2238' },
  '#FAFAF8': { bg: '#17121F', border: '#2A2238' },
  '#FAF9F7': { bg: '#17121F', border: '#2A2238' },
  '#F6F5F2': { bg: '#1C1626', border: '#2A2238' },
  '#F3F2EF': { bg: '#1C1626', border: '#2A2238' },
  '#F1F0ED': { bg: '#1C1626', border: '#2A2238' },
  '#F0EFEC': { bg: '#1C1626', border: '#2A2238' },
  '#EEEDEA': { bg: '#1C1626', border: '#2A2238' },
  '#EDEBE7': { bg: '#221B2D', border: '#2A2238' },
  '#E2E0DC': { bg: '#2A2238', border: '#2A2238', text: '#6B6477' },
  '#DFDCD6': { bg: '#2A2238', border: '#3A3049' },
  '#D9D5CE': { bg: '#2A2238', border: '#3A3049', text: '#6B6477' },
  '#D8D5D0': { bg: '#2A2238', border: '#3A3049', text: '#6B6477' },
  '#D5D2CC': { bg: '#2A2238', border: '#3A3049', text: '#6B6477' },
  '#D3D0CB': { bg: '#2A2238', border: '#3A3049', text: '#6B6477' },
  '#CFCBC5': { bg: '#3A3049', border: '#3A3049', text: '#6B6477' },
  '#C9C6C0': { bg: '#3A3049', border: '#3A3049', text: '#6B6477' },
  '#BDBDBD': { bg: '#3A3049', border: '#3A3049', text: '#6B6477' },
  '#B0ACA6': { bg: '#4A3C5E', border: '#4A3C5E', text: '#8A8496' },
  // ── Warm neutrals: text ──
  '#9A9A9A': { text: '#8A8496', bg: '#4A3C5E', border: '#4A3C5E' },
  '#8A8A8A': { text: '#9A93A6', bg: '#4A3C5E' },
  '#888780': { text: '#9A93A6', bg: '#4A3C5E', border: '#4A3C5E' },
  '#6B6B6B': { text: '#B7B1C2', bg: '#4A3C5E' },
  '#5F5B54': { text: '#B7B1C2' },
  '#555555': { text: '#B7B1C2' },
  '#4B4B4B': { text: '#CFCAD8' },
  '#3A3A3A': { text: '#D9D4E2', bg: '#2E2640' },
  '#2C2C2A': { text: '#E7E3EE', bg: '#2E2640', border: '#E7E3EE' },
  '#1A1A1A': { text: '#F0EDF5', bg: '#2E2640', border: '#E7E3EE' },
  '#0A0612': { text: '#FFFFFF', bg: '#08050C', border: '#E7E3EE' },
  // ── Status ──
  '#B42318': { text: '#FCA5A5', bg: '#E5484D', border: 'rgba(239, 68, 68, .45)' },
  '#9F1239': { text: '#FDA4AF', bg: '#E11D48', border: 'rgba(244, 63, 94, .45)' },
  '#E5484D': { text: '#FCA5A5', bg: '#E5484D', border: '#E5484D' },
  '#FEECEB': { bg: 'rgba(239, 68, 68, .14)', border: 'rgba(239, 68, 68, .30)' },
  '#FFF1F2': { bg: 'rgba(244, 63, 94, .14)', border: 'rgba(244, 63, 94, .30)' },
  '#027A48': { text: '#6EE7B7', bg: '#10B981', border: 'rgba(16, 185, 129, .45)' },
  '#12B76A': { text: '#6EE7B7', bg: '#12B76A', border: '#12B76A' },
  '#E8F6EE': { bg: 'rgba(16, 185, 129, .14)', border: 'rgba(16, 185, 129, .30)' },
  '#B45309': { text: '#FCD34D', bg: '#D97706', border: 'rgba(245, 158, 11, .45)' },
  '#7A5A2B': { text: '#FCD34D', bg: '#7A5A2B' },
  '#F59E0B': { text: '#FBBF24', bg: '#F59E0B', border: '#F59E0B' },
  '#FEF3E2': { bg: 'rgba(245, 158, 11, .12)', border: 'rgba(245, 158, 11, .30)' },
  '#F6F1EA': { bg: 'rgba(245, 158, 11, .10)', border: 'rgba(245, 158, 11, .25)' },
  // ── Proposal status select (ProjectProposals) ──
  '#F3F4F6': { bg: 'rgba(255, 255, 255, .06)' },
  '#374151': { text: '#CFCAD8' },
  '#DBEAFE': { bg: 'rgba(59, 130, 246, .15)' },
  '#EDE9FE': { bg: 'rgba(169, 106, 224, .16)' },
  '#5B21B6': { text: '#D3B4F2' },
  '#FEF3C7': { bg: 'rgba(245, 158, 11, .14)' },
  '#92400E': { text: '#FCD34D' },
  '#78350F': { text: '#FCD34D' },
  '#D1FAE5': { bg: 'rgba(16, 185, 129, .14)' },
  '#065F46': { text: '#6EE7B7' },
  '#FEE2E2': { bg: 'rgba(239, 68, 68, .15)' },
  '#991B1B': { text: '#FCA5A5' },
  '#4B5563': { text: '#CFCAD8' },
  '#1D4ED8': { text: '#93C5FD' },
  '#DCFCE7': { bg: 'rgba(34, 197, 94, .14)' },
  '#15803D': { text: '#86EFAC' },
  '#1E40AF': { text: '#93C5FD', bg: '#2563EB', border: 'rgba(59, 130, 246, .45)' },
  '#2F5BC9': { text: '#93C5FD', bg: '#3B6FE0', border: 'rgba(59, 130, 246, .45)' },
  '#E8EFFD': { bg: 'rgba(59, 130, 246, .15)', border: 'rgba(59, 130, 246, .30)' },
  '#EAF0FD': { bg: 'rgba(59, 130, 246, .15)', border: 'rgba(59, 130, 246, .30)' },
}

const CLASS_RE = /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border|border-[tblrxy]|divide|ring|fill|stroke|outline|placeholder)-\[(#[0-9A-Fa-f]{3,6})\]/g

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p)
  }
  return out
}

const norm = (hex: string) => {
  const h = hex.replace('#', '').toUpperCase()
  return '#' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h)
}

const esc = (cls: string) => cls.replace(/([:[\]#./%])/g, '\\$1')

const PSEUDO: Record<string, string> = { hover: ':hover', focus: ':focus', 'focus-visible': ':focus-visible', active: ':active', disabled: ':disabled', placeholder: '::placeholder' }

function roleOf(prop: string): Role {
  if (prop === 'text' || prop === 'placeholder') return 'text'
  if (prop === 'bg' || prop === 'fill') return 'bg'
  return 'border'
}

function declaration(prop: string, value: string): string {
  switch (prop) {
    case 'bg':          return `background-color: ${value};`
    case 'text':
    case 'placeholder': return `color: ${value};`
    case 'fill':        return `fill: ${value};`
    case 'stroke':      return `stroke: ${value};`
    case 'ring':        return `--tw-ring-color: ${value};`
    case 'outline':     return `outline-color: ${value};`
    case 'border-t':    return `border-top-color: ${value};`
    case 'border-b':    return `border-bottom-color: ${value};`
    case 'border-l':    return `border-left-color: ${value};`
    case 'border-r':    return `border-right-color: ${value};`
    case 'border-x':    return `border-left-color: ${value}; border-right-color: ${value};`
    case 'border-y':    return `border-top-color: ${value}; border-bottom-color: ${value};`
    default:            return `border-color: ${value};`
  }
}

const found = new Map<string, { variants: string[]; prop: string; hex: string; files: Set<string> }>()
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(CLASS_RE)) {
      const [cls, variantStr, prop, hex] = m
      const variants = variantStr.split(':').filter(Boolean)
      const entry = found.get(cls) ?? { variants, prop, hex, files: new Set<string>() }
      entry.files.add(file)
      found.set(cls, entry)
    }
  }
}

const missing: string[] = []
const rules: string[] = []
for (const [cls, { variants, prop, hex, files }] of [...found.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  // Variants we can't express as a plain selector (sm:, group-*, data-*) are reported, not guessed.
  const unsupported = variants.filter(v => !(v in PSEUDO) && v !== 'dark')
  if (variants.includes('dark')) continue          // already dark-aware
  const value = DARK[norm(hex)]?.[roleOf(prop)]
  if (!value || unsupported.length) {
    missing.push(`${cls}  (${[...files].join(', ')})${unsupported.length ? ` — unsupported variant ${unsupported.join(':')}` : ''}`)
    continue
  }
  const pseudo = variants.map(v => PSEUDO[v]).join('')
  let sel = `.dark .${esc(cls)}${pseudo}:not(.light-scope, .light-scope *)`
  if (prop === 'divide') sel = `.dark .${esc(cls)}:not(.light-scope, .light-scope *) > :not([hidden]) ~ :not([hidden])`
  rules.push(`${sel} { ${declaration(prop, value)} }`)
}

const css = `/* GENERATED by scripts/dark-overrides.ts — do not edit by hand.
   Dark-mode values for hard-coded hex classes in the signed-in app.
   Regenerate after adding one: npx tsx scripts/dark-overrides.ts */
${rules.join('\n')}
`

// ── Inline styles: a literal colour in style={{ … }} has no dark value ─────
// (the class rules above can't reach it). Allowed: neutral scrims/white text,
// the brand mint, the always-dark sidebar ink, and files that are
// client-facing on purpose (they stay light).
const CLIENT_FACING = /src\/components\/(proposal\/|invoice\/(InvoicePDF|InvoicePublicView|HelcimPayButton|EmailPreview)|marketing\/|deal-memos\/(DealMemoPDF|DealMemoDocument|DealMemoSignForm)|shot-list\/PublicShotList|public\/|layout\/(Sidebar|MobileNav)|theme\/AppearancePicker)|PDF\.tsx|invoices\/preview\//
const STYLE_COLOR_RE = /\b(background|backgroundColor|color|borderColor|border(?:Top|Bottom|Left|Right)?|fill|stroke)\s*:\s*(['"`])([^'"`]*?(?:#[0-9A-Fa-f]{3,8}\b|hsla?\(\s*\d|rgba?\(\s*\d)[^'"`]*)\2/g
const ALLOWED_VALUE = /^(?:.*\b(?:rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\b.*)|#fff(?:fff)?|white|#04FFCC|#003D31|#00D9A8|#0A0612|#130B22)$/i
const inlineMisses: string[] = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (CLIENT_FACING.test(file) || !file.endsWith('.tsx')) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      for (const m of line.matchAll(STYLE_COLOR_RE)) {
        const value = m[3].trim()
        if (value.includes('var(--')) continue
        // Strip a "0.5px solid " style prefix before judging the colour.
        const colour = value.replace(/^[\d.]+px\s+\w+\s+/, '')
        if (!ALLOWED_VALUE.test(colour)) inlineMisses.push(`${file}:${i + 1}  ${m[1]}: ${value}`)
      }
    })
  }
}

if (process.argv.includes('--check')) {
  if (inlineMisses.length) console.error(`Inline colours with no dark value (use a token / var(--…)):\n  ${inlineMisses.join('\n  ')}`)
  const stale = !existsSync(OUT) || readFileSync(OUT, 'utf8') !== css
  if (missing.length) console.error(`No dark mapping for:\n  ${missing.join('\n  ')}`)
  if (stale) console.error(`${OUT} is out of date — run: npx tsx scripts/dark-overrides.ts`)
  if (missing.length || stale || inlineMisses.length) process.exit(1)
  console.log(`dark-overrides: ${rules.length} classes covered, up to date.`)
} else {
  writeFileSync(OUT, css)
  console.log(`Wrote ${rules.length} rules to ${OUT}.`)
  if (missing.length) { console.error(`\nNo dark mapping for:\n  ${missing.join('\n  ')}`); process.exit(1) }
}
