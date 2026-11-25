'use client'

// "Add from actuals" — pick items from the project's Actuals onto an invoice,
// at a price you set (starts at what it cost; type a price or a +% markup).
// Nothing is added automatically. Each becomes an extra line: billed on top of
// the budget, never carrying the agency fee. Shared by the New invoice,
// invoice-first and Edit invoice windows.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ListPlus, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/money'
import { getInvoiceableActuals } from '@/server/actions/invoices'
import type { InvoiceableActual, InvoiceableGroup } from '@/lib/invoice-lines'
import { actualRow, type Row } from './InvoiceLineRows'

const GROUP_LABEL: Record<InvoiceableGroup, { title: string; hint: string }> = {
  unplanned: { title: 'Unplanned', hint: 'Not in the budget' },
  over:      { title: 'Over budget', hint: 'Only the part over its budget line' },
  budgeted:  { title: 'Already in the budget', hint: 'Billing these again charges the client twice' },
}

interface Pick { on: boolean; charge: string; markup: string }

/** "Add from actuals" link + window. `existing` = rows already on the invoice (to flag repeats). */
export function AddFromActualsButton({ projectId, existing, onAdd }: {
  projectId: string
  existing:  Row[]
  onAdd:     (rows: Row[]) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ListPlus className="h-3 w-3" /> Add from actuals
      </button>
      {open && <AddFromActualsDialog projectId={projectId} existing={existing} onClose={() => setOpen(false)} onAdd={rows => { onAdd(rows); setOpen(false) }} />}
    </>
  )
}

function AddFromActualsDialog({ projectId, existing, onClose, onAdd }: {
  projectId: string
  existing:  Row[]
  onClose:   () => void
  onAdd:     (rows: Row[]) => void
}) {
  const [items, setItems]       = useState<InvoiceableActual[] | null>(null)
  const [showMargin, setMargin] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [picks, setPicks]       = useState<Record<string, Pick>>({})

  // Already on this invoice (not saved yet, or saved) — don't offer twice.
  const onThis = useMemo(() => new Set(existing.flatMap(r =>
    r.source?.actualEntryId ? [r.source.actualPart === 'overage' ? `${r.source.actualEntryId}:overage` : r.source.actualEntryId] : [])), [existing])

  useEffect(() => {
    getInvoiceableActuals(projectId).then(res => {
      if (!res.success) {
        const e = (res as { success: false; error: string }).error
        setError(e === 'UNAUTHORIZED_ROLE' ? 'You need access to this project’s Actuals to bill items from it.' : e)
        return
      }
      setItems(res.data.items)
      setMargin(res.data.showMargin)
      // Pre-tick only unplanned items not billed anywhere yet.
      setPicks(Object.fromEntries(res.data.items.map(i => [i.key, {
        on: i.group === 'unplanned' && !i.looksLike && !i.fromDealMemo && i.invoicedOn.length === 0,
        charge: (i.costCents / 100).toFixed(2), markup: '',
      }])))
    }).catch(() => setError('Couldn’t load the actuals'))
  }, [projectId])

  const chargeCents = (key: string) => Math.max(0, Math.round((parseFloat(picks[key]?.charge ?? '') || 0) * 100))
  const chosen = (items ?? []).filter(i => picks[i.key]?.on && !onThis.has(i.key))
  const totalCents = chosen.reduce((s, i) => s + chargeCents(i.key), 0)
  const costTotal  = chosen.reduce((s, i) => s + i.costCents, 0)

  function patch(key: string, p: Partial<Pick>) {
    setPicks(prev => ({ ...prev, [key]: { ...prev[key], ...p } }))
  }

  function setMarkup(item: InvoiceableActual, text: string) {
    const pct = parseFloat(text)
    patch(item.key, {
      markup: text,
      ...(Number.isFinite(pct) ? { charge: (Math.round(item.costCents * (1 + pct / 100)) / 100).toFixed(2) } : {}),
    })
  }

  function add() {
    if (chosen.some(i => chargeCents(i.key) <= 0)) { setError('Every ticked item needs a charge above $0.'); return }
    onAdd(chosen.map(i => actualRow(i, chargeCents(i.key), showMargin)))
  }

  const groups: InvoiceableGroup[] = ['unplanned', 'over', 'budgeted']

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>Add from actuals</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Each item is billed on top of the budget at the charge you set — no agency fee is added.
            {showMargin ? ' Cost and margin are only shown to you, never on the invoice.' : ''}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!items && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading actuals…</p>}
          {items && items.length === 0 && <p className="text-sm text-muted-foreground">Nothing with a cost in this project’s actuals yet.</p>}

          {items && groups.map(g => {
            const list = items.filter(i => i.group === g)
            if (!list.length) return null
            return (
              <section key={g}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{GROUP_LABEL[g].title}</h3>
                  <span className="text-xs text-muted-foreground">{GROUP_LABEL[g].hint}</span>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {list.map(i => {
                    const p = picks[i.key]
                    const here = onThis.has(i.key)
                    const charge = chargeCents(i.key)
                    return (
                      <div key={i.key} className={`flex items-start gap-3 px-3 py-2 ${g === 'budgeted' ? 'bg-muted/30' : ''}`}>
                        <input
                          type="checkbox" className="mt-1 h-4 w-4 accent-primary"
                          checked={!!p?.on && !here} disabled={here}
                          onChange={e => patch(i.key, { on: e.target.checked })}
                          aria-label={`Add ${i.description}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">{i.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {g === 'over'
                              ? <>Spent {formatMoney(i.actualCents)} · budgeted {formatMoney(i.budgetedCents ?? 0)} · over by {formatMoney(i.costCents)}</>
                              : <>Cost {formatMoney(i.costCents)}</>}
                          </p>
                          {i.looksLike && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Looks like budget line “{i.looksLike}” — it may already be billed.
                            </p>
                          )}
                          {!i.looksLike && i.fromDealMemo && i.group === 'unplanned' && (
                            <p className="mt-0.5 text-xs text-muted-foreground">Crew fee from a deal memo — check it isn’t already covered by a budget line.</p>
                          )}
                          {here && <p className="mt-0.5 text-xs text-muted-foreground">Already on this invoice.</p>}
                          {!here && i.invoicedOn.length > 0 && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Already invoiced on {i.invoicedOn.map(x => `${x.number} (${x.status.toLowerCase()})`).join(', ')}.
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <label className="text-[11px] text-muted-foreground">
                            <span className="block">+%</span>
                            <Input
                              value={p?.markup ?? ''} onChange={e => setMarkup(i, e.target.value)}
                              inputMode="decimal" placeholder="0" className="h-7 w-14 text-xs text-right" disabled={here}
                            />
                          </label>
                          <label className="text-[11px] text-muted-foreground">
                            <span className="block">Charge ($)</span>
                            <Input
                              value={p?.charge ?? ''} onChange={e => patch(i.key, { charge: e.target.value, markup: '' })}
                              inputMode="decimal" className="h-7 w-24 text-xs text-right" disabled={here}
                            />
                          </label>
                          {showMargin && (
                            <div className="w-20 pt-4 text-right text-xs tabular-nums">
                              <span className={charge - i.costCents < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                                {charge - i.costCents >= 0 ? '+' : '−'}{formatMoney(Math.abs(charge - i.costCents))}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-3 shrink-0">
          <p className="text-xs text-muted-foreground">
            {chosen.length} item{chosen.length === 1 ? '' : 's'} · {formatMoney(totalCents)}
            {showMargin && chosen.length > 0 && <> · margin {formatMoney(totalCents - costTotal)}</>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={add} disabled={chosen.length === 0}>Add {chosen.length || ''} to invoice</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
