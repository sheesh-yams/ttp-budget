import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SettingsForm } from '@/components/settings/SettingsForm'

export const metadata = { title: 'Settings — TTP Budget' }

export default async function SettingsPage() {
  const user = await getCurrentUser()

  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: user.workspaceId },
    select: {
      name:                    true,
      legalName:               true,
      contactEmail:            true,
      contactPhone:            true,
      website:                 true,
      addressLine1:            true,
      addressLine2:            true,
      city:                    true,
      region:                  true,
      postalCode:              true,
      country:                 true,
      logoUrl:                 true,
      logoDarkUrl:             true,
      primaryColor:            true,
      accentColor:             true,
      invoiceNumberPrefix:     true,
      defaultPaymentTermsDays: true,
      defaultTaxPct:           true,
      wireInstructions:        true,
      achInstructions:         true,
      checkPayableTo:          true,
      checkMailingAddress:     true,
      defaultInvoiceTerms:     true,
      defaultProposalTerms:    true,
    },
  })

  const settings = {
    ...workspace,
    defaultTaxPct: Number(workspace.defaultTaxPct),
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace, branding, and default content.
        </p>
      </div>

      <SettingsForm workspace={settings} />
    </div>
  )
}
