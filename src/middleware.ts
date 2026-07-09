import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit, type PolicyName } from '@/lib/rate-limit'
import { trustedClientIp } from '@/lib/client-ip'

// ── Public routes (Clerk auth exempt) ────────────────────────────────────────
const isPublicRoute = createRouteMatcher([
  '/',                   // marketing homepage
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/m/(.*)',             // mobile-optimized auth pages (/m/sign-in, /m/sign-up, future mobile routes)
  '/p/(.*)',             // public proposal pages
  '/i/(.*)',             // public invoice pages
  '/cs/(.*)',            // public call sheet pages
  '/d/(.*)',             // public delivery pages — token-authenticated at the route level
  '/shade-test',         // temporary Shade embed test page
  '/invite/(.*)',        // workspace invitation acceptance
  '/api/webhooks/(.*)',
  // Only token-keyed client-facing PDF routes are public.
  // wrap-report and any future internal PDF routes intentionally omitted — they require Clerk auth.
  '/api/pdf/proposal/(.*)',
  '/api/pdf/invoice/(.*)',
  '/api/payments/(.*)',         // payment routes self-authenticate via publicToken / attemptId
  '/api/proposals/(.*)/approve', // public client sign-off — self-authenticates via proposal publicToken
  '/api/stripe/connect/callback', // OAuth redirect from Stripe — authenticated via HMAC-signed cookie
  '/api/csp-report',              // browser-posted CSP violation reports (no session)
])

// ── Mobile UA detection ───────────────────────────────────────────────────────

function isMobileUA(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  return /iPhone|Android.*Mobile|Mobile.*Android|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

// ── Rate limiter for public routes ───────────────────────────────────────────
//
// Backed by Upstash Redis when configured — counters survive restarts and are
// shared across all instances. Falls back to in-process memory when Redis is
// unconfigured (local dev) or unreachable (fail-open, never fail-closed).
//
// Policy limits are defined in src/lib/rate-limit.ts.

/**
 * Extract the real client IP for rate limiting. Uses the rightmost (trusted-
 * proxy-appended) x-forwarded-for entry so a client cannot spoof its IP to
 * evade limits. See trustedClientIp / TRUSTED_PROXY_HOPS.
 */
function clientIp(req: NextRequest): string {
  return trustedClientIp(name => req.headers.get(name), '127.0.0.1')
}

function policyFor(pathname: string): PolicyName | null {
  if (/^\/(p|i|cs|d)\//.test(pathname))                                               return 'publicDoc'
  if (pathname.startsWith('/api/pdf/proposal/') || pathname.startsWith('/api/pdf/invoice/')) return 'publicPdf'
  if (pathname.startsWith('/api/payments/'))                                           return 'payments'
  if (pathname.startsWith('/api/proposals/') && pathname.endsWith('/approve'))          return 'approve'
  if (pathname.startsWith('/api/csp-report'))                                          return 'cspReport'
  if (pathname.startsWith('/api/address-autocomplete'))                                return 'geocode'
  return null
}

// ── Single combined middleware ─────────────────────────────────────────────────

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl

  // 1. Mobile redirect — send mobile browsers to the dedicated mobile-optimised
  //    pages before any rate-limit or auth work.
  if (isMobileUA(request)) {
    if (pathname === '/sign-in' || pathname === '/sign-in/') {
      return NextResponse.redirect(new URL('/m/sign-in', request.url))
    }
    if (pathname === '/sign-up' || pathname === '/sign-up/') {
      return NextResponse.redirect(new URL('/m/sign-up', request.url))
    }
    // Delivery pages — /d/[token] and /d/[token]/[assetToken]
    if (pathname.startsWith('/d/')) {
      return NextResponse.redirect(new URL('/m' + pathname, request.url))
    }
  }

  // 2. Rate-limit check runs first — before any auth work
  const policy = policyFor(pathname)
  if (policy) {
    const ip     = clientIp(request)
    const result = await checkRateLimit(policy, ip)
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again shortly.' }),
        {
          status: 429,
          headers: {
            'Content-Type':          'application/json',
            'Retry-After':           String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
            'X-RateLimit-Limit':     String(result.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      )
    }
  }

  // 3. Clerk auth guard for all non-public routes
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
