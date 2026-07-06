'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SmartTextEditor } from '@/components/delivery/SmartTextEditor'
import { renderSmartText } from '@/lib/smart-text'
import {
  listContractSections,
  evaluateProposalContractTriggers,
  attachDefaultBlocks,
  attachContractBlock,
  addAdHocSection,
  updateContractSection,
  resetContractSection,
  removeContractSection,
  listLibraryBlocksForPicker,
  setContractEnabled,
  type ContractSectionRow,
  type SuggestedBlock,
  type LibraryBlockOption,
} from '@/server/actions/proposal-contracts'
import type { AttachSource } from '@prisma/client'

// ── Attach label badges ───────────────────────────────────────────────────────

const ATTACH_COLORS: Record<AttachSource, string> = {
  DEFAULT: 'bg-primary/10 text-primary',
  AUTO:    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  MANUAL:  'bg-muted text-muted-foreground',
}
const ATTACH_LABELS: Record<AttachSource, string> = {
  DEFAULT: 'Default', AUTO: 'Auto', MANUAL: 'Manual',
}

// ── LEFT PANEL: individual section card ──────────────────────────────────────

function SectionCard({
  section,
  isActive,
  onActivate,
  onRefresh,
}: {
  section:    ContractSectionRow
  isActive:   boolean
  onActivate: () => void
  onRefresh:  () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [editTitle, setEditTitle]    = useState(section.title)
  const [editBody,  setEditBody]     = useState(section.body)
  const [error,     setError]        = useState<string | null>(null)

  // Sync when section data changes (e.g. after reset)
  useEffect(() => {
    setEditTitle(section.title)
    setEditBody(section.body)
  }, [section.title, section.body])

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateContractSection(section.id, editTitle, editBody)
      if (!result.success) { setError((result as { success: false; error: string }).error); return }
      onRefresh()
    })
  }

  function handleReset() {
    if (!confirm('Reset to library version? Your edits will be lost.')) return
    startTransition(async () => {
      const result = await resetContractSection(section.id)
      if (!result.success) setError((result as { success: false; error: string }).error)
      else onRefresh()
    })
  }

  function handleRemove() {
    if (!confirm(`Remove "${section.title}"?`)) return
    startTransition(async () => {
      const result = await removeContractSection(section.id)
      if (!result.success) setError((result as { success: false; error: string }).error)
      else { onRefresh() }
    })
  }

  const preview = section.body.replace(/\*\*|__|_|\+\+/g, '').replace(/^- /gm, '').replace(/^\d+\. /gm, '').replace(/\s+/g, ' ').trim().slice(0, 90)

  return (
    <div className={cn('rounded-lg border bg-card transition-all', isPending && 'opacity-60', isActive && 'ring-1 ring-primary/40 border-primary/30')}>
      {/* Header */}
      <button
        type="button"
        className="w-full text-left px-3 py-2.5"
        onClick={onActivate}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{section.title}</p>
            {!isActive && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{preview || '—'}</p>
            )}
          </div>
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 mt-0.5', ATTACH_COLORS[section.attachedBy])}>
            {ATTACH_LABELS[section.attachedBy]}
          </span>
        </div>
      </button>

      {/* Expanded editor */}
      {isActive && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2.5 space-y-2.5">
          <Input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Section title"
            className="h-8 text-sm"
          />
          <SmartTextEditor
            value={editBody}
            onChange={setEditBody}
            rows={7}
            placeholder="Contract text…"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            {section.sourceBlockId && section.editedFromSource && (
              <Button size="sm" variant="outline" onClick={handleReset} disabled={isPending} className="h-7 text-xs">
                Reset to master
              </Button>
            )}
            <button
              className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
              onClick={handleRemove}
              disabled={isPending}
            >
              Remove
            </button>
          </div>
          {section.editedFromSource && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">Edited from master template</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── LEFT PANEL: suggestion banner ─────────────────────────────────────────────

function SuggestionBanner({
  suggestions, proposalId, onAccepted,
}: {
  suggestions: SuggestedBlock[]
  proposalId:  string
  onAccepted:  () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected]      = useState<Set<string>>(new Set(suggestions.map(s => s.blockId)))
  const [dismissed, setDismissed]    = useState(false)

  if (dismissed || suggestions.length === 0) return null

  function handleAdd() {
    const toAdd = suggestions.filter(s => selected.has(s.blockId))
    if (toAdd.length === 0) { setDismissed(true); return }
    startTransition(async () => {
      for (const s of toAdd) await attachContractBlock(proposalId, s.blockId, 'AUTO')
      setDismissed(true)
      onAccepted()
    })
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-2.5 space-y-1.5">
      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
        {suggestions.length} block{suggestions.length > 1 ? 's' : ''} match your deliverables
      </p>
      {suggestions.map(s => (
        <label key={s.blockId} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(s.blockId)}
            onChange={e => {
              const next = new Set(selected)
              e.target.checked ? next.add(s.blockId) : next.delete(s.blockId)
              setSelected(next)
            }}
            className="h-3 w-3 rounded accent-primary"
          />
          <span className="text-xs text-blue-900 dark:text-blue-200 flex-1 truncate">{s.blockTitle}</span>
        </label>
      ))}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleAdd} disabled={isPending} className="h-6 text-xs px-2">
          {isPending ? 'Adding…' : 'Add selected'}
        </Button>
        <button className="text-xs text-blue-600 hover:underline" onClick={() => setDismissed(true)} disabled={isPending}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── LEFT PANEL: library picker ────────────────────────────────────────────────

function LibraryPicker({ proposalId, onAttached, onClose }: {
  proposalId: string; onAttached: () => void; onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [blocks, setBlocks]         = useState<LibraryBlockOption[]>([])
  const [filter, setFilter]         = useState('')

  useEffect(() => {
    listLibraryBlocksForPicker().then(r => { if (r.success) setBlocks(r.data) })
  }, [])

  const filtered = blocks.filter(b => b.title.toLowerCase().includes(filter.toLowerCase()))

  function handlePick(blockId: string) {
    startTransition(async () => {
      await attachContractBlock(proposalId, blockId, 'MANUAL')
      onAttached()
      onClose()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">From library</p>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>✕</button>
      </div>
      <Input placeholder="Search…" value={filter} onChange={e => setFilter(e.target.value)} className="h-7 text-xs" autoFocus />
      <div className="max-h-36 overflow-y-auto space-y-0.5">
        {filtered.length === 0
          ? <p className="text-xs text-muted-foreground py-1 text-center">No blocks found</p>
          : filtered.map(b => (
              <button
                key={b.id}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 flex items-center gap-2"
                onClick={() => handlePick(b.id)}
                disabled={isPending}
              >
                <span className="flex-1 text-foreground">{b.title}</span>
                {b.isDefault && <span className="text-muted-foreground text-[10px]">Default</span>}
              </button>
            ))}
      </div>
    </div>
  )
}

// ── LEFT PANEL: ad-hoc creator ────────────────────────────────────────────────

function AdHocCreator({ proposalId, onCreated, onClose }: {
  proposalId: string; onCreated: () => void; onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [body,  setBody]  = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setError(null)
    startTransition(async () => {
      const result = await addAdHocSection(proposalId, title, body)
      if (!result.success) { setError((result as { success: false; error: string }).error); return }
      onCreated()
      onClose()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Custom section</p>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>✕</button>
      </div>
      <Input placeholder="Section title" value={title} onChange={e => setTitle(e.target.value)} className="h-7 text-xs" autoFocus />
      <SmartTextEditor value={body} onChange={setBody} rows={4} placeholder="Contract text…" />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleCreate} disabled={isPending} className="h-7 text-xs">
          {isPending ? 'Adding…' : 'Add'}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} disabled={isPending} className="h-7 text-xs">Cancel</Button>
      </div>
    </div>
  )
}

// ── RIGHT PANEL: contract preview ─────────────────────────────────────────────

function ContractPreview({ sections }: { sections: ContractSectionRow[] }) {
  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-muted-foreground">No sections yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Add sections from the left to see a preview here.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Document chrome */}
      <div className="bg-white dark:bg-card rounded-lg border shadow-sm mx-1 p-6 min-h-full">
        <div className="mb-6 pb-4 border-b border-border/60">
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">Terms &amp; Conditions</p>
          <div className="h-0.5 w-8 bg-primary/60 rounded" />
        </div>

        <div className="space-y-6">
          {sections.map((s, i) => (
            <div key={s.id}>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-primary mb-1.5">
                {sections.length > 1 ? `${String(i + 1).padStart(2, '0')} — ` : ''}{s.title}
              </p>
              <div
                className="text-xs leading-relaxed text-foreground/90 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:space-y-0.5 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:space-y-0.5 [&>br]:block"
                dangerouslySetInnerHTML={{ __html: renderSmartText(s.body) }}
              />
              {i < sections.length - 1 && <div className="mt-5 border-t border-border/40" />}
            </div>
          ))}
        </div>

        {/* Signature line */}
        <div className="mt-8 pt-6 border-t border-border/60">
          <div className="flex gap-8">
            <div className="flex-1">
              <div className="h-8 border-b border-foreground/30 mb-1" />
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Client signature</p>
            </div>
            <div className="flex-1">
              <div className="h-8 border-b border-foreground/30 mb-1" />
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ContractTab ──────────────────────────────────────────────────────────

export function ContractTab({
  proposalId,
  contractEnabled: initialEnabled,
}: {
  proposalId:       string
  contractEnabled:  boolean
}) {
  const [enabled,      setEnabled]     = useState(initialEnabled)
  const [sections,     setSections]    = useState<ContractSectionRow[]>([])
  const [suggestions,  setSuggestions] = useState<SuggestedBlock[]>([])
  const [loading,      setLoading]     = useState(true)
  const [activeId,     setActiveId]    = useState<string | null>(null)
  const [pickerOpen,   setPickerOpen]  = useState(false)
  const [adHocOpen,    setAdHocOpen]   = useState(false)
  const [togglePending, startToggle]  = useTransition()
  const [initPending,   startInit]    = useTransition()

  const load = useCallback(async () => {
    const [secRes, evalRes] = await Promise.all([
      listContractSections(proposalId),
      evaluateProposalContractTriggers(proposalId),
    ])
    if (secRes.success)  setSections(secRes.data)
    if (evalRes.success) setSuggestions(evalRes.data.suggested)
    setLoading(false)
  }, [proposalId])

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    startInit(async () => {
      await attachDefaultBlocks(proposalId)
      await load()
    })
  }, [proposalId, enabled, load])

  function handleToggle(on: boolean) {
    startToggle(async () => {
      await setContractEnabled(proposalId, on)
      setEnabled(on)
      if (on) {
        setLoading(true)
        startInit(async () => {
          await attachDefaultBlocks(proposalId)
          await load()
        })
      }
    })
  }

  const isLoading = loading || initPending

  return (
    <div className="flex flex-col" style={{ height: '62vh' }}>

      {/* ── Toggle bar ── */}
      <div className="flex items-center justify-between py-2 mb-3 border-b border-border/60">
        <div>
          <p className="text-sm font-medium text-foreground">Contract terms</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? 'A Terms section will appear on the proposal.' : 'No contract will be included with this proposal.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleToggle(!enabled)}
          disabled={togglePending}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            enabled ? 'bg-primary' : 'bg-muted-foreground/30',
            togglePending && 'opacity-50 cursor-not-allowed',
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1',
          )} />
        </button>
      </div>

      {/* ── Disabled state ── */}
      {!enabled && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground">No contract included</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            Toggle on to attach contract terms to this proposal. You can customise each section before sending.
          </p>
        </div>
      )}

      {/* ── Enabled: two-column layout ── */}
      {enabled && (
        <div className="flex gap-4 flex-1 min-h-0">

          {/* ── Left: sections editor ── */}
          <div className="w-[42%] flex flex-col gap-2.5 overflow-y-auto pr-1">

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Loading sections…</p>
              </div>
            ) : (
              <>
                {/* Suggestion banner */}
                {suggestions.length > 0 && (
                  <SuggestionBanner
                    suggestions={suggestions}
                    proposalId={proposalId}
                    onAccepted={() => { setSuggestions([]); load() }}
                  />
                )}

                {/* Section cards */}
                {sections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <p className="text-xs text-muted-foreground">No sections yet. Add from library or write a custom one.</p>
                  </div>
                ) : (
                  sections.map(s => (
                    <SectionCard
                      key={s.id}
                      section={s}
                      isActive={activeId === s.id}
                      onActivate={() => setActiveId(activeId === s.id ? null : s.id)}
                      onRefresh={() => { setActiveId(null); load() }}
                    />
                  ))
                )}

                {/* Add actions */}
                {!pickerOpen && !adHocOpen && (
                  <div className="flex gap-2 pt-1">
                    <button
                      className="flex-1 rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                      onClick={() => setPickerOpen(true)}
                    >
                      + From library
                    </button>
                    <button
                      className="flex-1 rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                      onClick={() => setAdHocOpen(true)}
                    >
                      + Custom section
                    </button>
                  </div>
                )}

                {pickerOpen && (
                  <LibraryPicker proposalId={proposalId} onAttached={load} onClose={() => setPickerOpen(false)} />
                )}
                {adHocOpen && (
                  <AdHocCreator proposalId={proposalId} onCreated={load} onClose={() => setAdHocOpen(false)} />
                )}
              </>
            )}
          </div>

          {/* ── Right: preview ── */}
          <div className="flex-1 min-h-0">
            {isLoading
              ? <div className="h-full flex items-center justify-center"><p className="text-xs text-muted-foreground">Loading…</p></div>
              : <ContractPreview sections={sections} />
            }
          </div>
        </div>
      )}
    </div>
  )
}
