import { FileText } from 'lucide-react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProposalsKanban, type ProposalCardData } from '@/components/proposals/ProposalsKanban'
import { ProposalsTable } from '@/components/proposals/ProposalsTable'

export const metadata = { title: 'Proposals' }

export default async function ProposalsPage() {
  const workspaceId = await getWorkspaceId()

  const [projects, allProposals] = await Promise.all([
    // For Kanban — projects with proposals, latest version first
    db.project.findMany({
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
    }),

    // For table — all proposals flat, newest first
    db.proposal.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id:            true,
        title:         true,
        status:        true,
        publicToken:   true,
        version:       true,
        viewCount:     true,
        sentAt:        true,
        expiresAt:     true,
        approvedAt:    true,
        signatureName: true,
        createdAt:     true,
        project: {
          select: {
            id:     true,
            name:   true,
            client: { select: { name: true } },
          },
        },
      },
    }),
  ])

  // ── Build Kanban cards (one per project, latest proposal) ──────────────────
  const cards: ProposalCardData[] = projects
    .filter(p => p.proposals.length > 0)
    .map(p => {
      // Show the latest sent proposal in the Kanban (skip drafts); fall back to newest if all are drafts
      const latest = p.proposals.find(pr => pr.status !== 'DRAFT') ?? p.proposals[0]
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
          declinedAt:    null,
          expiresAt:     latest.expiresAt,
          publicToken:   latest.publicToken,
          signatureName: latest.signatureName,
        },
        totalCount: p.proposals.length,
      }
    })

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length === 0
              ? 'No proposals yet'
              : `${cards.length} project${cards.length !== 1 ? 's' : ''} · ${allProposals.length} proposal${allProposals.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
      </div>

      {/* ── Kanban ── */}
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

      {/* ── All proposals list ── */}
      {allProposals.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            All Proposals
          </h2>
          <ProposalsTable proposals={allProposals} />
        </div>
      )}
    </div>
  )
}
