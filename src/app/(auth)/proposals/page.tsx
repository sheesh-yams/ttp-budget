import { ExternalLink, FileText } from 'lucide-react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProposalsKanban, type ProposalCardData } from '@/components/proposals/ProposalsKanban'

export const metadata = { title: 'Proposals' }

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT:          { label: 'Draft',          bg: '#F3F4F6', text: '#374151' },
  SENT:           { label: 'Sent',           bg: '#DBEAFE', text: '#1E40AF' },
  VIEWED:         { label: 'Viewed',         bg: '#EDE9FE', text: '#5B21B6' },
  CHANGES_NEEDED: { label: 'Changes Needed', bg: '#FEF3C7', text: '#92400E' },
  APPROVED:       { label: 'Approved',       bg: '#D1FAE5', text: '#065F46' },
  DECLINED:       { label: 'Declined',       bg: '#FEE2E2', text: '#991B1B' },
  EXPIRED:        { label: 'Expired',        bg: '#FEF3C7', text: '#78350F' },
}

export default async function ProposalsPage() {
  const workspaceId = await getWorkspaceId()
  const now = new Date()

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
      const latest = p.proposals[0]
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
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">Proposal</th>
                  <th className="px-3 py-2.5 text-left">Project</th>
                  <th className="px-3 py-2.5 text-left">Client</th>
                  <th className="px-3 py-2.5 text-left w-32">Status</th>
                  <th className="px-3 py-2.5 text-left w-24">Sent</th>
                  <th className="px-3 py-2.5 text-left w-24">Created</th>
                  <th className="px-3 py-2.5 text-left w-36">Signed by</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {allProposals.map(p => {
                  const isExpired = !!p.expiresAt && new Date(p.expiresAt) < now && p.status !== 'APPROVED'
                  const eff       = isExpired ? 'EXPIRED' : p.status
                  const style     = STATUS_STYLES[eff] ?? STATUS_STYLES.DRAFT

                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/projects/${p.project.id}`}
                          className="font-medium text-foreground hover:text-violet-700 hover:underline"
                        >
                          {p.title}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          v{p.version}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <Link href={`/projects/${p.project.id}`} className="hover:underline hover:text-foreground">
                          {p.project.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {p.project.client.name}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                          style={{ background: style.bg, color: style.text }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {p.sentAt
                          ? new Date(p.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {p.signatureName ?? '—'}
                      </td>
                      <td className="px-2 py-2.5">
                        <a
                          href={`/p/${p.publicToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex rounded p-1 text-muted-foreground/40 hover:bg-accent hover:text-violet-600 transition-colors"
                          title="Open public proposal"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
