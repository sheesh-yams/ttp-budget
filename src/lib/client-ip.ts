/**
 * Resolve the real client IP from proxy headers — safely.
 *
 * `x-forwarded-for` is a comma-separated chain: each proxy appends the address
 * it received the request from. The LEFTMOST entries are supplied by the client
 * and are therefore spoofable — a request can arrive with
 * `x-forwarded-for: 1.2.3.4` and our trusted proxy (Railway's edge) will append
 * the real connecting IP to the RIGHT of it. So the trustworthy value is counted
 * from the right, not `split(',')[0]`.
 *
 * `TRUSTED_PROXY_HOPS` is how many proxies sit between the app and the public
 * internet that we trust to append correctly (default 1 = Railway only). If you
 * later put another trusted proxy in front (e.g. Cloudflare), bump it so we skip
 * that many trusted hops and land on the real client address.
 *
 * Using the leftmost value here would let an attacker send a rotating
 * `x-forwarded-for` header to defeat per-IP rate limiting and forge audit IPs.
 */
export function trustedClientIp(
  getHeader: (name: string) => string | null | undefined,
  fallback = 'unknown',
): string {
  const xff = getHeader('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      const parsed = Number(process.env.TRUSTED_PROXY_HOPS)
      const hops   = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1
      // Skip `hops - 1` trusted proxies from the right; clamp to the oldest entry.
      const idx = Math.max(0, parts.length - hops)
      return parts[idx]
    }
  }
  return getHeader('x-real-ip')?.trim() || fallback
}
