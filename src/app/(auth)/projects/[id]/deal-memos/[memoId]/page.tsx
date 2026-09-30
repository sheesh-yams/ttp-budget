import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentRole, getWorkspaceId } from '@/lib/auth'
import { getScopedDb } from '@/lib/db-scoped'
import { loadDealMemoEditor } from '@/lib/deal-memo-queries'
import { toVendorDealMemo } from '@/lib/deal-memo-vendor-view'
import { DealMemoEditor, type EditorMemo } from '@/components/deal-memos/DealMemoEditor'

export const metadata = { title: 'Deal Memo' }

export default async function DealMemoPage({ params }: { params: Promise<{ id: string; memoId: string }> }) {
  const { id, memoId } = await params
  if ((await getCurrentRole()) === 'COLLABORATOR') notFound()

  const [sdb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])
  const [data, project, workspace] = await Promise.all([
    loadDealMemoEditor(sdb, id, memoId),
    sdb.project.findFirst({ where: { id }, select: { name: true } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, legalName: true } }),
  ])
  if (!data || !project) notFound()
  const { memo, lines, library } = data

  const editorMemo: EditorMemo = {
    id:                   memo.id,
    status:               memo.status,
    roleLabel:            memo.roleLabel,
    position:             memo.position,
    startDate:            memo.startDate?.toISOString() ?? null,
    endDate:              memo.endDate?.toISOString() ?? null,
    days:                 Number(memo.days),
    workDayHours:         memo.workDayHours,
    otMultiplier:         Number(memo.otMultiplier),
    doubleTimeAfterHours: memo.doubleTimeAfterHours,
    doubleTimeMultiplier: Number(memo.doubleTimeMultiplier),
    productionZoneMiles:  memo.productionZoneMiles,
    internalNotes:        memo.internalNotes,
    lineItemId:           memo.lineItemId,
    contact:              memo.contact,
    fees: memo.fees.map(f => ({
      id: f.id, kind: f.kind, label: f.label, rateCents: f.rateCents, unit: f.unit,
      quantity: Number(f.quantity), termsText: f.termsText, budgetLineItemId: f.budgetLineItemId,
      isAutoRate: f.isAutoRate, version: f.updatedAt.toISOString(),
    })),
    sections: memo.sections.map(s => ({
      id: s.id, title: s.title, body: s.body, sourceBlockId: s.sourceBlockId,
      editedFromSource: s.editedFromSource, version: s.updatedAt.toISOString(),
    })),
  }

  const vendorView = toVendorDealMemo(memo, {
    vendorName:         memo.contact?.name ?? '',
    projectName:        project.name,
    workspaceName:      workspace?.name ?? '',
    workspaceLegalName: workspace?.legalName ?? null,
  })

  return <DealMemoEditor projectId={id} memo={editorMemo} lines={lines} library={library} vendorView={vendorView} />
}
