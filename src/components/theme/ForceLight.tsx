'use client'

import { useEffect } from 'react'

type ThemeWindow = { __ssApplyTheme?: (p: string) => void; __ssThemePref?: () => string }

/**
 * Client-facing pages are always light. If someone moves here from the
 * signed-in app in dark mode (same tab), switch to light — and put their
 * theme back when they leave.
 */
export function ForceLight() {
  useEffect(() => {
    const w = window as unknown as ThemeWindow
    const prev = w.__ssThemePref?.()
    w.__ssApplyTheme?.('LIGHT')
    document.documentElement.classList.remove('dark')
    return () => { if (prev) w.__ssApplyTheme?.(prev) }
  }, [])
  return null
}
