import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Calendar, User, TrendingUp } from 'lucide-react'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { BudgetEditor } from '@/components/projects/BudgetEditor'
import { ProjectProposals } from '@/components/projects/ProjectProposals'
import { ProjectInvoices } from '@/components/projects/ProjectInvoices'
import { ProjectHeaderActions } from '@/components/projects/ProjectHeaderActions'
import { ClientInfoPanel } from '@/components/projects/ClientInfoPanel'
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
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `${project.name} — TTP Budget` : 'Project' }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const project = await db.project.findFirst({
    where: { id, workspaceId },
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
          id:            true,
          title:         true,
          status:        true,
          publicToken:   true,
          version:       true,
          createdAt:     true,
          expiresAt:     true,
          signatureName: true,
          approvedAt:    true,
          content:       true,
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        select: {
          id:              true,
          number:          true,
          title:           true,
          status:          true,
          kind:            true,
          totalCents:      true,
          amountPaidCents: true,
          dueDate:         true,
          publicToken:     true,
          sentAt:          true,
          lineItems:       true,
          taxPct:          true,
          notes:           true,
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

  // ── Actuals summary (lightweight — just revenue override + sum of entries) ──
  let actualsSummary: {
    billedCents: number
    spentCents:  number
    profitCents: number
    marginPct:   number
    hasSheet:    boolean
    actualsId:   string | null
  } | null = null

  if (budget) {
    const sheet = await db.actualSheet.findFirst({
      where: { budgetId: budget.id, workspaceId },
      select: {
        id:                  true,
        revenueOverrideCents: true,
        entries: { select: { actualCents: true } },
      },
    })

    if (sheet) {
      const billedCents = sheet.revenueOverrideCents ?? grandTotalCents
      const spentCents  = sheet.entries.reduce((s, e) => s + e.actualCents, 0)
      const profitCents = billedCents - spentCents
      const marginPct   = billedCents > 0 ? (profitCents / billedCents) * 100 : 0

      actualsSummary = {
        billedCents,
        spentCents,
        profitCents,
        marginPct,
        hasSheet:  true,
        actualsId: sheet.id,
      }
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
                  <> &ndash; {new Date(project.shootEndDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}</>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          {budget && grandTotalCents > 0 && !actualsSummary && (
            <div className="rounded-xl border bg-card px-5 py-3 text-right shadow-sm">
              <p className="text-xs text-muted-foreground">Budget total</p>
              <p className="text-2xl font-semibold tabular text-foreground">{formatMoney(grandTotalCents)}</p>
            </div>
          )}
          <ClientInfoPanel
            projectId={project.id}
            projectName={project.name}
            projectNotes={project.notes ?? null}
            client={{
              name:           project.client.name,
              contactName:    project.client.contactName ?? null,
              contactEmail:   project.client.contactEmail ?? null,
              contactPhone:   project.client.contactPhone ?? null,
              billingAddress: project.client.billingAddress ?? null,
              notes:          (project.client as { notes?: string | null }).notes ?? null,
            }}
            trigger={
              <Button size="sm" variant="outline" className="flex-shrink-0">
                <User className="mr-1.5 h-3.5 w-3.5" />
                Client Info
              </Button>
            }
          />
          <ProjectHeaderActions project={serialisedProject} />
        </div>
      </div>

      {/* ── Actuals summary bar ──────────────────────────────────────────────── */}
      {actualsSummary && (
        <section className="mb-6">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="grid grid-cols-4 divide-x">
              <ActualsStat
                label="Billed"
                value={formatMoney(actualsSummary.billedCents)}
                sub={null}
                color="text-foreground"
              />
              <ActualsStat
                label="Spent"
                value={formatMoney(actualsSummary.spentCents)}
                sub={null}
                color="text-foreground"
              />
              <ActualsStat
                label="Profit"
                value={formatMoney(actualsSummary.profitCents)}
                sub={null}
                color={actualsSummary.profitCents >= 0 ? 'text-green-500' : 'text-red-500'}
              />
              <ActualsStat
                label="Margin"
                value={`${actualsSummary.marginPct.toFixed(1)}%`}
                sub={null}
                color={marginColor(actualsSummary.marginPct)}
              />
            </div>
            <div className="border-t px-4 py-2 flex items-center justify-between bg-muted/30">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Actuals are being tracked for this project
              </span>
              <Link
                href={`/projects/${project.id}/actuals`}
                className="text-xs text-primary hover:underline underline-offset-2 transition-colors"
              >
                Edit actuals →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Proposals ────────────────────────────────────────────────────────── */}
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

      {/* ── Invoices ─────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <ProjectInvoices
          invoices={project.invoices as never}
          projectId={project.id}
        />
      </section>

      {/* ── Deliverables / Proposal Overview ─────────────────────────────────── */}
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

      {/* ── Budget ───────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Budget</h2>
          {budget && !actualsSummary && (
            <Link
              href={`/projects/${project.id}/actuals`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Track actuals →
            </Link>
          )}
          {budget && actualsSummary && (
            <Link
              href={`/projects/${project.id}/actuals`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Edit actuals →
            </Link>
          )}
        </div>
        {!budget ? (
          <NoBudget projectId={project.id} />
        ) : (
          <BudgetEditor budget={budget} projectId={project.id} />
        )}
      </section>
    </div>
  )
}

// ─── Actuals stat card ────────────────────────────────────────────────────────

function ActualsStat({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub:   string | null
  color: string
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-semibold tabular ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function marginColor(pct: number): string {
  if (pct >= 30) return 'text-green-500'
  if (pct >= 20) return 'text-yellow-500'
  if (pct >= 10) return 'text-orange-500'
  return 'text-red-500'
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
