'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createContractBlock, updateContractBlock } from '@/server/actions/contract-blocks'
import type { ContractBlockRow, TriggerInput } from '@/server/actions/contract-blocks'
import type { ContractBlockCategory, TriggerKind } from '@prisma/client'

const CATEGORIES: { value: ContractBlockCategory; label: string }[] = [
  { value: 'SOW',        label: 'Scope of Work' },
  { value: 'TERMS',      label: 'Terms & Conditions' },
  { value: 'PAYMENT',    label: 'Payment' },
  { value: 'IP_RIGHTS',  label: 'IP & Usage Rights' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'CUSTOM',     label: 'Custom' },
]

const TRIGGER_KINDS: { value: TriggerKind; label: string; placeholder: string }[] = [
  { value: 'KEYWORD',          label: 'Keyword',          placeholder: 'e.g. video, photo, drone' },
  { value: 'DELIVERABLE_TYPE', label: 'Deliverable type', placeholder: 'SERVICE | DELIVERABLE | RAW_FOOTAGE | OTHER' },
  { value: 'BUDGET_ACCOUNT',   label: 'Budget account',   placeholder: 'e.g. Talent, Cast' },
]

type Props = {
  open:    boolean
  onClose: () => void
  editing?: ContractBlockRow
}

export function ContractBlockDialog({ open, onClose, editing }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title,     setTitle]     = useState(editing?.title     ?? '')
  const [category,  setCategory]  = useState<ContractBlockCategory>(editing?.category ?? 'CUSTOM')
  const [body,      setBody]      = useState(editing?.body      ?? '')
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? false)
  const [triggers,  setTriggers]  = useState<TriggerInput[]>(
    editing?.triggers.map(t => ({ kind: t.kind, matchValue: t.matchValue })) ?? []
  )

  function addTrigger() {
    setTriggers(prev => [...prev, { kind: 'KEYWORD', matchValue: '' }])
  }

  function removeTrigger(index: number) {
    setTriggers(prev => prev.filter((_, i) => i !== index))
  }

  function updateTrigger(index: number, patch: Partial<TriggerInput>) {
    setTriggers(prev => prev.map((t, i) => i === index ? { ...t, ...patch } : t))
  }

  function handleClose() {
    setError(null)
    onClose()
  }

  function handleSave() {
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    setError(null)

    startTransition(async () => {
      const input = { title, category, body, isDefault, triggers }
      const result = editing
        ? await updateContractBlock(editing.id, input)
        : await createContractBlock(input)

      if (!result.success) {
        setError((result as { success: false; error: string }).error)
        return
      }
      handleClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit contract block' : 'New contract block'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="cb-title">Title</Label>
            <Input
              id="cb-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Video Production — Scope of Work"
            />
          </div>

          {/* Category + isDefault row */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cb-category">Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as ContractBlockCategory)}>
                <SelectTrigger id="cb-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2 pb-0.5">
              <input
                id="cb-default"
                type="checkbox"
                checked={isDefault}
                onChange={e => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="cb-default" className="cursor-pointer">
                Attach to every proposal by default
              </Label>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="cb-body">Body</Label>
            <textarea
              id="cb-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder="Enter contract text. HTML is supported for formatting (e.g. <strong>, <p>, <ul>)."
            />
            <p className="text-xs text-muted-foreground">
              Merge tags: <code className="text-xs">{'{{client.name}}'}</code>{' '}
              <code className="text-xs">{'{{workspace.name}}'}</code>{' '}
              <code className="text-xs">{'{{project.name}}'}</code>{' '}
              <code className="text-xs">{'{{proposal.total}}'}</code>
            </p>
          </div>

          {/* Triggers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Auto-attach triggers</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTrigger}>
                + Add trigger
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This block is suggested whenever any trigger matches a deliverable in the proposal.
              Leave empty for manual-only attachment.
            </p>

            {triggers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No triggers — manual attachment only.</p>
            ) : (
              <div className="space-y-2">
                {triggers.map((t, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select
                      value={t.kind}
                      onValueChange={v => updateTrigger(i, { kind: v as TriggerKind })}
                    >
                      <SelectTrigger className="w-48 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIGGER_KINDS.map(k => (
                          <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      value={t.matchValue}
                      onChange={e => updateTrigger(i, { matchValue: e.target.value })}
                      placeholder={TRIGGER_KINDS.find(k => k.value === t.kind)?.placeholder}
                      className="flex-1"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTrigger(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : editing ? 'Save changes' : 'Create block'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
