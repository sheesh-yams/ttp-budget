import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { RateCardTable } from '@/components/budget/RateCardTable'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export const metadata = { title: 'Rate cards' }

export default async function RatesPage() {
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add rate
        </Button>
      </div>
      <RateCardTable rateCards={rateCards} />
    </div>
  )
}
