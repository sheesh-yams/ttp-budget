import { notFound } from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
import { getScopedDb } from '@/lib/db-scoped'
import { loadDealMemoBoard } from '@/lib/deal-memo-queries'
import { DealMemosBoard } from '@/components/deal-memos/DealMemosBoard'

export const metadata = { title: 'Deal Memos' }

export default async function DealMemosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireProjectAccess(id)
  const access = await requireProjectArea(id, 'dealMemos')
  // Vendor rates follow dealMemos; the budget comparison (line rate, budgeted
  // amount, vs budget) is a budget cost — stripped here without budget.costs.
  const showBudget = access.can('budget.costs')

  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id }, select: { id: true } })
  if (!project) notFound()

  const loaded = await loadDealMemoBoard(sdb, id)
  const board = showBudget ? loaded : {
    ...loaded,
    roles: loaded.roles.map(r => ({ ...r, rateCents: 0, budgetCents: 0 })),
  }
  return <DealMemosBoard projectId={id} board={board} showBudget={showBudget} canEdit={access.can('dealMemos', 'EDIT')} />
}
