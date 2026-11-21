import { normalizeTheme, resolveTheme, themeScript } from '@/lib/theme'

describe('theme', () => {
  it('normalizes unknown values to LIGHT', () => {
    expect(normalizeTheme('DARK')).toBe('DARK')
    expect(normalizeTheme('dark')).toBe('LIGHT')
    expect(normalizeTheme(null)).toBe('LIGHT')
  })
  it('resolves a preference against the device', () => {
    expect(resolveTheme('LIGHT', true)).toBe('light')
    expect(resolveTheme('DARK', false)).toBe('dark')
    expect(resolveTheme('SYSTEM', true)).toBe('dark')
    expect(resolveTheme('SYSTEM', false)).toBe('light')
  })
  it('the inline script embeds only a known preference', () => {
    expect(themeScript('DARK')).toContain('p="DARK"')
    expect(themeScript('x</script><script>alert(1)' as never)).toContain('p="LIGHT"')
  })
})

import { installTheme } from '@/lib/theme'

describe('installTheme (client-side arrivals and leaving the app)', () => {
  function fakeBrowser(deviceDark: boolean) {
    const classes = new Set<string>()
    const listeners = new Set<() => void>()
    const mq = { matches: deviceDark, addEventListener: (_: string, f: () => void) => listeners.add(f), removeEventListener: (_: string, f: () => void) => listeners.delete(f) }
    const g = globalThis as unknown as Record<string, unknown>
    g.window = { matchMedia: () => mq } as unknown
    g.document = { documentElement: { classList: {
      toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c) },
      remove: (c: string) => { classes.delete(c) },
    } } } as unknown
    return { classes, listeners, mq, w: g.window as Record<string, (p?: string) => unknown> }
  }
  afterEach(() => { delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document })

  it('applies, switches instantly, follows the device for SYSTEM, and cleans up', () => {
    const b = fakeBrowser(true)
    const off = installTheme('DARK')
    expect(b.classes.has('dark')).toBe(true)
    b.w.__ssApplyTheme('LIGHT'); expect(b.classes.has('dark')).toBe(false)
    b.w.__ssApplyTheme('SYSTEM'); expect(b.classes.has('dark')).toBe(true)
    b.mq.matches = false; b.listeners.forEach(f => f()); expect(b.classes.has('dark')).toBe(false)
    expect(b.listeners.size).toBe(1)
    off()
    expect([b.classes.has('dark'), b.listeners.size, typeof b.w.__ssApplyTheme]).toEqual([false, 0, 'undefined'])
  })

  it('takes over the inline script’s device listener', () => {
    const b = fakeBrowser(false)
    let scriptOff = false
    ;(b.w as Record<string, unknown>).__ssThemeOff = () => { scriptOff = true }
    installTheme('LIGHT')
    expect(scriptOff).toBe(true)
  })
})
