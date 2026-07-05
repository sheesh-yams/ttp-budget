import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { StripeConnectCard } from '@/components/settings/payments/StripeConnectCard'

export const metadata = { title: 'Payments' }

type PaymentConfig = {
  provider:             string
  stripeAccountId:      string | null
  stripeChargesEnabled: boolean
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const [workspaceId, params] = await Promise.all([getWorkspaceId(), searchParams])

  const config = await (db as unknown as {
    workspacePaymentConfig: {
      findUnique: (args: object) => Promise<PaymentConfig | null>
    }
  }).workspacePaymentConfig.findUnique({
    where:  { workspaceId },
    select: { provider: true, stripeAccountId: true, stripeChargesEnabled: true },
  })

  const justConnected = params.connected === '1'
  const connectFailed = params.error === 'stripe_connect_failed'

  return (
    <div>
      {justConnected && (
        <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Stripe connected. The payment button will now appear on your invoices.
        </div>
      )}

      {connectFailed && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Stripe connection failed — please try again. If the problem persists, check that
          your redirect URI is registered in the Stripe dashboard.
        </div>
      )}

      <StripeConnectCard
        stripeAccountId={config?.stripeAccountId ?? null}
        stripeChargesEnabled={config?.stripeChargesEnabled ?? false}
      />
    </div>
  )
}
