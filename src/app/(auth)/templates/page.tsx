import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { TemplatesPageClient } from '@/components/templates/TemplatesPageClient'

export const metadata = { title: 'Templates' }

export default async function TemplatesPage() {
  const workspaceId = await getWorkspaceId()

  const templates = await db.budgetTemplate.findMany({
    where: { workspaceId },
    orderBy: [{ shootType: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="space-y-4">
      <TemplatesPageClient templates={templates} />
    </div>
  )
}
