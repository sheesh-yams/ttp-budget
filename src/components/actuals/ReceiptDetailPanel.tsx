'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { FileText, Link2, Link2Off, PlusCircle, Search, Check, ChevronRight, ExternalLink } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  updateReceiptDetails,
  getProjectActualEntries,
  linkReceiptToEntry,
  unlinkReceipt,
  createAdHocEntryFromReceipt,
} from '@/server/actions/receipts'
import type { ReceiptDb, ActualEntryForMatching } from '@/server/actions/receipts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isImage(type: string) { return type.startsWith('image/') }

function parseDollar(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toInputDate(d: Date | string | null): string {
  if (!d) return ''
  return new Date(d).toISOString().split('T')[0]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReceiptPreview({ receipt }: { receipt: ReceiptDb }) {
  if (isImage(receipt.fileType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={receipt.fileUrl}
        alt={receipt.fileName}
        className="w-full rounded-xl object-contain max-h-72 bg-muted"
      />
    )
  }
  // PDF — inline iframe so the user doesn't have to navigate away
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted" style={{ height: 380 }}>
      <iframe
        src={receipt.fileUrl}
        title={receipt.fileName}
        className="h-full w-full border-none"
      />
      {/* Fallback icon shown if the browser can't render the PDF inline */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0">
        <FileText className="h-10 w-10 text-muted-foreground" />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open:      boolean
  onClose:   () => void
  receipt:   ReceiptDb | null
  projectId: string
  onUpdated: (r: ReceiptDb) => void
  onLinked:  (receiptId: string, entryId: string, entryDescription: string) => void
  onUnlinked:(receiptId: string) => void
}

type MatchMode = 'add' | 'match'

export function ReceiptDetailPanel({ open, onClose, receipt, projectId, onUpdated, onLinked, onUnlinked }: Props) {
  // ── Detail form ────────────────────────────────────────────────────────────
  const [amount,   setAmount]   = useState('')
  const [merchant, setMerchant] = useState('')
  const [date,     setDate]     = useState('')
  const [saving,   startSave]   = useTransition()

  // ── Actuals linking ────────────────────────────────────────────────────────
  const [matchMode,    setMatchMode]    = useState<MatchMode>('add')
  const [addDesc,      setAddDesc]      = useState('')
  const [entries,      setEntries]      = useState<ActualEntryForMatching[]>([])
  const [entrySearch,  setEntrySearch]  = useState('')
  const [showMatchBox, setShowMatchBox] = useState(false)
  const [linking,      startLink]       = useTransition()
  const [entriesLoaded, setEntriesLoaded] = useState(false)

  // ── Sync from receipt prop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!receipt) return
    setAmount(receipt.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : '')
    setMerchant(receipt.merchantName ?? '')
    setDate(toInputDate(receipt.receiptDate))
    setAddDesc(receipt.merchantName ?? '')
    setShowMatchBox(false)
    setEntrySearch('')
    setEntriesLoaded(false)
    setEntries([])
    setMatchMode('add')
  }, [receipt])

  // ── Load entries for match picker ──────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    if (entriesLoaded) return
    const list = await getProjectActualEntries(projectId)
    setEntries(list)
    setEntriesLoaded(true)
  }, [projectId, entriesLoaded])

  function handleShowMatch() {
    setMatchMode('match')
    setShowMatchBox(true)
    loadEntries()
  }

  // ── Save details ───────────────────────────────────────────────────────────
  function handleSaveDetails() {
    if (!receipt) return
    const cents = amount.trim() ? parseDollar(amount) : null
    startSave(async () => {
      const res = await updateReceiptDetails(receipt.id, projectId, {
        amountCents:  cents,
        merchantName: merchant.trim() || null,
        receiptDate:  date ? new Date(date) : null,
      })
      if (res.success) {
        setAddDesc(res.data.merchantName ?? addDesc)
        onUpdated(res.data)
      }
    })
  }

  // ── Add to actuals (ad-hoc entry) ──────────────────────────────────────────
  function handleAddToActuals() {
    if (!receipt || !addDesc.trim()) return
    startLink(async () => {
      // Persist details first if there's a pending amount
      const cents = amount.trim() ? parseDollar(amount) : null
      if (cents !== receipt.amountCents || merchant !== (receipt.merchantName ?? '') || date !== toInputDate(receipt.receiptDate)) {
        await updateReceiptDetails(receipt.id, projectId, {
          amountCents:  cents,
          merchantName: merchant.trim() || null,
          receiptDate:  date ? new Date(date) : null,
        })
      }
      const res = await createAdHocEntryFromReceipt(projectId, receipt.id, addDesc.trim())
      if (res.success) {
        onLinked(receipt.id, res.data.entryId, res.data.entryDescription)
        onClose()
      }
    })
  }

  // ── Match existing entry ───────────────────────────────────────────────────
  function handleMatchEntry(entry: ActualEntryForMatching) {
    if (!receipt) return
    startLink(async () => {
      const cents = amount.trim() ? parseDollar(amount) : null
      if (cents !== receipt.amountCents || merchant !== (receipt.merchantName ?? '') || date !== toInputDate(receipt.receiptDate)) {
        await updateReceiptDetails(receipt.id, projectId, {
          amountCents:  cents,
          merchantName: merchant.trim() || null,
          receiptDate:  date ? new Date(date) : null,
        })
      }
      const res = await linkReceiptToEntry(receipt.id, entry.id, projectId)
      if (res.success) {
        onLinked(receipt.id, entry.id, entry.description)
        onClose()
      }
    })
  }

  // ── Unlink ─────────────────────────────────────────────────────────────────
  function handleUnlink() {
    if (!receipt) return
    startLink(async () => {
      const res = await unlinkReceipt(receipt.id, projectId)
      if (res.success) {
        onUnlinked(receipt.id)
        onClose()
      }
    })
  }

  // ── Filtered entries ───────────────────────────────────────────────────────
  const filtered = entries.filter(e =>
    e.description.toLowerCase().includes(entrySearch.toLowerCase())
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  const isAttached = !!receipt?.actualEntryId
  const detailsDirty =
    receipt && (
      (amount.trim() ? parseDollar(amount) : null) !== receipt.amountCents ||
      (merchant.trim() || null) !== receipt.merchantName ||
      (date || null) !== toInputDate(receipt.receiptDate)
    )

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pr-10">
          <div className="flex items-center gap-2">
            <SheetTitle className="flex-1 truncate text-sm">
              {receipt?.fileName ?? 'Receipt'}
            </SheetTitle>
            {receipt && (
              <a
                href={receipt.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </SheetHeader>

        {receipt && (
          <div className="flex flex-col gap-6 px-6 py-4">

            {/* ── Preview ─────────────────────────────────────────────────── */}
            <ReceiptPreview receipt={receipt} />

            {/* ── Details form ────────────────────────────────────────────── */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Merchant</label>
                <input
                  type="text"
                  placeholder="Vendor name"
                  value={merchant}
                  onChange={e => { setMerchant(e.target.value); if (!addDesc) setAddDesc(e.target.value) }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
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

              {detailsDirty && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveDetails}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? 'Saving…' : 'Save details'}
                </Button>
              )}
            </section>

            {/* ── Actuals action ───────────────────────────────────────────── */}
            {isAttached ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attached to actuals</h3>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-foreground">Linked to an entry</span>
                  </div>
                  <button
                    onClick={handleUnlink}
                    disabled={linking}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Link2Off className="h-3 w-3" />
                    Unlink
                  </button>
                </div>
              </section>
            ) : (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add to actuals</h3>

                {/* Mode toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  <button
                    onClick={() => { setMatchMode('add'); setShowMatchBox(false) }}
                    className={`flex-1 py-2 font-medium transition-colors ${
                      matchMode === 'add'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Add new entry
                  </button>
                  <button
                    onClick={handleShowMatch}
                    className={`flex-1 py-2 font-medium transition-colors ${
                      matchMode === 'match'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Match existing
                  </button>
                </div>

                {/* Add new entry */}
                {matchMode === 'add' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Entry description</label>
                      <input
                        type="text"
                        placeholder={merchant || 'e.g. Transport, Catering…'}
                        value={addDesc}
                        onChange={e => setAddDesc(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {amount && (
                      <p className="text-xs text-muted-foreground">
                        Will add <strong className="text-foreground">${(parseDollar(amount) / 100).toFixed(2)}</strong> as an unplanned expense
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={handleAddToActuals}
                      disabled={linking || !addDesc.trim()}
                      className="w-full"
                    >
                      <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                      {linking ? 'Creating…' : 'Create entry in actuals'}
                    </Button>
                  </div>
                )}

                {/* Match existing */}
                {matchMode === 'match' && showMatchBox && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search entries…"
                        value={entrySearch}
                        onChange={e => setEntrySearch(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {!entriesLoaded ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
                    ) : filtered.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        {entries.length === 0 ? 'No actuals entries yet.' : 'No matches.'}
                      </p>
                    ) : (
                      <ul className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                        {filtered.map(entry => (
                          <li key={entry.id}>
                            <button
                              onClick={() => handleMatchEntry(entry)}
                              disabled={linking}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                            >
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{entry.description}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  ${formatCents(entry.actualCents)} actual
                                  {entry.receiptCount > 0 && ` · ${entry.receiptCount} receipt${entry.receiptCount !== 1 ? 's' : ''}`}
                                  {entry.isAdHoc && ' · unplanned'}
                                </p>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {amount && (
                      <p className="text-xs text-muted-foreground">
                        Attaching will update the entry total to include{' '}
                        <strong className="text-foreground">${(parseDollar(amount) / 100).toFixed(2)}</strong>
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
