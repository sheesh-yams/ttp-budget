'use client'

import { useEffect } from 'react'

/**
 * Rendered on the public call-sheet page when ?print=1 is in the URL.
 * Waits for the page to be fully painted then calls window.print().
 * The browser's Save as PDF / Print dialog opens automatically.
 */
export function PrintTrigger() {
  useEffect(() => {
    // A short delay lets fonts, images, and Tailwind classes fully render
    // before the print dialog captures the page.
    const t = setTimeout(() => window.print(), 800)
    return () => clearTimeout(t)
  }, [])

  return null
}
