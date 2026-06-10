'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Phone, Mail, User, GitMerge, Check, AlertCircle, Loader2 } from 'lucide-react'
import {
  findDuplicateContacts,
  mergeContacts,
  type DuplicateGroup,
  type DuplicateContact,
} from '@/server/actions/rolodex'

interface Props {
  onClose:  () => void
  onMerged: () => void
}

const REASON_CONFIG = {
  phone: { label: 'Phone match', icon: Phone, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  email: { label: 'Email match', icon: Mail,  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  name:  { label: 'Name match',  icon: User,  color: 'bg-violet-100 text-violet-700 border-violet-200' },
}

export function MergeDuplicatesModal({ onClose, onMerged }: Props) {
  const [groups,   setGroups]   = useState<DuplicateGroup[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    findDuplicateContacts().then(data => {
      setGroups(data)
      setLoading(false)
    })
  }, [])

  function handleMerged(groupIdx: number) {
    setGroups(prev => prev.filter((_, i) => i !== groupIdx))
    onMerged()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl rounded-2xl border bg-card shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <GitMerge className="h-4 w-4 text-primary" />
              Merge duplicates
            </h2>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {groups.length === 0
                  ? 'No duplicates found'
                  : `${groups.length} duplicate group${groups.length === 1 ? '' : 's'} found`
                }
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning for duplicates…
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Check className="mb-3 h-10 w-10 text-green-500/40" />
              <p className="font-medium text-foreground">Your Rolodex is clean</p>
              <p className="mt-1 text-sm text-muted-foreground">No duplicate contacts detected.</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && groups.map((group, idx) => (
            <DuplicateGroupCard
              key={idx}
              group={group}
              onMerged={() => handleMerged(idx)}
              onError={setError}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Individual duplicate group card ───────────────────────────────────────────

function DuplicateGroupCard({
  group,
  onMerged,
  onError,
}: {
  group:    DuplicateGroup
  onMerged: () => void
  onError:  (msg: string) => void
}) {
  const [primaryId,  setPrimaryId]  = useState(
    // Default primary = whichever has more projects; tie-break: first in list
    group.contacts.reduce((best, c) => c.projectCount > best.projectCount ? c : best, group.contacts[0]).id
  )
  const [isPending,  startTransition] = useTransition()
  const [merged,     setMerged]     = useState(false)

  const cfg = REASON_CONFIG[group.matchReason]
  const Icon = cfg.icon

  const duplicates = group.contacts.filter(c => c.id !== primaryId)

  function handleMerge(duplicateId: string) {
    onError('')
    startTransition(async () => {
      const result = await mergeContacts(primaryId, duplicateId)
      if (result.success) {
        setMerged(true)
        setTimeout(() => onMerged(), 600)
      } else if ('error' in result) {
        onError(result.error)
      }
    })
  }

  if (merged) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-2 text-sm text-green-700">
        <Check className="h-4 w-4" />
        Merged successfully
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cfg.color}`}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground truncate">{group.matchValue}</span>
      </div>

      {/* Contact cards */}
      <div className="p-4 space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Select which contact to keep as primary
        </p>

        <div className="grid gap-2">
          {group.contacts.map(contact => {
            const isPrimary = contact.id === primaryId
            return (
              <label
                key={contact.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isPrimary
                    ? 'border-primary/40 bg-primary/5'
                    : 'hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name={`primary-${group.matchValue}`}
                  value={contact.id}
                  checked={isPrimary}
                  onChange={() => setPrimaryId(contact.id)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{contact.name}</p>
                    {isPrimary && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Keep</span>
                    )}
                  </div>
                  <p className="text-xs text-primary/80 mt-0.5">{contact.primaryRole}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {contact.phone && <span>📞 {contact.phone}</span>}
                    {contact.email && <span>✉ {contact.email}</span>}
                    <span className="text-muted-foreground/60">
                      {contact.projectCount === 0 ? 'No projects' : `${contact.projectCount} project${contact.projectCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Merge actions */}
        <div className="pt-1 border-t">
          <p className="text-xs text-muted-foreground mb-2">
            Merging will copy any missing fields from the duplicate into the primary, re-assign all project history, then archive the duplicate.
          </p>
          <div className="flex flex-wrap gap-2">
            {duplicates.map(dup => (
              <button
                key={dup.id}
                onClick={() => handleMerge(dup.id)}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <GitMerge className="h-3.5 w-3.5" />
                {isPending ? 'Merging…' : `Merge "${dup.name}" →`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
