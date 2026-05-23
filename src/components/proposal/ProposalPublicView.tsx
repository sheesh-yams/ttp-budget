// Phase 2 component — full implementation builds here.
// This stub lets the scaffold compile cleanly.

import type { ProposalWithProject } from '@/types'

export function ProposalPublicView({ proposal }: { proposal: ProposalWithProject }) {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-white/50 text-sm">
          Proposal: {proposal.title}
        </p>
        <p className="text-white/30 text-xs mt-2">
          Full proposal renderer — Phase 2
        </p>
      </div>
    </div>
  )
}
