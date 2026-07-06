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
  type ContractSectionRow,
  type SuggestedBlock,
  type LibraryBlockOption,
} from '@/server/actions/proposal-contracts'
import type { AttachSource } from '@prisma/client'

// ── Label maps ────────────────────────────────────────────────────────────────

const ATTACH_LABELS: Record<AttachSource, string> = {
  DEFAULT: 'Default',
  AUTO:    'Auto',
  MANUAL:  'Manual',
}

const ATTACH_COLORS: Record<AttachSource, string> = {
  DEFAULT: 'bg-primary/10 text-primary',
  AUTO:    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  MANUAL:  'bg-muted text-muted-foreground',
}

// ── Section row ───────────────────────────────────────────────────────────────

function ContractSectionItem({
  section,
  onRefresh,
}: {
  section:   ContractSectionRow
  onRefresh: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [expanded,  setExpanded]     = useState(false)
  const [editing,   setEditing]      = useState(false)
  const [editTitle, setEditTitle]    = useState(section.title)
  const [editBody,  setEditBody]     = useState(section.body)
  const [error,     setError]        = useState<string | null>(null)

  // strip HTML tags for plain preview
  const preview = section.body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateContractSection(section.id, editTitle, editBody)
      if (!result.success) {
        setError((result as { success: false; error: string }).error)
        return
      }
      setEditing(false)
      onRefresh()
    })
  }

  function handleReset() {
    if (!confirm('Reset this section to the library version? Your edits will be lost.')) return
    setError(null)
    startTransition(async () => {
      const result = await resetContractSection(section.id)
      if (!result.success) setError((result as { success: false; error: string }).error)
      else onRefresh()
    })
  }

  function handleRemove() {
    if (!confirm(`Remove "${section.title}"?`)) return
    setError(null)
    startTransition(async () => {
      const result = await removeContractSection(section.id)
      if (!result.success) setError((result as { success: false; error: string }).error)
      else onRefresh()
    })
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card', isPending && 'opacity-60')}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={() => { setExpanded(e => !e); setEditing(false) }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            {expanded
              ? <path d="M2 4l4 4 4-4H2z"/>
              : <path d="M4 2l4 4-4 4V2z"/>}
          </svg>
        </button>

        <span className="flex-1 text-sm font-medium text-foreground truncate">{section.title}</span>

        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0', ATTACH_COLORS[section.attachedBy])}>
          {ATTACH_LABELS[section.attachedBy]}
        </span>

        {section.editedFromSource && (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium shrink-0">
            Edited
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5"
            onClick={() => { setEditing(e => !e); setExpanded(true); setEditTitle(section.title); setEditBody(section.body) }}
            disabled={isPending}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          {section.sourceBlockId && section.editedFromSource && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5"
              onClick={handleReset}
              disabled={isPending}
            >
              Reset
            </button>
          )}
          <button
            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1.5"
            onClick={handleRemove}
            disabled={isPending}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Expanded view */}
      {expanded && !editing && (
        <div className="px-3 pb-3 border-t border-border/50">
          {section.body ? (
            <div
              className="mt-2 text-sm text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderSmartText(section.body) }}
            />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground italic">No body text.</p>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-3 pb-3 border-t border-border/50 space-y-2.5 pt-3">
          <Input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Section title"
            className="h-8 text-sm"
          />
          <SmartTextEditor
            value={editBody}
            onChange={setEditBody}
            rows={8}
            placeholder="Contract text…"
          />
          <p className="text-xs text-muted-foreground">
            Merge tags: <code className="text-xs">{'{{client.name}}'}</code>{' '}
            <code className="text-xs">{'{{workspace.name}}'}</code>{' '}
            <code className="text-xs">{'{{project.name}}'}</code>
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!editing && error && (
        <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

// ── Suggestion banner ─────────────────────────────────────────────────────────

function SuggestionBanner({
  suggestions,
  proposalId,
  onAccepted,
}: {
  suggestions: SuggestedBlock[]
  proposalId:  string
  onAccepted:  () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [selected,  setSelected]     = useState<Set<string>>(new Set(suggestions.map(s => s.blockId)))
  const [dismissed, setDismissed]    = useState(false)

  if (dismissed || suggestions.length === 0) return null

  function handleAdd() {
    const toAdd = suggestions.filter(s => selected.has(s.blockId))
    if (toAdd.length === 0) { setDismissed(true); return }

    startTransition(async () => {
      for (const s of toAdd) {
        await attachContractBlock(proposalId, s.blockId, 'AUTO')
      }
      setDismissed(true)
      onAccepted()
    })
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
        {suggestions.length} contract block{suggestions.length > 1 ? 's' : ''} match your deliverables
      </p>

      <div className="space-y-1">
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
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-blue-900 dark:text-blue-200 flex-1">{s.blockTitle}</span>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">{s.matchedBy}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={handleAdd} disabled={isPending} className="h-7 text-xs">
          {isPending ? 'Adding…' : 'Add selected'}
        </Button>
        <button
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => setDismissed(true)}
          disabled={isPending}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── Library picker ────────────────────────────────────────────────────────────

function LibraryPicker({
  proposalId,
  onAttached,
  onClose,
}: {
  proposalId: string
  onAttached: () => void
  onClose:    () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [blocks, setBlocks]         = useState<LibraryBlockOption[]>([])
  const [filter, setFilter]         = useState('')

  useEffect(() => {
    listLibraryBlocksForPicker().then(r => {
      if (r.success) setBlocks(r.data)
    })
  }, [])

  const filtered = blocks.filter(b =>
    b.title.toLowerCase().includes(filter.toLowerCase())
  )

  function handlePick(blockId: string) {
    startTransition(async () => {
      await attachContractBlock(proposalId, blockId, 'MANUAL')
      onAttached()
      onClose()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Add from library</p>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>✕</button>
      </div>
      <Input
        placeholder="Search blocks…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="h-7 text-xs"
        autoFocus
      />
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">No blocks found</p>
        ) : (
          filtered.map(b => (
            <button
              key={b.id}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
              onClick={() => handlePick(b.id)}
              disabled={isPending}
            >
              <span className="flex-1 text-foreground">{b.title}</span>
              {b.isDefault && (
                <span className="text-xs text-muted-foreground">Default</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── Ad-hoc section creator ────────────────────────────────────────────────────

function AdHocCreator({
  proposalId,
  onCreated,
  onClose,
}: {
  proposalId: string
  onCreated:  () => void
  onClose:    () => void
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
      if (!result.success) {
        setError((result as { success: false; error: string }).error)
        return
      }
      onCreated()
      onClose()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Blank section</p>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>✕</button>
      </div>
      <Input
        placeholder="Section title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="h-7 text-xs"
        autoFocus
      />
      <SmartTextEditor
        value={body}
        onChange={setBody}
        rows={5}
        placeholder="Contract text…"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleCreate} disabled={isPending} className="h-7 text-xs">
          {isPending ? 'Adding…' : 'Add section'}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} disabled={isPending} className="h-7 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Main ContractTab ──────────────────────────────────────────────────────────

export function ContractTab({ proposalId }: { proposalId: string }) {
  const [sections,    setSections]    = useState<ContractSectionRow[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedBlock[]>([])
  const [loading,     setLoading]     = useState(true)
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [adHocOpen,   setAdHocOpen]   = useState(false)
  const [initPending, startInit]      = useTransition()

  const load = useCallback(async () => {
    const [secResult, evalResult] = await Promise.all([
      listContractSections(proposalId),
      evaluateProposalContractTriggers(proposalId),
    ])
    if (secResult.success)  setSections(secResult.data)
    if (evalResult.success) setSuggestions(evalResult.data.suggested)
    setLoading(false)
  }, [proposalId])

  // On first mount: attach defaults if none exist, then load
  useEffect(() => {
    startInit(async () => {
      await attachDefaultBlocks(proposalId)
      await load()
    })
  }, [proposalId, load])

  if (loading || initPending) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading contract sections…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Trigger suggestion banner */}
      {suggestions.length > 0 && (
        <SuggestionBanner
          suggestions={suggestions}
          proposalId={proposalId}
          onAccepted={load}
        />
      )}

      {/* Sections list */}
      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No contract sections</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a block from your library or write a custom section.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map(section => (
            <ContractSectionItem
              key={section.id}
              section={section}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {/* Add actions */}
      {!pickerOpen && !adHocOpen && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPickerOpen(true)}
          >
            + Add from library
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAdHocOpen(true)}
          >
            + Blank section
          </Button>
        </div>
      )}

      {pickerOpen && (
        <LibraryPicker
          proposalId={proposalId}
          onAttached={load}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {adHocOpen && (
        <AdHocCreator
          proposalId={proposalId}
          onCreated={load}
          onClose={() => setAdHocOpen(false)}
        />
      )}
    </div>
  )
}
