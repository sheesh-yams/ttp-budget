'use client'

import { useEffect } from 'react'
import { installTheme, type ThemePreference } from '@/lib/theme'

/** Applies the person's theme whenever the signed-in app mounts (incl. client-side sign-in), and drops it on leaving. */
export function ThemeController({ preference }: { preference: ThemePreference }) {
  useEffect(() => installTheme(preference), [preference])
  return null
}
