import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getActualSheet, syncActualSheetEntries } from '@/server/actions/actuals'
import { ActualsEditor } from '@/components/projects/ActualsEditor'
import { sumAccount, calcBudgetTotals, type AccountInput } from '@/lib/totals'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `${project.name} | Actuals` : 'Actuals' }
}

export default async function ActualsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  // Load project with budget + primary phase
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: {
      id:   true,
      name: true,
      budgets: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          id:        true,
          name:      true,
          markupPct: true,
          taxPct:    true,
          phases: {
            orderBy: { order: 'asc' },
            include: {
              accounts: {
                where:   { parentId: null },
                orderBy: { order: 'asc' },
                include: {
                  lineItems: { orderBy: { order: 'asc' } },
                  children: {
                    orderBy: { order: 'asc' },
                    include: {
                      lineItems: { orderBy: { order: 'asc' } },
                      children: {
                        orderBy: { order: 'asc' },
                        include: { lineItems: { orderBy: { order: 'asc' } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!project) notFound()

  const budget = project.budgets[0] ?? null
  const phase  = budget
    ? (budget.phases.find(p => (p as unknown as { isPrimary: boolean }).isPrimary) ?? budget.phases[0] ?? null)
    : null

  // Compute budget grand total (what was billed / what the client agreed to pay)
  let budgetTotalCents = 0
  if (phase) {
    const markupPct = budget ? Number(budget.markupPct ?? 0) : 0
    const taxPct    = budget ? Number(budget.taxPct    ?? 0) : 0
    const totals = calcBudgetTotals(
      phase.accounts as unknown as AccountInput[],
      markupPct,
      taxPct,
    )
    budgetTotalCents = totals.grandTotalCents
  }

  // Fetch existing actuals sheet, then sync any line items added to the budget
  // after the sheet was created (they wouldn't have ActualEntry rows yet and
  // would show as un-editable "—" without this step).
  let sheet = budget ? await getActualSheet(budget.id) : null
  if (sheet && phase) {
    const synced = await syncActualSheetEntries(
      sheet.id,
      phase.accounts as unknown as import('@/server/actions/actuals').AccountNode[],
    )
    if (synced) sheet = synced
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Link
        href={`/projects/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {project.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Actuals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track real spend against your budget and see your margins.
        </p>
      </div>

      <ActualsEditor
        project={{ id: project.id, name: project.name }}
        budget={budget ? { id: budget.id, name: budget.name } : null}
        phase={phase as unknown as { id: string; accounts: unknown[] }}
        sheet={sheet}
        budgetTotalCents={budgetTotalCents}
      />
    </div>
  )
}
