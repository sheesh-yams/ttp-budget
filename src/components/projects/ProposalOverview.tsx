'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Check, Pencil } from 'lucide-react'
import { updatePhaseOverview } from '@/server/actions/budgets'

interface Deliverable {
  title: string
  description: string
  number?: string
}

interface Phase {
  id: string
  name: string
  description: string | null
  deliverables: Deliverable[] | null
}

interface Props {
  phase: Phase
}

export function ProposalOverview({ phase }: Props) {
  const [, startTransition] = useTransition()

  const [editing,      setEditing]      = useState(false)
  const [description,  setDescription]  = useState(phase.description ?? '')
  const [deliverables, setDeliverables] = useState<Deliverable[]>(
    phase.deliverables && phase.deliverables.length > 0
      ? phase.deliverables
      : [{ title: '', description: '' }]
  )
  const [saved, setSaved] = useState(false)

  function addDeliverable() {
    setDeliverables(prev => [...prev, { title: '', description: '' }])
  }

  function removeDeliverable(i: number) {
    setDeliverables(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateDeliverable(i: number, field: keyof Deliverable, value: string) {
    setDeliverables(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  function handleSave() {
    const filled = deliverables.filter(d => d.title.trim())
    startTransition(async () => {
      await updatePhaseOverview(phase.id, {
        description: description.trim() || null,
        deliverables: filled,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      setEditing(false)
    })
  }

  function handleCancel() {
    setDescription(phase.description ?? '')
    setDeliverables(
      phase.deliverables && phase.deliverables.length > 0
        ? phase.deliverables
        : [{ title: '', description: '' }]
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
        {/* Description */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Project Description
          </p>
          {editing ? (
            <textarea
              rows={4}
              placeholder="A brief description shown on the proposal cover and 'The Project' section…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          ) : (
            <p className={`text-sm leading-relaxed ${description ? 'text-foreground' : 'text-muted-foreground italic'}`}>
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
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="group/deliv flex items-start gap-2">
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
                  {deliverables.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDeliverable(i)}
                      title="Remove"
                      className="mt-5 rounded p-0.5 text-muted-foreground opacity-0 group-hover/deliv:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
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
