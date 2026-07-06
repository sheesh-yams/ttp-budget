'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getStripeConnectUrl, disconnectStripe } from '@/server/actions/stripe-connect'

export function StripeConnectCard({
  stripeAccountId,
  stripeChargesEnabled,
  isActiveProvider = true,
}: {
  stripeAccountId:      string | null
  stripeChargesEnabled: boolean
  isActiveProvider?:    boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isConnected  = !!stripeAccountId
  const accountShort = stripeAccountId ? `acct_…${stripeAccountId.slice(-6)}` : null

  function handleConnect() {
    setError(null)
    startTransition(async () => {
      const result = await getStripeConnectUrl()
      if (!result.success) {
        setError((result as { success: false; error: string }).error)
        return
      }
      window.location.href = result.data.url
    })
  }

  function handleDisconnect() {
    setError(null)
    startTransition(async () => {
      const result = await disconnectStripe()
      if (!result.success) {
        setError((result as { success: false; error: string }).error)
        return
      }
      window.location.reload()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-base font-semibold text-foreground">Stripe</h2>

        {isConnected && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              !isActiveProvider
                ? 'bg-muted text-muted-foreground'
                : stripeChargesEnabled
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                !isActiveProvider
                  ? 'bg-muted-foreground'
                  : stripeChargesEnabled ? 'bg-green-500' : 'bg-yellow-500',
              )}
            />
            {!isActiveProvider
              ? 'Connected'
              : stripeChargesEnabled ? 'Active' : 'Pending activation'}
          </span>
        )}
      </div>

      {/* ── Sub-copy ──────────────────────────────────────────────────────── */}
      <p className="text-sm text-muted-foreground">
        {isConnected
          ? accountShort
          : 'Accept card payments on invoices via Stripe Connect.'}
      </p>

      {isConnected && isActiveProvider && !stripeChargesEnabled && (
        <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-500">
          Complete onboarding in your Stripe dashboard to enable charges.
        </p>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      )}

      {/* ── Action ────────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleDisconnect}
          >
            {isPending ? 'Disconnecting…' : 'Disconnect Stripe'}
          </Button>
        ) : (
          <Button
            disabled={isPending}
            onClick={handleConnect}
          >
            {isPending ? 'Redirecting to Stripe…' : 'Connect with Stripe'}
          </Button>
        )}
      </div>
    </div>
  )
}
