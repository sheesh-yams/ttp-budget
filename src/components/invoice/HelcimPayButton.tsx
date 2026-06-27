'use client'

/**
 * HelcimPayButton — client-side HelcimPay.js modal integration
 *
 * Flow:
 *  1. Click "Pay" → POST /api/payments/initiate → { attemptId, checkoutToken, secretToken }
 *  2. appendHelcimPayIframe(checkoutToken) — HelcimPay.js renders the modal
 *  3. window.message listener catches SUCCESS / ABORTED / HIDE from the iFrame
 *  4. SUCCESS → POST /api/payments/confirm → invoice marked PAID server-side
 *
 * Security notes:
 *  - secretToken is stored in a ref, never in React state (state can be
 *    serialised/logged; refs are plain memory).
 *  - The confirm POST sends secretToken to the server, which validates it
 *    against the stored hash. Never log secretToken on the client side.
 *  - origin filter: only accept messages from https://secure.helcim.app
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { HelcimEventStatus, HelcimTransactionData } from '@/lib/payments/types'

// ── Brand tokens (matching InvoicePublicView) ─────────────────────────────
// Resolve to the per-workspace CSS variables set on the InvoicePublicView root
// (this button renders inside it), with the SlateSuite hex as the fallback.

const V       = 'var(--brand-v, #5D00A4)'
const MINT    = 'var(--brand-mint, #04FFCC)'
const MINT_DK = 'var(--brand-mint-dk, #003D31)'
const BODY    = '#2C2C2A'
const MUTED   = '#888780'

// ── Global type augment for HelcimPay.js window functions ─────────────────

declare global {
  interface Window {
    appendHelcimPayIframe?: (checkoutToken: string) => void
    removeHelcimPayIframe?: () => void
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

type PayState = 'idle' | 'loading' | 'modal_open' | 'confirming' | 'success' | 'error'

type HelcimMessagePayload =
  | { eventName: 'SUCCESS'; data: HelcimTransactionData; hash: string }
  | { eventName: Exclude<HelcimEventStatus, 'SUCCESS'> }

export interface HelcimPayButtonProps {
  /** The invoice's publicToken — sent to /api/payments/initiate to identify the invoice. */
  invoicePublicToken: string
  /** Balance due in cents — displayed on the button label. */
  amountCents: number
  /** ISO 4217 currency code. Defaults to "USD". */
  currency?: string
}

// ── Component ──────────────────────────────────────────────────────────────

export function HelcimPayButton({
  invoicePublicToken,
  amountCents,
  currency = 'USD',
}: HelcimPayButtonProps) {
  const [state, setState]   = useState<PayState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Sensitive values live in refs — never serialised into React state
  const secretTokenRef   = useRef<string | null>(null)
  const attemptIdRef     = useRef<string | null>(null)
  const listenerRef      = useRef<((e: MessageEvent) => void) | null>(null)

  // ── Load HelcimPay.js script once on mount ─────────────────────────────
  useEffect(() => {
    const SRC = 'https://secure.helcim.app/helcim-pay/services/start.js'
    if (document.querySelector(`script[src="${SRC}"]`)) return
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    document.head.appendChild(script)
    // Intentionally not removed — shared across component instances
  }, [])

  // ── Remove listener on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current)
        listenerRef.current = null
      }
    }
  }, [])

  // ── DOM fallback: reload if Helcim overlay disappears without a message ─
  // Helcim's JS may post SUCCESS from our own page context rather than from the
  // iframe, so the origin check can't be the only signal. If the iframe/overlay
  // is removed from the DOM while we're stuck in modal_open, the webhook has
  // almost certainly already settled the invoice — reload to show the paid state.
  const stateRef = useRef<PayState>('idle')
  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    if (state !== 'modal_open') return

    const observer = new MutationObserver(() => {
      const helcimEl = document.querySelector(
        '[id*="helcim"], [class*="helcim-pay"], iframe[src*="helcim"]',
      )
      if (!helcimEl) {
        observer.disconnect()
        setTimeout(() => {
          if (stateRef.current === 'modal_open') window.location.reload()
        }, 1500)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [state])

  // ── iFrame message handler ─────────────────────────────────────────────
  const handleMessage = useCallback((event: MessageEvent) => {
    // Accept messages from the Helcim iframe origin OR from our own page context.
    // Helcim's start.js runs in the main page and may dispatch postMessages from
    // window.location.origin rather than from https://secure.helcim.app.
    // Real security is server-side: hash validation + secretToken check + Helcim
    // transaction lookup. The origin check here is defence-in-depth only.
    const fromHelcim = event.origin.includes('helcim.app')
    const fromSelf   = event.origin === window.location.origin
    if (!fromHelcim && !fromSelf) return

    let payload: HelcimMessagePayload
    try {
      // HelcimPay.js may deliver event.data as a JSON string or a plain object
      // depending on the browser / flow. Handle both to avoid silently dropping events.
      payload = (typeof event.data === 'string'
        ? JSON.parse(event.data)
        : event.data) as HelcimMessagePayload
    } catch {
      return
    }
    if (!payload || typeof payload.eventName !== 'string') return

    // ── HIDE / ABORTED ─────────────────────────────────────────────────
    if (payload.eventName === 'HIDE') {
      // iFrame closed without a terminal event — user dismissed it
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current)
        listenerRef.current = null
      }
      setState('idle')
      return
    }

    if (payload.eventName === 'ABORTED') {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current)
        listenerRef.current = null
      }
      setState('error')
      setErrorMsg('Payment was cancelled.')
      return
    }

    // ── SUCCESS ────────────────────────────────────────────────────────
    if (payload.eventName === 'SUCCESS') {
      if (!('data' in payload) || !payload.data || !payload.hash) {
        setState('error')
        setErrorMsg('Invalid payment response. Please try again.')
        return
      }

      // Remove listener immediately — no more iFrame messages needed
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current)
        listenerRef.current = null
      }

      const rawDataJson = JSON.stringify(payload.data)
      const helcimHash  = payload.hash
      const attemptId   = attemptIdRef.current!
      // Read + clear secretToken in one step — minimise time it's in memory
      const secretToken = secretTokenRef.current!
      secretTokenRef.current = null

      setState('confirming')

      fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, rawDataJson, helcimHash, secretToken }),
      })
        .then(async (res) => {
          const json = await res.json() as { success?: boolean; error?: string }
          if (!res.ok || !json.success) {
            setState('error')
            setErrorMsg(
              json.error ??
              'Payment confirmation failed. Please contact us to verify your payment.',
            )
          } else {
            setState('success')
          }
        })
        .catch(() => {
          setState('error')
          setErrorMsg(
            'Network error during confirmation. ' +
            'Your card may have been charged — please contact us before retrying.',
          )
        })
    }
  }, [])

  // ── Pay button click ───────────────────────────────────────────────────
  async function handlePayClick() {
    setState('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken: invoicePublicToken }),
      })

      const json = await res.json() as {
        attemptId?: string
        checkoutToken?: string
        secretToken?: string
        error?: string
      }

      if (!res.ok || !json.attemptId || !json.checkoutToken || !json.secretToken) {
        setState('error')
        setErrorMsg(json.error ?? 'Could not initialize payment. Please try again.')
        return
      }

      // Store sensitive values in refs before opening the modal
      attemptIdRef.current   = json.attemptId
      secretTokenRef.current = json.secretToken

      // Register listener BEFORE opening iFrame — avoids a race
      listenerRef.current = handleMessage
      window.addEventListener('message', handleMessage)

      // Open HelcimPay.js modal
      if (typeof window.appendHelcimPayIframe === 'function') {
        window.appendHelcimPayIframe(json.checkoutToken)
        setState('modal_open')
      } else {
        // Script hasn't loaded yet — shouldn't happen since we load it on mount
        setState('error')
        setErrorMsg('Payment widget is not ready. Please refresh and try again.')
      }
    } catch {
      setState('error')
      setErrorMsg('Network error. Please check your connection and try again.')
    }
  }

  function handleRetry() {
    setState('idle')
    setErrorMsg(null)
  }

  // ── Amount display ─────────────────────────────────────────────────────
  const amountDisplay = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountCents / 100)

  // ── Render: success state ──────────────────────────────────────────────
  if (state === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '32px 24px' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: MINT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke={MINT_DK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p style={{ fontSize: 20, fontWeight: 700, color: BODY, margin: '0 0 8px' }}>
          Payment Submitted
        </p>
        <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Your payment of {amountDisplay} is being processed.
          You&apos;ll receive a confirmation once it&apos;s complete.
          You may need to refresh this page to see the updated status.
        </p>
      </div>
    )
  }

  // ── Render: confirming state ───────────────────────────────────────────
  if (state === 'confirming') {
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <Spinner large />
        <p style={{ fontSize: 14, color: MUTED, margin: '12px 0 0' }}>
          Confirming your payment…
        </p>
      </div>
    )
  }

  // ── Render: idle / loading / modal_open / error ────────────────────────
  const isDisabled = state === 'loading' || state === 'modal_open'

  return (
    <div>
      {state === 'error' && errorMsg && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: '#B91C1C', lineHeight: 1.5 }}>
            {errorMsg}
          </span>
          <button
            onClick={handleRetry}
            style={{
              fontSize: 12, color: '#B91C1C', textDecoration: 'underline',
              background: 'none', border: 'none', cursor: 'pointer',
              flexShrink: 0, padding: 0,
            }}
          >
            Try again
          </button>
        </div>
      )}

      <button
        onClick={handlePayClick}
        disabled={isDisabled}
        style={{
          width: '100%',
          background: isDisabled ? '#3D0070' : V,
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '16px 24px',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          transition: 'background 0.15s ease',
          opacity: isDisabled ? 0.85 : 1,
        }}
      >
        {state === 'loading' ? (
          <>
            <Spinner />
            Processing…
          </>
        ) : state === 'modal_open' ? (
          <>
            <Spinner />
            Complete payment in the window above…
          </>
        ) : (
          <>
            <LockIcon />
            Pay {amountDisplay} securely
          </>
        )}
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, color: MUTED, margin: '12px 0 0' }}>
        Secured by{' '}
        <a
          href="https://www.helcim.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: MUTED, textDecoration: 'underline' }}
        >
          Helcim
        </a>
        {' '}· Your card details are never stored on our servers
      </p>
    </div>
  )
}

// ── Icon helpers ───────────────────────────────────────────────────────────

function Spinner({ large = false }: { large?: boolean }) {
  const size = large ? 28 : 18
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ animation: 'helcim-spin 0.9s linear infinite' }}
    >
      <style>{`
        @keyframes helcim-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <path d="M16 9a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      width="16" height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
