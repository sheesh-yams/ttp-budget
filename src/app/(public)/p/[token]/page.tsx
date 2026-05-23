import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { ProposalPublicView } from '@/components/proposal/ProposalPublicView'
import { recordProposalView } from '@/server/actions/proposals'
import { headers } from 'next/headers'

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props) {
  const proposal = await db.proposal.findUnique({
    where: { publicToken: params.token },
    include: { project: { include: { client: true } } },
  })
  if (!proposal) return { title: 'Proposal not found' }
  return {
    title: `${proposal.title} — The Third Place Creative`,
    robots: { index: false },
  }
}

export default async function PublicProposalPage({ params }: Props) {
  const proposal = await db.proposal.findUnique({
    where: { publicToken: params.token },
    include: {
      project: { include: { client: true } },
      budget: true,
    },
  })

  if (!proposal || proposal.status === 'DRAFT') {
    notFound()
  }

  // Record view — fire and forget
  const headersList = headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  const ua = headersList.get('user-agent') ?? ''
  void recordProposalView(proposal.id, ip, ua)

  return <ProposalPublicView proposal={proposal} />
}
