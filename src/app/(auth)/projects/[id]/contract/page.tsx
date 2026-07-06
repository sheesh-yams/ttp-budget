import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ContractTab } from '@/components/proposals/ContractTab'
import { ScrollText } from 'lucide-react'
import Link from 'next/link'

export default async function ProjectContractPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  // Fetch project and its proposals — prefer non-draft, fall back to draft
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: {
      id:   true,
      name: true,
      proposals: {
        orderBy: { createdAt: 'desc' },
        select: {
          id:              true,
          title:           true,
          status:          true,
          contractEnabled: true,
        },
      },
    },
  })

  if (!project) notFound()

  // Pick most recent non-draft first, then any draft
  const proposal =
    project.proposals.find(p => p.status !== 'DRAFT') ??
    project.proposals[0]

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <ScrollText className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No proposal yet</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Create a proposal for this project first, then you can edit the contract terms here.
        </p>
        <Link
          href={`/projects/${id}`}
          className="mt-1 text-sm text-primary hover:underline underline-offset-2"
        >
          Go to Overview →
        </Link>
      </div>
    )
  }

  const contractEnabled = proposal.contractEnabled

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Contract</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Proposal: <span className="text-foreground font-medium">{proposal.title}</span>
        </p>
      </div>

      <ContractTab proposalId={proposal.id} contractEnabled={contractEnabled} height="calc(100vh - 200px)" />
    </div>
  )
}
