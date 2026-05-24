'use client'

import { useState, useTransition, useRef, useCallback, type DragEvent } from 'react'
import { Upload, FileJson, FileText, X, CheckCircle, AlertCircle, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button }    from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { importPayloadSchema, formatZodError, parseFileText, CSV_TEMPLATE, type ImportPayload } from '@/lib/importSchema'
import { importToBudget, importToTemplate } from '@/server/actions/import'
import { formatMoney, lineTotal } from '@/lib/money'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportTarget =
  | { type: 'budget';   budgetId: string;   projectId: string }
  | { type: 'template'; templateId: string }

interface Props {
  open:         boolean
  onOpenChange: (v: boolean) => void
  target:       ImportTarget
  onImported:   () => void
}

type Step = 'idle' | 'preview' | 'importing' | 'success' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByAccount(rows: ImportPayload): Map<string, ImportPayload> {
  const map = new Map<string, ImportPayload>()
  for (const row of rows) {
    const existing = map.get(row.accountName)
    if (existing) existing.push(row)
    else map.set(row.accountName, [row])
  }
  return map
}

function accountTotal(rows: ImportPayload): number {
  return rows.reduce(
    (sum, r) => sum + lineTotal(r.qty, r.rateCents, r.markupPct ?? null),
    0
  )
}

function downloadCSVTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'ttp-budget-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Preview table ────────────────────────────────────────────────────────────

function PreviewTable({ rows }: { rows: ImportPayload }) {
  const groups       = groupByAccount(rows)
  const grandTotal   = accountTotal(rows)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.keys()))

  const toggle = (name: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  return (
    <div className="rounded-lg border border-border overflow-hidden text-sm">
      {/* Header */}
      <div className="grid grid-cols-[1fr_60px_80px_90px_90px] bg-muted/50 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Total</span>
      </div>

      {Array.from(groups.entries()).map(([accountName, items]) => {
        const isOpen   = expanded.has(accountName)
        const accTotal = accountTotal(items)
        return (
          <div key={accountName} className="border-b border-border last:border-0">
            {/* Account header row */}
            <button
              type="button"
              onClick={() => toggle(accountName)}
              className="w-full grid grid-cols-[1fr_60px_80px_90px_90px] items-center px-3 py-2 bg-secondary/40 hover:bg-secondary/70 transition-colors text-left"
            >
              <span className="flex items-center gap-1.5 font-semibold text-foreground text-[12px]">
                {isOpen
                  ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                }
                {accountName}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  {items.length} item{items.length !== 1 ? 's' : ''}
                </span>
              </span>
              <span />
              <span />
              <span />
              <span className="text-right font-semibold tabular-nums text-[12px]">
                {formatMoney(accTotal)}
              </span>
            </button>

            {/* Line items */}
            {isOpen && items.map((item, i) => {
              const total = lineTotal(item.qty, item.rateCents, item.markupPct ?? null)
              const unitLabel = item.unit.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_60px_80px_90px_90px] items-center px-3 py-1.5 border-t border-border/40 hover:bg-muted/20"
                >
                  <span className="text-foreground/85 pl-5">
                    {item.description}
                    {item.notes && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">({item.notes})</span>
                    )}
                    {item.taxRate && (
                      <span className="ml-1.5 text-[10px] text-amber-600">+{(item.taxRate * 100).toFixed(1)}% tax</span>
                    )}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">{item.qty}</span>
                  <span className="text-right text-[11px] text-muted-foreground uppercase">{unitLabel}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{formatMoney(item.rateCents)}</span>
                  <span className="text-right tabular-nums font-medium">{formatMoney(total)}</span>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Grand total footer */}
      <div className="grid grid-cols-[1fr_60px_80px_90px_90px] items-center px-3 py-2.5 bg-primary/5 border-t border-border">
        <span className="font-semibold text-foreground text-[12px]">
          {rows.length} line item{rows.length !== 1 ? 's' : ''}
          {' · '}{groups.size} account{groups.size !== 1 ? 's' : ''}
        </span>
        <span /><span /><span />
        <span className="text-right font-bold tabular-nums text-[13px]" style={{ color: '#5D00A4' }}>
          {formatMoney(grandTotal)}
        </span>
      </div>
    </div>
  )
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={e  => { e.preventDefault(); setIsDragOver(true)  }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 cursor-pointer transition-all ${
        isDragOver
          ? 'border-violet-400 bg-violet-50'
          : 'border-border/60 hover:border-violet-300 hover:bg-muted/40'
      }`}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
        isDragOver ? 'bg-violet-100' : 'bg-muted'
      }`}>
        <Upload className={`h-6 w-6 transition-colors ${isDragOver ? 'text-violet-600' : 'text-muted-foreground'}`} />
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          Drop your file here, or <span className="text-violet-600">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Accepts <span className="font-mono">.json</span> or <span className="font-mono">.csv</span>
        </p>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
        <FileJson className="h-3.5 w-3.5" />
        <span>JSON array</span>
        <span className="mx-1">·</span>
        <FileText className="h-3.5 w-3.5" />
        <span>CSV with header row</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BulkImportModal({ open, onOpenChange, target, onImported }: Props) {
  const [step, setStep]       = useState<Step>('idle')
  const [rows, setRows]       = useState<ImportPayload | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [result, setResult]   = useState<{ accountsCreated: number; accountsReused: number; itemsCreated: number } | null>(null)
  const [filename, setFilename] = useState('')
  const [, startTransition]   = useTransition()

  function reset() {
    setStep('idle')
    setRows(null)
    setParseError(null)
    setImportError(null)
    setResult(null)
    setFilename('')
  }

  function handleClose(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  // ── File received → parse + validate ────────────────────────────────────────
  async function handleFile(file: File) {
    setParseError(null)
    setFilename(file.name)
    const text = await file.text()
    let raw: unknown[]
    try {
      raw = parseFileText(text, file.name)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file')
      return
    }

    const result = importPayloadSchema.safeParse(raw)
    if (!result.success) {
      setParseError(formatZodError(result.error))
      return
    }
    setRows(result.data)
    setStep('preview')
  }

  // ── Confirm import ───────────────────────────────────────────────────────────
  function handleImport() {
    if (!rows) return
    setStep('importing')

    startTransition(async () => {
      let res
      if (target.type === 'budget') {
        res = await importToBudget(target.budgetId, rows)
      } else {
        res = await importToTemplate(target.templateId, rows)
      }

      if (res.success) {
        setResult(res.data)
        setStep('success')
        onImported()
      } else {
        setImportError(res.error)
        setStep('error')
      }
    })
  }

  const targetLabel = target.type === 'budget' ? 'budget' : 'template'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-violet-600" />
            Bulk import — {targetLabel}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step: idle ── */}
        {step === 'idle' && (
          <div className="flex-1 space-y-4 py-2">
            <DropZone onFile={handleFile} />

            {parseError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Parse error</p>
                  <p className="text-xs mt-0.5 text-red-600">{parseError}</p>
                </div>
                <button onClick={() => setParseError(null)} className="ml-auto">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* CSV format hint + download template */}
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-[12px]">Expected columns</p>
              <p>
                <span className="font-mono text-[10px] bg-muted rounded px-1 py-0.5">accountName</span>
                {' · '}
                <span className="font-mono text-[10px] bg-muted rounded px-1 py-0.5">description</span>
                {' · '}
                <span className="font-mono text-[10px] bg-muted rounded px-1 py-0.5">qty</span>
                {' · '}
                <span className="font-mono text-[10px] bg-muted rounded px-1 py-0.5">unit</span>
                {' · '}
                <span className="font-mono text-[10px] bg-muted rounded px-1 py-0.5">rateCents</span>
                <span className="ml-1 text-muted-foreground/60">(optional: markupPct · hasMarkup · taxRate · notes)</span>
              </p>
              <p>
                <span className="text-violet-600 font-medium">rateCents</span> is in cents — $1,500 → <span className="font-mono">150000</span>.
                {' '}
                <span className="text-violet-600 font-medium">markupPct/taxRate</span> are decimals — 10% → <span className="font-mono">0.10</span>.
              </p>
              <button
                onClick={downloadCSVTemplate}
                className="flex items-center gap-1.5 text-violet-600 hover:text-violet-700 font-medium mt-1"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV template
              </button>
            </div>
          </div>
        )}

        {/* ── Step: preview ── */}
        {step === 'preview' && rows && (
          <div className="flex-1 flex flex-col gap-4 min-h-0 py-2">
            {/* File badge */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{filename}</span>
                <button
                  onClick={reset}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ready to import into{' '}
                <span className="font-medium text-foreground">
                  {target.type === 'budget' ? 'budget' : 'template'}
                </span>
                . Review below.
              </p>
            </div>

            <ScrollArea className="flex-1 max-h-[420px] rounded-lg">
              <PreviewTable rows={rows} />
            </ScrollArea>
          </div>
        )}

        {/* ── Step: importing ── */}
        {step === 'importing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
            <div className="h-10 w-10 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" />
            <p className="text-sm text-muted-foreground">Importing line items…</p>
          </div>
        )}

        {/* ── Step: success ── */}
        {step === 'success' && result && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Import complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.itemsCreated} line item{result.itemsCreated !== 1 ? 's' : ''} added
                {result.accountsCreated > 0 && (
                  <> across <strong>{result.accountsCreated}</strong> new account{result.accountsCreated !== 1 ? 's' : ''}</>
                )}
                {result.accountsReused > 0 && (
                  <> ({result.accountsReused} existing account{result.accountsReused !== 1 ? 's' : ''} extended)</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Step: error ── */}
        {step === 'error' && importError && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="text-center max-w-sm">
              <p className="font-semibold text-foreground">Import failed</p>
              <p className="mt-1 text-sm text-red-600">{importError}</p>
            </div>
          </div>
        )}

        {/* ── Footer buttons ── */}
        <DialogFooter className="border-t border-border pt-4 mt-0">
          {step === 'idle' && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={reset}>Change file</Button>
              <Button onClick={handleImport} style={{ background: '#5D00A4' }} className="text-white hover:opacity-90">
                Import {rows!.length} line item{rows!.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'importing' && (
            <Button variant="outline" disabled>Importing…</Button>
          )}
          {step === 'success' && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
          {step === 'error' && (
            <>
              <Button variant="outline" onClick={reset}>Try again</Button>
              <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
