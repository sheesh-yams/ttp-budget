'use client'

import { useState } from 'react'
import { FileText, Trash2, ExternalLink, DollarSign } from 'lucide-react'
import { ReceiptUploader }    from '@/components/actuals/ReceiptUploader'
import { ReceiptDetailPanel } from '@/components/actuals/ReceiptDetailPanel'
import { deleteReceipt }      from '@/server/actions/receipts'
import type { ReceiptDb }     from '@/server/actions/receipts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isImage(type: string) { return type.startsWith('image/') }

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Receipt card ─────────────────────────────────────────────────────────────

function ReceiptCard({
  receipt,
  onClick,
  onDelete,
}: {
  receipt:  ReceiptDb
  onClick:  () => void
  onDelete: () => void
}) {
  const hasAmount = receipt.amountCents != null

  return (
    <div
      className="group relative cursor-pointer rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
      onClick={onClick}
    >
      {/* Thumbnail */}
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

      {/* Meta */}
      <div className="px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground" title={receipt.fileName}>
          {receipt.merchantName ?? receipt.fileName}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          {hasAmount ? (
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
              <DollarSign className="h-2.5 w-2.5" />
              {formatCents(receipt.amountCents!)}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">No amount</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(receipt.uploadedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* Hover actions — open file or delete, without propagating to card click */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={receipt.fileUrl}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="rounded bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
          title="Open file"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="rounded bg-black/60 p-1 text-white hover:bg-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Status badges */}
      <div className="absolute left-2 top-2 flex flex-col gap-1">
        {receipt.actualEntryId && (
          <span className="rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
            Attached
          </span>
        )}
        {!receipt.amountCents && !receipt.actualEntryId && (
          <span className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Needs info
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  projectId:       string
  initialReceipts: ReceiptDb[]
}

export function ReceiptsPageClient({ projectId, initialReceipts }: Props) {
  const [receipts,       setReceipts]       = useState<ReceiptDb[]>(initialReceipts)
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDb | null>(null)
  const [panelOpen,      setPanelOpen]      = useState(false)

  const inbox    = receipts.filter(r => r.actualEntryId === null)
  const attached = receipts.filter(r => r.actualEntryId !== null)

  function openPanel(r: ReceiptDb) {
    setSelectedReceipt(r)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
  }

  function handleUploaded(receipt: ReceiptDb) {
    setReceipts(prev => [receipt, ...prev])
    // Auto-open the panel so the user can fill in details immediately
    openPanel(receipt)
  }

  async function handleDelete(receiptId: string) {
    const res = await deleteReceipt(receiptId, projectId)
    if (res.success) {
      setReceipts(prev => prev.filter(r => r.id !== receiptId))
      if (selectedReceipt?.id === receiptId) closePanel()
    }
  }

  function handleUpdated(updated: ReceiptDb) {
    setReceipts(prev => prev.map(r => r.id === updated.id ? updated : r))
    setSelectedReceipt(updated)
  }

  function handleLinked(receiptId: string, entryId: string, _entryDescription: string) {
    setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, actualEntryId: entryId } : r))
  }

  function handleUnlinked(receiptId: string) {
    setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, actualEntryId: null } : r))
  }

  return (
    <>
      <div className="space-y-8">

        {/* ── Upload zone ─────────────────────────────────────────────────── */}
        <section>
          <ReceiptUploader
            projectId={projectId}
            listenPaste
            onUploaded={handleUploaded}
          />
        </section>

        {/* ── Inbox: unattached receipts ───────────────────────────────────── */}
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
                No unattached receipts. Upload above to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {inbox.map(r => (
                <ReceiptCard
                  key={r.id}
                  receipt={r}
                  onClick={() => openPanel(r)}
                  onDelete={() => handleDelete(r.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Attached receipts ────────────────────────────────────────────── */}
        {attached.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Attached to actuals</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {attached.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {attached.map(r => (
                <ReceiptCard
                  key={r.id}
                  receipt={r}
                  onClick={() => openPanel(r)}
                  onDelete={() => handleDelete(r.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Detail panel ──────────────────────────────────────────────────── */}
      <ReceiptDetailPanel
        open={panelOpen}
        onClose={closePanel}
        receipt={selectedReceipt}
        projectId={projectId}
        onUpdated={handleUpdated}
        onLinked={handleLinked}
        onUnlinked={handleUnlinked}
      />
    </>
  )
}
