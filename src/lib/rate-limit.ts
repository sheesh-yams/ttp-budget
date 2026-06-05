/**
 * rate-limit.ts
 *
 * Sliding-window rate limiter for public document routes.
 *
 * Uses an in-memory Map — resets on each serverless cold start, so it limits
 * within a single Lambda instance rather than globally. For the threat model
 * here (scraping / enumeration) this is sufficient; most attacks come from a
 * single IP and will hit the same warm instance repeatedly.
 *
 * To upgrade to a globally-consistent limiter later, swap `checkRateLimit`
 * for an Upstash call in middleware.ts — the interface here stays the same.
 *
 * Limit: 60 requests per IP per 60-second window.
 */

const WINDOW_MS = 60_000   // 1 minute
const MAX_REQS  = 60       // requests per window

interface Entry { count: number; reset: number }

// Module-level map — persists for the lifetime of the Lambda warm instance
const store = new Map<string, Entry>()

// Periodically prune stale entries to avoid memory growth on long-lived instances
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.reset < now) store.delete(key)
  }
}, 5 * 60_000) // every 5 minutes

/**
 * Check rate limit for a given identifier (usually the client IP).
 * Returns `{ allowed: true }` when within limits, `{ allowed: false }` when over.
 */
export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean }> {
  const now   = Date.now()
  const entry = store.get(identifier)

  if (!entry || entry.reset < now) {
    store.set(identifier, { count: 1, reset: now + WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= MAX_REQS) {
    return { allowed: false }
  }

  entry.count++
  return { allowed: true }
}
