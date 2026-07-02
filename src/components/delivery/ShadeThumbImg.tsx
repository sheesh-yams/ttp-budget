'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { getShadeThumbnailUrl } from '@/server/actions/delivery'

/**
 * Parses assetId and driveId from a Shade canonical URL.
 *
 * Handles the two common formats:
 *   /drive/{driveId}/assets/{assetId}   — drive asset link
 *   /publish/{assetId}                  — public publish link (no drive)
 */
function parseShadeUrl(url: string): { assetId: string; driveId: string } | null {
  try {
    const u = new URL(url)
    const driveMatch = u.pathname.match(/\/drive\/([^/]+)\/assets\/([^/?]+)/)
    if (driveMatch) return { driveId: driveMatch[1], assetId: driveMatch[2] }
    const publishMatch = u.pathname.match(/\/(?:publish|assets)\/([^/?]+)/)
    if (publishMatch) return { assetId: publishMatch[1], driveId: '' }
    return null
  } catch {
    return null
  }
}

interface Props {
  canonicalUrl: string
  /** Rendered while the thumbnail is loading or if the fetch fails. */
  fallback:     React.ReactNode
  /** Class applied to the <Image> element (default: object-cover). */
  imgClassName?: string
}

/**
 * Fetches a fresh Shade pre-signed thumbnail at render time and displays it.
 * Falls back to the provided placeholder on load or error.
 * Uses Next Image to avoid the @next/next/no-img-element lint rule.
 */
export function ShadeThumbImg({ canonicalUrl, fallback, imgClassName }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const parsed = parseShadeUrl(canonicalUrl)
    if (!parsed) return

    let cancelled = false
    getShadeThumbnailUrl(parsed.assetId, parsed.driveId).then(result => {
      if (!cancelled && result.success) setSrc(result.data)
    })
    return () => { cancelled = true }
  }, [canonicalUrl])

  if (!src) return <>{fallback}</>

  return (
    <Image
      src={src}
      alt=""
      fill
      className={imgClassName ?? 'object-cover'}
      unoptimized
    />
  )
}
