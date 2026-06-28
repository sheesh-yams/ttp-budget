'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Globe, Copy, Check, Settings, Loader2, MoreHorizontal, GripVertical, Pencil, Trash2, ChevronDown, ArrowRight } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { AssetEditorModal } from './AssetEditorModal'
import { GenerateFromProposalModal } from './GenerateFromProposalModal'
import { AnalyticsPanel } from './AnalyticsPanel'
import { CoverImageUploader } from './CoverImageUploader'
import {
  ensureDeliveryPage, updateDeliveryPageMeta,
  publishDeliveryPage, unpublishDeliveryPage,
  createSection, renameSection, reorderSections, deleteSection,
  createAsset, deleteAsset, moveAssetToSection, reorderAssets,
} from '@/server/actions/delivery'
import type { AssetStat } from '@/server/actions/delivery'
import type { DeliverableItemType } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Version {
  id:               string
  versionNumber:    number
  provider:         string
  renderMode:       string
  thumbnailUrl:     string | null
  firstClientViewAt: Date | string | null
}

interface Asset {
  id:             string
  title:          string
  description:    string | null
  type:           DeliverableItemType
  status:         'DRAFT' | 'SHARED'
  publicToken:    string
  orderIndex:     number
  currentVersion: Version | null
}

interface Section {
  id:          string
  title:       string
  description: string | null
  orderIndex:  number
  deliverables: Asset[]
}

interface DeliveryPage {
  id:             string
  publicToken:    string
  title:          string | null
  subtitle:       string | null
  customMessage:  string | null
  coverImageUrl:  string | null
  status:         'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  lastPublishedAt: Date | string | null
  sections:       Section[]
}

interface Props {
  project:             { id: string; name: string }
  deliveryPage:        DeliveryPage | null
  hasApprovedProposal: boolean
  analytics:           AssetStat[]
}

const TYPE_LABELS: Record<DeliverableItemType, string> = {
  DELIVERABLE: 'Deliverable',
  SERVICE:     'Service',
  RAW_FOOTAGE: 'Raw Footage',
  OTHER:       'Other',
}

const PROVIDER_LABELS: Record<string, string> = {
  FRAME_IO:     'Frame.io',
  SHADE:        'Shade',
  GDRIVE_FILE:  'Google Drive',
  GDRIVE_FOLDER:'Google Drive',
  DROPBOX_FILE: 'Dropbox',
  DROPBOX_FOLDER: 'Dropbox',
  DIRECT_IMAGE: 'Image',
  DIRECT_VIDEO: 'Video',
  YOUTUBE:      'YouTube',
  VIMEO:        'Vimeo',
  GENERIC_LINK: 'Link',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeliverablesManager({ project, deliveryPage: initialPage, hasApprovedProposal, analytics }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  const [page,           setPage]           = useState<DeliveryPage | null>(initialPage)
  const [editingAsset,   setEditingAsset]   = useState<Asset | null>(null)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [generating,     setGenerating]     = useState(false)
  const [publishPending, setPublishPending] = useState(false)
  const [copied,         setCopied]         = useState(false)

  // Drag state for section reorder
  const [dragSectionId,  setDragSectionId]  = useState<string | null>(null)
  const [dropSectionId,  setDropSectionId]  = useState<string | null>(null)
  // Drag state for asset reorder/move
  const [dragAssetId,    setDragAssetId]    = useState<string | null>(null)
  const [dragAssetSection, setDragAssetSection] = useState<string | null>(null)
  const [dropAssetSectionId, setDropAssetSectionId] = useState<string | null>(null)

  // Sync local state whenever router.refresh() delivers new server props.
  // useState(initialPage) only uses the prop on first mount; this keeps it live.
  useEffect(() => { setPage(initialPage) }, [initialPage])

  const publicUrl = page ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/d/${page.publicToken}` : null

  // ── Page creation ──────────────────────────────────────────────────────────

  async function handleEnsurePage() {
    const result = await ensureDeliveryPage(project.id)
    if (!result.success) return
    router.refresh()
  }

  // ── Publish / Unpublish ────────────────────────────────────────────────────

  async function handlePublish() {
    if (!page) return
    setPublishPending(true)
    try {
      if (page.status === 'PUBLISHED') {
        await unpublishDeliveryPage(page.id)
      } else {
        await publishDeliveryPage(page.id)
      }
      router.refresh()
    } finally {
      setPublishPending(false)
    }
  }

  function handleCopyUrl() {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // ── Section drag ───────────────────────────────────────────────────────────

  function handleSectionDrop(targetId: string) {
    if (!dragSectionId || dragSectionId === targetId || !page) {
      setDragSectionId(null); setDropSectionId(null); return
    }
    const sections = [...page.sections]
    const fromIdx  = sections.findIndex(s => s.id === dragSectionId)
    const toIdx    = sections.findIndex(s => s.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [removed] = sections.splice(fromIdx, 1)
    sections.splice(toIdx, 0, removed)
    setPage(prev => prev ? { ...prev, sections } : prev)
    setDragSectionId(null); setDropSectionId(null)
    startTransition(async () => {
      await reorderSections(page.id, sections.map(s => s.id))
    })
  }

  // ── Asset drag ─────────────────────────────────────────────────────────────

  function handleAssetDrop(toSectionId: string, beforeAssetId?: string) {
    if (!dragAssetId || !page) {
      setDragAssetId(null); setDragAssetSection(null); return
    }
    const srcSectionId = dragAssetSection
    if (srcSectionId === toSectionId) {
      // Reorder within section
      const sections = page.sections.map(s => {
        if (s.id !== toSectionId) return s
        const assets = [...s.deliverables]
        const fromIdx = assets.findIndex(a => a.id === dragAssetId)
        const rawTo   = beforeAssetId ? assets.findIndex(a => a.id === beforeAssetId) : assets.length
        const toIdx   = rawTo > fromIdx ? rawTo - 1 : rawTo
        const [removed] = assets.splice(fromIdx, 1)
        assets.splice(Math.max(0, toIdx), 0, removed)
        return { ...s, deliverables: assets }
      })
      setPage(prev => prev ? { ...prev, sections } : prev)
      const section = sections.find(s => s.id === toSectionId)
      if (section) {
        startTransition(async () => {
          await reorderAssets(toSectionId, section.deliverables.map(a => a.id))
        })
      }
    } else {
      // Move to different section
      const insertIdx = beforeAssetId
        ? (page.sections.find(s => s.id === toSectionId)?.deliverables.findIndex(a => a.id === beforeAssetId) ?? -1)
        : -1
      startTransition(async () => {
        await moveAssetToSection(dragAssetId, toSectionId, insertIdx === -1 ? 999 : insertIdx)
        router.refresh()
      })
    }
    setDragAssetId(null); setDragAssetSection(null); setDropAssetSectionId(null)
  }

  // ── Delete section ─────────────────────────────────────────────────────────

  async function handleDeleteSection(sectionId: string, sectionTitle: string) {
    const ok = await confirm(`Delete section "${sectionTitle}"? Assets inside will be removed.`, {
      title: 'Delete section',
    })
    if (!ok) return
    startTransition(async () => {
      await deleteSection(sectionId)
      router.refresh()
    })
  }

  // ── Add section ────────────────────────────────────────────────────────────

  async function handleAddSection() {
    if (!page) return
    const title = prompt('Section title:')
    if (!title?.trim()) return
    startTransition(async () => {
      await createSection(page.id, title.trim())
      router.refresh()
    })
  }

  // ── Add asset ──────────────────────────────────────────────────────────────

  async function handleAddAsset(sectionId: string) {
    if (!page) return
    startTransition(async () => {
      const result = await createAsset(page.id, sectionId, { title: 'New Asset', type: 'DELIVERABLE' })
      if (result.success) router.refresh()
    })
  }

  // ── Delete asset ───────────────────────────────────────────────────────────

  async function handleDeleteAsset(assetId: string, assetTitle: string) {
    const ok = await confirm(`Delete "${assetTitle}"? This cannot be undone.`, {
      title: 'Delete asset',
    })
    if (!ok) return
    startTransition(async () => {
      await deleteAsset(assetId)
      router.refresh()
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!page) {
    return (
      <EmptyState
        projectId={project.id}
        hasApprovedProposal={hasApprovedProposal}
        onEnsurePage={handleEnsurePage}
      />
    )
  }

  return (
    <div className="space-y-5">
      {ConfirmDialog}

      {/* ── Page settings header ─────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <PageStatusPill status={page.status} />
            {page.status === 'PUBLISHED' && publicUrl && (
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasApprovedProposal && (
              <button
                type="button"
                onClick={() => setGenerating(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                <ArrowRight className="h-3 w-3" />
                Sync from proposal
              </button>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishPending}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                page.status === 'PUBLISHED'
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {publishPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {page.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </div>

        <PageMetaForm page={page} onSaved={() => router.refresh()} />
      </div>

      {/* ── Section list ──────────────────────────────────────────────────── */}
      {page.sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
          <p className="text-sm font-medium text-foreground">No sections yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasApprovedProposal
              ? 'Generate from your approved proposal or add a section manually.'
              : 'Add a section to start organizing deliverables.'}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {hasApprovedProposal && (
              <button
                type="button"
                onClick={() => setGenerating(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <ArrowRight className="h-3 w-3" />
                Generate from proposal
              </button>
            )}
            <button
              type="button"
              onClick={handleAddSection}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add section
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {page.sections.map(section => (
            <SectionCard
              key={section.id}
              section={section}
              allSections={page.sections}
              isDragging={dragSectionId === section.id}
              isDropTarget={dropSectionId === section.id}
              onDragStart={() => setDragSectionId(section.id)}
              onDragOver={e => { e.preventDefault(); setDropSectionId(section.id) }}
              onDrop={() => handleSectionDrop(section.id)}
              onDragEnd={() => { setDragSectionId(null); setDropSectionId(null) }}
              onRename={() => setEditingSectionId(section.id)}
              onDelete={() => handleDeleteSection(section.id, section.title)}
              onAddAsset={() => handleAddAsset(section.id)}
              onEditAsset={asset => setEditingAsset(asset)}
              onDeleteAsset={(id, title) => handleDeleteAsset(id, title)}
              dragAssetId={dragAssetId}
              onAssetDragStart={(assetId) => { setDragAssetId(assetId); setDragAssetSection(section.id) }}
              onAssetDrop={(beforeId) => handleAssetDrop(section.id, beforeId)}
              dropAssetSectionId={dropAssetSectionId}
              onAssetDragOver={() => setDropAssetSectionId(section.id)}
              onAssetDragEnd={() => { setDragAssetId(null); setDragAssetSection(null); setDropAssetSectionId(null) }}
            />
          ))}

          <button
            type="button"
            onClick={handleAddSection}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add section
          </button>
        </div>
      )}

      {/* ── Asset editor ──────────────────────────────────────────────────── */}
      {editingAsset && (
        <AssetEditorModal
          asset={editingAsset}
          onClose={() => { setEditingAsset(null); router.refresh() }}
        />
      )}

      {/* ── Section rename inline editor ──────────────────────────────────── */}
      {editingSectionId && (
        <SectionRenameModal
          sectionId={editingSectionId}
          currentTitle={page.sections.find(s => s.id === editingSectionId)?.title ?? ''}
          currentDescription={page.sections.find(s => s.id === editingSectionId)?.description ?? null}
          onClose={() => { setEditingSectionId(null); router.refresh() }}
        />
      )}

      {/* ── Analytics ─────────────────────────────────────────────────────── */}
      {page.sections.length > 0 && (
        <AnalyticsPanel
          assets={page.sections.flatMap(s => s.deliverables)}
          analytics={analytics}
        />
      )}

      {/* ── Generate from proposal ────────────────────────────────────────── */}
      {generating && (
        <GenerateFromProposalModal
          deliveryPageId={page.id}
          projectId={project.id}
          onClose={() => { setGenerating(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Empty state (no delivery page yet) ──────────────────────────────────────

function EmptyState({
  projectId, hasApprovedProposal, onEnsurePage,
}: {
  projectId:           string
  hasApprovedProposal: boolean
  onEnsurePage:        () => void
}) {
  void projectId
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Globe className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">No delivery page yet</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">
        {hasApprovedProposal
          ? 'Generate from your approved proposal to instantly scaffold sections and assets.'
          : 'Create a delivery page to start sharing deliverables with your client.'}
      </p>
      <button
        type="button"
        onClick={onEnsurePage}
        className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Create delivery page
      </button>
    </div>
  )
}

// ─── Page status pill ─────────────────────────────────────────────────────────

function PageStatusPill({ status }: { status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }) {
  const cfg = {
    DRAFT:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600' },
    PUBLISHED: { label: 'Published', cls: 'bg-green-100 text-green-700' },
    ARCHIVED:  { label: 'Archived',  cls: 'bg-amber-100 text-amber-700' },
  }[status]
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ─── Page meta form ───────────────────────────────────────────────────────────

function PageMetaForm({ page, onSaved }: { page: DeliveryPage; onSaved: () => void }) {
  const [open,         setOpen]         = useState(false)
  const [title,        setTitle]        = useState(page.title ?? '')
  const [subtitle,     setSubtitle]     = useState(page.subtitle ?? '')
  const [customMsg,    setCustomMsg]    = useState(page.customMessage ?? '')
  const [coverUrl,     setCoverUrl]     = useState(page.coverImageUrl ?? '')
  const [saving,       setSaving]       = useState(false)

  async function handleSave() {
    setSaving(true)
    await updateDeliveryPageMeta(page.id, {
      title:         title.trim() || null,
      subtitle:      subtitle.trim() || null,
      customMessage: customMsg.trim() || null,
      coverImageUrl: coverUrl.trim() || null,
    })
    setSaving(false)
    setOpen(false)
    onSaved()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings className="h-3 w-3" />
        Page settings
      </button>
    )
  }

  return (
    <div className="space-y-2 pt-1 border-t border-border/60">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={`${page.id ? 'Delivery Page' : ''}`}
            className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Subtitle</label>
          <input
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            placeholder="e.g. Season 1 Deliverables"
            className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Message to client</label>
        <textarea
          rows={2}
          value={customMsg}
          onChange={e => setCustomMsg(e.target.value)}
          placeholder="A note shown at the top of the client page…"
          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Cover image</label>
        <CoverImageUploader
          currentUrl={coverUrl || null}
          onUploadComplete={url => setCoverUrl(url)}
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  section, allSections,
  isDragging, isDropTarget,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onRename, onDelete, onAddAsset,
  onEditAsset, onDeleteAsset,
  dragAssetId, onAssetDragStart, onAssetDrop,
  dropAssetSectionId, onAssetDragOver, onAssetDragEnd,
}: {
  section:     Section
  allSections: Section[]
  isDragging:  boolean
  isDropTarget: boolean
  onDragStart: () => void
  onDragOver:  (e: React.DragEvent) => void
  onDrop:      () => void
  onDragEnd:   () => void
  onRename:    () => void
  onDelete:    () => void
  onAddAsset:  () => void
  onEditAsset: (a: Asset) => void
  onDeleteAsset: (id: string, title: string) => void
  dragAssetId: string | null
  onAssetDragStart: (id: string) => void
  onAssetDrop: (beforeId?: string) => void
  dropAssetSectionId: string | null
  onAssetDragOver: () => void
  onAssetDragEnd: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-xl border bg-card transition-all ${
        isDragging  ? 'opacity-40 scale-[0.98]' : ''
      } ${
        isDropTarget ? 'border-primary ring-1 ring-primary/40' : ''
      }`}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{section.title}</p>
          {section.description && (
            <p className="text-xs text-muted-foreground truncate">{section.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{section.deliverables.length} asset{section.deliverables.length !== 1 ? 's' : ''}</span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-md text-[13px]">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                onClick={() => { setMenuOpen(false); onRename() }}
              >
                <Pencil className="h-3 w-3" /> Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/10"
                onClick={() => { setMenuOpen(false); onDelete() }}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Asset grid */}
      <div
        className="p-3"
        onDragOver={e => { e.preventDefault(); onAssetDragOver() }}
        onDrop={e => { e.preventDefault(); onAssetDrop() }}
      >
        {section.deliverables.length === 0 ? (
          <div className={`flex items-center justify-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground transition-colors ${dropAssetSectionId === section.id ? 'border-primary bg-primary/5' : ''}`}>
            Drop assets here or click Add
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {section.deliverables.map(asset => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isDragging={dragAssetId === asset.id}
                isDropTarget={false}
                onDragStart={() => onAssetDragStart(asset.id)}
                onDrop={() => onAssetDrop(asset.id)}
                onDragEnd={onAssetDragEnd}
                onEdit={() => onEditAsset(asset)}
                onDelete={() => onDeleteAsset(asset.id, asset.title)}
                allSections={allSections}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onAddAsset}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add asset
        </button>
      </div>
    </div>
  )
}

// ─── Asset card ───────────────────────────────────────────────────────────────

function AssetCard({
  asset, isDragging, onDragStart, onDrop, onDragEnd, onEdit, onDelete, allSections,
}: {
  asset:       Asset
  isDragging:  boolean
  isDropTarget: boolean
  onDragStart: () => void
  onDrop:      () => void
  onDragEnd:   () => void
  onEdit:      () => void
  onDelete:    () => void
  allSections: Section[]
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isUnseen = asset.currentVersion && !asset.currentVersion.firstClientViewAt && asset.status === 'SHARED'
  void allSections

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      className={`group/asset relative rounded-lg border bg-card overflow-hidden transition-all ${
        isDragging ? 'opacity-40 scale-[0.97]' : 'hover:border-foreground/20'
      }`}
    >
      {/* Thumbnail or placeholder */}
      <div className="aspect-video bg-secondary/40 flex items-center justify-center relative">
        {asset.currentVersion?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.currentVersion.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground/60">
            {asset.currentVersion ? PROVIDER_LABELS[asset.currentVersion.provider] ?? 'Asset' : 'No version'}
          </span>
        )}
        {isUnseen && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-violet-500" title="Not yet seen by client" />
        )}
        {/* Drag handle */}
        <div className="absolute top-1.5 left-1.5 opacity-0 group-hover/asset:opacity-100 transition-opacity">
          <GripVertical className="h-3.5 w-3.5 text-white drop-shadow cursor-grab" />
        </div>
      </div>

      {/* Card body */}
      <div className="p-2.5">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-foreground truncate">{asset.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                asset.status === 'SHARED'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {asset.status === 'SHARED' ? 'Shared' : 'Draft'}
              </span>
              {asset.currentVersion && (
                <span className="text-[10px] text-muted-foreground">
                  v{asset.currentVersion.versionNumber}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{TYPE_LABELS[asset.type]}</span>
            </div>
          </div>
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="rounded p-0.5 text-muted-foreground opacity-0 group-hover/asset:opacity-100 hover:bg-accent transition-all"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[130px] rounded-lg border border-border bg-popover p-1 shadow-md text-[13px]">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                  onClick={() => { setMenuOpen(false); onEdit() }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => { setMenuOpen(false); onDelete() }}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Section rename modal ─────────────────────────────────────────────────────

function SectionRenameModal({
  sectionId, currentTitle, currentDescription, onClose,
}: {
  sectionId:          string
  currentTitle:       string
  currentDescription: string | null
  onClose:            () => void
}) {
  const [title,       setTitle]       = useState(currentTitle)
  const [description, setDescription] = useState(currentDescription ?? '')
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await renameSection(sectionId, title.trim(), description.trim() || null)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl mx-4 space-y-4">
        <p className="text-sm font-semibold">Rename section</p>
        <div className="space-y-2">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Section title"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <textarea
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
