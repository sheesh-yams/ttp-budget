/** @jest-environment node */
// A public page that redirects to a private address must be refused at the
// redirect hop (fetchGuarded re-checks every Location).

jest.mock('server-only', () => ({}))
jest.mock('@/lib/r2', () => ({ r2: {}, R2_BUCKET: 'test' }))

const redirects: Record<string, string> = {}
const stalls = new Set<string>() // these respond, send a byte, then never finish
jest.mock('node:https', () => {
  const { EventEmitter } = jest.requireActual('node:events')
  return {
    __esModule: true,
    default: {
      request: (url: URL, _opts: unknown, cb: (res: unknown) => void) => {
        const req = new EventEmitter() as InstanceType<typeof EventEmitter> & { end: () => void; destroy: () => void }
        req.destroy = (err?: Error) => { if (err) setImmediate(() => req.emit('error', err)) }
        req.end = () => {
          const res = new EventEmitter() as InstanceType<typeof EventEmitter> & Record<string, unknown>
          const loc = redirects[url.toString()]
          Object.assign(res, { statusCode: loc ? 302 : 200, headers: loc ? { location: loc } : { 'content-type': 'text/html' }, resume: () => {}, destroy: () => {} })
          cb(res)
          if (stalls.has(url.toString())) { setImmediate(() => res.emit('data', Buffer.from('<'))); return }
          if (!loc) setImmediate(() => { res.emit('data', Buffer.from('<html></html>')); res.emit('end') })
        }
        return req
      },
    },
  }
})

import { fetchGuarded, BlockedUrlError } from '@/lib/link-preview-fetch'

describe('fetchGuarded redirects', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'file:///etc/passwd',
    'http://localhost:8080/',
  ])('refuses a redirect to %s', async target => {
    redirects['https://public.example.com/start'] = target
    await expect(fetchGuarded(new URL('https://public.example.com/start'), { text: 1000, image: 1000 }, 'text/html')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('follows a redirect to another public https page', async () => {
    redirects['https://public.example.com/a'] = 'https://public.example.com/b'
    const res = await fetchGuarded(new URL('https://public.example.com/a'), { text: 1000, image: 1000 }, 'text/html')
    expect(res.url.toString()).toBe('https://public.example.com/b')
    expect(res.status).toBe(200)
  })

  it('gives up after too many redirects', async () => {
    redirects['https://public.example.com/l1'] = 'https://public.example.com/l2'
    redirects['https://public.example.com/l2'] = 'https://public.example.com/l3'
    redirects['https://public.example.com/l3'] = 'https://public.example.com/l4'
    redirects['https://public.example.com/l4'] = 'https://public.example.com/l5'
    await expect(fetchGuarded(new URL('https://public.example.com/l1'), { text: 1000, image: 1000 }, 'text/html')).rejects.toThrow('Too many redirects')
  })

  it('aborts a page that drips data and never finishes (wall-clock limit)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
    try {
      stalls.add('https://public.example.com/slow')
      const p = fetchGuarded(new URL('https://public.example.com/slow'), { text: 1000, image: 1000 }, 'text/html')
      const assertion = expect(p).rejects.toThrow('Timed out')
      await Promise.resolve()
      jest.advanceTimersByTime(6_001)
      await assertion
    } finally {
      jest.useRealTimers()
    }
  })
})
