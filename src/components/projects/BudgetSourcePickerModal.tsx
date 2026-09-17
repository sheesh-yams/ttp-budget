'use client'

/**
 * BudgetSourcePickerModal
 *
 * Shared "start a budget from something" picker, used from two places:
 *   NEW_BUDGET mode — budget page empty state (no budget yet on this project)
 *   NEW_PHASE  mode — budget editor's "Add phase from another project"
 *
 * NEW_BUDGET shows two tabs: Templates (unchanged materialiseTemplate path,
 * via createBudget) and Past budgets (the new clone flow). NEW_PHASE shows
 * only Past budgets — there's no existing action that materializes a FULL
 * template as a new phase inside an already-existing budget, and building
 * one is out of scope here.
 *
 * Past budgets: pick a row -> preview (structure + rate diff) -> confirm ->
 * cloneBudget(). Templates: pick one -> createBudget() immediately, no preview
 * (matches the existing NewProjectModal behavior exactly).
 */

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import {
  listCloneableBudgets, getBudgetClonePreview, cloneBudget, createBudget,
  type CloneableBudget, type ClonePreview,
} from '@/server/actions/budgets'
import type { BudgetTemplate } from '@prisma/client'
import { Search, ArrowLeft, Loader2, AlertTriangle, ChevronRight } from 'lucide-react'

// ─── Shared labels ────────────────────────────────────────────────────────────

const SHOOT_TYPE_LABELS: Record<string, string> = {
  MUSIC_VIDEO: 'Music Video', BRAND_CAMPAIGN: 'Brand Campaign', PRODUCT_SHOOT: 'Product Shoot',
  EVENT_RECAP: 'Event Recap', SOCIAL_CONTENT: 'Social Content', INFLUENCER: 'Influencer',
  DOCUMENTARY: 'Documentary', OTHER: 'Other',
}

const STATUS_PILL: Record<string, { label: string; variant: 'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'overdue' }> = {
  DRAFT:           { label: 'Draft',           variant: 'draft' },
  SENT:            { label: 'Sent',             variant: 'sent' },
  VIEWED:          { label: 'Viewed',           variant: 'viewed' },
  CHANGES_NEEDED:  { label: 'Changes needed',   variant: 'sent' },
  APPROVED:        { label: 'Won',              variant: 'approved' },
  DECLINED:        { label: 'Declined',         variant: 'declined' },
  EXPIRED:         { label: 'Expired',          variant: 'overdue' },
  LOST:            { label: 'Lost',             variant: 'declined' },
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Props ────────────────────────────────────────────────────────────────────

type TargetProp =
  | { mode: 'NEW_BUDGET'; projectId: string }
  | { mode: 'NEW_PHASE'; budgetId: string; sourceExcludeBudgetId?: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Only used in NEW_BUDGET mode — NEW_PHASE mode never shows the Templates tab. */
  templates?: Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
  target: TargetProp
  onDone: (budgetId: string, phaseId?: string) => void
}

type SortKey = 'recent' | 'total' | 'lineItems'

// ─── Component ────────────────────────────────────────────────────────────────

export function BudgetSourcePickerModal({ open, onOpenChange, templates = [], target, onDone }: Props) {
  const [step, setStep] = useState<'source' | 'preview'>('source')
  const [tab, setTab]   = useState<'templates' | 'past'>(target.mode === 'NEW_BUDGET' ? 'templates' : 'past')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Past-budgets list
  const [budgets, setBudgets]         = useState<CloneableBudget[] | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [search, setSearch]           = useState('')
  const [typeFilter, setTypeFilter]   = useState<Set<string>>(new Set())
  const [wonOnly, setWonOnly]         = useState(false)
  const [sort, setSort]               = useState<SortKey>('recent')

  // Preview
  const [selectedBudget, setSelectedBudget]   = useState<CloneableBudget | null>(null)
  const [preview, setPreview]                 = useState<ClonePreview | null>(null)
  const [loadingPreview, setLoadingPreview]   = useState(false)
  const [rateMode, setRateMode]               = useState<'REFRESH' | 'PRESERVE'>('REFRESH')
  const [nameInput, setNameInput]             = useState('')

  // Reset on open
  useEffect(() => {
    if (!open) return
    setStep('source')
    setTab(target.mode === 'NEW_BUDGET' ? 'templates' : 'past')
    setError('')
    setSearch(''); setTypeFilter(new Set()); setWonOnly(false); setSort('recent')
    setSelectedBudget(null); setPreview(null); setRateMode('REFRESH'); setNameInput('')
    setBudgets(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Fetch the list once, when the Past-budgets tab is first visible
  useEffect(() => {
    if (!open) return
    if (target.mode === 'NEW_BUDGET' && tab !== 'past') return
    if (budgets !== null || loadingList) return
    setLoadingList(true)
    listCloneableBudgets().then(res => {
      setLoadingList(false)
      if (res.success) setBudgets(res.data)
      else setError((res as { success: false; error: string }).error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  const availableTypes = useMemo(
    () => [...new Set((budgets ?? []).map(b => b.projectType).filter((t): t is string => !!t))],
    [budgets]
  )

  const filtered = useMemo(() => {
    if (!budgets) return []
    let list = budgets
    if (target.mode === 'NEW_PHASE' && target.sourceExcludeBudgetId) {
      list = list.filter(b => b.budgetId !== target.sourceExcludeBudgetId)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(b => b.projectName.toLowerCase().includes(q) || b.clientName.toLowerCase().includes(q))
    }
    if (typeFilter.size > 0) list = list.filter(b => b.projectType && typeFilter.has(b.projectType))
    if (wonOnly) list = list.filter(b => b.proposalStatus === 'APPROVED')

    const sorted = [...list]
    if (sort === 'recent')        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    else if (sort === 'total')    sorted.sort((a, b) => b.grandTotalCents - a.grandTotalCents)
    else                          sorted.sort((a, b) => b.lineItemCount - a.lineItemCount)
    return sorted
  }, [budgets, search, typeFilter, wonOnly, sort, target])

  function toggleType(t: string) {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  function handleSelectTemplate(templateId: string) {
    if (target.mode !== 'NEW_BUDGET') return
    setError('')
    startTransition(async () => {
      const result = await createBudget(target.projectId, templateId === '__blank__' ? undefined : templateId)
      if (result.success) onDone(result.data.id)
      else setError((result as { success: false; error: string }).error)
    })
  }

  function handleSelectBudget(b: CloneableBudget) {
    setSelectedBudget(b)
    setNameInput(`${b.budgetName} (from ${b.projectName})`)
    setLoadingPreview(true)
    setError('')
    getBudgetClonePreview(b.budgetId).then(res => {
      setLoadingPreview(false)
      if (res.success) { setPreview(res.data); setStep('preview') }
      else setError((res as { success: false; error: string }).error)
    })
  }

  function handleBack() {
    setStep('source')
    setSelectedBudget(null)
    setPreview(null)
    setError('')
  }

  function handleConfirm() {
    if (!selectedBudget || !preview) return
    if (!nameInput.trim()) { setError('A name is required'); return }
    setError('')
    startTransition(async () => {
      const result = await cloneBudget({
        sourceBudgetId: selectedBudget.budgetId,
        sourcePhaseId:  preview.phaseId,
        target: target.mode === 'NEW_BUDGET'
          ? { mode: 'NEW_BUDGET', projectId: target.projectId, budgetName: nameInput.trim() }
          : { mode: 'NEW_PHASE', budgetId: target.budgetId, phaseName: nameInput.trim() },
        rateMode,
      })
      if (result.success) onDone(result.data.budgetId, result.data.phaseId)
      else setError((result as { success: false; error: string }).error)
    })
  }

  const showTabs = target.mode === 'NEW_BUDGET'

  return (
    <Dialog open={open} onOpenChange={v => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>
            {step === 'preview'
              ? (target.mode === 'NEW_BUDGET' ? 'Review before cloning' : 'Review before adding phase')
              : (target.mode === 'NEW_BUDGET' ? 'Start a new budget' : 'Add phase from another project')}
          </DialogTitle>
        </DialogHeader>

        {step === 'source' && showTabs && (
          <div className="px-6 pt-4 shrink-0">
            <Tabs value={tab} onValueChange={v => setTab(v as 'templates' | 'past')}>
              <TabsList>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="past">Past budgets</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'source' && tab === 'templates' && showTabs && (
            <TemplatesTab templates={templates} pending={pending} onSelect={handleSelectTemplate} />
          )}

          {step === 'source' && (!showTabs || tab === 'past') && (
            <PastBudgetsTab
              loading={loadingList}
              budgets={filtered}
              search={search} onSearch={setSearch}
              availableTypes={availableTypes}
              typeFilter={typeFilter} onToggleType={toggleType}
              wonOnly={wonOnly} onWonOnly={setWonOnly}
              sort={sort} onSort={setSort}
              onSelect={handleSelectBudget}
              loadingPreviewFor={loadingPreview ? selectedBudget?.budgetId ?? null : null}
            />
          )}

          {step === 'preview' && preview && selectedBudget && (
            <PreviewStep
              preview={preview}
              sourceBudget={selectedBudget}
              targetMode={target.mode}
              nameInput={nameInput} onNameInput={setNameInput}
              rateMode={rateMode} onRateMode={setRateMode}
            />
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex gap-3 justify-end">
          {step === 'preview' ? (
            <>
              <Button variant="outline" onClick={handleBack} disabled={pending}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={pending}>
                {pending
                  ? 'Working…'
                  : target.mode === 'NEW_BUDGET' ? 'Clone into this project' : 'Add as new phase'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Templates tab ──────────────────────────────────────────────────────────

function TemplatesTab({
  templates, pending, onSelect,
}: {
  templates: Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
  pending: boolean
  onSelect: (templateId: string) => void
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => onSelect('__blank__')}
        className="w-full rounded-lg border border-dashed px-4 py-3 text-left text-sm hover:border-foreground/30 hover:bg-muted/30 transition-colors disabled:opacity-60"
      >
        <span className="font-medium text-foreground">Blank budget</span>
        <span className="block text-xs text-muted-foreground mt-0.5">Start with an empty phase, no line items.</span>
      </button>
      {templates.map(t => (
        <button
          key={t.id}
          type="button"
          disabled={pending}
          onClick={() => onSelect(t.id)}
          className="w-full rounded-lg border px-4 py-3 text-left text-sm hover:border-[#c9a8f0] hover:bg-muted/30 transition-colors disabled:opacity-60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{t.name}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{SHOOT_TYPE_LABELS[t.shootType] ?? t.shootType}</span>
          </div>
          {t.description && <span className="block text-xs text-muted-foreground mt-0.5">{t.description}</span>}
        </button>
      ))}
      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No templates saved yet.</p>
      )}
    </div>
  )
}

// ─── Past budgets tab ───────────────────────────────────────────────────────

function PastBudgetsTab({
  loading, budgets, search, onSearch, availableTypes, typeFilter, onToggleType,
  wonOnly, onWonOnly, sort, onSort, onSelect, loadingPreviewFor,
}: {
  loading: boolean
  budgets: CloneableBudget[]
  search: string
  onSearch: (v: string) => void
  availableTypes: string[]
  typeFilter: Set<string>
  onToggleType: (t: string) => void
  wonOnly: boolean
  onWonOnly: (v: boolean) => void
  sort: SortKey
  onSort: (v: SortKey) => void
  onSelect: (b: CloneableBudget) => void
  loadingPreviewFor: string | null
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search by project or client…"
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {availableTypes.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onToggleType(t)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              typeFilter.has(t)
                ? 'border-[#5D00A4] bg-[#F5EDFA] text-[#5D00A4]'
                : 'border-border text-muted-foreground hover:border-foreground/30'
            }`}
          >
            {SHOOT_TYPE_LABELS[t] ?? t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onWonOnly(!wonOnly)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
            wonOnly
              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
              : 'border-border text-muted-foreground hover:border-foreground/30'
          }`}
        >
          Won only
        </button>

        <select
          value={sort}
          onChange={e => onSort(e.target.value as SortKey)}
          className="ml-auto rounded-md border border-input bg-transparent px-2 py-1 text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="recent">Most recent</option>
          <option value="total">Highest total</option>
          <option value="lineItems">Most line items</option>
        </select>
      </div>

      {/* Rows */}
      {budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No budgets match.</p>
      ) : (
        <div className="space-y-1.5">
          {budgets.map(b => {
            const pill = b.proposalStatus ? STATUS_PILL[b.proposalStatus] : null
            const isLoadingThis = loadingPreviewFor === b.budgetId
            return (
              <button
                key={b.budgetId}
                type="button"
                disabled={!!loadingPreviewFor}
                onClick={() => onSelect(b)}
                className="w-full rounded-lg border px-3.5 py-2.5 text-left hover:border-[#c9a8f0] hover:bg-muted/30 transition-colors disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{b.projectName}</span>
                      {b.projectType && (
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{SHOOT_TYPE_LABELS[b.projectType] ?? b.projectType}</span>
                      )}
                      {pill && <Badge variant={pill.variant}>{pill.label}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.budgetName} · {b.clientName}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {b.sectionCount} section{b.sectionCount !== 1 ? 's' : ''} · {b.lineItemCount} line item{b.lineItemCount !== 1 ? 's' : ''} · {fmtDate(b.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatMoney(b.grandTotalCents)}</span>
                    {isLoadingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Preview step ───────────────────────────────────────────────────────────

function PreviewStep({
  preview, sourceBudget, targetMode, nameInput, onNameInput, rateMode, onRateMode,
}: {
  preview: ClonePreview
  sourceBudget: CloneableBudget
  targetMode: 'NEW_BUDGET' | 'NEW_PHASE'
  nameInput: string
  onNameInput: (v: string) => void
  rateMode: 'REFRESH' | 'PRESERVE'
  onRateMode: (v: 'REFRESH' | 'PRESERVE') => void
}) {
  const hasRateChanges = preview.rateChanges.length > 0

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          {targetMode === 'NEW_BUDGET' ? 'Budget name' : 'Phase name'}
        </label>
        <Input value={nameInput} onChange={e => onNameInput(e.target.value)} />
      </div>

      {/* Structure */}
      <div>
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Structure</p>
        <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
          {preview.sections.map((section, si) => (
            <div key={si} className="px-3.5 py-2">
              <p className="text-xs font-semibold text-foreground">{section.title}</p>
              {section.accounts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic mt-1">No accounts</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {section.accounts.map((acc, ai) => (
                    <div key={ai} className="flex items-center justify-between text-xs text-muted-foreground" style={{ paddingLeft: acc.depth * 16 }}>
                      <span>{acc.name}</span>
                      <span className="tabular-nums shrink-0 ml-2">{acc.lineItemCount} item{acc.lineItemCount !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums text-foreground">{formatMoney(preview.totals.subtotalCents)}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-foreground">Total</span>
          <span className="tabular-nums text-foreground">{formatMoney(preview.totals.grandTotalCents)}</span>
        </div>
      </div>

      {/* Rate mode */}
      <div>
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Rates</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onRateMode('REFRESH')}
            className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              rateMode === 'REFRESH' ? 'border-[#5D00A4] bg-[#F5EDFA]' : 'border-border hover:border-foreground/30'
            }`}
          >
            <p className="text-sm font-medium text-foreground">Use current rates</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasRateChanges
                ? `${preview.rateChanges.length} line item${preview.rateChanges.length !== 1 ? 's' : ''} will update to current rate card pricing.`
                : 'No rate card pricing has changed since this was last quoted.'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onRateMode('PRESERVE')}
            className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              rateMode === 'PRESERVE' ? 'border-[#5D00A4] bg-[#F5EDFA]' : 'border-border hover:border-foreground/30'
            }`}
          >
            <p className="text-sm font-medium text-foreground">Keep original rates</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All rates copied exactly as quoted on {fmtDate(sourceBudget.createdAt)}.
            </p>
          </button>
        </div>

        {rateMode === 'REFRESH' && hasRateChanges && (
          <div className="mt-3 rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="text-left font-medium px-3 py-1.5">Line item</th>
                  <th className="text-left font-medium px-3 py-1.5">Rate card</th>
                  <th className="text-right font-medium px-3 py-1.5">Old</th>
                  <th className="text-right font-medium px-3 py-1.5">New</th>
                </tr>
              </thead>
              <tbody>
                {preview.rateChanges.map((rc, i) => {
                  const cheaper = rc.newRateCents < rc.oldRateCents
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 text-foreground">{rc.lineItemDescription}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{rc.rateCardName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatMoney(rc.oldRateCents)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${cheaper ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {formatMoney(rc.newRateCents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {preview.orphanedRateCards.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              {preview.orphanedRateCards.length} line item{preview.orphanedRateCards.length !== 1 ? 's' : ''} reference{preview.orphanedRateCards.length === 1 ? 's' : ''} a rate card that has since been archived ({preview.orphanedRateCards.join(', ')}) — original rate{preview.orphanedRateCards.length !== 1 ? 's' : ''} kept, the rate card link will be removed.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
