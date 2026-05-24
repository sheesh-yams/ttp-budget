import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { TemplateDetailClient } from '@/components/templates/TemplateDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const tpl = await db.budgetTemplate.findUnique({ where: { id }, select: { name: true } })
  return { title: tpl?.name ?? 'Template' }
}

export default async function TemplateDetailPage({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const template = await db.budgetTemplate.findFirst({
    where: { id, workspaceId },
  })

  if (!template) notFound()

  return (
    <div className="max-w-4xl">
      <TemplateDetailClient template={template} />
    </div>
  )
}
