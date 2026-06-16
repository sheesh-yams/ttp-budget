'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, LayoutGrid, Package, ArrowRight, Upload, FileUp, CheckCircle2, FileText, Receipt } from 'lucide-react'
import { ProposalTemplatePreview, type ProposalBranding } from '@/components/proposals/ProposalTemplatePreview'
import { format } from 'date-fns'
import type { BudgetTemplate, ShootType } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createTemplate, deleteTemplate } from '@/server/actions/templates'
import { importToTemplate } from '@/server/actions/import'
import { parseFileText, importPayloadSchema, formatZodError, CSV_TEMPLATE, type ImportRow } from '@/lib/importSchema'
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

// ─── Import template modal ────────────────────────────────────────────────────
//
// One-shot flow: fill out metadata + drop a file → preview → Create & import.
// Creates the template first, then calls importToTemplate, then navigates.

type ImportStep = 'form' | 'preview' | 'importing' | 'success'

interface PreviewGroup { name: string; count: number }

interface ImportTemplateModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultKind?: TemplateKind
}

function ImportTemplateModal({ open, onOpenChange, defaultKind = 'FULL' }: ImportTemplateModalProps) {
  const router    = useRouter()
  const fileRef   = useRef<HTMLInputElement>(null)
  const [, start] = useTransition()

  const [step,       setStep]       = useState<ImportStep>('form')
  const [name,       setName]       = useState('')
  const [desc,       setDesc]       = useState('')
  const [kind,       setKind]       = useState<TemplateKind>(defaultKind)
  const [shootType,  setShootType]  = useState<ShootType>('OTHER')
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [rows,       setRows]       = useState<ImportRow[]>([])
  const [preview,    setPreview]    = useState<PreviewGroup[]>([])
  const [fileError,  setFileError]  = useState('')
  const [formError,  setFormError]  = useState('')

  function reset() {
    setStep('form'); setName(''); setDesc(''); setKind(defaultKind); setShootType('OTHER')
    setIsDragOver(false); setFileName(''); setRows([]); setPreview([])
    setFileError(''); setFormError('')
  }
  function handleClose(v: boolean) { if (!v) reset(); onOpenChange(v) }

  function processFile(file: File) {
    setFileError('')
    file.text().then(text => {
      try {
        const raw    = parseFileText(text, file.name)
        const result = importPayloadSchema.safeParse(raw)
        if (!result.success) {
          setFileError(formatZodError(result.error))
          return
        }
        const parsed = result.data
        // Build preview groups
        const groups = new Map<string, number>()
        for (const r of parsed) groups.set(r.accountName, (groups.get(r.accountName) ?? 0) + 1)
        setRows(parsed)
        setPreview(Array.from(groups.entries()).map(([n, c]) => ({ name: n, count: c })))
        setFileName(file.name)
        setStep('preview')
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Failed to parse file')
      }
    })
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'ttp-template-import.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  function handleImport() {
    if (!name.trim()) { setFormError('Name is required'); setStep('form'); return }
    setFormError('')
    setStep('importing')
    start(async () => {
      // 1. Create the template
      const created = await createTemplate({
        name: name.trim(),
        description: desc.trim() || null,
        kind,
        shootType,
        tags: [],
      })
      if (!created.success) {
        setFileError((created as { success: false; error: string }).error)
        setStep('preview')
        return
      }
      // 2. Import rows into it
      const imported = await importToTemplate(created.data.id, rows)
      if (!imported.success) {
        setFileError((imported as { success: false; error: string }).error)
        setStep('preview')
        return
      }
      setStep('success')
      setTimeout(() => {
        onOpenChange(false)
        router.push(`/templates/${created.data.id}`)
      }, 1200)
    })
  }

  const totalItems = rows.length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'success' ? 'Template imported!' : 'Import template from file'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Success ── */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-sm text-muted-foreground">Redirecting to your new template…</p>
          </div>
        )}

        {/* ── Form + drop zone ── */}
        {(step === 'form' || step === 'preview') && (
          <div className="space-y-4 py-1">
            {/* Metadata */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Template name</Label>
                <Input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Music Video — Standard Crew"
                />
                {formError && <p className="text-[12px] text-red-600">{formError}</p>}
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
            </div>

            {/* File drop / preview toggle */}
            {step === 'form' ? (
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false) }}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
                  isDragOver
                    ? 'border-violet-400 bg-violet-50'
                    : 'border-border hover:border-violet-300 hover:bg-muted/50'
                }`}
              >
                <FileUp className={`h-7 w-7 ${isDragOver ? 'text-violet-500' : 'text-muted-foreground'}`} />
                <div className="text-center">
                  <p className="text-[13px] font-medium text-foreground">Drop a .csv or .json file</p>
                  <p className="text-[12px] text-muted-foreground">or click to browse</p>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); downloadTemplate() }}
                  className="text-[11px] text-violet-600 underline underline-offset-2 hover:text-violet-800"
                >
                  Download CSV template
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium text-foreground">
                    {fileName} — {totalItems} line {totalItems === 1 ? 'item' : 'items'}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setStep('form'); setRows([]); setPreview([]); setFileName('') }}
                    className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Change file
                  </button>
                </div>
                <ScrollArea className="max-h-44">
                  <div className="space-y-1">
                    {preview.map(g => (
                      <div key={g.name} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-[12px]">
                        <span className="font-medium text-foreground">{g.name}</span>
                        <span className="text-muted-foreground">{g.count} {g.count === 1 ? 'item' : 'items'}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {fileError && <p className="text-[12px] text-red-600">{fileError}</p>}
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileInput} />
          </div>
        )}

        {/* ── Importing spinner ── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
            <p className="text-sm text-muted-foreground">Creating template and importing…</p>
          </div>
        )}

        {/* ── Footer ── */}
        {(step === 'form' || step === 'preview') && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            {step === 'preview' && (
              <Button onClick={handleImport} disabled={!name.trim()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Create &amp; import
              </Button>
            )}
          </DialogFooter>
        )}
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

type Tab = 'FULL' | 'PACKAGE' | 'PROPOSALS' | 'INVOICES'

// ─── Main page client ─────────────────────────────────────────────────────────

export function TemplatesPageClient({
  templates: rawTemplates,
  branding,
}: {
  templates: BudgetTemplate[]
  branding: ProposalBranding
}) {
  const templates = rawTemplates as unknown as BudgetTemplateExtended[]
  const [activeTab,   setActiveTab]   = useState<Tab>('FULL')
  const [showCreate,  setShowCreate]  = useState(false)
  const [showImport,  setShowImport]  = useState(false)
  const [deleting,    setDeleting]    = useState<BudgetTemplateExtended | null>(null)

  const full     = templates.filter(t => (t.kind ?? 'FULL') === 'FULL')
  const packages = templates.filter(t => t.kind === 'PACKAGE')
  const visible  = activeTab === 'PACKAGE' ? packages : full
  const isLibraryTab = activeTab === 'FULL' || activeTab === 'PACKAGE'
  const modalKind: TemplateKind = activeTab === 'PACKAGE' ? 'PACKAGE' : 'FULL'

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Document Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable budgets and packages, plus branded proposal &amp; invoice templates.
          </p>
        </div>
        {isLibraryTab && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New {activeTab === 'PACKAGE' ? 'package' : 'budget'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'FULL',      label: 'Budgets',         Icon: LayoutGrid, count: full.length },
          { id: 'PACKAGE',   label: 'Add-on Packages', Icon: Package,    count: packages.length },
          { id: 'PROPOSALS', label: 'Proposals',       Icon: FileText,   count: null },
          { id: 'INVOICES',  label: 'Invoices',        Icon: Receipt,    count: null },
        ] as { id: Tab; label: string; Icon: React.ElementType; count: number | null }[]).map(tab => (
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
            {tab.count !== null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                activeTab === tab.id ? 'bg-violet-100 text-violet-700' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Proposals tab — branded preview ── */}
      {activeTab === 'PROPOSALS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-muted-foreground">
              Live preview — uses your workspace logo and brand color.{' '}
              <Link href="/settings" className="font-medium text-violet-600 hover:underline">
                Edit branding →
              </Link>
            </p>
          </div>
          <ProposalTemplatePreview branding={branding} />
        </div>
      )}

      {/* ── Invoices tab — coming soon ── */}
      {activeTab === 'INVOICES' && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Receipt className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Invoice templates are coming soon</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Branded, customizable invoice layouts will live here — sharing the same logo and brand
            color you set in workspace settings.
          </p>
        </div>
      )}

      {/* ── Context hint (library tabs only) ── */}
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

      {/* ── Grid (library tabs only) ── */}
      {isLibraryTab && (visible.length === 0 ? (
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
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create {activeTab === 'FULL' ? 'template' : 'package'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import from file
            </Button>
          </div>
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
          {/* "Import" card */}
          <button
            onClick={() => setShowImport(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-muted-foreground hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <Upload className="h-5 w-5" />
            <span className="text-[13px] font-medium">Import from file</span>
          </button>
        </div>
      ))}

      {/* ── Modals ── */}
      <CreateModal
        open={showCreate}
        onOpenChange={setShowCreate}
        defaultKind={modalKind}
      />
      <ImportTemplateModal
        open={showImport}
        onOpenChange={setShowImport}
        defaultKind={modalKind}
      />
      <DeleteModal
        template={deleting}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
