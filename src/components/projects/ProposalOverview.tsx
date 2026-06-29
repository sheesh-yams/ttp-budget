'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Plus, X, Check, Pencil, Link2, ChevronDown } from 'lucide-react'
import { updatePhaseOverview } from '@/server/actions/budgets'
import type { DeliverableItemType } from '@/types'

interface Deliverable {
  id?:          string
  title:        string
  description:  string
  number?:      string
  sectionIds?:  string[]
  type?:        DeliverableItemType
  quantity?:    number
}

interface SectionOption {
  id:    string
  title: string
}

interface Phase {
  id:           string
  name:         string
  overview:     string | null
  description:  string | null
  deliverables: Deliverable[] | null
  sections?:    SectionOption[]
}

interface Props {
  phase: Phase
}

const TYPE_OPTIONS: { value: DeliverableItemType; label: string }[] = [
  { value: 'DELIVERABLE',  label: 'Deliverable'  },
  { value: 'SERVICE',      label: 'Service'       },
  { value: 'RAW_FOOTAGE',  label: 'Raw Footage'   },
  { value: 'OTHER',        label: 'Other'         },
]

const TYPE_LABELS: Record<DeliverableItemType, string> = {
  DELIVERABLE: 'Deliverable',
  SERVICE:     'Service',
  RAW_FOOTAGE: 'Raw Footage',
  OTHER:       'Other',
}

function blankDeliverable(): Deliverable {
  return { id: crypto.randomUUID(), title: '', description: '', type: 'DELIVERABLE', quantity: 1 }
}

export function ProposalOverview({ phase }: Props) {
  const [, startTransition] = useTransition()

  const multiSection = (phase.sections?.length ?? 0) > 1

  const [editing,      setEditing]      = useState(false)
  const [overview,     setOverview]     = useState(phase.overview ?? '')
  const [description,  setDescription]  = useState(phase.description ?? '')
  const [deliverables, setDeliverables] = useState<Deliverable[]>(
    phase.deliverables && phase.deliverables.length > 0
      ? phase.deliverables
      : [blankDeliverable()]
  )
  const [saved, setSaved] = useState(false)

  function addDeliverable() {
    setDeliverables(prev => [...prev, blankDeliverable()])
  }

  function removeDeliverable(i: number) {
    setDeliverables(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateDeliverable<K extends keyof Deliverable>(i: number, field: K, value: Deliverable[K]) {
    setDeliverables(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  function handleSave() {
    const filled = deliverables.filter(d => d.title.trim())
    startTransition(async () => {
      await updatePhaseOverview(phase.id, {
        overview:     overview.trim() || null,
        description:  description.trim() || null,
        deliverables: filled,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      setEditing(false)
    })
  }

  function handleCancel() {
    setOverview(phase.overview ?? '')
    setDescription(phase.description ?? '')
    setDeliverables(
      phase.deliverables && phase.deliverables.length > 0
        ? phase.deliverables
        : [blankDeliverable()]
    )
    setEditing(false)
  }

  const hasContent = description.trim() || deliverables.some(d => d.title.trim())

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground">Proposal Overview</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-5">
        {/* Overview — short tagline for proposal cover */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Overview
          </p>
          {editing ? (
            <textarea
              rows={2}
              placeholder="One or two sentences shown on the proposal cover…"
              value={overview}
              onChange={e => setOverview(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          ) : (
            <p className={`text-sm leading-relaxed ${overview ? 'text-foreground' : 'text-muted-foreground italic'}`}>
              {overview || 'No overview yet — click Edit to add one.'}
            </p>
          )}
        </div>

        {/* Description — full copy for "The Project" section */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Description
          </p>
          {editing ? (
            <textarea
              rows={5}
              placeholder="Full project description shown in 'The Project' section of the proposal…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          ) : (
            <p className={`text-sm leading-relaxed whitespace-pre-line ${description ? 'text-foreground' : 'text-muted-foreground italic'}`}>
              {description || 'No description yet — click Edit to add one.'}
            </p>
          )}
        </div>

        {/* Deliverables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Deliverables
            </p>
            {editing && (
              <button
                type="button"
                onClick={addDeliverable}
                className="flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              {deliverables.map((d, i) => (
                <div key={i} className="group/deliv space-y-1.5">
                  {/* Primary row: index + title + description + delete */}
                  <div className="flex items-start gap-2">
                    <div className="grid grid-cols-[90px_1fr] gap-2 flex-1">
                      <div className="grid gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <input
                          placeholder="Title"
                          value={d.title}
                          onChange={e => updateDeliverable(i, 'title', e.target.value)}
                          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <div className="grid gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                          Description
                        </span>
                        <input
                          placeholder="Short description…"
                          value={d.description}
                          onChange={e => updateDeliverable(i, 'description', e.target.value)}
                          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDeliverable(i)}
                      title="Remove"
                      className={`mt-5 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all ${deliverables.length > 1 ? 'opacity-0 group-hover/deliv:opacity-100' : 'invisible'}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Secondary row: type + qty + sections */}
                  <div className={`pl-[calc(90px+0.5rem)] grid gap-2 ${multiSection ? 'grid-cols-[130px_72px_1fr]' : 'grid-cols-[130px_72px]'}`}>
                    {/* Type */}
                    <div className="relative">
                      <select
                        value={d.type ?? 'DELIVERABLE'}
                        onChange={e => updateDeliverable(i, 'type', e.target.value as DeliverableItemType)}
                        className="w-full appearance-none rounded-md border border-input bg-transparent pl-2 pr-7 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground"
                      >
                        {TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    </div>
                    {/* Qty */}
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={d.quantity ?? 1}
                        onChange={e => updateDeliverable(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground"
                        placeholder="Qty"
                      />
                    </div>
                    {/* Sections */}
                    {multiSection && (
                      <SectionMultiSelect
                        sections={phase.sections ?? []}
                        selected={d.sectionIds ?? []}
                        onChange={ids => updateDeliverable(i, 'sectionIds', ids)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {hasContent && deliverables.some(d => d.title.trim()) ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {deliverables.filter(d => d.title.trim()).map((d, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                      <p className="text-[11px] font-semibold text-violet-600 mb-1">
                        {String(i + 1).padStart(2, '0')}
                      </p>
                      <p className="text-sm font-medium text-foreground mb-1">{d.title}</p>
                      {d.description && (
                        <p className="text-xs text-muted-foreground">{d.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {d.type && d.type !== 'DELIVERABLE' && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {TYPE_LABELS[d.type]}
                          </span>
                        )}
                        {(d.quantity ?? 1) > 1 && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                            ×{d.quantity}
                          </span>
                        )}
                        {multiSection && (d.sectionIds?.length ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-violet-500 font-medium">
                            <Link2 className="h-2.5 w-2.5" />
                            {phase.sections
                              ?.filter(s => d.sectionIds?.includes(s.id))
                              .map(s => s.title)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No deliverables yet — click Edit to add some.
                </p>
              )}
            </>
          )}
        </div>

        {saved && (
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <Check className="h-3 w-3" /> Saved
          </p>
        )}
      </div>
    </section>
  )
}

// ─── Section multi-select dropdown ────────────────────────────────────────────

function SectionMultiSelect({
  sections, selected, onChange,
}: {
  sections: SectionOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  const label = selected.length === 0
    ? 'None'
    : selected.length === sections.length
      ? 'All sections'
      : sections.filter(s => selected.includes(s.id)).map(s => s.title).join(', ')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={`truncate ${selected.length === 0 ? 'text-muted-foreground' : ''}`}>
          {label}
        </span>
        <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-full rounded-lg border border-border bg-popover p-1 shadow-md text-[13px]">
          {sections.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
            >
              <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${selected.includes(s.id) ? 'border-primary bg-primary' : 'border-input'}`}>
                {selected.includes(s.id) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </span>
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
