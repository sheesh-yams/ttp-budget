// Link previews for shot references — the pure half: URL rules, private-address
// checks and picking a preview image out of a page. No network here (see
// link-preview-fetch.ts); unit-tested in __tests__/link-preview.test.ts.

import { isIP } from 'node:net'

/** Parse a pasted link; adds https:// when the scheme is missing. Null if unusable. */
export function normaliseLink(input: string): URL | null {
  const raw = input.trim()
  if (!raw || raw.length > 2000) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  return checkUrlShape(url) ? url : null
}

/**
 * Only plain http(s) on default ports, no credentials, a real-looking host.
 * (Addresses are checked separately — names need DNS.)
 */
export function checkUrlShape(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username || url.password) return false
  if (url.port && url.port !== '80' && url.port !== '443') return false
  const host = hostOf(url)
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (isIP(host)) return !isPrivateAddress(host)
  return host.includes('.')
}

/** Hostname without IPv6 brackets, lower-cased. */
export function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]

/** True for any address our server must never call: private, loopback, link-local, metadata, multicast… */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const n = v4ToInt(ip)
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)))
  }
  if (kind === 6) {
    const a = ip.toLowerCase()
    // IPv4-mapped / -compatible (::ffff:10.0.0.1, ::ffff:a00:1) — judge the IPv4 inside.
    const mapped = a.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? a.match(/^::(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    const hexMapped = a.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16)
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    if (a === '::' || a === '::1') return true
    const first = parseInt(a.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return true   // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true   // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true   // ff00::/8 multicast
    if (a.startsWith('64:ff9b:')) return true      // NAT64 — could reach IPv4 private space
    if (a.startsWith('2001:db8:')) return true     // documentation
    return false
  }
  return true // not an IP at all — refuse
}

// ─── Picking the preview image ────────────────────────────────────────────────

/** YouTube video id from watch / youtu.be / shorts / embed / live links. */
export function youtubeId(url: URL): string | null {
  const host = hostOf(url).replace(/^www\.|^m\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)
      id = m ? m[1] : null
    }
  }
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null
}

export function isVimeo(url: URL): boolean {
  const host = hostOf(url)
  return host === 'vimeo.com' || host.endsWith('.vimeo.com')
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim()) : null
}

const IMAGE_META_KEYS = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']

/** The page's share image (og:image, twitter:image, image_src), resolved to an absolute http(s) URL. */
export function extractPreviewImage(html: string, pageUrl: URL): string | null {
  const head = html.slice(0, 500_000)
  const found = new Map<string, string>()
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase()
    const content = attr(tag, 'content')
    if (key && content && IMAGE_META_KEYS.includes(key) && !found.has(key)) found.set(key, content)
  }
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, 'rel') ?? '').toLowerCase() === 'image_src') {
      const href = attr(tag, 'href')
      if (href && !found.has('image_src')) found.set('image_src', href)
    }
  }
  for (const key of [...IMAGE_META_KEYS, 'image_src']) {
    const v = found.get(key)
    if (!v) continue
    try {
      const abs = new URL(v, pageUrl)
      if (abs.protocol === 'https:' || abs.protocol === 'http:') return abs.toString()
    } catch { /* try the next */ }
  }
  return null
}

/** Image types we turn into a JPEG (no SVG — it can carry scripts and external refs). */
export const PREVIEW_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
