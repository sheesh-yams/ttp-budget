import { notFound } from 'next/navigation'
import { requireWorkspaceArea } from '@/lib/project-access'
import { ViewOnly } from '@/components/ui/view-only'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { TemplateDetailClient } from '@/components/templates/TemplateDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const tpl = await db.budgetTemplate.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: tpl?.name ?? 'Template' }
}

export default async function TemplateDetailPage({ params }: Props) {
  // Roles 2b: the workspace library permission.
  const access = await requireWorkspaceArea('library')
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const template = await db.budgetTemplate.findFirst({
    where: { id, workspaceId },
  })

  if (!template) notFound()

  return (
    <div className="max-w-4xl">
      <ViewOnly readOnly={!access.can('library', 'EDIT')} what="templates">
        <TemplateDetailClient template={template} />
      </ViewOnly>
    </div>
  )
}
