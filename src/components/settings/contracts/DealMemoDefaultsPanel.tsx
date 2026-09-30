'use client'

import { useState, useTransition } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateDealMemoDefaults } from '@/server/actions/deal-memos'
import { centsToRate, rateToCents } from '@/lib/money'
import { FEE_UNITS, type DealMemoDefaults, type DefaultFeeRow } from '@/lib/deal-memo-defaults'

const UNIT_LABELS: Record<(typeof FEE_UNITS)[number], string> = {
  DAY: 'per day', HOUR: 'per hour', HALF_DAY: 'per half day', WEEK: 'per week',
  FLAT: 'total', EACH: 'each', MILE: 'per mile',
}

const KIND_LABELS: Record<DefaultFeeRow['kind'], string> = {
  DAY_RATE: 'Day rate', OVERTIME: 'Overtime', KIT: 'Kit', PER_DIEM: 'Per diem',
  MILEAGE: 'Mileage', CUSTOM: 'Custom',
}

function toDollars(cents: number | null): string {
  return cents == null ? '' : centsToRate(cents)
}

function toCentsOrNull(dollars: string): number | null {
  return dollars.trim() === '' ? null : rateToCents(dollars)
}

export function DealMemoDefaultsPanel({ initial }: { initial: DealMemoDefaults }) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workDayHours, setWorkDayHours]   = useState<10 | 12>(initial.workDayHours)
  const [otMultiplier, setOtMultiplier]   = useState(String(initial.otMultiplier))
  const [dtAfter, setDtAfter]             = useState(String(initial.doubleTimeAfterHours))
  const [dtMultiplier, setDtMultiplier]   = useState(String(initial.doubleTimeMultiplier))
  const [zoneMiles, setZoneMiles]         = useState(String(initial.productionZoneMiles))
  const [perDiem, setPerDiem]             = useState(toDollars(initial.perDiemCents))
  const [mileageRate, setMileageRate]     = useState(toDollars(initial.mileageRateCents))
  const [fees, setFees]                   = useState<DefaultFeeRow[]>(initial.fees)

  function updateFee(i: number, patch: Partial<DefaultFeeRow>) {
    setFees(prev => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  function handleSave() {
    setError(null)
    const input: DealMemoDefaults = {
      workDayHours,
      otMultiplier:         Number(otMultiplier),
      doubleTimeAfterHours: Number(dtAfter),
      doubleTimeMultiplier: Number(dtMultiplier),
      productionZoneMiles:  Number(zoneMiles),
      perDiemCents:         toCentsOrNull(perDiem),
      mileageRateCents:     toCentsOrNull(mileageRate),
      fees:                 fees.filter(f => f.label.trim()),
    }
    startTransition(async () => {
      const res = await updateDealMemoDefaults(input)
      if (!res.success) {
        setError((res as { success: false; error: string }).error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <section className="mb-10 rounded-xl border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Deal memo defaults</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prefilled on every new deal memo. Each memo can still override them.
        </p>
      </div>

      {/* Work day + overtime */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Work day</Label>
          <div className="flex gap-1">
            {([10, 12] as const).map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setWorkDayHours(h)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  workDayHours === h
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-input text-muted-foreground hover:bg-muted/60'
                }`}
              >
                {h}-hour
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dm-ot">Overtime multiplier</Label>
          <Input id="dm-ot" type="number" step="0.1" min="1" value={otMultiplier} onChange={e => setOtMultiplier(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dm-dt-after">Double time after (hrs)</Label>
          <Input id="dm-dt-after" type="number" step="1" min="1" value={dtAfter} onChange={e => setDtAfter(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dm-dt">Double time multiplier</Label>
          <Input id="dm-dt" type="number" step="0.1" min="1" value={dtMultiplier} onChange={e => setDtMultiplier(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dm-zone">Production zone (miles)</Label>
          <Input id="dm-zone" type="number" step="1" min="0" value={zoneMiles} onChange={e => setZoneMiles(e.target.value)} />
        </div>
      </div>

      {/* Money defaults */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="dm-perdiem">Default per diem ($/day)</Label>
          <Input id="dm-perdiem" inputMode="decimal" placeholder="None" value={perDiem} onChange={e => setPerDiem(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dm-mileage">Default mileage ($/mile)</Label>
          <Input id="dm-mileage" inputMode="decimal" placeholder="None" value={mileageRate} onChange={e => setMileageRate(e.target.value)} />
        </div>
      </div>

      {/* Default fee rows */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <Label>Default fee rows</Label>
          <button
            type="button"
            onClick={() => setFees(prev => [...prev, { kind: 'CUSTOM', label: '', unit: 'FLAT', termsText: '' }])}
            className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Terms text supports <code>{'{{dealMemo.workDayHours}}'}</code>,{' '}
          <code>{'{{dealMemo.otMultiplier}}'}</code>, <code>{'{{dealMemo.doubleTimeAfterHours}}'}</code>,{' '}
          <code>{'{{dealMemo.doubleTimeMultiplier}}'}</code> and <code>{'{{dealMemo.productionZoneMiles}}'}</code>.
        </p>
        <div className="space-y-2">
          {fees.map((f, i) => (
            <div key={i} className="group/fee grid grid-cols-[90px_1fr_120px_1.6fr_24px] items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {KIND_LABELS[f.kind]}
              </span>
              <Input value={f.label} placeholder="Fee name" onChange={e => updateFee(i, { label: e.target.value })} />
              <select
                value={f.unit}
                onChange={e => updateFee(i, { unit: e.target.value as DefaultFeeRow['unit'] })}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {FEE_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
              </select>
              <Input value={f.termsText} placeholder="Details & terms" onChange={e => updateFee(i, { termsText: e.target.value })} />
              <button
                type="button"
                title="Remove row"
                onClick={() => setFees(prev => prev.filter((_, idx) => idx !== i))}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/fee:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save defaults'}
        </Button>
      </div>
    </section>
  )
}
