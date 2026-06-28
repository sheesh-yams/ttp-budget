/**
 * Embed detection — pure module, safe to import in both server and client.
 *
 * Given a bare URL or an <iframe> HTML snippet, returns:
 *   { provider, renderMode, canonicalUrl, embedHtml? }
 * or
 *   { error: string }
 *
 * For bare URLs that aren't on the known allow-list:
 *   returns GENERIC_LINK / EXTERNAL_ONLY (never rejects).
 *
 * For iframe HTML whose src isn't on the allow-list:
 *   returns { error } — we never surface unrecognised iframe sources.
 *
 * iframe sanitization is done with a regex-based attribute parser rather than
 * a full HTML parser to avoid ESM-only transitive dependencies and to keep this
 * module importable in any environment (server, client, Jest).
 */

export type EmbedProvider =
  | 'FRAME_IO'
  | 'SHADE'
  | 'GDRIVE_FILE'
  | 'GDRIVE_FOLDER'
  | 'DROPBOX_FILE'
  | 'DROPBOX_FOLDER'
  | 'DIRECT_IMAGE'
  | 'DIRECT_VIDEO'
  | 'YOUTUBE'
  | 'VIMEO'
  | 'GENERIC_LINK'

export type RenderMode = 'IFRAME' | 'NATIVE_MEDIA' | 'EXTERNAL_ONLY'

export interface DetectEmbedSuccess {
  provider:     EmbedProvider
  renderMode:   RenderMode
  canonicalUrl: string
  embedHtml?:   string  // sanitized iframe HTML when input was an <iframe> snippet
}

export interface DetectEmbedError {
  error: string
}

export type DetectEmbedResult = DetectEmbedSuccess | DetectEmbedError

// Attributes allowed on sanitized <iframe> output
const IFRAME_ALLOWED_ATTRS = new Set([
  'src', 'width', 'height', 'allow', 'allowfullscreen', 'referrerpolicy',
])

// ─── URL classification ────────────────────────────────────────────────────────

function classifyUrl(rawUrl: string): DetectEmbedSuccess | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  const path = url.pathname

  // Direct image / video — check extension before host
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
    return { provider: 'DIRECT_IMAGE', renderMode: 'NATIVE_MEDIA', canonicalUrl: rawUrl }
  }
  if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
    return { provider: 'DIRECT_VIDEO', renderMode: 'NATIVE_MEDIA', canonicalUrl: rawUrl }
  }

  // Frame.io presentation — app.frame.io/presentations/ or f.io/
  if (
    (host === 'app.frame.io' && path.startsWith('/presentations/')) ||
    host === 'f.io'
  ) {
    return { provider: 'FRAME_IO', renderMode: 'IFRAME', canonicalUrl: rawUrl }
  }

  // Frame.io v4 share — next.frame.io/share/
  if (host === 'next.frame.io' && path.startsWith('/share/')) {
    return { provider: 'FRAME_IO', renderMode: 'IFRAME', canonicalUrl: rawUrl }
  }

  // Shade
  if (host === 'shade.inc' || host.endsWith('.shade.inc')) {
    return { provider: 'SHADE', renderMode: 'IFRAME', canonicalUrl: rawUrl }
  }

  // YouTube
  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'youtu.be') {
    const canonicalUrl = toYoutubeEmbed(url)
    if (!canonicalUrl) return { provider: 'GENERIC_LINK', renderMode: 'EXTERNAL_ONLY', canonicalUrl: rawUrl }
    return { provider: 'YOUTUBE', renderMode: 'IFRAME', canonicalUrl }
  }
  if (host === 'www.youtube-nocookie.com' || host === 'youtube-nocookie.com') {
    return { provider: 'YOUTUBE', renderMode: 'IFRAME', canonicalUrl: rawUrl }
  }

  // Vimeo — regular vimeo.com/{id} watch page
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const canonicalUrl = toVimeoEmbed(url)
    if (!canonicalUrl) return { provider: 'GENERIC_LINK', renderMode: 'EXTERNAL_ONLY', canonicalUrl: rawUrl }
    return { provider: 'VIMEO', renderMode: 'IFRAME', canonicalUrl }
  }
  if (host === 'player.vimeo.com') {
    // Already an embed URL
    return { provider: 'VIMEO', renderMode: 'IFRAME', canonicalUrl: rawUrl }
  }

  // Google Drive — file vs folder
  if (host === 'drive.google.com') {
    if (path.startsWith('/file/d/')) {
      const canonicalUrl = toGDrivePreview(url)
      return { provider: 'GDRIVE_FILE', renderMode: 'IFRAME', canonicalUrl }
    }
    if (path.startsWith('/drive/folders/')) {
      return { provider: 'GDRIVE_FOLDER', renderMode: 'EXTERNAL_ONLY', canonicalUrl: rawUrl }
    }
    return { provider: 'GENERIC_LINK', renderMode: 'EXTERNAL_ONLY', canonicalUrl: rawUrl }
  }

  // Dropbox — all modes block iframes
  if (host === 'www.dropbox.com' || host === 'dropbox.com') {
    const isFile = path.startsWith('/s/') || path.startsWith('/scl/fi/')
    return {
      provider:     isFile ? 'DROPBOX_FILE' : 'DROPBOX_FOLDER',
      renderMode:   'EXTERNAL_ONLY',
      canonicalUrl: rawUrl,
    }
  }

  return null  // caller falls back to GENERIC_LINK
}

// ─── URL conversion helpers ───────────────────────────────────────────────────

function toYoutubeEmbed(url: URL): string | null {
  let videoId: string | null = null

  if (url.hostname === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0]
  } else {
    videoId = url.searchParams.get('v')
  }

  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null

  const params = new URLSearchParams()
  params.set('autoplay', '0')
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`
}

function toVimeoEmbed(url: URL): string | null {
  // vimeo.com/{id} or vimeo.com/{id}/...
  const match = url.pathname.match(/^\/(\d+)/)
  if (!match) return null
  const videoId = match[1]
  return `https://player.vimeo.com/video/${videoId}`
}

function toGDrivePreview(url: URL): string {
  // Normalize: remove trailing /view /edit /preview (if present), then add /preview
  const cleanPath = url.pathname
    .replace(/\/(view|edit|preview)\/?$/, '')
    .replace(/\/$/, '')
  return `https://drive.google.com${cleanPath}/preview`
}

// ─── Iframe HTML sanitization ─────────────────────────────────────────────────

/**
 * Extracts the value of a named attribute from a raw HTML attribute string.
 * Handles both double-quoted and single-quoted attribute values.
 */
function extractAttr(attrsRaw: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'i')
  const m = re.exec(attrsRaw)
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? null
}

function sanitizeIframe(html: string): DetectEmbedResult {
  // Strip any <script>…</script> blocks first
  const stripped = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')

  // Find the <iframe ...> opening tag
  const iframeMatch = stripped.match(/<iframe\b([^>]*)>/i)
  if (!iframeMatch) return { error: 'No <iframe> element found in input' }

  const attrsRaw = iframeMatch[1]

  const src = extractAttr(attrsRaw, 'src')
  if (!src) return { error: 'iframe is missing a src attribute' }

  // Validate src against the same URL allow-list
  const classified = classifyUrl(src)
  if (!classified || classified.provider === 'GENERIC_LINK') {
    return { error: `iframe src "${src}" is not from a recognized provider` }
  }

  // Rebuild the iframe keeping only allowed attributes.
  // `allowfullscreen` is a boolean attribute (no value) — handle separately.
  const safeAttrs: string[] = [`src="${classified.canonicalUrl}"`]
  const BOOLEAN_ATTRS = new Set(['allowfullscreen'])
  for (const attr of IFRAME_ALLOWED_ATTRS) {
    if (attr === 'src') continue
    if (BOOLEAN_ATTRS.has(attr)) {
      if (new RegExp(`\\b${attr}\\b`, 'i').test(attrsRaw)) {
        safeAttrs.push(attr)
      }
    } else {
      const val = extractAttr(attrsRaw, attr)
      if (val !== null) {
        safeAttrs.push(`${attr}="${val.replace(/"/g, '')}"`)
      }
    }
  }

  const embedHtml = `<iframe ${safeAttrs.join(' ')}></iframe>`

  return {
    provider:     classified.provider,
    renderMode:   classified.renderMode,
    canonicalUrl: classified.canonicalUrl,
    embedHtml,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects the embed type for a bare URL or <iframe> HTML snippet.
 *
 * - Bare URL → always returns a result (GENERIC_LINK for unknown providers)
 * - iframe HTML → returns { error } for unknown/unsafe providers
 */
export function detectEmbed(input: string): DetectEmbedResult {
  const trimmed = input.trim()

  // Any input containing an HTML tag is treated as an embed snippet (not a URL).
  // This ensures `<div>...</div>` returns { error } rather than falling through
  // to the GENERIC_LINK URL path.
  if (/<[a-z]/i.test(trimmed)) {
    return sanitizeIframe(trimmed)
  }

  // Bare URL path
  const classified = classifyUrl(trimmed)
  if (classified) return classified

  // Unknown URL — safe EXTERNAL_ONLY fallback
  return {
    provider:     'GENERIC_LINK',
    renderMode:   'EXTERNAL_ONLY',
    canonicalUrl: trimmed,
  }
}
