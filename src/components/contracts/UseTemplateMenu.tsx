'use client'

// "Use template" — adds a contract template's blocks that aren't already on a
// deal memo or proposal (never removes or overwrites a section). Shared by the
// deal memo editor and the proposal Contract tab.

import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { ContractAudience } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listContractTemplateOptions, type ContractTemplateOption } from '@/server/actions/contract-templates'

export function UseTemplateMenu({ audience, disabled, onApply }: {
  audience: ContractAudience
  disabled?: boolean
  /** Apply the template; the menu closes when called. */
  onApply: (templateId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<ContractTemplateOption[] | null>(null)

  function onOpenChange(o: boolean) {
    setOpen(o)
    if (o && templates === null) {
      listContractTemplateOptions(audience).then(r => setTemplates(r.success ? r.data : [])).catch(() => setTemplates([]))
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Layers className="mr-1 h-3.5 w-3.5" /> Use template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">Adds the template’s blocks that aren’t here yet. Nothing is removed.</p>
        {templates === null ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">No templates yet — build them in Settings → Contracts.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {templates.map(t => (
              <button
                key={t.id} type="button"
                onClick={() => { setOpen(false); onApply(t.id) }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 truncate">{t.name}{t.isDefault && <span className="ml-1 text-xs text-muted-foreground">(default)</span>}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.blockCount}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
