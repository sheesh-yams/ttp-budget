import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Calendar, User } from 'lucide-react'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { BudgetEditor } from '@/components/projects/BudgetEditor'
import { ProjectProposals } from '@/components/projects/ProjectProposals'
import { ProjectInvoices } from '@/components/projects/ProjectInvoices'
import { ProjectHeaderActions } from '@/components/projects/ProjectHeaderActions'
import { ProposalOverview } from '@/components/projects/ProposalOverview'
import { createBudget } from '@/server/actions/budgets'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'

const SHOOT_LABELS: Record<string, string> = {
  MUSIC_VIDEO:    'Music Video',
  BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT:  'Product Shoot',
  EVENT_RECAP:    'Event Recap',
  SOCIAL_CONTENT: 'Social Content',
  INFLUENCER:     'Influencer',
  DOCUMENTARY:    'Documentary',
  OTHER:          'Other',
}

const STATUS_COLORS: Record<string, string> = {
  LEAD:     'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-green-100 text-green-800',
  WRAPPED:  'bg-blue-100 text-blue-800',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await db.project.findUnique({ where: { id }, select: { name: true } })
  return { title: project ? `${project.name} — TTP Budget` : 'Project' }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  const project = await db.project.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: {
      client: true,
      budgets: {
        orderBy: { createdAt: 'asc' },
        include: {
          phases: {
            orderBy: { order: 'asc' },
            include: {
              accounts: {
                where: { parentId: null },
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
      proposals: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          publicToken: true,
          version: true,
          createdAt: true,
          expiresAt: true,
          signatureName: true,
          approvedAt: true,
          content: true,
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          kind: true,
          totalCents: true,
          amountPaidCents: true,
          dueDate: true,
          publicToken: true,
          sentAt: true,
        },
      },
    },
  })

  if (!project) notFound()

  const budget = project.budgets[0] ?? null

  // Grand total from primary phase
  let grandTotalCents = 0
  if (budget) {
    const primaryPhase = budget.phases.find(p => p.isPrimary) ?? budget.phases[0]
    if (primaryPhase) {
      grandTotalCents = primaryPhase.accounts.reduce(
        (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
        0
      )
    }
  }

  // Serialise project for client component (dates → strings)
  const serialisedProject = {
    id:             project.id,
    name:           project.name,
    status:         project.status,
    shootType:      project.shootType,
    shootStartDate: project.shootStartDate?.toISOString() ?? null,
    shootEndDate:   project.shootEndDate?.toISOString()   ?? null,
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        All projects
      </Link>

      {/* Project header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[project.status] ?? ''}`}>
              {project.status}
            </span>
            <span className="text-xs text-muted-foreground">{SHOOT_LABELS[project.shootType] ?? project.shootType}</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {project.client.name}
            </span>
            {project.shootStartDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(project.shootStartDate).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
                {project.shootEndDate && project.shootEndDate.getTime() !== project.shootStartDate.getTime() && (
                  <> – {new Date(project.shootEndDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}</>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          {budget && grandTotalCents > 0 && (
            <div className="rounded-xl border bg-card px-5 py-3 text-right shadow-sm">
              <p className="text-xs text-muted-foreground">Budget total</p>
              <p className="text-2xl font-semibold tabular text-foreground">{formatMoney(grandTotalCents)}</p>
            </div>
          )}
          {/* Edit project button (client component) */}
          <ProjectHeaderActions project={serialisedProject} />
        </div>
      </div>

      {/* Proposals section */}
      <section className="mb-8">
        <ProjectProposals
          proposals={project.proposals as never}
          projectId={project.id}
          projectName={project.name}
          clientId={project.clientId}
          budgetId={budget?.id ?? null}
          totalCents={grandTotalCents}
        />
      </section>

      {/* Invoices section */}
      {project.invoices.length > 0 && (
        <section className="mb-8">
          <ProjectInvoices invoices={project.invoices as never} />
        </section>
      )}

      {/* Proposal Overview section — editable description + deliverables per budget version */}
      {budget && (() => {
        const primaryPhase = budget.phases.find(p => p.isPrimary) ?? budget.phases[0]
        if (!primaryPhase) return null
        return (
          <ProposalOverview
            phase={{
              id:           primaryPhase.id,
              name:         primaryPhase.name,
              description:  (primaryPhase as { description?: string | null }).description ?? null,
              deliverables: (primaryPhase as { deliverables?: unknown }).deliverables as ({ title: string; description: string }[]) | null,
            }}
          />
        )
      })()}

      {/* Budget section */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">Budget</h2>
        {!budget ? (
          <NoBudget projectId={project.id} />
        ) : (
          <BudgetEditor budget={budget} projectId={project.id} />
        )}
      </section>
    </div>
  )
}

// ─── Empty state when no budget yet ──────────────────────────────────────────

function NoBudget({ projectId }: { projectId: string }) {
  async function handleCreate() {
    'use server'
    await createBudget(projectId)
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <p className="font-medium text-foreground">No budget yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Create a blank budget to start adding line items.</p>
      <form action={handleCreate}>
        <Button className="mt-4" type="submit">Create budget</Button>
      </form>
    </div>
  )
}
