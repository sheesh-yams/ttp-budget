import { db } from '@/lib/db'
import { requireWorkspaceArea } from '@/lib/project-access'
import { ViewOnly } from '@/components/ui/view-only'
import { getWorkspaceId } from '@/lib/auth'
import { RateCardTable } from '@/components/budget/RateCardTable'
import { AddRateButton } from '@/components/budget/AddRateButton'

export const metadata = { title: 'Rate cards' }

export default async function RatesPage() {
  // Roles 2b: the workspace library permission.
  const access = await requireWorkspaceArea('library')
  const workspaceId = await getWorkspaceId()

  const rateCards = await db.rateCard.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ isFavorite: 'desc' }, { usageCount: 'desc' }, { role: 'asc' }],
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-ink">Rate cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master rates that auto-populate when you add a line item to a budget.
          </p>
        </div>
        {access.can('library', 'EDIT') && <AddRateButton />}
      </div>
      <ViewOnly readOnly={!access.can('library', 'EDIT')} what="rate cards">
        <RateCardTable rateCards={rateCards} />
      </ViewOnly>
    </div>
  )
}
