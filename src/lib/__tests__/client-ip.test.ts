import { trustedClientIp } from '@/lib/client-ip'

function headersFrom(map: Record<string, string>) {
  return (name: string) => map[name.toLowerCase()] ?? null
}

describe('trustedClientIp', () => {
  const origHops = process.env.TRUSTED_PROXY_HOPS
  afterEach(() => {
    if (origHops === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = origHops
  })

  it('uses the rightmost (proxy-appended) XFF entry, not the client-supplied left', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    const ip = trustedClientIp(headersFrom({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }))
    expect(ip).toBe('9.9.9.9')
  })

  it('a spoofed leftmost value cannot win', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    // Attacker prepends fake IPs; the real connecting IP is still appended last.
    const ip = trustedClientIp(headersFrom({ 'x-forwarded-for': 'evil, evil2, evil3, 203.0.113.7' }))
    expect(ip).toBe('203.0.113.7')
  })

  it('single-entry XFF returns that entry', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    expect(trustedClientIp(headersFrom({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('honors TRUSTED_PROXY_HOPS to skip additional trusted proxies', () => {
    process.env.TRUSTED_PROXY_HOPS = '2'
    // 2 trusted hops: skip the last (e.g. Railway edge), land on the real client.
    const ip = trustedClientIp(headersFrom({ 'x-forwarded-for': 'client, cf-edge, railway-edge' }))
    expect(ip).toBe('cf-edge')
  })

  it('clamps hops to the oldest entry rather than going out of range', () => {
    process.env.TRUSTED_PROXY_HOPS = '5'
    expect(trustedClientIp(headersFrom({ 'x-forwarded-for': 'a, b' }))).toBe('a')
  })

  it('falls back to x-real-ip when no XFF', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    expect(trustedClientIp(headersFrom({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
  })

  it('returns the fallback when nothing is present', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    expect(trustedClientIp(headersFrom({}))).toBe('unknown')
    expect(trustedClientIp(headersFrom({}), '127.0.0.1')).toBe('127.0.0.1')
  })

  it('ignores an invalid TRUSTED_PROXY_HOPS and defaults to 1', () => {
    process.env.TRUSTED_PROXY_HOPS = 'not-a-number'
    expect(trustedClientIp(headersFrom({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2')
  })
})
