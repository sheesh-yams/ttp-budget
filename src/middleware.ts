import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Public routes (Clerk auth exempt) ────────────────────────────────────────
const isPublicRoute = createRouteMatcher([
  '/',                   // marketing homepage
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/p/(.*)',             // public proposal pages
  '/i/(.*)',             // public invoice pages
  '/cs/(.*)',            // public call sheet pages
  '/d/(.*)',             // public delivery pages — token-authenticated at the route level
  '/shade-test',         // temporary Shade embed test page
  '/invite/(.*)',        // workspace invitation acceptance
  '/api/webhooks/(.*)',
  '/api/pdf/(.*)',       // PDF streams are token-authenticated at the route level
  '/api/payments/(.*)', // payment routes self-authenticate via publicToken / attemptId
])

// ── Rate limiter for public doc routes ───────────────────────────────────────
//
// Protects /p/[token], /i/[token], /cs/[token] from automated scraping.
// Limits each IP to MAX_REQUESTS per WINDOW_MS per route type.
//
// ⚠  Per-process in-memory state — correct for single-instance Railway
//    deployments.  If you scale to multiple replicas, swap the Map for a
//    Redis-backed store: @upstash/ratelimit + Upstash Redis (free tier, 5 min
//    setup) is the cleanest upgrade path.

const WINDOW_MS    = 60_000  // 1-minute fixed window
const MAX_REQUESTS = 60      // requests per IP per window per route type

type WindowRecord = { count: number; windowStart: number }
const windows = new Map<string, WindowRecord>()

function checkRateLimit(ip: string, routeType: string): {
  limited: boolean
  retryAfterSec: number
} {
  const key = `${routeType}:${ip}`
  const now = Date.now()
  const rec = windows.get(key)

  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    windows.set(key, { count: 1, windowStart: now })
    return { limited: false, retryAfterSec: 0 }
  }

  rec.count++

  if (rec.count > MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((rec.windowStart + WINDOW_MS - now) / 1000)
    return { limited: true, retryAfterSec }
  }

  return { limited: false, retryAfterSec: 0 }
}

/** Extract real client IP — Railway sets x-forwarded-for. */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

function publicDocRouteType(pathname: string): string | null {
  if (pathname.startsWith('/p/'))  return 'proposal'
  if (pathname.startsWith('/i/'))  return 'invoice'
  if (pathname.startsWith('/cs/')) return 'callsheet'
  return null
}

// ── Single combined middleware ─────────────────────────────────────────────────

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl

  // 1. Rate-limit check runs first — before any auth work
  const routeType = publicDocRouteType(pathname)
  if (routeType) {
    const ip = clientIp(request)
    const { limited, retryAfterSec } = checkRateLimit(ip, routeType)
    if (limited) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again shortly.' }),
        {
          status: 429,
          headers: {
            'Content-Type':          'application/json',
            'Retry-After':           String(retryAfterSec),
            'X-RateLimit-Limit':     String(MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
          },
        },
      )
    }
  }

  // 2. Clerk auth guard for all non-public routes
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
