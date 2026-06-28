'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ArrowRight, Check } from 'lucide-react'
import { getProposalDeliverables, generateFromProposal } from '@/server/actions/delivery'

// ─── Types ────────────────────────────────────────────────────────────────────

// Matches the PhaseDeliverable type in delivery.ts
interface ProposalDeliverable {
  id?:         string
  title:       string
  description?: string | null
  type?:       string
  quantity?:   number
  sectionIds?: string[]
}

interface ProposalData {
  deliverables:        ProposalDeliverable[]
  hasApprovedProposal: boolean
}

interface ChoiceState {
  include:      boolean
  mode:         'section' | 'single_card'
  sectionTitle: string
}

interface Props {
  deliveryPageId: string
  projectId:      string
  onClose:        () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenerateFromProposalModal({ deliveryPageId, projectId, onClose }: Props) {
  const [loading,   setLoading]   = useState(true)
  const [data,      setData]      = useState<ProposalData | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [choices,   setChoices]   = useState<Record<string, ChoiceState>>({})
  const [generating, setGenerating] = useState(false)
  const [genError,  setGenError]  = useState<string | null>(null)

  useEffect(() => {
    getProposalDeliverables(projectId).then(result => {
      setLoading(false)
      if (!result.success) {
        setError(('error' in result ? result.error : null) ?? 'Failed to load')
        return
      }
      setData(result.data)
      const defaults: Record<string, ChoiceState> = {}
      for (const d of result.data.deliverables) {
        const key = d.id ?? d.title
        defaults[key] = {
          include:      true,
          mode:         (d.quantity ?? 1) > 1 ? 'section' : 'single_card',
          sectionTitle: d.title,
        }
      }
      setChoices(defaults)
    })
  }, [projectId])

  function updateChoice(id: string, patch: Partial<ChoiceState>) {
    setChoices(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleGenerate() {
    if (!data) return
    setGenerating(true)
    setGenError(null)
    const choiceArr = data.deliverables.map(d => {
      const key = d.id ?? d.title
      return {
        deliverableId: d.id ?? '',
        include:       choices[key]?.include ?? true,
        mode:          choices[key]?.mode ?? 'single_card',
        sectionTitle:  choices[key]?.sectionTitle?.trim() || undefined,
      }
    })
    const result = await generateFromProposal(deliveryPageId, choiceArr)
    setGenerating(false)
    if (!result.success) {
      setGenError(('error' in result ? result.error : null) ?? 'Generation failed')
      return
    }
    onClose()
  }

  const included = data ? data.deliverables.filter(d => choices[d.id ?? d.title]?.include).length : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl max-h-[85vh] rounded-2xl border border-border bg-card shadow-xl mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">Generate from proposal</p>
            <p className="text-xs text-muted-foreground mt-0.5">Choose how each deliverable becomes sections and assets</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive text-center py-10">{error}</p>
          )}
          {data && data.deliverables.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No deliverables found in the approved proposal.</p>
          )}
          {data && data.deliverables.length > 0 && (
            <div className="space-y-3">
              {data.deliverables.map(d => {
                const key = d.id ?? d.title
                const qty = d.quantity ?? 1
                const ch  = choices[key] ?? { include: true, mode: 'single_card', sectionTitle: d.title }
                return (
                  <div key={key} className={`rounded-xl border p-4 space-y-3 transition-colors ${ch.include ? '' : 'opacity-50'}`}>
                    {/* Row 1: toggle + title */}
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => updateChoice(key, { include: !ch.include })}
                        className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded border transition-colors flex items-center justify-center ${
                          ch.include ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-transparent'
                        }`}
                      >
                        {ch.include && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{d.title}</p>
                        {d.description && <p className="text-xs text-muted-foreground line-clamp-2">{d.description}</p>}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {d.type && <span>{d.type.replace('_', ' ')}</span>}
                          {qty > 1 && <span>× {qty}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: mode + section name — only when included */}
                    {ch.include && (
                      <div className="pl-7 space-y-2">
                        {qty > 1 && (
                          <div className="flex gap-2">
                            <ModeButton
                              active={ch.mode === 'section'}
                              label="As section (each unit = asset)"
                              onClick={() => updateChoice(key, { mode: 'section' })}
                            />
                            <ModeButton
                              active={ch.mode === 'single_card'}
                              label="As single asset"
                              onClick={() => updateChoice(key, { mode: 'single_card' })}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex-shrink-0">
                            {qty > 1 && ch.mode === 'section' ? 'Section name' : 'Goes into section'}
                          </span>
                          <input
                            value={ch.sectionTitle}
                            onChange={e => updateChoice(key, { sectionTitle: e.target.value })}
                            placeholder="Section title…"
                            className="flex-1 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border flex-shrink-0 bg-muted/30">
          <p className="text-xs text-muted-foreground">{included} deliverable{included !== 1 ? 's' : ''} selected</p>
          <div className="flex items-center gap-2">
            {genError && <p className="text-xs text-destructive">{genError}</p>}
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || included === 0 || loading}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}
