/**
 * rate-limit.ts
 *
 * Sliding-window rate limiter for public document routes.
 * Uses Upstash Redis — requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 *
 * If those env vars are not set (e.g. local dev without Upstash), the limiter
 * is disabled and all requests are allowed through (graceful degradation).
 *
 * To enable:
 *   1. Create a free Upstash Redis database at https://console.upstash.com
 *   2. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to .env.local
 *      and to your Vercel project environment variables.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

// Null when env vars aren't configured — graceful no-op in dev
let _limiter: Ratelimit | null = null

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  _limiter = new Ratelimit({
    redis:     Redis.fromEnv(),
    limiter:   Ratelimit.slidingWindow(60, '1 m'), // 60 requests per IP per minute
    analytics: true,
    prefix:    'ttp:public',
  })
}

/**
 * Check rate limit for a given identifier (usually the client IP).
 * Returns { allowed: true } when either the limiter is disabled or the
 * request is within limits. Returns { allowed: false } when rate-limited.
 */
export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean }> {
  if (!_limiter) return { allowed: true }

  const { success } = await _limiter.limit(identifier)
  return { allowed: success }
}
