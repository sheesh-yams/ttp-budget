import Link from 'next/link'
import { ExternalLink, CheckCircle, Clock, Send, FileText } from 'lucide-react'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { ProposalStatus } from '@/types'

export const metadata = { title: 'Proposals — TTP Budget' }

const STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:    { label: 'Draft',    color: 'bg-gray-100 text-gray-600',     icon: <FileText    className="h-3 w-3" /> },
  SENT:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700',     icon: <Send        className="h-3 w-3" /> },
  VIEWED:   { label: 'Viewed',   color: 'bg-violet-100 text-violet-700', icon: <Clock       className="h-3 w-3" /> },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700',   icon: <CheckCircle className="h-3 w-3" /> },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-700',       icon: <Clock       className="h-3 w-3" /> },
  EXPIRED:  { label: 'Expired',  color: 'bg-amber-100 text-amber-700',   icon: <Clock       className="h-3 w-3" /> },
}

export default async function ProposalsPage() {
  const user = await getCurrentUser()

  const proposals = await db.proposal.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      publicToken: true,
      version: true,
      createdAt: true,
      expiresAt: true,
      approvedAt: true,
      signatureName: true,
      firstViewedAt: true,
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { name: true } },
        },
      },
    },
  })

  const now = new Date()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
      </div>

      {proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No proposals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a project and create a proposal to share your budget with a client.
          </p>
          <Link
            href="/projects"
            className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Projects
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Proposal</th>
                <th className="px-3 py-2.5 text-left">Project</th>
                <th className="px-3 py-2.5 text-left">Client</th>
                <th className="px-3 py-2.5 text-left w-28">Status</th>
                <th className="px-3 py-2.5 text-left w-32">Created</th>
                <th className="px-3 py-2.5 text-left w-36">Valid through</th>
                <th className="px-3 py-2.5 text-left w-40">Signed by</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => {
                const isExpired = !!p.expiresAt && new Date(p.expiresAt) < now && p.status !== 'APPROVED'
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.DRAFT
                const effectiveStatus = isExpired ? STATUS_CONFIG.EXPIRED : cfg

                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <Link
                        href={`/projects/${p.project.id}`}
                        className="hover:underline"
                      >
                        {p.title}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground font-normal">v{p.version}</span>
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
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${effectiveStatus.color}`}>
                        {effectiveStatus.icon}
                        {effectiveStatus.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {p.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {p.expiresAt
                        ? p.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {p.signatureName ?? '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      <a
                        href={`/p/${p.publicToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
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
      )}
    </div>
  )
}
