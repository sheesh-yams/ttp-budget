import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

/**
 * Central rate limiter. Uses Upstash Redis when configured; falls back to an
 * in-process sliding window (local dev, or Redis outage — fail-open).
 *
 * The Upstash client is HTTP-based and safe in both Node.js and Edge runtimes,
 * so this module is imported by middleware (Edge) and route pages (Node) alike.
 *
 * Counters in Redis survive server restarts and are shared across all instances,
 * so "60/min" means 60/min globally — not per-replica.
 */

export type LimitResult = { success: boolean; limit: number; remaining: number; reset: number }

const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

const redis = hasRedis ? Redis.fromEnv() : null

const POLICIES = {
  publicDoc: { requests: 60, window: '60 s' },  // /p/ /i/ /cs/ /d/
  publicPdf: { requests: 10, window: '60 s' },  // /api/pdf/proposal/ and /api/pdf/invoice/
  payments:  { requests: 20, window: '60 s' },  // /api/payments/*
  geocode:   { requests: 30, window: '60 s' },  // /api/address-autocomplete
  approve:   { requests: 10, window: '60 s' },  // /api/proposals/*/approve (public sign-off)
  cspReport: { requests: 20, window: '60 s' },  // /api/csp-report (violation collector — cap log flooding)
} as const
export type PolicyName = keyof typeof POLICIES

const limiters: Partial<Record<PolicyName, Ratelimit>> = {}
function getLimiter(policy: PolicyName): Ratelimit | null {
  if (!redis) return null
  if (!limiters[policy]) {
    const p = POLICIES[policy]
    limiters[policy] = new Ratelimit({
      redis,
      limiter:   Ratelimit.slidingWindow(p.requests, p.window),
      prefix:    `rl:${policy}`,
      analytics: false,
    })
  }
  return limiters[policy]!
}

// ── In-process fallback ───────────────────────────────────────────────────────
// No setInterval — not safe in Edge runtime. Stale buckets are evicted lazily.

const memory = new Map<string, { count: number; resetAt: number }>()

function memoryLimit(policy: PolicyName, key: string): LimitResult {
  const p         = POLICIES[policy]
  const windowMs  = 60_000
  const now       = Date.now()
  const bucketKey = `${policy}:${key}`
  const bucket    = memory.get(bucketKey)

  if (!bucket || bucket.resetAt < now) {
    memory.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return { success: true, limit: p.requests, remaining: p.requests - 1, reset: now + windowMs }
  }

  bucket.count++
  return {
    success:   bucket.count <= p.requests,
    limit:     p.requests,
    remaining: Math.max(0, p.requests - bucket.count),
    reset:     bucket.resetAt,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkRateLimit(policy: PolicyName, key: string): Promise<LimitResult> {
  const limiter = getLimiter(policy)
  if (!limiter) return memoryLimit(policy, key)
  try {
    const r = await limiter.limit(key)
    return { success: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset }
  } catch {
    // Redis outage: fail open rather than returning 500 to every public-doc visitor.
    return memoryLimit(policy, key)
  }
}
