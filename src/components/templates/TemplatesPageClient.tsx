'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, LayoutGrid } from 'lucide-react'
import { format } from 'date-fns'
import type { BudgetTemplate, ShootType } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createTemplate, updateTemplate, deleteTemplate } from '@/server/actions/templates'

// ─── Shoot type labels ────────────────────────────────────────────────────────

const SHOOT_TYPES: { value: ShootType; label: string }[] = [
  { value: 'MUSIC_VIDEO',    label: 'Music Video' },
  { value: 'BRAND_CAMPAIGN', label: 'Brand Campaign' },
  { value: 'PRODUCT_SHOOT',  label: 'Product Shoot' },
  { value: 'EVENT_RECAP',    label: 'Event Recap' },
  { value: 'SOCIAL_CONTENT', label: 'Social Content' },
  { value: 'INFLUENCER',     label: 'Influencer' },
  { value: 'DOCUMENTARY',    label: 'Documentary' },
  { value: 'OTHER',          label: 'Other' },
]

const shootLabel = (v: ShootType) => SHOOT_TYPES.find(s => s.value === v)?.label ?? v

// ─── Shoot type badge colors ──────────────────────────────────────────────────

const SHOOT_COLORS: Partial<Record<ShootType, string>> = {
  MUSIC_VIDEO:    'bg-violet-100 text-violet-700',
  BRAND_CAMPAIGN: 'bg-blue-100 text-blue-700',
  PRODUCT_SHOOT:  'bg-amber-100 text-amber-700',
  EVENT_RECAP:    'bg-green-100 text-green-700',
  SOCIAL_CONTENT: 'bg-pink-100 text-pink-700',
  INFLUENCER:     'bg-orange-100 text-orange-700',
  DOCUMENTARY:    'bg-teal-100 text-teal-700',
  OTHER:          'bg-gray-100 text-gray-600',
}

// ─── Template form modal ──────────────────────────────────────────────────────

interface FormModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Pick<BudgetTemplate, 'id' | 'name' | 'description' | 'shootType'>
}

function TemplateFormModal({ open, onOpenChange, initial }: FormModalProps) {
  const router      = useRouter()
  const [pending, start] = useTransition()
  const [name, setName]             = useState(initial?.name ?? '')
  const [desc, setDesc]             = useState(initial?.description ?? '')
  const [shootType, setShootType]   = useState<ShootType>(initial?.shootType ?? 'OTHER')
  const [error, setError]           = useState('')

  function reset() {
    setName(initial?.name ?? '')
    setDesc(initial?.description ?? '')
    setShootType(initial?.shootType ?? 'OTHER')
    setError('')
  }

  function handleClose(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    start(async () => {
      const input = { name: name.trim(), description: desc.trim() || null, shootType }
      let ok = false
      let err = ''
      if (initial) {
        const res = await updateTemplate(initial.id, input)
        ok = res.success
        if (!res.success) err = (res as { success: false; error: string }).error
      } else {
        const res = await createTemplate(input)
        ok = res.success
        if (!res.success) err = (res as { success: false; error: string }).error
      }
      if (ok) {
        onOpenChange(false)
        router.refresh()
      } else {
        setError(err)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit template' : 'New template'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Music Video — Standard Crew"
              autoFocus
            />
          </div>

          {/* Shoot type */}
          <div className="space-y-1.5">
            <Label>Shoot type</Label>
            <Select value={shootType} onValueChange={v => setShootType(v as ShootType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOOT_TYPES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              id="tpl-desc"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What's this template for?"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? 'Saving…' : initial ? 'Save changes' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

interface DeleteModalProps {
  template: Pick<BudgetTemplate, 'id' | 'name'> | null
  onClose: () => void
}

function DeleteModal({ template, onClose }: DeleteModalProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function handleDelete() {
    if (!template) return
    start(async () => {
      await deleteTemplate(template.id)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={!!template} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete template?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          <span className="font-medium text-foreground">{template?.name}</span> will be permanently deleted.
          Projects that used this template won&apos;t be affected.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page client ─────────────────────────────────────────────────────────

export function TemplatesPageClient({ templates }: { templates: BudgetTemplate[] }) {
  const [showCreate, setShowCreate]   = useState(false)
  const [editing, setEditing]         = useState<BudgetTemplate | null>(null)
  const [deleting, setDeleting]       = useState<BudgetTemplate | null>(null)

  // Group by shoot type
  const grouped = SHOOT_TYPES
    .map(st => ({
      shootType: st,
      items: templates.filter(t => t.shootType === st.value),
    }))
    .filter(g => g.items.length > 0)

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-ink">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Budget templates pre-populate line items when you start a new project.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      </div>

      {/* ── List ── */}
      {templates.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <LayoutGrid className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No templates yet</p>
          <p className="text-sm text-muted-foreground">
            Create a template to speed up budgeting on future projects.
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first template
          </Button>
        </div>
      ) : (
        <div className="space-y-6 mt-2">
          {grouped.length > 0 ? (
            grouped.map(({ shootType: st, items }) => (
              <div key={st.value}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {st.label}
                </p>
                <TemplateTable
                  templates={items}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              </div>
            ))
          ) : (
            <TemplateTable
              templates={templates}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <TemplateFormModal
        open={showCreate}
        onOpenChange={setShowCreate}
      />
      {editing && (
        <TemplateFormModal
          key={editing.id}
          open={!!editing}
          onOpenChange={v => { if (!v) setEditing(null) }}
          initial={editing}
        />
      )}
      <DeleteModal
        template={deleting}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

function TemplateTable({
  templates,
  onEdit,
  onDelete,
}: {
  templates: BudgetTemplate[]
  onEdit: (t: BudgetTemplate) => void
  onDelete: (t: BudgetTemplate) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="grid grid-cols-[1fr_140px_130px_72px] border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        <span>Name</span>
        <span>Type</span>
        <span>Last updated</span>
        <span />
      </div>
      {templates.map(tpl => (
        <div
          key={tpl.id}
          className="grid grid-cols-[1fr_140px_130px_72px] items-center border-b border-violet-50 px-4 py-3 last:border-0 hover:bg-muted/20"
        >
          <div>
            <p className="text-[13px] font-medium text-foreground">{tpl.name}</p>
            {tpl.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{tpl.description}</p>
            )}
          </div>
          <span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SHOOT_COLORS[tpl.shootType] ?? 'bg-gray-100 text-gray-600'}`}>
              {shootLabel(tpl.shootType)}
            </span>
          </span>
          <span className="text-[12px] text-muted-foreground">
            {format(new Date(tpl.updatedAt), 'MMM d, yyyy')}
          </span>
          <span className="flex items-center gap-1 justify-end">
            <button
              onClick={() => onEdit(tpl)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(tpl)}
              className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
