'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { getShadeThumbnailUrl } from '@/server/actions/delivery'

interface Props {
  /** The deliverable version whose stored Shade link we preview. */
  versionId:    string
  /** Public delivery pages pass their page token (no session there). */
  pageToken?:   string
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
export function ShadeThumbImg({ versionId, pageToken, fallback, imgClassName }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    getShadeThumbnailUrl(versionId, pageToken).then(result => {
      if (!cancelled && result.success) setSrc(result.data)
    }).catch(() => { /* best-effort — keep the fallback */ })
    return () => { cancelled = true }
  }, [versionId, pageToken])

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
