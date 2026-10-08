'use client'

// Settings → Contracts → Contract Builder: templates are named, ordered groups
// of blocks from the library below (e.g. "Talent" = standard terms + Usage).
// One template per side can be the default — used when a deal memo or
// proposal starts without one chosen.

import { useMemo, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Layers, Plus, Star, X } from 'lucide-react'
import type { ContractAudience, ContractBlockCategory } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { CONTRACT_CATEGORY_LABEL, categoryNeedsReview } from '@/lib/contract-categories'
import {
  createContractTemplate, deleteContractTemplate, updateContractTemplate, type ContractTemplateRow,
} from '@/server/actions/contract-templates'
import type { ContractBlockRow } from '@/server/actions/contract-blocks'

const CATEGORY_ORDER: ContractBlockCategory[] = ['SOW', 'TERMS', 'PAYMENT', 'IP_RIGHTS', 'COMPLIANCE', 'CUSTOM']

export function ContractTemplatesManager({ audience, templates, blocks }: {
  audience:  ContractAudience
  templates: ContractTemplateRow[]
  blocks:    ContractBlockRow[]
}) {
  const isVendor = audience === 'VENDOR'
  const [editing, setEditing] = useState<ContractTemplateRow | 'new' | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function remove(t: ContractTemplateRow) {
    if (!(await confirm(`Delete the “${t.name}” template? Deal memos and proposals that already used it keep their terms.`, { title: 'Delete template' }))) return
    setError(null)
    start(async () => {
      const res = await deleteContractTemplate(t.id)
      if (!res.success) setError((res as { success: false; error: string }).error)
    })
  }

  return (
    <section className="mb-10">
      {ConfirmDialog}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Layers className="h-4 w-4 text-primary" /> Contract Builder</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isVendor
              ? 'Group blocks into contract templates — e.g. Crew, Talent (with Usage). Pick one when you add a bid, or apply it from a deal memo.'
              : 'Group blocks into contract templates — e.g. SOW – Social, SOW – Brand. Apply one from a proposal’s Contract tab.'}
          </p>
        </div>
        <Button onClick={() => setEditing('new')} disabled={blocks.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> New template
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          No templates yet. New {isVendor ? 'deal memos' : 'proposals'} start with the blocks marked “attach by default” until you set a default template.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map(t => (
            <div key={t.id} className={cn('rounded-xl border bg-card p-4', t.isDefault && 'border-primary/40 ring-1 ring-primary/20')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    {t.name}
                    {t.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Star className="h-3 w-3" /> Default</span>}
                  </p>
                  {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => setEditing(t)}>Edit</Button>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => void remove(t)} className="text-muted-foreground hover:text-destructive">Delete</Button>
                </div>
              </div>
              <ol className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                {t.blocks.map((b, i) => (
                  <li key={b.id} className={cn('truncate', !b.isActive && 'line-through opacity-60')}>
                    {i + 1}. {b.title}{categoryNeedsReview(b.category) && <span className="ml-1 text-blue-700">· {CONTRACT_CATEGORY_LABEL[b.category]}</span>}
                  </li>
                ))}
                {t.blocks.length === 0 && <li className="italic">No blocks</li>}
              </ol>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ContractTemplateDialog
          audience={audience}
          template={editing === 'new' ? null : editing}
          blocks={blocks}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function ContractTemplateDialog({ audience, template, blocks, onClose }: {
  audience: ContractAudience
  template: ContractTemplateRow | null
  blocks:   ContractBlockRow[]
  onClose:  () => void
}) {
  const [name, setName]         = useState(template?.name ?? '')
  const [description, setDesc]  = useState(template?.description ?? '')
  const [isDefault, setDefault] = useState(template?.isDefault ?? false)
  // New templates start from the blocks marked "attach by default".
  const [selected, setSelected] = useState<string[]>(
    template ? template.blocks.map(b => b.id) : blocks.filter(b => b.isDefault && b.isActive).map(b => b.id),
  )
  const [error, setError]  = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const byId = useMemo(() => new Map(blocks.map(b => [b.id, b])), [blocks])
  const grouped = useMemo(() => CATEGORY_ORDER
    .map(cat => ({ cat, items: blocks.filter(b => b.category === cat) }))
    .filter(g => g.items.length > 0), [blocks])

  function toggle(id: string) {
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  }
  function move(i: number, dir: -1 | 1) {
    setSelected(s => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function save() {
    setError(null)
    if (!name.trim()) { setError('Give the template a name.'); return }
    const input = { name: name.trim(), description: description.trim() || null, isDefault, blockIds: selected }
    start(async () => {
      const res = template ? await updateContractTemplate(template.id, input) : await createContractTemplate(audience, input)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>{template ? `Edit “${template.name}”` : 'New contract template'}</DialogTitle>
          <DialogDescription>Tick blocks from the library, then put them in order. The template adds them to a {audience === 'VENDOR' ? 'deal memo' : 'proposal'} in this order.</DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-4 sm:grid-cols-2">
          <div className="space-y-3 sm:col-span-2">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-1.5">
                <Label htmlFor="ct-name">Name</Label>
                <Input id="ct-name" value={name} onChange={e => setName(e.target.value)} placeholder={audience === 'VENDOR' ? 'e.g. Talent' : 'e.g. SOW – Social'} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-desc">Description (optional)</Label>
                <Input id="ct-desc" value={description} onChange={e => setDesc(e.target.value)} placeholder="When to use it" />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={e => setDefault(e.target.checked)} className="h-4 w-4 accent-primary" />
              Use by default for new {audience === 'VENDOR' ? 'deal memos' : 'proposals'}
            </label>
          </div>

          {/* Library */}
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Library</p>
            <div className="space-y-3">
              {grouped.map(g => (
                <div key={g.cat}>
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">{CONTRACT_CATEGORY_LABEL[g.cat]}</p>
                  <div className="space-y-1">
                    {g.items.map(b => {
                      const on = selected.includes(b.id)
                      const review = categoryNeedsReview(b.category)
                      return (
                        <label key={b.id} className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                          review ? 'border-blue-200 bg-blue-50/40' : 'border-border',
                          on && (review ? 'border-blue-400' : 'border-primary/50 bg-primary/5'),
                          !b.isActive && 'opacity-60',
                        )}>
                          <input type="checkbox" checked={on} onChange={() => toggle(b.id)} className="h-4 w-4 shrink-0 accent-primary" />
                          <span className="min-w-0 flex-1 truncate">{b.title}</span>
                          {!b.isActive && <span className="text-[10px] uppercase text-muted-foreground">inactive</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Template order */}
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">In this template · {selected.length}</p>
            {selected.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Tick blocks on the left.</p>
            ) : (
              <ol className="space-y-1">
                {selected.map((id, i) => {
                  const b = byId.get(id)
                  if (!b) return null
                  return (
                    <li key={id} className={cn('flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm', categoryNeedsReview(b.category) && 'border-blue-300')}>
                      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate">{b.title}</span>
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={i === selected.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => toggle(id)} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Remove"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={save} disabled={isPending}>{isPending ? 'Saving…' : template ? 'Save template' : 'Create template'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
