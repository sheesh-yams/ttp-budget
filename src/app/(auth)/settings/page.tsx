import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { requireWorkspaceArea } from '@/lib/project-access'
import { getRecentAuditEvents } from '@/lib/audit'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { DangerZone } from '@/components/settings/DangerZone'
import { WorkspaceDataSection } from '@/components/settings/WorkspaceDataSection'
import { ActivityFeed } from '@/components/settings/ActivityFeed'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  // Roles 2b: the Settings permission; editing needs Edit.
  const access = await requireWorkspaceArea('settings')
  const canEdit = access.can('settings', 'EDIT')
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
      proposalExpiryDays:      true,
      invoiceExpiryDays:       true,
      callTimeFormat:          true,
    },
  })

  const settings = {
    ...workspace,
    defaultTaxPct: Number(workspace.defaultTaxPct),
    callTimeFormat: (workspace.callTimeFormat as '12H' | '24H') ?? '12H',
  }

  return (
    <div>
      {!canEdit && <ViewOnlyNote />}
      <fieldset disabled={!canEdit} className="contents">
        <SettingsForm
          workspace={settings}
          currentUser={{ id: user.id, name: user.name ?? '', avatarUrl: user.avatarUrl ?? null }}
        />
      </fieldset>

      {/* Resetting demo data is Owner-only (danger zone). */}
      {access.isOwner && <WorkspaceDataSection />}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-foreground mb-1">Recent activity</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Last 10 workspace events — read-only audit log.
        </p>
        <ActivityFeed events={auditEvents} />
      </section>

      <DangerZone
        workspaceName={workspace.name}
        userRole={access.isOwner ? 'OWNER' : 'MEMBER'}
      />
    </div>
  )
}

function ViewOnlyNote() {
  return (
    <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      View only — your role can see settings but not change them.
    </p>
  )
}
