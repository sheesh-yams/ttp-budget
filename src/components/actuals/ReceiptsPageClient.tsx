'use client'

import { useState } from 'react'
import { FileImage, FileText, Link2Off, Trash2, ExternalLink } from 'lucide-react'
import { ReceiptUploader } from '@/components/actuals/ReceiptUploader'
import { deleteReceipt } from '@/server/actions/receipts'
import type { ReceiptDb } from '@/server/actions/receipts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:        string
  initialReceipts:  ReceiptDb[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isImage(type: string) { return type.startsWith('image/') }

function ReceiptCard({ receipt, onDelete }: { receipt: ReceiptDb; onDelete: () => void }) {
  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Thumbnail */}
      <a href={receipt.fileUrl} target="_blank" rel="noreferrer" className="block">
        {isImage(receipt.fileType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receipt.fileUrl}
            alt={receipt.fileName}
            className="h-36 w-full object-cover"
          />
        ) : (
          <div className="flex h-36 items-center justify-center bg-muted">
            <FileText className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
      </a>

      {/* Meta */}
      <div className="px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground" title={receipt.fileName}>
          {receipt.fileName}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {new Date(receipt.uploadedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      </div>

      {/* Hover actions */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={receipt.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
          title="Open"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={onDelete}
          className="rounded bg-black/60 p-1 text-white hover:bg-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Attached badge */}
      {receipt.actualEntryId && (
        <div className="absolute left-2 top-2">
          <span className="rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
            Attached
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReceiptsPageClient({ projectId, initialReceipts }: Props) {
  const [receipts, setReceipts] = useState<ReceiptDb[]>(initialReceipts)

  const inbox    = receipts.filter(r => r.actualEntryId === null)
  const attached = receipts.filter(r => r.actualEntryId !== null)

  function handleUploaded(receipt: ReceiptDb) {
    setReceipts(prev => [receipt, ...prev])
  }

  async function handleDelete(receiptId: string) {
    const res = await deleteReceipt(receiptId, projectId)
    if (res.success) {
      setReceipts(prev => prev.filter(r => r.id !== receiptId))
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Upload zone ──────────────────────────────────────────────────── */}
      <section>
        <ReceiptUploader
          projectId={projectId}
          listenPaste
          onUploaded={handleUploaded}
        />
      </section>

      {/* ── Inbox: unattached receipts ────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Inbox</h2>
          {inbox.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {inbox.length} unattached
            </span>
          )}
        </div>

        {inbox.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed py-8 text-center">
            <p className="w-full text-sm text-muted-foreground">
              No unattached receipts. Upload above, then attach them to actuals entries.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {inbox.map(r => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Attached receipts ─────────────────────────────────────────────── */}
      {attached.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Attached</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {attached.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {attached.map(r => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
