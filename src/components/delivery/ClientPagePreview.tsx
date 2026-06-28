'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Copy, Check, ExternalLink, Loader2, Package } from 'lucide-react'
import {
  ensureDeliveryPage,
  publishDeliveryPage,
  unpublishDeliveryPage,
} from '@/server/actions/delivery'

interface DeliveryPage {
  id:              string
  publicToken:     string
  status:          'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  title:           string | null
  subtitle:        string | null
  customMessage:   string | null
  coverImageUrl:   string | null
  lastPublishedAt: Date | string | null
  _count:          { sections: number }
}

interface Props {
  project:      { id: string; name: string }
  deliveryPage: DeliveryPage | null
}

export function ClientPagePreview({ project, deliveryPage: initial }: Props) {
  const router                              = useRouter()
  const [page,           setPage]           = useState<DeliveryPage | null>(initial)
  const [publishPending, setPublishPending] = useState(false)
  const [creating,       setCreating]       = useState(false)
  const [copied,         setCopied]         = useState(false)

  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const appUrl    = rawAppUrl && !rawAppUrl.startsWith('http') ? `https://${rawAppUrl}` : rawAppUrl
  const publicUrl = page ? `${appUrl.replace(/\/$/, '')}/d/${page.publicToken}` : null

  async function handleCreate() {
    setCreating(true)
    await ensureDeliveryPage(project.id)
    setCreating(false)
    router.refresh()
  }

  async function handlePublish() {
    if (!page) return
    setPublishPending(true)
    if (page.status === 'PUBLISHED') {
      await unpublishDeliveryPage(page.id)
    } else {
      await publishDeliveryPage(page.id)
    }
    setPublishPending(false)
    router.refresh()
  }

  function handleCopy() {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // ── No delivery page yet ──────────────────────────────────────────────────

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Globe className="h-10 w-10 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-semibold text-foreground">No client page yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Create a delivery page and configure it here before sharing with your client.
        </p>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-5 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
          Create client page
        </button>
      </div>
    )
  }

  // ── Page exists ───────────────────────────────────────────────────────────

  const isPublished = page.status === 'PUBLISHED'

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Status card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {isPublished ? 'Published' : 'Draft'}
            </span>
            {page.lastPublishedAt && (
              <span className="text-xs text-muted-foreground">
                Last published {new Date(page.lastPublishedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishPending}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              isPublished
                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            } disabled:opacity-60`}
          >
            {publishPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
        </div>

        {/* Public URL */}
        {isPublished && publicUrl && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{publicUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </div>
        )}

        {!isPublished && (
          <p className="text-xs text-muted-foreground">
            Publish to generate a shareable link. Only assets marked as <span className="font-semibold">Shared</span> will be visible to the client.
          </p>
        )}
      </div>

      {/* Page summary */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page details</p>
        <dl className="space-y-2 text-sm">
          <Row label="Title"    value={page.title ?? <em className="text-muted-foreground">{project.name} (default)</em>} />
          <Row label="Subtitle" value={page.subtitle ?? <em className="text-muted-foreground">None</em>} />
          <Row label="Message"  value={page.customMessage ?? <em className="text-muted-foreground">None</em>} />
          <Row label="Sections" value={`${page._count.sections}`} />
        </dl>
        <p className="text-[11px] text-muted-foreground pt-1">
          Edit title, subtitle, and message from the{' '}
          <a href={`/projects/${project.id}/delivery/deliverables`} className="underline hover:text-foreground">
            Deliverables
          </a>{' '}
          tab &rarr; Page settings.
        </p>
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/projects/${project.id}/delivery/deliverables`}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <Package className="h-3 w-3" />
            Manage deliverables
          </a>
          {isPublished && publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Preview as client
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 flex-shrink-0 text-muted-foreground text-[12px]">{label}</dt>
      <dd className="text-foreground text-[13px] flex-1">{value}</dd>
    </div>
  )
}
