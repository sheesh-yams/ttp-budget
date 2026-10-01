import { notFound } from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getScopedDb } from '@/lib/db-scoped'
import { loadDealMemoEditor } from '@/lib/deal-memo-queries'
import { toVendorDealMemo } from '@/lib/deal-memo-vendor-view'
import { DealMemoEditor, type EditorMemo } from '@/components/deal-memos/DealMemoEditor'

export const metadata = { title: 'Deal Memo' }

export default async function DealMemoPage({ params }: { params: Promise<{ id: string; memoId: string }> }) {
  const { id, memoId } = await params
  await requireProjectAccess(id)
  const access = await requireProjectArea(id, 'dealMemos')
  const showBudget = access.can('budget.costs')

  const [sdb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])
  const [data, project, workspace] = await Promise.all([
    loadDealMemoEditor(sdb, id, memoId),
    sdb.project.findFirst({ where: { id }, select: { name: true } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, legalName: true } }),
  ])
  if (!data || !project) notFound()
  const { memo, library } = data
  // Budget lines are offered for fee mapping (lines VIEW is enough); their
  // rates are budget costs.
  const lines = showBudget ? data.lines : data.lines.map(l => ({ ...l, rateCents: 0 }))

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

  return (
    <DealMemoEditor
      projectId={id} memo={editorMemo} lines={lines} library={library} vendorView={vendorView}
      showBudget={showBudget} canEdit={access.can('dealMemos', 'EDIT')}
    />
  )
}
