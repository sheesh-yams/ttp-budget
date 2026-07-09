/**
 * POST /api/csp-report
 *
 * Collector for Content-Security-Policy violation reports while the CSP runs in
 * Report-Only mode. Public (browsers post here with no session), rate-limited in
 * middleware, and deliberately minimal: it logs a concise line and returns 204.
 * No DB, no PII beyond the violated directive + blocked URI + document.
 *
 * Once the report stream is clean, flip the header in next.config.js from
 * Content-Security-Policy-Report-Only to Content-Security-Policy and this route
 * can be removed.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as
      | { 'csp-report'?: Record<string, unknown> }
      | Record<string, unknown>
      | null

    // Browsers send either the legacy { "csp-report": {...} } shape or a
    // report-to array item; normalize to a single object.
    const r = (body && typeof body === 'object' && 'csp-report' in body
      ? (body as { 'csp-report'?: Record<string, unknown> })['csp-report']
      : body) as Record<string, unknown> | null

    if (r) {
      console.warn('[csp-report]', JSON.stringify({
        directive: r['violated-directive'] ?? r['effectiveDirective'] ?? null,
        blocked:   r['blocked-uri'] ?? r['blockedURL'] ?? null,
        document:  r['document-uri'] ?? r['documentURL'] ?? null,
      }))
    }
  } catch {
    // Never let a malformed report throw — always ack.
  }
  return new NextResponse(null, { status: 204 })
}
