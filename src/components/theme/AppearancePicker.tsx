'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { updateThemePreference } from '@/server/actions/workspace'
import { normalizeTheme, type ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'LIGHT',  label: 'Light' },
  { value: 'DARK',   label: 'Dark' },
  { value: 'SYSTEM', label: 'Match my device' },
]

/** A tiny picture of the app in that theme: the dark sidebar plus a page. */
function Thumb({ value }: { value: ThemePreference }) {
  const page = (bg: string, line: string, accent: string) => (
    <div className="grid content-start gap-1.5 p-2" style={{ background: bg }}>
      <div className="h-1.5 w-2/5 rounded-full" style={{ background: accent }} />
      <div className="h-1.5 rounded-full" style={{ background: line }} />
      <div className="h-1.5 w-4/5 rounded-full" style={{ background: line }} />
    </div>
  )
  return (
    <div className="grid h-16 grid-cols-[22px_1fr] overflow-hidden rounded-md border border-black/10">
      <div style={{ background: '#0A0612' }} />
      {value === 'SYSTEM' ? (
        <div className="grid grid-cols-2">
          {page('#F7F4FA', '#E8E0F0', '#5D00A4')}
          {page('#0F0B16', '#2A2238', '#8A3FD4')}
        </div>
      ) : value === 'DARK' ? page('#0F0B16', '#2A2238', '#8A3FD4') : page('#F7F4FA', '#E8E0F0', '#5D00A4')}
    </div>
  )
}

type ThemeWindow = { __ssApplyTheme?: (p: string) => void }

/** Settings → My profile → Appearance. Applies instantly, then saves. */
export function AppearancePicker({ initial }: { initial: string }) {
  const [value, setValue] = useState<ThemePreference>(normalizeTheme(initial))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function pick(next: ThemePreference) {
    if (next === value) return
    const prev = value
    setValue(next); setError(null)
    ;(window as unknown as ThemeWindow).__ssApplyTheme?.(next)
    start(async () => {
      const res = await updateThemePreference(next)
      if (!res.success) {
        setValue(prev)
        ;(window as unknown as ThemeWindow).__ssApplyTheme?.(prev)
        setError((res as { success: false; error: string }).error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">Appearance</p>
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> Saved</span>}
      </div>
      <div role="radiogroup" aria-label="Appearance" className="grid gap-2.5 sm:grid-cols-3">
        {OPTIONS.map(o => {
          const on = value === o.value
          return (
            // A div (not a <button>): it's your own setting, so a read-only
            // Settings page's disabled <fieldset> mustn't grey it out.
            <div
              key={o.value} role="radio" aria-checked={on} tabIndex={0}
              onClick={() => { if (!pending) pick(o.value) }}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !pending) { e.preventDefault(); pick(o.value) } }}
              className={`grid cursor-pointer gap-2 rounded-[10px] border bg-card p-2.5 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring ${on ? 'border-[color:var(--primary-text)] ring-1 ring-[color:var(--primary-text)]' : 'hover:border-foreground/20'}`}
            >
              <Thumb value={o.value} />
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className={`inline-block h-3.5 w-3.5 rounded-full border ${on ? 'border-[4px] border-[color:var(--primary-text)]' : 'border-muted-foreground/50'}`} />
                {o.label}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Only changes how SlateSuite looks for you. Proposals, invoices, call sheets and PDFs your clients and crew see keep your brand colours.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
