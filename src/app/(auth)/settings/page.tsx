import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { getRecentAuditEvents } from '@/lib/audit'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { DangerZone } from '@/components/settings/DangerZone'
import { WorkspaceDataSection } from '@/components/settings/WorkspaceDataSection'
import { ActivityFeed } from '@/components/settings/ActivityFeed'

export const metadata = { title: 'Settings — TTP Budget' }

export default async function SettingsPage() {
  const [user, workspaceId] = await Promise.all([getCurrentUser(), getWorkspaceId()])
  const auditEvents = await getRecentAuditEvents(workspaceId, 10)

  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
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

      <WorkspaceDataSection />

      <section className="mt-8">
        <h2 className="text-base font-semibold text-foreground mb-1">Recent activity</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Last 10 workspace events — read-only audit log.
        </p>
        <ActivityFeed events={auditEvents} />
      </section>

      <DangerZone
        workspaceName={workspace.name}
        userRole={user.role as string}
      />
    </div>
  )
}
