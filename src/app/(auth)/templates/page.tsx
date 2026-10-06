import { db } from '@/lib/db'
import { requireWorkspaceArea } from '@/lib/project-access'
import { ViewOnly } from '@/components/ui/view-only'
import { getWorkspaceId } from '@/lib/auth'
import { TemplatesPageClient } from '@/components/templates/TemplatesPageClient'
import type { ProposalBranding } from '@/components/proposals/ProposalTemplatePreview'

export const metadata = { title: 'Document Hub' }

export default async function TemplatesPage() {
  // Roles 2b: the workspace library permission.
  const access = await requireWorkspaceArea('library')
  const workspaceId = await getWorkspaceId()

  const [templates, workspace] = await Promise.all([
    db.budgetTemplate.findMany({
      where:   { workspaceId },
      orderBy: [{ shootType: 'asc' }, { name: 'asc' }],
    }),
    db.workspace.findUniqueOrThrow({
      where:  { id: workspaceId },
      select: { name: true, logoUrl: true, primaryColor: true, bodyFont: true },
    }),
  ])

  // Map existing workspace branding onto the proposal preview's shape.
  // primaryColor = brand accent, bodyFont = document font — no duplicate columns.
  const branding: ProposalBranding = {
    workspaceName: workspace.name,
    logoUrl:       workspace.logoUrl,
    brandColor:    workspace.primaryColor || '#5D00A4',
    fontFamily:    workspace.bodyFont || 'Inter',
  }

  return (
    <div className="space-y-5">
      <ViewOnly readOnly={!access.can('library', 'EDIT')} what="templates">
        <TemplatesPageClient templates={templates} branding={branding} />
      </ViewOnly>
    </div>
  )
}
