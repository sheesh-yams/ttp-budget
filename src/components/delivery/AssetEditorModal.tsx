'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Loader2, Plus, Check } from 'lucide-react'
import { detectEmbed } from '@/lib/embed-detection'
import {
  updateAsset, addVersion,
  setCurrentVersion, deleteVersion, getAssetVersions,
} from '@/server/actions/delivery'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { DeliverableItemType } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Version {
  id:               string
  versionNumber:    number
  provider:         string
  renderMode:       string
  thumbnailUrl:     string | null
  firstClientViewAt: Date | string | null
  note?:            string | null
}

interface Asset {
  id:             string
  title:          string
  description:    string | null
  type:           DeliverableItemType
  status:         'DRAFT' | 'SHARED'
  currentVersion: Version | null
  versions?:      Version[]
}

interface AssetUpdates {
  title:       string
  description: string | null
  type:        DeliverableItemType
  status:      'DRAFT' | 'SHARED'
}

interface Props {
  asset:   Asset
  onClose: (updates?: AssetUpdates) => void
}

const TYPE_OPTIONS: { value: DeliverableItemType; label: string }[] = [
  { value: 'DELIVERABLE',  label: 'Deliverable'  },
  { value: 'SERVICE',      label: 'Service'       },
  { value: 'RAW_FOOTAGE',  label: 'Raw Footage'   },
  { value: 'OTHER',        label: 'Other'         },
]

const PROVIDER_LABELS: Record<string, string> = {
  FRAME_IO:      'Frame.io',
  SHADE:         'Shade',
  GDRIVE_FILE:   'Google Drive File',
  GDRIVE_FOLDER: 'Google Drive Folder',
  DROPBOX_FILE:  'Dropbox File',
  DROPBOX_FOLDER:'Dropbox Folder',
  DIRECT_IMAGE:  'Image',
  DIRECT_VIDEO:  'Video',
  YOUTUBE:       'YouTube',
  VIMEO:         'Vimeo',
  GENERIC_LINK:  'Link',
}

const RENDER_MODE_OPTIONS = [
  { value: 'IFRAME',        label: 'Embed (iframe)' },
  { value: 'NATIVE_MEDIA',  label: 'Native media'   },
  { value: 'EXTERNAL_ONLY', label: 'External link'  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function AssetEditorModal({ asset, onClose }: Props) {
  const [tab, setTab] = useState<'details' | 'versions'>('details')

  // Shared state at modal level so it persists when switching tabs
  const [title,       setTitle]       = useState(asset.title)
  const [description, setDescription] = useState(asset.description ?? '')
  const [type,        setType]        = useState<DeliverableItemType>(asset.type)
  const [status,      setStatus]      = useState<'DRAFT' | 'SHARED'>(asset.status)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => onClose()} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] rounded-2xl border border-border bg-card shadow-xl mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <p className="text-sm font-semibold text-foreground truncate">{title || asset.title}</p>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5 flex-shrink-0">
          {(['details', 'versions'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`py-2.5 px-1 mr-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'details' ? 'Details' : 'Versions'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details'
            ? <DetailsTab
                asset={asset}
                title={title}        setTitle={setTitle}
                description={description} setDescription={setDescription}
                type={type}          setType={setType}
                status={status}      setStatus={setStatus}
                onClose={onClose}
              />
            : <VersionsTab
                asset={asset}
                pendingDetails={{ title: title.trim(), description: description.trim() || null, type, status }}
              />
          }
        </div>
      </div>
    </div>
  )
}

// ─── Details tab ──────────────────────────────────────────────────────────────

function DetailsTab({
  asset, title, setTitle, description, setDescription, type, setType, status, setStatus, onClose,
}: {
  asset:          Asset
  title:          string
  setTitle:       (v: string) => void
  description:    string
  setDescription: (v: string) => void
  type:           DeliverableItemType
  setType:        (v: DeliverableItemType) => void
  status:         'DRAFT' | 'SHARED'
  setStatus:      (v: 'DRAFT' | 'SHARED') => void
  onClose:        (updates?: AssetUpdates) => void
}) {
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const result = await updateAsset(asset.id, {
      title:       title.trim(),
      description: description.trim() || null,
      type,
      status,
    })
    setSaving(false)
    if (!result.success) {
      setSaveError(('error' in result ? result.error : null) ?? 'Failed to save.')
      return
    }
    onClose({ title: title.trim(), description: description.trim() || null, type, status })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Title</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Description</label>
        <textarea
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Shown on the client page…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as DeliverableItemType)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Visibility</label>
          <button
            type="button"
            onClick={() => setStatus(status === 'DRAFT' ? 'SHARED' : 'DRAFT')}
            className={`w-full rounded-md border px-3 py-2 text-sm font-medium text-left transition-colors ${
              status === 'SHARED'
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-input bg-transparent text-muted-foreground'
            }`}
          >
            {status === 'SHARED' ? '● Shared with client' : '○ Draft (hidden)'}
          </button>
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-destructive">{saveError}</p>
      )}
      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={() => onClose()} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
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
  )
}

// ─── Versions tab ─────────────────────────────────────────────────────────────

function VersionsTab({ asset, pendingDetails }: {
  asset:          Asset
  pendingDetails: AssetUpdates
}) {
  const [, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  // Local version list — seeded from currentVersion, then replaced by full fetch on mount
  const [localVersions,   setLocalVersions]   = useState<Version[]>(
    asset.currentVersion ? [asset.currentVersion] : []
  )
  const [curVersionId,    setCurVersionId]    = useState<string | null>(asset.currentVersion?.id ?? null)
  const [versionsLoading, setVersionsLoading] = useState(true)

  useEffect(() => {
    getAssetVersions(asset.id).then(result => {
      if (result.success) setLocalVersions(result.data)
      setVersionsLoading(false)
    })
  }, [asset.id])

  // Add-version form state
  const [urlOrEmbed,      setUrlOrEmbed]      = useState('')
  const [note,            setNote]            = useState('')
  const [detectedLabel,   setDetectedLabel]   = useState<string | null>(null)
  const [detectedMode,    setDetectedMode]    = useState<'IFRAME' | 'NATIVE_MEDIA' | 'EXTERNAL_ONLY' | null>(null)
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null)
  const [renderOverride,  setRenderOverride]  = useState<'IFRAME' | 'NATIVE_MEDIA' | 'EXTERNAL_ONLY' | ''>('')
  const [addError,        setAddError]        = useState<string | null>(null)
  const [adding,          setAdding]          = useState(false)

  function handleEmbedChange(val: string) {
    setUrlOrEmbed(val)
    setAddError(null)
    if (!val.trim()) {
      setDetectedLabel(null); setDetectedMode(null); setDetectedProvider(null); setRenderOverride('')
      return
    }
    const result = detectEmbed(val.trim())
    if ('error' in result) {
      setDetectedLabel(null); setDetectedMode(null); setDetectedProvider(null)
    } else {
      setDetectedLabel(`${PROVIDER_LABELS[result.provider] ?? result.provider} · ${result.renderMode.replace('_', ' ').toLowerCase()}`)
      setDetectedMode(result.renderMode)
      setDetectedProvider(result.provider)
    }
  }

  async function handleAddVersion() {
    if (!urlOrEmbed.trim()) return
    setAdding(true)
    setAddError(null)

    // Auto-save unsaved details so the user doesn't lose title/description/etc.
    const detailsDirty =
      pendingDetails.title       !== asset.title ||
      pendingDetails.description !== (asset.description ?? null) ||
      pendingDetails.type        !== asset.type ||
      pendingDetails.status      !== asset.status
    if (detailsDirty) {
      const saveResult = await updateAsset(asset.id, pendingDetails)
      if (!saveResult.success) {
        setAddError('Could not save asset details. Please try again.')
        setAdding(false)
        return
      }
    }

    const result = await addVersion(asset.id, {
      urlOrEmbed: urlOrEmbed.trim(),
      note:       note.trim() || undefined,
      renderMode: renderOverride || undefined,
    })
    setAdding(false)
    if (!result.success) {
      setAddError(('error' in result ? result.error : null) ?? 'Failed to add version.')
      return
    }
    // Optimistically append new version and promote it to current
    const newVersion: Version = {
      id:                result.data.id,
      versionNumber:     result.data.versionNumber,
      provider:          detectedProvider ?? 'GENERIC_LINK',
      renderMode:        (renderOverride || detectedMode) ?? 'EXTERNAL_ONLY',
      thumbnailUrl:      null,
      firstClientViewAt: null,
      note:              note.trim() || null,
    }
    setLocalVersions(prev => [...prev, newVersion])
    setCurVersionId(result.data.id)
    setUrlOrEmbed('')
    setNote('')
    setDetectedLabel(null)
    setDetectedMode(null)
    setDetectedProvider(null)
    setRenderOverride('')
  }

  async function handleSetCurrent(versionId: string) {
    startTransition(async () => {
      await setCurrentVersion(asset.id, versionId)
      setCurVersionId(versionId)
    })
  }

  async function handleDeleteVersion(versionId: string, versionNumber: number) {
    const ok = await confirm(`Delete v${versionNumber}? This cannot be undone.`, {
      title: 'Delete version',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteVersion(versionId)
      if (!result.success) {
        alert('error' in result ? result.error : 'Delete failed')
      } else {
        setLocalVersions(prev => prev.filter(v => v.id !== versionId))
        if (curVersionId === versionId) setCurVersionId(null)
      }
    })
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}

      {/* Existing versions */}
      {versionsLoading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading versions…</span>
        </div>
      ) : localVersions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No versions yet — add one below.</p>
      ) : (
        <div className="space-y-2">
          {[...localVersions].sort((a, b) => b.versionNumber - a.versionNumber).map(v => {
            const isCurrent = v.id === curVersionId
            return (
              <div key={v.id} className={`flex items-start gap-3 rounded-lg border p-3 ${isCurrent ? 'border-primary/40 bg-primary/5' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">v{v.versionNumber}</span>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Current</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{PROVIDER_LABELS[v.provider] ?? v.provider}</span>
                    <span className="text-[10px] text-muted-foreground">{v.renderMode.replace('_', ' ').toLowerCase()}</span>
                    {v.firstClientViewAt === null && (
                      <span className="text-[10px] text-violet-600 font-medium">Unseen</span>
                    )}
                  </div>
                  {v.note && <p className="text-xs text-muted-foreground">{v.note}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleSetCurrent(v.id)}
                      className="rounded px-2 py-0.5 text-[11px] font-medium border border-border text-muted-foreground hover:bg-accent"
                    >
                      <Check className="h-3 w-3 inline mr-0.5" />Set current
                    </button>
                  )}
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVersion(v.id, v.versionNumber)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add new version */}
      <div className="rounded-lg border border-dashed p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add new version</p>
        <div className="space-y-1">
          <textarea
            rows={2}
            value={urlOrEmbed}
            onChange={e => handleEmbedChange(e.target.value)}
            onBlur={e => handleEmbedChange(e.target.value)}
            placeholder="Paste a URL or <iframe> embed code…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-mono text-xs"
          />
          {detectedLabel && (
            <p className="text-[11px] text-green-600 font-medium">Detected: {detectedLabel}</p>
          )}
          {addError && (
            <p className="text-[11px] text-destructive">{addError}</p>
          )}
        </div>

        {detectedMode && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Render mode</label>
            <select
              value={renderOverride || detectedMode}
              onChange={e => setRenderOverride(e.target.value as 'IFRAME' | 'NATIVE_MEDIA' | 'EXTERNAL_ONLY')}
              className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {RENDER_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Version note (optional)"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <button
          type="button"
          onClick={handleAddVersion}
          disabled={!urlOrEmbed.trim() || adding}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add version
        </button>
      </div>
    </div>
  )
}
