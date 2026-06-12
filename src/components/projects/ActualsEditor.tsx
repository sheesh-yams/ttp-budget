'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ChevronRight, ChevronDown, TrendingUp, TrendingDown, BarChart3, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createActualSheet,
  updateActualEntry,
  addAdHocEntry,
  deleteAdHocEntry,
} from '@/server/actions/actuals'
import { formatMoney, lineTotal } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { ActualSheetFull, ActualEntryDb } from '@/server/actions/actuals'
import type { AccountWithItems } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  project:         { id: string; name: string }
  budget:          { id: string; name: string } | null
  phase:           { id: string; accounts: unknown[] } | null
  sheet:           ActualSheetFull | null
  budgetTotalCents: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDollar(s: string): number {
  const clean = s.replace(/[^0-9.]/g, '')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function displayDollar(cents: number): string {
  return (cents / 100).toFixed(2)
}

function VariancePill({ budgeted, actual }: { budgeted: number; actual: number }) {
  const diff = budgeted - actual
  if (actual === 0 && budgeted === 0) return <span className="text-muted-foreground tabular">—</span>
  if (diff === 0)   return <span className="text-muted-foreground tabular">—</span>
  const positive = diff > 0
  return (
    <span className={`inline-flex items-center gap-0.5 tabular text-xs font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive
        ? <TrendingUp className="h-3 w-3" />
        : <TrendingDown className="h-3 w-3" />
      }
      {positive ? '+' : ''}{formatMoney(diff)}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActualsEditor({ project, budget, phase, sheet, budgetTotalCents }: Props) {
  const router   = useRouter()
  const [creating, startCreate] = useTransition()

  // Local state: entryId → actualCents
  const [actuals, setActuals] = useState<Record<string, number>>(() =>
    sheet ? Object.fromEntries(sheet.entries.map(e => [e.id, e.actualCents])) : {}
  )
  // Local input strings (so the user can type freely before we parse)
  const [inputValues, setInputValues] = useState<Record<string, string>>(() =>
    sheet ? Object.fromEntries(sheet.entries.map(e => [e.id, displayDollar(e.actualCents)])) : {}
  )
  // Saving state per entry
  const [saving, setSaving] = useState<Set<string>>(new Set())
  // Ad-hoc entries: start from sheet, allow local additions/removals
  const [adHocEntries, setAdHocEntries] = useState<ActualEntryDb[]>(() =>
    sheet ? sheet.entries.filter(e => e.isAdHoc) : []
  )
  // Which account is showing the "add unplanned" form
  const [addingToAccount, setAddingToAccount] = useState<string | null>(null)
  const [adHocForm, setAdHocForm] = useState({ description: '', actual: '', date: '', status: 'PENDING' as 'PENDING' | 'APPROVED' })
  const [adHocSaving, startAdHocSave] = useTransition()

  if (!budget || !phase) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <p className="font-medium text-foreground">No budget yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Create a budget for this project first, then come back to track actuals.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/projects/${project.id}`)}>
          Go to project
        </Button>
      </div>
    )
  }

  // ── Empty state: no sheet yet ──────────────────────────────────────────────

  function handleCreateSheet() {
    startCreate(async () => {
      const result = await createActualSheet(project.id, budget!.id, phase!.id)
      if (result.success) {
        router.refresh()
      }
    })
  }

  if (!sheet) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <p className="font-medium text-foreground">No actuals tracked yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Start tracking real spend against your <strong>{budget.name}</strong> budget.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Budget total: {formatMoney(budgetTotalCents)}</p>
        <Button className="mt-4" onClick={handleCreateSheet} disabled={creating}>
          {creating ? 'Creating…' : 'Start tracking actuals'}
        </Button>
      </div>
    )
  }

  // ── Build lookup maps ─────────────────────────────────────────────────────

  // Map lineItemId → entry (for budget-linked rows)
  const entryByLineItem = new Map<string, ActualEntryDb>(
    sheet.entries.filter(e => !e.isAdHoc && e.lineItemId).map(e => [e.lineItemId!, e])
  )

  // Map accountId → ad-hoc entries for that account
  const adHocByAccount = adHocEntries.reduce<Record<string, ActualEntryDb[]>>((acc, e) => {
    if (!e.accountId) return acc
    acc[e.accountId] = acc[e.accountId] ?? []
    acc[e.accountId].push(e)
    return acc
  }, {})

  // ── Summary calculations ──────────────────────────────────────────────────

  const totalSpentCents = Object.values(actuals).reduce((sum, v) => sum + v, 0)
  const billedCents     = sheet.revenueOverrideCents ?? budgetTotalCents
  const profitCents     = billedCents - totalSpentCents
  const marginPct       = billedCents > 0 ? (profitCents / billedCents) * 100 : 0

  // ── Event handlers ────────────────────────────────────────────────────────

  function handleInputChange(entryId: string, value: string) {
    setInputValues(prev => ({ ...prev, [entryId]: value }))
    const cents = parseDollar(value)
    setActuals(prev => ({ ...prev, [entryId]: cents }))
  }

  function handleInputBlur(entryId: string) {
    const cents = parseDollar(inputValues[entryId] ?? '0')
    // Normalise display
    setInputValues(prev => ({ ...prev, [entryId]: displayDollar(cents) }))
    setActuals(prev => ({ ...prev, [entryId]: cents }))
    // Save
    setSaving(prev => new Set(prev).add(entryId))
    updateActualEntry(entryId, cents).then(() => {
      setSaving(prev => { const s = new Set(prev); s.delete(entryId); return s })
    })
  }

  function handleAddAdHoc(accountId: string) {
    if (!adHocForm.description.trim()) return
    const cents = parseDollar(adHocForm.actual)
    startAdHocSave(async () => {
      const result = await addAdHocEntry(sheet.id, project.id, {
        accountId,
        description: adHocForm.description.trim(),
        actualCents: cents,
        date: adHocForm.date ? new Date(adHocForm.date) : null,
        status: adHocForm.status,
      })
      if (result.success) {
        const entry = result.data
        setAdHocEntries(prev => [...prev, entry])
        setActuals(prev => ({ ...prev, [entry.id]: entry.actualCents }))
        setInputValues(prev => ({ ...prev, [entry.id]: displayDollar(entry.actualCents) }))
        setAdHocForm({ description: '', actual: '', date: '', status: 'PENDING' })
        setAddingToAccount(null)
      }
    })
  }

  function handleDeleteAdHoc(entryId: string) {
    setAdHocEntries(prev => prev.filter(e => e.id !== entryId))
    setActuals(prev => { const n = { ...prev }; delete n[entryId]; return n })
    setInputValues(prev => { const n = { ...prev }; delete n[entryId]; return n })
    deleteAdHocEntry(entryId, project.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const marginColor = marginPct >= 20 ? 'text-green-600' : marginPct >= 10 ? 'text-yellow-600' : marginPct >= 0 ? 'text-orange-500' : 'text-red-600'

  return (
    <div className="space-y-6">

      {/* ── Header with Wrap Report button ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Actuals Tracker</h2>
        <Link href={`/projects/${project.id}/actuals/wrap`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Wrap Report
          </Button>
        </Link>
      </div>

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Billed" value={formatMoney(billedCents)} sub="client agreed to pay" />
        <SummaryCard label="Spent" value={formatMoney(totalSpentCents)} sub="actual cost to date" />
        <SummaryCard
          label="Profit"
          value={formatMoney(Math.abs(profitCents))}
          sub={profitCents >= 0 ? 'gross profit' : 'over budget'}
          valueClass={profitCents >= 0 ? 'text-green-600' : 'text-red-500'}
        />
        <SummaryCard
          label="Margin"
          value={`${marginPct.toFixed(1)}%`}
          sub="of billed amount"
          valueClass={marginColor}
        />
      </div>

      {/* ── Column headers ─────────────────────────────────────────────────── */}
      <div className="hidden grid-cols-[1fr_120px_140px_110px] items-center gap-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Description</span>
        <span className="text-right">Budgeted</span>
        <span className="text-right">Actual</span>
        <span className="text-right">Variance</span>
      </div>

      {/* ── Account sections ───────────────────────────────────────────────── */}
      {(phase.accounts as unknown as AccountWithItems[]).map(account => (
        <AccountSection
          key={account.id}
          account={account}
          depth={0}
          entryByLineItem={entryByLineItem}
          adHocByAccount={adHocByAccount}
          actuals={actuals}
          inputValues={inputValues}
          saving={saving}
          addingToAccount={addingToAccount}
          adHocForm={adHocForm}
          adHocSaving={adHocSaving}
          onInputChange={handleInputChange}
          onInputBlur={handleInputBlur}
          onSetAddingToAccount={setAddingToAccount}
          onAdHocFormChange={setAdHocForm}
          onAddAdHoc={handleAddAdHoc}
          onDeleteAdHoc={handleDeleteAdHoc}
        />
      ))}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, valueClass = 'text-foreground',
}: {
  label: string; value: string; sub: string; valueClass?: string
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

// ─── AccountSection ───────────────────────────────────────────────────────────

interface AccountSectionProps {
  account:            AccountWithItems
  depth:              number
  entryByLineItem:    Map<string, ActualEntryDb>
  adHocByAccount:     Record<string, ActualEntryDb[]>
  actuals:            Record<string, number>
  inputValues:        Record<string, string>
  saving:             Set<string>
  addingToAccount:    string | null
  adHocForm:          { description: string; actual: string; date: string; status: 'PENDING' | 'APPROVED' }
  adHocSaving:        boolean
  onInputChange:      (id: string, val: string) => void
  onInputBlur:        (id: string) => void
  onSetAddingToAccount: (id: string | null) => void
  onAdHocFormChange:  (f: { description: string; actual: string; date: string; status: 'PENDING' | 'APPROVED' }) => void
  onAddAdHoc:         (accountId: string) => void
  onDeleteAdHoc:      (id: string) => void
}

function AccountSection({
  account, depth,
  entryByLineItem, adHocByAccount,
  actuals, inputValues, saving,
  addingToAccount, adHocForm, adHocSaving,
  onInputChange, onInputBlur,
  onSetAddingToAccount, onAdHocFormChange, onAddAdHoc, onDeleteAdHoc,
}: AccountSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  const budgetedCents = sumAccount(account as unknown as AccountInput)

  // All entries for this account (linked + ad-hoc)
  const linkedEntries  = account.lineItems.map(item => entryByLineItem.get(item.id)).filter((e): e is ActualEntryDb => !!e)
  const adHocEntries   = adHocByAccount[account.id] ?? []
  const allEntryIds    = [...linkedEntries, ...adHocEntries].map(e => e.id)
  const actualCents    = allEntryIds.reduce((sum, id) => sum + (actuals[id] ?? 0), 0)
  // Also include child accounts
  function childActualCents(acc: AccountWithItems): number {
    const own = (adHocByAccount[acc.id] ?? [])
      .concat(acc.lineItems.map(item => entryByLineItem.get(item.id)).filter((e): e is ActualEntryDb => !!e))
      .reduce((s, e) => s + (actuals[e.id] ?? 0), 0)
    return own + (acc.children ?? []).reduce((s, c) => s + childActualCents(c as AccountWithItems), 0)
  }
  const totalActualCents  = actualCents + (account.children ?? []).reduce((s, c) => s + childActualCents(c as AccountWithItems), 0)

  const indent = depth > 0 ? `ml-${depth * 4}` : ''

  return (
    <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${indent}`}>
      {/* Account header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsed
            ? <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          }
          <span className="font-medium text-foreground truncate">{account.name}</span>
          {account.code && <span className="text-xs text-muted-foreground">{account.code}</span>}
        </div>
        <div className="hidden items-center gap-6 sm:flex flex-shrink-0 ml-4">
          <span className="w-[120px] text-right text-sm tabular text-muted-foreground">{formatMoney(budgetedCents)}</span>
          <span className="w-[140px] text-right text-sm tabular font-medium">{formatMoney(totalActualCents)}</span>
          <span className="w-[110px] text-right">
            <VariancePill budgeted={budgetedCents} actual={totalActualCents} />
          </span>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t">
          {/* Line items */}
          {account.lineItems.map(item => {
            const entry       = entryByLineItem.get(item.id)
            const budgeted    = lineTotal(
              Number(item.quantity),
              item.rateCents,
              item.markupPct ? Number(item.markupPct) : null,
            )
            const entryId     = entry?.id
            const actualValue = entryId ? (actuals[entryId] ?? 0) : 0

            return (
              <LineRow
                key={item.id}
                description={item.description}
                budgetedCents={budgeted}
                entryId={entryId ?? null}
                inputValue={entryId ? (inputValues[entryId] ?? '0.00') : '—'}
                actualCents={actualValue}
                isSaving={!!entryId && saving.has(entryId)}
                isAdHoc={false}
                onInputChange={entryId ? (v => onInputChange(entryId, v)) : undefined}
                onInputBlur={entryId  ? (() => onInputBlur(entryId))    : undefined}
                onDelete={undefined}
              />
            )
          })}

          {/* Ad-hoc entries for this account */}
          {adHocEntries.map(entry => (
            <LineRow
              key={entry.id}
              description={entry.description}
              budgetedCents={null}
              entryId={entry.id}
              inputValue={inputValues[entry.id] ?? '0.00'}
              actualCents={actuals[entry.id] ?? 0}
              isSaving={saving.has(entry.id)}
              isAdHoc
              entryDate={entry.date}
              entryStatus={entry.status}
              onInputChange={v => onInputChange(entry.id, v)}
              onInputBlur={() => onInputBlur(entry.id)}
              onDelete={() => onDeleteAdHoc(entry.id)}
            />
          ))}

          {/* Inline add-row form */}
          {addingToAccount === account.id ? (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 bg-muted/20">
              <input
                autoFocus
                type="text"
                placeholder="Description"
                value={adHocForm.description}
                onChange={e => onAdHocFormChange({ ...adHocForm, description: e.target.value })}
                onKeyDown={e => e.key === 'Escape' && onSetAddingToAccount(null)}
                className="flex-1 min-w-[140px] rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="date"
                value={adHocForm.date}
                onChange={e => onAdHocFormChange({ ...adHocForm, date: e.target.value })}
                className="rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="relative flex-shrink-0 w-28">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input
                  type="text"
                  placeholder="0.00"
                  value={adHocForm.actual}
                  onChange={e => onAdHocFormChange({ ...adHocForm, actual: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onAddAdHoc(account.id)
                    if (e.key === 'Escape') onSetAddingToAccount(null)
                  }}
                  className="w-full rounded border border-border bg-background pl-5 pr-2 py-1 text-right text-sm tabular focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={() => onAdHocFormChange({ ...adHocForm, status: adHocForm.status === 'APPROVED' ? 'PENDING' : 'APPROVED' })}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  adHocForm.status === 'APPROVED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {adHocForm.status === 'APPROVED' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {adHocForm.status === 'APPROVED' ? 'Approved' : 'Pending'}
              </button>
              <Button
                size="sm"
                onClick={() => onAddAdHoc(account.id)}
                disabled={adHocSaving || !adHocForm.description.trim()}
              >
                {adHocSaving ? '…' : 'Add'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onSetAddingToAccount(null)}>Cancel</Button>
            </div>
          ) : (
            <div className="border-t px-4 py-2">
              <button
                onClick={() => {
                  onAdHocFormChange({ description: '', actual: '', date: '', status: 'PENDING' })
                  onSetAddingToAccount(account.id)
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add unplanned item
              </button>
            </div>
          )}

          {/* Child accounts (nested) */}
          {(account.children ?? []).length > 0 && (
            <div className="border-t space-y-0">
              {(account.children as AccountWithItems[]).map(child => (
                <div key={child.id} className="border-b last:border-b-0">
                  <AccountSection
                    account={child}
                    depth={depth + 1}
                    entryByLineItem={entryByLineItem}
                    adHocByAccount={adHocByAccount}
                    actuals={actuals}
                    inputValues={inputValues}
                    saving={saving}
                    addingToAccount={addingToAccount}
                    adHocForm={adHocForm}
                    adHocSaving={adHocSaving}
                    onInputChange={onInputChange}
                    onInputBlur={onInputBlur}
                    onSetAddingToAccount={onSetAddingToAccount}
                    onAdHocFormChange={onAdHocFormChange}
                    onAddAdHoc={onAddAdHoc}
                    onDeleteAdHoc={onDeleteAdHoc}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── LineRow ──────────────────────────────────────────────────────────────────

interface LineRowProps {
  description:    string
  budgetedCents:  number | null   // null = ad-hoc (no budget equivalent)
  entryId:        string | null
  inputValue:     string
  actualCents:    number
  isSaving:       boolean
  isAdHoc:        boolean
  entryDate?:     Date | null
  entryStatus?:   'PENDING' | 'APPROVED'
  onInputChange?: (val: string) => void
  onInputBlur?:   () => void
  onDelete?:      () => void
}

function LineRow({
  description, budgetedCents, entryId,
  inputValue, actualCents, isSaving,
  isAdHoc, entryDate, entryStatus,
  onInputChange, onInputBlur, onDelete,
}: LineRowProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2 hover:bg-muted/20 sm:grid-cols-[1fr_120px_140px_110px]">
      {/* Description */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {isAdHoc && (
            <span className="flex-shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
              Unplanned
            </span>
          )}
          {isAdHoc && entryStatus === 'APPROVED' && (
            <span className="flex-shrink-0 flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Approved
            </span>
          )}
          <span className="truncate text-sm text-foreground">{description}</span>
        </div>
        {isAdHoc && entryDate && (
          <span className="text-[11px] text-muted-foreground pl-0.5">
            {new Date(entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Budgeted */}
      <span className="hidden w-[120px] text-right text-sm tabular text-muted-foreground sm:block">
        {budgetedCents !== null ? formatMoney(budgetedCents) : '—'}
      </span>

      {/* Actual input */}
      <div className="flex w-full items-center justify-end sm:w-[140px]">
        {entryId && onInputChange && onInputBlur ? (
          <div className="relative w-32">
            {!focused && (
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={focused ? inputValue : (actualCents === 0 ? '' : inputValue)}
              placeholder={focused ? '' : '0.00'}
              onChange={e => onInputChange(e.target.value)}
              onFocus={() => {
                setFocused(true)
                setTimeout(() => inputRef.current?.select(), 0)
              }}
              onBlur={() => {
                setFocused(false)
                onInputBlur()
              }}
              className={`w-full rounded border bg-background py-1 text-right text-sm tabular transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
                isSaving ? 'border-border opacity-60' : 'border-border hover:border-ring/50'
              } ${focused ? 'px-2' : 'pl-5 pr-2'}`}
            />
            {isSaving && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
            )}
          </div>
        ) : (
          <span className="text-sm tabular text-muted-foreground">—</span>
        )}
      </div>

      {/* Variance + delete */}
      <div className="hidden w-[110px] items-center justify-end gap-1 sm:flex">
        {budgetedCents !== null ? (
          <VariancePill budgeted={budgetedCents} actual={actualCents} />
        ) : (
          <span className="text-xs text-red-500 tabular">
            {actualCents > 0 ? `-${formatMoney(actualCents)}` : '—'}
          </span>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-red-500 transition-colors"
            title="Remove row"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
