'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ContractBlockDialog } from './ContractBlockDialog'
import { toggleContractBlockActive, deleteContractBlock } from '@/server/actions/contract-blocks'
import type { ContractBlockRow } from '@/server/actions/contract-blocks'
import type { ContractBlockCategory, TriggerKind } from '@prisma/client'

const CATEGORY_LABELS: Record<ContractBlockCategory, string> = {
  SOW:        'Scope of Work',
  TERMS:      'Terms',
  PAYMENT:    'Payment',
  IP_RIGHTS:  'IP & Rights',
  COMPLIANCE: 'Compliance',
  CUSTOM:     'Custom',
}

const CATEGORY_COLORS: Record<ContractBlockCategory, string> = {
  SOW:        'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  TERMS:      'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  PAYMENT:    'bg-green-500/10 text-green-700 dark:text-green-400',
  IP_RIGHTS:  'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  COMPLIANCE: 'bg-red-500/10 text-red-700 dark:text-red-400',
  CUSTOM:     'bg-muted text-muted-foreground',
}

const TRIGGER_KIND_LABELS: Record<TriggerKind, string> = {
  KEYWORD:          'keyword',
  DELIVERABLE_TYPE: 'type',
  BUDGET_ACCOUNT:   'account',
}

type Props = {
  block: ContractBlockRow
}

export function ContractBlockCard({ block }: Props) {
  const [isPending, startTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleToggleActive() {
    setError(null)
    startTransition(async () => {
      const result = await toggleContractBlockActive(block.id, !block.isActive)
      if (!result.success) setError((result as { success: false; error: string }).error)
    })
  }

  function handleDelete() {
    if (!confirm(`Delete "${block.title}"? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteContractBlock(block.id)
      if (!result.success) setError((result as { success: false; error: string }).error)
    })
  }

  const bodyPreview = block.body
    .replace(/<[^>]*>/g, ' ')   // strip HTML tags
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim()
    .slice(0, 180)

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-border bg-card p-5 shadow-sm transition-opacity',
          !block.isActive && 'opacity-60',
        )}
      >
        {/* ── Header row ────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">{block.title}</h3>

              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                CATEGORY_COLORS[block.category],
              )}>
                {CATEGORY_LABELS[block.category]}
              </span>

              {block.isDefault && (
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                  Default
                </span>
              )}

              {!block.isActive && (
                <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                  Inactive
                </span>
              )}
            </div>

            {/* Triggers */}
            {block.triggers.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {block.triggers.map(t => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    <span className="font-medium">{TRIGGER_KIND_LABELS[t.kind]}:</span>
                    {t.matchValue}
                  </span>
                ))}
              </div>
            )}

            {/* Body preview */}
            <p
              className="mt-2 text-xs text-muted-foreground line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setExpanded(e => !e)}
            >
              {bodyPreview}{block.body.length > 180 ? '…' : ''}
            </p>

            {expanded && (
              <div
                className="mt-2 text-sm text-foreground border-t border-border pt-3 leading-relaxed [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-2 [&>li]:mb-1"
                dangerouslySetInnerHTML={{ __html: block.body }}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setEditOpen(true)}
              disabled={isPending}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleToggleActive}
              disabled={isPending}
            >
              {block.isActive ? 'Disable' : 'Enable'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </div>

      <ContractBlockDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={block}
      />
    </>
  )
}
