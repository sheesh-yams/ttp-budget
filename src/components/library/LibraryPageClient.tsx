'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Plus, BookOpen, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyGlobalRateCardToWorkspace, copyGlobalTemplateToWorkspace } from '@/server/actions/library'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GlobalRate = {
  id:               string
  role:             string
  category:         string
  defaultUnit:      string
  defaultRateCents: number
  notes:            string | null
  isFeatured:       boolean
  inWorkspace:      boolean
  workspaceId:      string | null
}

type GlobalTemplate = {
  id:           string
  name:         string
  description:  string | null
  shootType:    string
  templateKind: string
  isFeatured:   boolean
  itemCount:    number
  inWorkspace:  boolean
  workspaceId:  string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  CREW:           'Crew',
  EQUIPMENT:      'Equipment',
  POST:           'Post',
  LOCATION:       'Location',
  TALENT:         'Talent',
  TRAVEL:         'Travel',
  CATERING:       'Catering',
  INSURANCE:      'Insurance',
  PRODUCTION_FEE: 'Production fee',
  MISC:           'Misc',
}

const SHOOT_TYPE_LABELS: Record<string, string> = {
  MUSIC_VIDEO:    'Music Video',
  BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT:  'Product Shoot',
  EVENT_RECAP:    'Event Recap',
  SOCIAL_CONTENT: 'Social Content',
  INFLUENCER:     'Influencer',
  DOCUMENTARY:    'Documentary',
  OTHER:          'Other',
}

function formatCents(cents: number): string {
  if (cents === 0) return '—'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatUnit(unit: string): string {
  const map: Record<string, string> = {
    HOUR: '/hr', HALF_DAY: '/half-day', DAY: '/day',
    WEEK: '/wk', FLAT: 'flat', EACH: '/ea', MILE: '/mi',
  }
  return map[unit] ?? unit.toLowerCase()
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function LibraryPageClient({
  rates,
  templates,
}: {
  rates:     GlobalRate[]
  templates: GlobalTemplate[]
}) {
  const [tab, setTab] = useState<'rates' | 'templates'>('rates')

  return (
    <div>
      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border mb-6">
        {([
          { key: 'rates',     label: 'Rate cards', count: rates.length     },
          { key: 'templates', label: 'Templates',  count: templates.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-[#5D00A4] text-[#5D00A4]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
          </button>
        ))}
      </div>

      {tab === 'rates'     && <RatesTab     rates={rates} />}
      {tab === 'templates' && <TemplatesTab templates={templates} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rate cards tab — grouped by category
// ---------------------------------------------------------------------------

function RatesTab({ rates }: { rates: GlobalRate[] }) {
  // Group by category, maintaining category order
  const groups = new Map<string, GlobalRate[]>()
  for (const r of rates) {
    const existing = groups.get(r.category) ?? []
    groups.set(r.category, [...existing, r])
  }

  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                  <th className="w-[140px] px-4 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {items.map(rate => (
                  <RateRow key={rate.id} rate={rate} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function RateRow({ rate }: { rate: GlobalRate }) {
  const [inWorkspace, setInWorkspace] = useState(rate.inWorkspace)
  const [wsId, setWsId]               = useState(rate.workspaceId)
  const [isPending, startTransition]  = useTransition()
  const [error, setError]             = useState('')

  function handleAdd() {
    setError('')
    startTransition(async () => {
      const result = await copyGlobalRateCardToWorkspace(rate.id)
      if ('error' in result) { setError(result.error); return }
      setInWorkspace(true)
      setWsId(result.data.id)
    })
  }

  return (
    <tr className="group hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <span className="font-medium text-foreground">{rate.role}</span>
        {rate.notes && <p className="text-xs text-muted-foreground mt-0.5">{rate.notes}</p>}
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </td>
      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
        {formatCents(rate.defaultRateCents)}{' '}
        <span className="text-xs">{formatUnit(rate.defaultUnit)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        {inWorkspace ? (
          <div className="flex items-center justify-end gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <Link
              href="/rates"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              In workspace
            </Link>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 ml-auto"
          >
            <Plus className="h-3 w-3" />
            {isPending ? 'Adding…' : 'Add'}
          </button>
        )}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Templates tab — cards
// ---------------------------------------------------------------------------

function TemplatesTab({ templates }: { templates: GlobalTemplate[] }) {
  const full     = templates.filter(t => t.templateKind === 'FULL')
  const packages = templates.filter(t => t.templateKind === 'PACKAGE')

  return (
    <div className="space-y-8">
      {full.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Full budgets
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {full.map(t => <TemplateCard key={t.id} template={t} />)}
          </div>
        </div>
      )}
      {packages.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Add-on packages
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map(t => <TemplateCard key={t.id} template={t} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function TemplateCard({ template }: { template: GlobalTemplate }) {
  const [inWorkspace, setInWorkspace] = useState(template.inWorkspace)
  const [wsId, setWsId]               = useState(template.workspaceId)
  const [isPending, startTransition]  = useTransition()
  const [error, setError]             = useState('')

  function handleAdd() {
    setError('')
    startTransition(async () => {
      const result = await copyGlobalTemplateToWorkspace(template.id)
      if ('error' in result) { setError(result.error); return }
      setInWorkspace(true)
      setWsId(result.data.id)
    })
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground leading-snug">{template.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {SHOOT_TYPE_LABELS[template.shootType] ?? template.shootType}
            </span>
            {template.templateKind === 'PACKAGE' && (
              <span className="inline-flex items-center rounded-full bg-[#5D00A4]/10 px-2 py-0.5 text-[10px] font-medium text-[#5D00A4]">
                Add-on
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
          <List className="h-3 w-3" />
          {template.itemCount}
        </div>
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed flex-1">
          {template.description}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-border">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        {inWorkspace ? (
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
            <Link
              href={wsId ? `/templates/${wsId}` : '/templates'}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              In workspace — view
            </Link>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            {isPending ? 'Adding…' : 'Add to workspace'}
          </button>
        )}
      </div>
    </div>
  )
}
