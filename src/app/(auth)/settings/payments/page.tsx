import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { requireWorkspaceArea } from '@/lib/project-access'
import { StripeConnectCard } from '@/components/settings/payments/StripeConnectCard'
import { HelcimConnectedCard } from '@/components/settings/payments/HelcimConnectedCard'

export const metadata = { title: 'Payments' }

type PaymentConfig = {
  provider:               string
  stripeAccountId:        string | null
  stripeChargesEnabled:   boolean
  helcimEnabled:          boolean
  helcimCredentialId:     string | null
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  // Roles 2b: Settings to see this; where payouts go is the Owner's call only.
  const access = await requireWorkspaceArea('settings')
  const [workspaceId, params] = await Promise.all([getWorkspaceId(), searchParams])

  const config = await (db as unknown as {
    workspacePaymentConfig: {
      findUnique: (args: object) => Promise<PaymentConfig | null>
    }
  }).workspacePaymentConfig.findUnique({
    where:  { workspaceId },
    select: {
      provider:             true,
      stripeAccountId:      true,
      stripeChargesEnabled: true,
      helcimEnabled:        true,
      helcimCredentialId:   true,
    },
  })

  const justConnected  = params.connected === '1'
  const connectFailed  = params.error === 'stripe_connect_failed'
  const activeProvider = config?.provider ?? 'NONE'

  const showHelcim = (config?.helcimEnabled && !!config?.helcimCredentialId)
  const showStripe = !!config?.stripeAccountId

  // When Helcim is active, show it first; otherwise lead with Stripe
  const helcimFirst = activeProvider === 'HELCIM'

  return (
    <div className="space-y-4">
      {justConnected && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Stripe connected. The payment button will now appear on your invoices.
        </div>
      )}

      {connectFailed && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Stripe connection failed — please try again. If the problem persists, check that
          your redirect URI is registered in the Stripe dashboard.
        </div>
      )}

      {!access.isOwner && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only the workspace Owner can connect or change payment providers.
        </p>
      )}

      {access.isOwner && helcimFirst && showHelcim && (
        <HelcimConnectedCard isActiveProvider />
      )}

      {access.isOwner && showStripe && (
        <StripeConnectCard
          stripeAccountId={config?.stripeAccountId ?? null}
          stripeChargesEnabled={config?.stripeChargesEnabled ?? false}
          isActiveProvider={activeProvider === 'STRIPE'}
        />
      )}

      {access.isOwner && !helcimFirst && showHelcim && (
        <HelcimConnectedCard isActiveProvider={activeProvider === 'HELCIM'} />
      )}

      {access.isOwner && !showHelcim && !showStripe && (
        <StripeConnectCard
          stripeAccountId={null}
          stripeChargesEnabled={false}
          isActiveProvider={false}
        />
      )}
    </div>
  )
}
