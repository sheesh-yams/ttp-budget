'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, LayoutGrid, Package, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import type { BudgetTemplate, ShootType } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createTemplate, deleteTemplate } from '@/server/actions/templates'
import type { TemplateStructure, TemplateKind, BudgetTemplateExtended } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

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

const shootLabel  = (v: ShootType)  => SHOOT_TYPES.find(s => s.value === v)?.label ?? v

function itemCount(tpl: BudgetTemplate) {
  const structure = tpl.structure as unknown as TemplateStructure
  return (structure?.accounts ?? []).reduce((s, a) => s + (a.items?.length ?? 0), 0)
}

// ─── Create modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultKind?: TemplateKind
}

function CreateModal({ open, onOpenChange, defaultKind = 'FULL' }: CreateModalProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name,      setName]      = useState('')
  const [desc,      setDesc]      = useState('')
  const [kind,      setKind]      = useState<TemplateKind>(defaultKind)
  const [shootType, setShootType] = useState<ShootType>('OTHER')
  const [error,     setError]     = useState('')

  function reset() { setName(''); setDesc(''); setKind(defaultKind); setShootType('OTHER'); setError('') }

  function handleClose(v: boolean) { if (!v) reset(); onOpenChange(v) }

  function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    start(async () => {
      const res = await createTemplate({
        name: name.trim(),
        description: desc.trim() || null,
        kind,
        shootType,
        tags: [],
      })
      if (res.success) {
        onOpenChange(false)
        router.push(`/templates/${res.data.id}`)
      } else {
        setError((res as { success: false; error: string }).error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="e.g. Music Video — Standard Crew"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={v => setKind(v as TemplateKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full Template</SelectItem>
                  <SelectItem value="PACKAGE">Add-on Package</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Primary type</Label>
              <Select value={shootType} onValueChange={v => setShootType(v as ShootType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHOOT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What's this template for?"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <p className="text-[12px] text-muted-foreground">
            You&apos;ll add line items and sections after creating.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={pending}>Cancel</Button>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? 'Creating…' : 'Create & edit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteModal({
  template,
  onClose,
}: {
  template: BudgetTemplateExtended | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <Dialog open={!!template} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Delete template?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          <span className="font-medium text-foreground">{template?.name}</span> will be permanently deleted.
          Existing projects won&apos;t be affected.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!template) return
              start(async () => {
                await deleteTemplate(template.id)
                onClose()
                router.refresh()
              })
            }}
          >
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onDelete,
}: {
  template: BudgetTemplateExtended
  onDelete: () => void
}) {
  const count = itemCount(template)
  const tags  = (template.tags as unknown as ShootType[]) ?? []

  return (
    <div className="group relative rounded-xl border border-border bg-white hover:border-violet-200 hover:shadow-sm transition-all">
      <Link href={`/templates/${template.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[14px] text-foreground truncate group-hover:text-violet-700 transition-colors">
              {template.name}
            </p>
            {template.description && (
              <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">
                {template.description}
              </p>
            )}
          </div>
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 group-hover:text-violet-500 transition-colors mt-0.5" />
        </div>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SHOOT_COLORS[template.shootType] ?? 'bg-gray-100 text-gray-600'}`}>
            {shootLabel(template.shootType)}
          </span>
          {tags
            .filter(t => t !== template.shootType)
            .map(tag => (
              <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                {shootLabel(tag)}
              </span>
            ))}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {count === 0 ? 'No items yet' : `${count} line ${count === 1 ? 'item' : 'items'}`}
            <span className="mx-1.5">·</span>
            Updated {format(new Date(template.updatedAt), 'MMM d')}
          </p>
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={e => { e.preventDefault(); onDelete() }}
        className="absolute right-3 bottom-3 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

type Tab = 'FULL' | 'PACKAGE'

// ─── Main page client ─────────────────────────────────────────────────────────

export function TemplatesPageClient({ templates: rawTemplates }: { templates: BudgetTemplate[] }) {
  const templates = rawTemplates as unknown as BudgetTemplateExtended[]
  const [activeTab, setActiveTab]   = useState<Tab>('FULL')
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting]     = useState<BudgetTemplateExtended | null>(null)

  const full     = templates.filter(t => (t.kind ?? 'FULL') === 'FULL')
  const packages = templates.filter(t => t.kind === 'PACKAGE')
  const visible  = activeTab === 'FULL' ? full : packages

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-ink">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full templates seed a new project&apos;s budget. Add-on packages are building blocks you can insert into any budget.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'FULL',    label: 'Full templates',  Icon: LayoutGrid, count: full.length },
          { id: 'PACKAGE', label: 'Add-on packages', Icon: Package,    count: packages.length },
        ] as { id: Tab; label: string; Icon: React.ElementType; count: number }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.Icon className="h-4 w-4" />
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
              activeTab === tab.id ? 'bg-violet-100 text-violet-700' : 'bg-muted text-muted-foreground'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Context hint ── */}
      {activeTab === 'FULL' && (
        <p className="text-[12px] text-muted-foreground -mt-1">
          These are selected when creating a new project and pre-populate the entire budget structure.
        </p>
      )}
      {activeTab === 'PACKAGE' && (
        <p className="text-[12px] text-muted-foreground -mt-1">
          Packages are reusable building blocks — add them to any active budget from the budget editor.
        </p>
      )}

      {/* ── Grid ── */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            {activeTab === 'FULL'
              ? <LayoutGrid className="h-6 w-6 text-muted-foreground" />
              : <Package className="h-6 w-6 text-muted-foreground" />}
          </div>
          <p className="text-sm font-medium text-foreground">
            No {activeTab === 'FULL' ? 'full templates' : 'add-on packages'} yet
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {activeTab === 'FULL'
              ? 'Create a full template to speed up budgeting when you start a new project.'
              : 'Create add-on packages for recurring crew setups, equipment bundles, or service packages.'}
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create {activeTab === 'FULL' ? 'template' : 'package'}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onDelete={() => setDeleting(tpl)}
            />
          ))}
          {/* "New" card */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-muted-foreground hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[13px] font-medium">
              New {activeTab === 'FULL' ? 'template' : 'package'}
            </span>
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      <CreateModal
        open={showCreate}
        onOpenChange={setShowCreate}
        defaultKind={activeTab}
      />
      <DeleteModal
        template={deleting}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
