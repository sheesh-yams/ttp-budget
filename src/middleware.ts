import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Public routes — no auth required
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/p/(.*)',              // public proposal pages
  '/i/(.*)',              // public invoice pages
  '/cs/(.*)',             // public call sheet pages
  '/invite/(.*)',         // workspace invitation acceptance
  '/api/webhooks/(.*)',
  '/api/pdf/(.*)',        // PDF streams are token-authenticated at the route level
  '/api/payments/(.*)',   // payment routes self-authenticate via publicToken / attemptId
])

export default clerkMiddleware(async (auth, request) => {
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
