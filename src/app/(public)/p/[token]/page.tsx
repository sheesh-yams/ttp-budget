import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { ProposalPublicView } from '@/components/proposal/ProposalPublicView'
import { recordProposalView } from '@/server/actions/proposals'
import { sumAccount, calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { trustedClientIp } from '@/lib/client-ip'
import { ExpiredLinkPage } from '@/components/public/ExpiredLinkPage'
import { RateLimitedPage } from '@/components/public/RateLimitedPage'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const proposal = await db.proposal.findUnique({
    where:  { publicToken: token },
    select: { title: true },
  })
  if (!proposal) return { title: 'Proposal not found' }
  return {
    title: { absolute: `${proposal.title} | Proposal` },
    robots: { index: false },
  }
}

export default async function PublicProposalPage({ params }: Props) {
  const { token } = await params

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const reqHeaders = await headers()
  const ip = trustedClientIp(name => reqHeaders.get(name))
  const { success } = await checkRateLimit('publicDoc', ip)
  if (!success) return <RateLimitedPage />

  // ── Fetch proposal (no budget nesting — we fetch accounts separately) ──────
  let proposal = await db.proposal.findUnique({
    where: { publicToken: token },
    include: {
      project: { include: { client: true } },
      workspace: {
        select: {
          name: true,
          legalName: true,
          contactEmail: true,
          website: true,
          contactPhone: true,
          logoUrl: true,
          logoDarkUrl: true,
          primaryColor: true,
          accentColor: true,
          invoiceNumberPrefix: true,
        },
      },
    },
  })

  if (!proposal) notFound()

  // ── Contract sections ─────────────────────────────────────────────────────
  type ContractSectionRow = { id: string; title: string; body: string; orderIndex: number }
  const contractEnabled = (proposal as unknown as { contractEnabled?: boolean }).contractEnabled ?? true
  const contractSections = contractEnabled
    ? await (db as unknown as {
        proposalContractSection: {
          findMany: (a: object) => Promise<ContractSectionRow[]>
        }
      }).proposalContractSection.findMany({
        where:   { proposalId: proposal.id },
        orderBy: { orderIndex: 'asc' },
        select:  { id: true, title: true, body: true, orderIndex: true },
      })
    : []

  // ── Expiry check ──────────────────────────────────────────────────────────
  const proposalExpiry = (proposal as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
  if (proposalExpiry && proposalExpiry < new Date()) {
    return <ExpiredLinkPage type="proposal" />
  }

  const isDraft = proposal.status === 'DRAFT'

  // ── Budget data: use frozen snapshot if present, otherwise fall back to live ─
  const content = proposal.content as Record<string, unknown>
  const snapshot = content?.budgetSnapshot as {
    accounts: unknown[]
    totalCents: number
    discountCents?: number
    discountLabel?: string
  } | undefined

  let serialisedAccounts: unknown[]
  let totalCents: number
  let discountCents = 0
  let discountLabel = 'Discount'
  let budgetSections: { id: string; title: string }[] = []

  if (snapshot?.accounts) {
    // Proposal was sent with a frozen snapshot — use it
    serialisedAccounts = snapshot.accounts
    totalCents = snapshot.totalCents
    discountCents = snapshot.discountCents ?? 0
    discountLabel = snapshot.discountLabel || 'Discount'
    budgetSections = (snapshot as unknown as { sections?: { id: string; title: string }[] }).sections ?? []
  } else {
    // Legacy / draft: fall back to live budget query
    const phaseInclude = {
      sections: {
        orderBy: { orderIndex: 'asc' as const },
        select:  { id: true, title: true },
      },
      accounts: {
        where: { parentId: null as null },
        orderBy: { order: 'asc' as const },
        include: {
          lineItems: { orderBy: { order: 'asc' as const } },
          children: {
            orderBy: { order: 'asc' as const },
            include: { lineItems: { orderBy: { order: 'asc' as const } } },
          },
        },
      },
    }
    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: proposal.budgetId, isPrimary: true },
      include: phaseInclude,
    }) ?? await db.phase.findFirst({
      where: { budgetId: proposal.budgetId },
      orderBy: { order: 'asc' as const },
      include: phaseInclude,
    })

    budgetSections = (primaryPhase?.sections ?? []).map(s => ({ id: s.id, title: s.title }))

    const accounts = primaryPhase?.accounts ?? []
    serialisedAccounts = accounts.map(acc => ({
      ...acc,
      sectionId: (acc as unknown as { sectionId?: string }).sectionId ?? null,
      lineItems: acc.lineItems.map(item => ({
        ...item,
        quantity:  Number(item.quantity),
        markupPct: item.markupPct != null ? Number(item.markupPct) : null,
      })),
      children: acc.children.map(child => ({
        ...child,
        lineItems: child.lineItems.map(item => ({
          ...item,
          quantity:  Number(item.quantity),
          markupPct: item.markupPct != null ? Number(item.markupPct) : null,
        })),
      })),
    }))

    // Fetch budget-level markup/tax/discount so the draft preview total matches
    // what the sent proposal will show (the snapshot captures these; the draft
    // path must apply them manually or the hero total is missing them).
    const budgetForMarkup = proposal.budgetId
      ? await db.budget.findUnique({
          where: { id: proposal.budgetId },
          select: {
            markupPct: true, taxPct: true,
            discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
          },
        })
      : null
    const draftMarkupPct = budgetForMarkup?.markupPct != null ? Number(budgetForMarkup.markupPct) : 0
    const draftTaxPct    = budgetForMarkup?.taxPct    != null ? Number(budgetForMarkup.taxPct)    : 0
    const draftDiscountConfig: BudgetDiscountConfig | null = budgetForMarkup?.discountType ? {
      type:       budgetForMarkup.discountType as 'flat' | 'pct',
      label:      budgetForMarkup.discountLabel,
      valueCents: budgetForMarkup.discountValueCents,
      valuePct:   budgetForMarkup.discountValuePct != null ? Number(budgetForMarkup.discountValuePct) : null,
    } : null

    const draftTotals = calcBudgetTotals(
      serialisedAccounts as unknown as AccountInput[],
      draftMarkupPct,
      draftTaxPct,
      draftDiscountConfig,
    )
    discountCents = draftTotals.discountCents
    discountLabel = draftTotals.discountLabel || 'Discount'
    totalCents    = draftTotals.grandTotalCents

    // Drafts always preview the LIVE description/deliverables from the budget's
    // primary phase — not whatever was captured on the last "Save Draft" — so
    // editing the Proposal Overview or budget doesn't require re-saving the
    // draft (or deleting and recreating it) to see the change reflected. Sent
    // proposals must stay frozen at what was actually sent, so this is gated
    // on isDraft rather than just "no snapshot".
    let sectionsPatch: unknown[] | undefined
    if (isDraft) {
      const livePhaseOverview = (primaryPhase as unknown as { overview?: string | null })?.overview ?? ''
      const livePhaseAbout    = primaryPhase?.description ?? ''
      const livePhaseDeliverables = (primaryPhase as unknown as {
        deliverables?: { title: string; description: string; sectionIds?: string[] }[] | null
      })?.deliverables ?? []

      const existingSections = (content.sections as Array<Record<string, unknown>> | undefined) ?? []
      sectionsPatch = existingSections.map(sec => {
        if (sec.type === 'about') return { ...sec, overview: livePhaseOverview, body: livePhaseAbout }
        if (sec.type === 'scope') {
          return {
            ...sec,
            items: livePhaseDeliverables.map((d, i) => ({
              number:      String(i + 1).padStart(2, '0'),
              title:       d.title,
              description: d.description,
              ...(d.sectionIds?.length ? { sectionIds: d.sectionIds } : {}),
            })),
          }
        }
        return sec
      })
    }

    // Inject a synthetic budgetSnapshot so ProposalPublicView's breakdown
    // section shows the agency fee row correctly for draft previews.
    const needsSnapshotPatch = draftMarkupPct > 0 || draftTaxPct > 0

    if (needsSnapshotPatch || sectionsPatch) {
      proposal = {
        ...proposal,
        content: {
          ...content,
          ...(sectionsPatch ? { sections: sectionsPatch } : {}),
          ...(needsSnapshotPatch ? {
            budgetSnapshot: {
              ...(content.budgetSnapshot as object | undefined ?? {}),
              productionCents: draftTotals.subtotalCents,
              budgetMarkupPct: draftMarkupPct,
              budgetTaxPct:    draftTaxPct,
              totalCents:      totalCents,
            },
          } : {}),
        },
      } as typeof proposal
    }
  }

  // Serialise the proposal too (strip Decimal / Date edge cases)
  const serialisedProposal = {
    ...proposal,
    // content is already plain JSON from Prisma
    project: {
      ...proposal.project,
      shootStartDate: proposal.project.shootStartDate?.toISOString() ?? null,
      shootEndDate:   proposal.project.shootEndDate?.toISOString()   ?? null,
    },
    createdAt:  proposal.createdAt.toISOString(),
    updatedAt:  proposal.updatedAt.toISOString(),
    sentAt:     proposal.sentAt?.toISOString()     ?? null,
    expiresAt:  proposal.expiresAt?.toISOString()  ?? null,
    approvedAt: proposal.approvedAt?.toISOString() ?? null,
    firstViewedAt: proposal.firstViewedAt?.toISOString() ?? null,
    lastViewedAt:  proposal.lastViewedAt?.toISOString()  ?? null,
    declinedAt:    proposal.declinedAt?.toISOString()    ?? null,
  }

  // Record view — fire and forget (skip for draft previews)
  if (!isDraft) {
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') ?? 'unknown'
    const ua = headersList.get('user-agent') ?? ''
    void recordProposalView(proposal.id, ip, ua)
  }

  // When the contract toggle is ON and sections exist, the contract + sign-off
  // move to /p/[token]/sign. The main proposal view shows a "Continue to Sign" CTA.
  // If toggle is OFF or no sections have been added yet, fall back to inline sign-off.
  const effectiveContractEnabled = contractEnabled && contractSections.length > 0

  return (
    <ProposalPublicView
      proposal={serialisedProposal as never}
      accounts={serialisedAccounts as never}
      totalCents={totalCents}
      discountCents={discountCents}
      discountLabel={discountLabel}
      isDraft={isDraft}
      budgetSections={budgetSections}
      contractEnabled={effectiveContractEnabled}
      contractSections={effectiveContractEnabled ? [] : contractSections}
    />
  )
}
