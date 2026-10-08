'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContractBlockCard } from './ContractBlockCard'
import { ContractBlockDialog } from './ContractBlockDialog'
import type { ContractBlockRow } from '@/server/actions/contract-blocks'
import type { ContractAudience } from '@prisma/client'

type Props = {
  blocks:    ContractBlockRow[]
  audience?: ContractAudience
  /** A default contract template decides what new memos/proposals start with. */
  hasDefaultTemplate?: boolean
}

export function ContractBlocksManager({ blocks, audience = 'CLIENT', hasDefaultTemplate = false }: Props) {
  const isVendor = audience === 'VENDOR'
  const [createOpen, setCreateOpen] = useState(false)

  const defaultBlocks    = blocks.filter(b => b.isDefault)
  const triggeredBlocks  = blocks.filter(b => !b.isDefault && b.triggers.length > 0)
  const manualBlocks     = blocks.filter(b => !b.isDefault && b.triggers.length === 0)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {hasDefaultTemplate
              ? `The blocks your templates are built from. New ${isVendor ? 'deal memos' : 'proposals'} start with the default template above.`
              : isVendor
              ? 'Terms for crew and talent deal memos. Default blocks attach to every new deal memo, and you can edit them per memo.'
              : 'Reusable contract clauses. Default blocks attach to every proposal; triggered blocks are suggested automatically based on deliverables.'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New block</Button>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {isVendor ? 'No crew & vendor terms yet' : 'No contract blocks yet'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isVendor
              ? 'Add terms like contractor status, cancellation, or work-for-hire. Mark them default to attach them to every deal memo.'
              : 'Create your first block or seed the global library.'}
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            New block
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {defaultBlocks.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {hasDefaultTemplate ? 'Marked default (used only if there’s no default template)' : 'Always attached'}
              </h2>
              <div className="space-y-3">
                {defaultBlocks.map(b => <ContractBlockCard key={b.id} block={b} />)}
              </div>
            </section>
          )}

          {triggeredBlocks.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Auto-attach triggers
              </h2>
              <div className="space-y-3">
                {triggeredBlocks.map(b => <ContractBlockCard key={b.id} block={b} />)}
              </div>
            </section>
          )}

          {manualBlocks.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Manual only
              </h2>
              <div className="space-y-3">
                {manualBlocks.map(b => <ContractBlockCard key={b.id} block={b} />)}
              </div>
            </section>
          )}
        </div>
      )}

      <ContractBlockDialog
        audience={audience}
        hasDefaultTemplate={hasDefaultTemplate}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  )
}
