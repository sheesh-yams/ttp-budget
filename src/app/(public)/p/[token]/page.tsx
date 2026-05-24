import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { ProposalPublicView } from '@/components/proposal/ProposalPublicView'
import { recordProposalView } from '@/server/actions/proposals'
import { sumAccount, type AccountInput } from '@/lib/totals'
import { headers } from 'next/headers'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const proposal = await db.proposal.findUnique({
    where: { publicToken: token },
    include: { project: { include: { client: true } } },
  })
  if (!proposal) return { title: 'Proposal not found' }
  return {
    title: `${proposal.title} — The Third Place Creative`,
    robots: { index: false },
  }
}

export default async function PublicProposalPage({ params }: Props) {
  const { token } = await params

  // ── Fetch proposal (no budget nesting — we fetch accounts separately) ──────
  const proposal = await db.proposal.findUnique({
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
        },
      },
    },
  })

  if (!proposal || proposal.status === 'DRAFT') {
    notFound()
  }

  // ── Fetch accounts from the primary phase separately ──────────────────────
  const primaryPhase = await db.phase.findFirst({
    where: { budgetId: proposal.budgetId, isPrimary: true },
    include: {
      accounts: {
        where: { parentId: null },
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
  }) ?? await db.phase.findFirst({
    where: { budgetId: proposal.budgetId },
    orderBy: { order: 'asc' },
    include: {
      accounts: {
        where: { parentId: null },
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
  })

  const accounts = primaryPhase?.accounts ?? []

  // Convert Decimal → number so the client component receives plain JSON
  const serialisedAccounts = accounts.map(acc => ({
    ...acc,
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

  const totalCents = serialisedAccounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
    0
  )

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

  // Record view — fire and forget
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  const ua = headersList.get('user-agent') ?? ''
  void recordProposalView(proposal.id, ip, ua)

  return (
    <ProposalPublicView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proposal={serialisedProposal as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts={serialisedAccounts as any}
      totalCents={totalCents}
    />
  )
}
