// Link previews for shot references — the network half. Server-only.
//
// Our server fetches a URL a user pasted, so every request is SSRF-guarded:
//   • http(s) on default ports only (checkUrlShape);
//   • every DNS answer is checked at connect time (a custom `lookup`), so a
//     name can't resolve to a private / loopback / metadata address — and a
//     second lookup can't swap one in (no TOCTOU between check and connect);
//   • redirects are followed by hand (max 3), each hop re-checked;
//   • hard timeout and byte caps on both the page and the image.
// The image is re-encoded as a JPEG (sharp) and stored in R2, so the
// thumbnail never depends on the other site again and react-pdf can embed it.

import 'server-only'
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import type { LookupFunction } from 'node:net'
import sharp from 'sharp'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from '@/lib/r2'
import { generatePublicToken } from '@/lib/secure-token'
import {
  checkUrlShape, extractPreviewImage, hostOf, isPrivateAddress, isVimeo, youtubeId, PREVIEW_IMAGE_TYPES,
} from '@/lib/link-preview'

const TIMEOUT_MS   = 6000          // per request, wall clock (not just idle time)
const TOTAL_MS     = 10_000        // per fetchGuarded call, across redirects
const MAX_HTML     = 1_000_000     // pages: read at most this much (the <head> is near the top)
const MAX_IMAGE    = 8_000_000     // images: refuse anything bigger
const MAX_REDIRECT = 3
const UA = 'Mozilla/5.0 (compatible; SlateSuiteLinkPreview/1.0; +https://slatesuite.com)'

export class BlockedUrlError extends Error {}

// c-ares resolver with its own timeout: unlike dns.lookup it doesn't use the
// libuv thread pool, so a slow attacker-controlled DNS server can't stall the
// server's other lookups.
const resolver = new dns.Resolver({ timeout: 2500, tries: 2 })
function resolveAll(hostname: string): Promise<{ address: string; family: 4 | 6 }[]> {
  const one = (fam: 4 | 6) => new Promise<{ address: string; family: 4 | 6 }[]>(res => {
    const cb = (err: Error | null, addrs: string[]) => res(err ? [] : addrs.map(address => ({ address, family: fam })))
    if (fam === 4) resolver.resolve4(hostname, cb)
    else resolver.resolve6(hostname, cb)
  })
  return Promise.all([one(4), one(6)]).then(([a, b]) => [...a, ...b])
}

/** Lookup that refuses private answers — used for every connection we open. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  resolveAll(hostname).then(all => {
    const list = options.family === 4 || options.family === 6 ? all.filter(a => a.family === options.family) : all
    if (list.length === 0) return callback(Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }), '', 0)
    if (list.some(a => isPrivateAddress(a.address))) return callback(new BlockedUrlError(`Blocked address for ${hostname}`), '', 0)
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
    }
    callback(null, list[0].address, list[0].family)
  }, err => callback(err as Error, '', 0))
}

interface Fetched { url: URL; status: number; contentType: string; body: Buffer; truncated: boolean }
/** Byte caps by what the server sends: text is truncated at its cap, images over theirs are refused. */
interface Caps { text: number; image: number }

function requestOnce(url: URL, caps: Caps, accept: string, ms: number): Promise<Fetched & { location?: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http
    let hard: ReturnType<typeof setTimeout> | undefined
    const done = <T,>(fn: (v: T) => void) => (v: T) => { clearTimeout(hard); fn(v) }
    const ok = done(resolve), fail = done(reject)
    const req = mod.request(url, {
      method: 'GET',
      lookup: guardedLookup,
      headers: { 'user-agent': UA, accept, 'accept-encoding': 'identity', 'accept-language': 'en' },
      timeout: Math.min(TIMEOUT_MS, ms),
    }, res => {
      const status = res.statusCode ?? 0
      const contentType = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        return ok({ url, status, contentType, body: Buffer.alloc(0), truncated: false, location: String(res.headers.location) })
      }
      const isImage = contentType.startsWith('image/')
      const cap = isImage ? caps.image : caps.text
      if (isImage && Number(res.headers['content-length'] ?? 0) > cap) { res.destroy(); return fail(new Error('Too large')) }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        if (size + c.length > cap) {
          res.destroy()
          if (isImage) return fail(new Error('Too large'))
          chunks.push(c.subarray(0, cap - size))
          return ok({ url, status, contentType, body: Buffer.concat(chunks), truncated: true })
        }
        size += c.length
        chunks.push(c)
      })
      res.on('end', () => ok({ url, status, contentType, body: Buffer.concat(chunks), truncated: false }))
      res.on('error', fail)
    })
    // `timeout` above is idle time only; this caps the whole request (a slow drip can't hold it open).
    hard = setTimeout(() => req.destroy(new Error('Timed out')), Math.min(TIMEOUT_MS, ms))
    req.on('timeout', () => req.destroy(new Error('Timed out')))
    req.on('error', fail)
    req.end()
  })
}

/** GET with every hop checked, within TOTAL_MS. Throws BlockedUrlError for a refused address or URL. */
export async function fetchGuarded(start: URL, caps: Caps, accept: string): Promise<Fetched> {
  let url = start
  const deadline = Date.now() + TOTAL_MS
  for (let hop = 0; hop <= MAX_REDIRECT; hop++) {
    if (!checkUrlShape(url)) throw new BlockedUrlError('Blocked URL')
    const left = deadline - Date.now()
    if (left <= 0) throw new Error('Timed out')
    const res = await requestOnce(url, caps, accept, left)
    if (!res.location) return res
    url = new URL(res.location, url)
  }
  throw new Error('Too many redirects')
}

async function vimeoThumbnail(url: URL): Promise<string | null> {
  try {
    const api = new URL(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(url.toString())}`)
    const res = await fetchGuarded(api, { text: 200_000, image: 0 }, 'application/json')
    if (res.status !== 200) return null
    const json = JSON.parse(res.body.toString('utf8')) as { thumbnail_url?: unknown }
    return typeof json.thumbnail_url === 'string' ? json.thumbnail_url : null
  } catch {
    return null
  }
}

async function toJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: 50_000_000, animated: false })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
}

async function downloadImage(src: string): Promise<Buffer | null> {
  let url: URL
  try { url = new URL(src) } catch { return null }
  const res = await fetchGuarded(url, { text: 0, image: MAX_IMAGE }, 'image/*')
  if (res.status !== 200 || !PREVIEW_IMAGE_TYPES.has(res.contentType)) return null
  return res.body
}

export interface LinkPreviewResult {
  sourceUrl:  string
  sourceHost: string
  /** A JPEG of the preview image, ready to store; null → show a link card. */
  jpeg:       Buffer | null
}

/**
 * Find and download a link's preview image. Throws BlockedUrlError when the
 * link itself is refused; any other failure just means "no preview".
 */
export async function fetchLinkPreview(url: URL): Promise<LinkPreviewResult> {
  if (!checkUrlShape(url)) throw new BlockedUrlError('Blocked URL')
  const base = { sourceUrl: url.toString(), sourceHost: hostOf(url).replace(/^www\./, '') }

  try {
    let imageSrc: string | null = null
    const yt = youtubeId(url)
    if (yt) imageSrc = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
    else if (isVimeo(url)) imageSrc = await vimeoThumbnail(url)

    if (!imageSrc) {
      const page = await fetchGuarded(url, { text: MAX_HTML, image: MAX_IMAGE }, 'text/html,application/xhtml+xml,image/*;q=0.8')
      if (page.status !== 200) return { ...base, jpeg: null }
      if (PREVIEW_IMAGE_TYPES.has(page.contentType)) {
        // A direct image link (read in full, up to MAX_IMAGE).
        return { ...base, jpeg: await toJpeg(page.body) }
      }
      if (!page.contentType.includes('html')) return { ...base, jpeg: null }
      imageSrc = extractPreviewImage(page.body.toString('utf8'), page.url)
    }
    if (!imageSrc) return { ...base, jpeg: null }

    const img = await downloadImage(imageSrc)
    return { ...base, jpeg: img ? await toJpeg(img) : null }
  } catch (err) {
    // A link (or a redirect from it) that points at a private address is refused outright.
    if (err instanceof BlockedUrlError) throw err
    return { ...base, jpeg: null }
  }
}

/** Store a reference JPEG in R2; returns its public URL. */
export async function storeReferenceJpeg(workspaceId: string, jpeg: Buffer): Promise<string> {
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')
  if (!publicBase) throw new Error('R2 public URL is not configured.')
  const key = `shot-references/${workspaceId}-${generatePublicToken()}.jpg`
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: jpeg, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }))
  return `${publicBase}/${key}`
}
