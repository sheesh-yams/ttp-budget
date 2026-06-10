'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { X, Search, Download, CheckSquare, Square, AlertCircle } from 'lucide-react'
import {
  getCallSheetCrewForImport,
  bulkImportContacts,
  type ImportableMember,
} from '@/server/actions/rolodex'

interface Props {
  onClose:    () => void
  onImported: (count: number) => void
}

export function ImportFromCallSheetsModal({ onClose, onImported }: Props) {
  const [members,   setMembers]   = useState<ImportableMember[]>([])
  const [loading,   setLoading]   = useState(true)
  const [query,     setQuery]     = useState('')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error,     setError]     = useState('')

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Load on mount
  useEffect(() => {
    setLoading(true)
    getCallSheetCrewForImport().then(data => {
      setMembers(data)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return members
    const q = query.toLowerCase()
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q) ||
      (m.department ?? '').toLowerCase().includes(q)
    )
  }, [members, query])

  const importable = filtered.filter(m => !m.alreadyInRolodex)
  const allImportableSelected = importable.length > 0 &&
    importable.every(m => selected.has(m.name))

  function toggleAll() {
    if (allImportableSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(importable.map(m => m.name)))
    }
  }

  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleImport() {
    const toImport = members.filter(m => selected.has(m.name))
    if (!toImport.length) return
    setError('')
    startTransition(async () => {
      const result = await bulkImportContacts(toImport)
      if (result.success) {
        onImported(result.data.count)
        onClose()
      } else if ('error' in result) {
        setError(result.error)
      }
    })
  }

  const selectedCount = selected.size
  const newCount      = members.filter(m => !m.alreadyInRolodex).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl rounded-2xl border bg-card shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Import from call sheets</h2>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {newCount} new · {members.length - newCount} already in Rolodex
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

        {/* Search */}
        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by name, role, or department…"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading crew…</div>
          )}

          {!loading && members.length === 0 && (
            <div className="py-12 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No crew found in any call sheets yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add crew to a call sheet first, then import them here.</p>
            </div>
          )}

          {!loading && members.length > 0 && (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b">
                  <th className="py-2 w-8">
                    <button
                      onClick={toggleAll}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={allImportableSelected ? 'Deselect all' : 'Select all new'}
                    >
                      {allImportableSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />
                      }
                    </button>
                  </th>
                  <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Role</th>
                  <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(m => {
                  const isSelected = selected.has(m.name)
                  return (
                    <tr
                      key={m.name}
                      onClick={() => { if (!m.alreadyInRolodex) toggle(m.name) }}
                      className={`transition-colors ${
                        m.alreadyInRolodex
                          ? 'opacity-50 cursor-default'
                          : 'cursor-pointer hover:bg-muted/30'
                      } ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-2.5 pr-3">
                        {m.alreadyInRolodex ? (
                          <CheckSquare className="h-4 w-4 text-muted-foreground/40" />
                        ) : isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-foreground leading-tight">{m.name}</p>
                        {m.alreadyInRolodex && (
                          <p className="text-[10px] text-primary/70 mt-0.5">Already in Rolodex</p>
                        )}
                        {m.department && !m.alreadyInRolodex && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{m.department}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground hidden sm:table-cell">{m.role}</td>
                      <td className="py-2.5 text-xs text-muted-foreground/60 hidden md:table-cell truncate max-w-[140px]">{m.source}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-4 flex-shrink-0">
          {error && <p className="text-sm text-red-500 flex-1">{error}</p>}
          {!error && (
            <p className="text-xs text-muted-foreground flex-1">
              {selectedCount > 0
                ? `${selectedCount} selected — will be added to your Rolodex`
                : 'Select crew members to import'
              }
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isPending || selectedCount === 0}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              {isPending ? 'Importing…' : `Import ${selectedCount > 0 ? selectedCount : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
