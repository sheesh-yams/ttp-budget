import { notFound } from 'next/navigation'
import { getCurrentRole } from '@/lib/auth'
import { getScopedDb } from '@/lib/db-scoped'
import { loadDealMemoBoard } from '@/lib/deal-memo-queries'
import { DealMemosBoard } from '@/components/deal-memos/DealMemosBoard'

export const metadata = { title: 'Deal Memos' }

export default async function DealMemosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Vendor rates next to client budget rates reveal margin — Owner/Producer only.
  if ((await getCurrentRole()) === 'COLLABORATOR') notFound()

  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id }, select: { id: true } })
  if (!project) notFound()

  const board = await loadDealMemoBoard(sdb, id)
  return <DealMemosBoard projectId={id} board={board} />
}
