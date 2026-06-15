'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileImage, FileText, Link2, Link2Off, Trash2, CheckCircle2, Clock, X } from 'lucide-react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ReceiptUploader } from '@/components/actuals/ReceiptUploader'
import {
  updateActualEntry,
} from '@/server/actions/actuals'
import {
  getEntryReceipts,
  getProjectReceipts,
  linkReceiptToEntry,
  unlinkReceipt,
  deleteReceipt,
} from '@/server/actions/receipts'
import { formatMoney } from '@/lib/money'
import type { ActualEntryDb } from '@/server/actions/actuals'
import type { ReceiptDb } from '@/server/actions/receipts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open:        boolean
  onClose:     () => void
  entry:       ActualEntryDb | null
  projectId:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDollar(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function displayDollar(cents: number) {
  return (cents / 100).toFixed(2)
}

function isImage(type: string) { return type.startsWith('image/') }

function ReceiptThumbnail({ receipt }: { receipt: ReceiptDb }) {
  if (isImage(receipt.fileType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={receipt.fileUrl}
        alt={receipt.fileName}
        className="h-16 w-16 rounded-lg object-cover border border-border"
      />
    )
  }
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-muted">
      <FileText className="h-6 w-6 text-muted-foreground" />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActualEntrySidebar({ open, onClose, entry, projectId }: Props) {
  const router = useRouter()

  // ── Entry edit state ──────────────────────────────────────────────────────
  const [amount,      setAmount]      = useState('')
  const [notes,       setNotes]       = useState('')
  const [date,        setDate]        = useState('')
  const [status,      setStatus]      = useState<'PENDING' | 'APPROVED'>('PENDING')
  const [saving,      startSave]      = useTransition()

  // ── Receipt state ─────────────────────────────────────────────────────────
  const [entryReceipts,   setEntryReceipts]   = useState<ReceiptDb[]>([])
  const [inboxReceipts,   setInboxReceipts]   = useState<ReceiptDb[]>([])
  const [showInbox,       setShowInbox]       = useState(false)
  const [receiptsPending, startReceiptsLoad]  = useTransition()

  // ── Sync from entry prop ──────────────────────────────────────────────────

  useEffect(() => {
    if (!entry) return
    setAmount(displayDollar(entry.actualCents))
    setNotes(entry.notes ?? '')
    setDate(entry.date ? new Date(entry.date).toISOString().split('T')[0] : '')
    setStatus(entry.status ?? 'PENDING')
    setShowInbox(false)
  }, [entry])

  // Load receipts when the sidebar opens for an entry
  useEffect(() => {
    if (!open || !entry) return
    startReceiptsLoad(async () => {
      const receipts = await getEntryReceipts(entry.id, projectId)
      setEntryReceipts(receipts)
    })
  }, [open, entry, projectId])

  // Load inbox (unattached) receipts on demand
  const loadInbox = useCallback(() => {
    startReceiptsLoad(async () => {
      const all = await getProjectReceipts(projectId)
      setInboxReceipts(all.filter(r => r.actualEntryId === null))
      setShowInbox(true)
    })
  }, [projectId])

  // ── Save handler ──────────────────────────────────────────────────────────

  function handleSave() {
    if (!entry) return
    const cents = parseDollar(amount)
    startSave(async () => {
      await updateActualEntry(entry.id, cents, {
        notes:  notes || undefined,
        date:   date ? new Date(date) : null,
        status,
      })
      router.refresh()
    })
  }

  // ── Receipt actions ───────────────────────────────────────────────────────

  async function handleUnlink(receiptId: string) {
    const res = await unlinkReceipt(receiptId, projectId)
    if (res.success) {
      setEntryReceipts(prev => prev.filter(r => r.id !== receiptId))
    }
  }

  async function handleDelete(receiptId: string) {
    const res = await deleteReceipt(receiptId, projectId)
    if (res.success) {
      setEntryReceipts(prev => prev.filter(r => r.id !== receiptId))
      setInboxReceipts(prev => prev.filter(r => r.id !== receiptId))
    }
  }

  async function handleLinkFromInbox(receiptId: string) {
    if (!entry) return
    const res = await linkReceiptToEntry(receiptId, entry.id, projectId)
    if (res.success) {
      const receipt = inboxReceipts.find(r => r.id === receiptId)
      if (receipt) {
        setEntryReceipts(prev => [...prev, { ...receipt, actualEntryId: entry.id }])
        setInboxReceipts(prev => prev.filter(r => r.id !== receiptId))
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pr-10">
          <SheetTitle className="truncate">
            {entry?.description ?? 'Entry details'}
          </SheetTitle>
        </SheetHeader>

        {entry && (
          <div className="flex flex-col gap-6 px-6 py-5">

            {/* ── Amounts & metadata ─────────────────────────────────────── */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Actual amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <input
                    type="text"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <button
                  type="button"
                  onClick={() => setStatus(s => s === 'APPROVED' ? 'PENDING' : 'APPROVED')}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    status === 'APPROVED'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {status === 'APPROVED'
                    ? <CheckCircle2 className="h-3 w-3" />
                    : <Clock className="h-3 w-3" />
                  }
                  {status === 'APPROVED' ? 'Approved' : 'Pending'}
                </button>
              </div>

              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </section>

            {/* ── Receipts attached to this entry ────────────────────────── */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Receipts{entryReceipts.length > 0 && ` (${entryReceipts.length})`}
              </h3>

              {receiptsPending ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : entryReceipts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No receipts attached yet.</p>
              ) : (
                <ul className="space-y-2">
                  {entryReceipts.map(r => (
                    <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                      <a href={r.fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
                        <ReceiptThumbnail receipt={r} />
                      </a>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{r.fileName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(r.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          onClick={() => handleUnlink(r.id)}
                          title="Move to inbox"
                          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          title="Delete"
                          className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Upload directly into this entry */}
              <ReceiptUploader
                projectId={projectId}
                actualEntryId={entry.id}
                compact
                onUploaded={receipt => setEntryReceipts(prev => [receipt, ...prev])}
              />
            </section>

            {/* ── Attach from inbox ──────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Inbox {showInbox && inboxReceipts.length > 0 && `(${inboxReceipts.length})`}
                </h3>
                {!showInbox && (
                  <button
                    onClick={loadInbox}
                    className="text-xs text-primary hover:underline"
                  >
                    Browse unattached receipts
                  </button>
                )}
                {showInbox && (
                  <button
                    onClick={() => setShowInbox(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {showInbox && (
                receiptsPending ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : inboxReceipts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unattached receipts for this project.</p>
                ) : (
                  <ul className="space-y-2">
                    {inboxReceipts.map(r => (
                      <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2">
                        <div className="shrink-0">
                          <ReceiptThumbnail receipt={r} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{r.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(r.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleLinkFromInbox(r.id)}
                          title="Attach to this entry"
                          className="shrink-0 rounded p-1 text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </section>

          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
