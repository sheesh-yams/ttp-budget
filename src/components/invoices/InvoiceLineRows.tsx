'use client'

// Invoice line-item rows — the editable table shared by NewInvoiceModal (from a
// proposal) and NewStandaloneInvoiceModal (invoice-first). Rows hold display
// strings while typing; rowToLineItem turns them into cents for the server.

import { Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/money'
import type { InvoiceLineItem } from '@/types'

export const UNITS = ['FLAT', 'HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'EACH', 'MILE'] as const
export type Unit = typeof UNITS[number]

const UNIT_LABELS: Record<Unit, string> = {
  FLAT: 'Flat', HOUR: 'Hour', HALF_DAY: 'Half day',
  DAY: 'Day', WEEK: 'Week', EACH: 'Each', MILE: 'Mile',
}

export interface Row {
  id:          string
  description: string
  quantity:    string
  unit:        Unit
  rate:        string   // display dollars
  notes:       string
}

export function rowToCents(row: Row): number {
  const qty  = parseFloat(row.quantity) || 0
  const rate = Math.round((parseFloat(row.rate) || 0) * 100)
  return Math.round(qty * rate)
}

export function liToRow(li: InvoiceLineItem): Row {
  return {
    id:          li.id,
    description: li.description,
    quantity:    String(li.quantity),
    unit:        li.unit as Unit,
    rate:        (li.rateCents / 100).toFixed(2),
    notes:       (li as unknown as { notes?: string }).notes ?? '',
  }
}

export function blankRow(): Row {
  return { id: crypto.randomUUID(), description: '', quantity: '1', unit: 'FLAT', rate: '', notes: '' }
}

export function rowToLineItem(row: Row): InvoiceLineItem {
  const qty       = parseFloat(row.quantity) || 0
  const rateCents = Math.round((parseFloat(row.rate) || 0) * 100)
  return {
    id:             row.id,
    description:    row.description,
    quantity:       qty,
    unit:           row.unit,
    rateCents,
    lineTotalCents: Math.round(qty * rateCents),
    ...(row.notes ? { notes: row.notes } : {}),
  } as InvoiceLineItem
}

/**
 * The same checks the server makes, as one message (or null when fine).
 * `requireQuantity` — invoice-first lines become budget lines, so a zero
 * quantity is refused there; a proposal's itemised invoice may carry unused
 * (quantity 0) budget lines.
 */
export function rowsError(rows: Row[], opts: { requireQuantity?: boolean } = {}): string | null {
  if (rows.length === 0) return 'At least one line item is required'
  if (rows.some(r => !r.description.trim())) return 'All line items need a description.'
  if (opts.requireQuantity && rows.some(r => !((parseFloat(r.quantity) || 0) > 0))) return 'All line items need a quantity greater than zero.'
  if (rows.some(r => (parseFloat(r.rate) || 0) <= 0)) return 'All line items need a rate greater than zero.'
  return null
}

const GRID = { gridTemplateColumns: '1fr 60px 90px 100px 80px 24px' }

export function InvoiceLineRowsEditor({ rows, onChange, autoFocusFirst }: {
  rows:            Row[]
  onChange:        (rows: Row[]) => void
  autoFocusFirst?: boolean
}) {
  function update(idx: number, patch: Partial<Row>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="grid gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide" style={GRID}>
        <span>Description</span>
        <span>Qty</span>
        <span>Unit</span>
        <span className="text-right">Rate ($)</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {rows.map((row, idx) => (
        <div key={row.id}>
          <div className="grid gap-2 items-center" style={GRID}>
            <Input
              value={row.description}
              onChange={e => update(idx, { description: e.target.value })}
              placeholder="e.g. Deposit, Overtime…"
              className="h-7 text-xs"
              autoFocus={autoFocusFirst && idx === 0}
            />
            <Input
              type="number"
              min={0}
              step={0.5}
              value={row.quantity}
              onChange={e => update(idx, { quantity: e.target.value })}
              className="h-7 text-xs text-right"
            />
            <select
              value={row.unit}
              onChange={e => update(idx, { unit: e.target.value as Unit })}
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {UNITS.map(u => (
                <option key={u} value={u}>{UNIT_LABELS[u]}</option>
              ))}
            </select>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={row.rate}
              onChange={e => update(idx, { rate: e.target.value })}
              placeholder="0.00"
              className="h-7 text-xs text-right"
            />
            <div className="text-right text-xs font-medium tabular-nums text-foreground pr-1">
              {rowToCents(row) > 0 ? formatMoney(rowToCents(row)) : '—'}
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              disabled={rows.length === 1}
              className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {/* Per-item notes */}
          <input
            type="text"
            value={row.notes}
            onChange={e => update(idx, { notes: e.target.value })}
            placeholder={`Notes for "${row.description || 'item'}" (optional)`}
            className="mt-1 w-full h-6 rounded border border-input bg-background px-2 text-[11px] text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ))}
    </div>
  )
}
