import { FileText } from 'lucide-react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProposalsKanban, type ProposalCardData } from '@/components/proposals/ProposalsKanban'

export const metadata = { title: 'Proposals' }

export default async function ProposalsPage() {
  const workspaceId = await getWorkspaceId()

  // Fetch all non-archived projects that have at least one proposal
  const projects = await db.project.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      proposals: { some: {} },
    },
    include: {
      client: { select: { name: true } },
      proposals: {
        orderBy: { version: 'desc' },
        select: {
          id:            true,
          title:         true,
          status:        true,
          publicToken:   true,
          version:       true,
          viewCount:     true,
          sentAt:        true,
          approvedAt:    true,
          declinedAt:    true,
          expiresAt:     true,
          signatureName: true,
          createdAt:     true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // One card per project — latest proposal (highest version) drives the column
  const cards: ProposalCardData[] = projects
    .filter(p => p.proposals.length > 0)
    .map(p => {
      const latest = p.proposals[0] // ordered by version desc
      return {
        projectId:   p.id,
        projectName: p.name,
        clientName:  p.client.name,
        shootType:   p.shootType,
        proposal: {
          id:            latest.id,
          title:         latest.title,
          version:       latest.version,
          status:        latest.status,
          viewCount:     latest.viewCount,
          sentAt:        latest.sentAt,
          approvedAt:    latest.approvedAt,
          declinedAt:    latest.declinedAt,
          expiresAt:     latest.expiresAt,
          publicToken:   latest.publicToken,
          signatureName: latest.signatureName,
        },
        totalCount: p.proposals.length,
      }
    })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Proposals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cards.length === 0
            ? 'No proposals yet'
            : `${cards.length} project${cards.length !== 1 ? 's' : ''} in the pipeline`}
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="font-medium text-foreground">No proposals yet</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Open a project and send a proposal to track it here.
          </p>
          <Link
            href="/projects"
            className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Projects
          </Link>
        </div>
      ) : (
        <ProposalsKanban cards={cards} />
      )}
    </div>
  )
}
