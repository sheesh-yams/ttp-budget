import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { ProposalPublicView } from '@/components/proposal/ProposalPublicView'
import { recordProposalView } from '@/server/actions/proposals'
import { sumAccount, type AccountInput } from '@/lib/totals'
import { headers } from 'next/headers'
import type { ProposalFull, AccountWithItems } from '@/types'

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

  const proposal = await db.proposal.findUnique({
    where: { publicToken: token },
    include: {
      project: { include: { client: true } },
      budget: {
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
                    },
                  },
                },
              },
            },
          },
        },
      },
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

  // Primary phase accounts for budget summary
  const primaryPhase =
    proposal.budget.phases.find(p => p.isPrimary) ?? proposal.budget.phases[0]
  const accounts = (primaryPhase?.accounts ?? []) as unknown as AccountWithItems[]
  const totalCents = accounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
    0
  )

  // Record view — fire and forget
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  const ua = headersList.get('user-agent') ?? ''
  void recordProposalView(proposal.id, ip, ua)

  return (
    <ProposalPublicView
      proposal={proposal as unknown as ProposalFull}
      accounts={accounts}
      totalCents={totalCents}
    />
  )
}
