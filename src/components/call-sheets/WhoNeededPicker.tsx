'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { CrewDept, TalentMember } from '@/server/actions/call-sheets'

// ─── Preset roles shown in the Roles tab ──────────────────────────────────────

const PRESET_ROLES = [
  'Production',
  'Camera',
  'G&E',
  'Sound',
  'Art / Props',
  'Hair & Makeup',
  'Talent',
  'Post Production',
  'Other',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSelected(value: string): string[] {
  if (!value.trim()) return []
  return value.split(',').map(n => n.trim()).filter(Boolean)
}

function serializeSelected(items: string[]): string {
  return items.join(', ')
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  value:    string
  crew:     CrewDept[]
  talent:   TalentMember[]
  onChange: (value: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WhoNeededPicker({ value, crew, talent, onChange }: Props) {
  const [open,    setOpen]    = useState(false)
  const [tab,     setTab]     = useState<'names' | 'roles'>('names')
  const [mounted, setMounted] = useState(false)
  const [pos,     setPos]     = useState<{ top: number; left: number; width: number } | null>(null)

  const triggerRef = useRef<HTMLDivElement>(null)
  const portalRef  = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  const selected   = parseSelected(value)
  const isEveryone = selected.includes('Everyone')

  // Collect names from crew + talent (non-empty only)
  const crewNames   = crew.flatMap(d => d.members.map(m => m.name).filter(Boolean))
  const talentNames = talent.map(t => t.name).filter(Boolean)
  const allNames    = [...new Set([...crewNames, ...talentNames])]

  // Roles tab: dept names first, then preset roles not already in deptNames
  const deptNames = [...new Set(crew.map(d => d.dept).filter(Boolean))]
  const allRoles  = [...new Set([...deptNames, ...PRESET_ROLES])]

  function toggle(item: string) {
    if (item === 'Everyone') {
      onChange(isEveryone ? '' : 'Everyone')
      return
    }
    // If "Everyone" was active, replace with just this one
    if (isEveryone) {
      onChange(serializeSelected([item]))
      return
    }
    const next = selected.includes(item)
      ? selected.filter(n => n !== item)
      : [...selected, item]
    onChange(serializeSelected(next))
  }

  function openPicker() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top:   rect.bottom + 4,
      left:  rect.left,
      width: Math.max(rect.width, 280),
    })
    setOpen(true)
  }

  // Close on click outside trigger + portal
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (portalRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Close when the PAGE scrolls — but NOT when the user scrolls inside the dropdown itself
  useEffect(() => {
    if (!open) return
    function handle(e: Event) {
      if (portalRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('scroll', handle, true)
    return () => window.removeEventListener('scroll', handle, true)
  }, [open])

  // Display label in the trigger
  const displayLabel =
    selected.length === 0  ? null
    : selected.length <= 3 ? selected.join(', ')
    : `${selected.slice(0, 2).join(', ')} +${selected.length - 2} more`

  const dropdown = mounted && open && pos
    ? createPortal(
        <div
          ref={portalRef}
          style={{
            position: 'fixed',
            top:      pos.top,
            left:     pos.left,
            width:    pos.width,
            zIndex:   9999,
          }}
          className="rounded-lg border bg-card shadow-xl overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex border-b">
            {(['names', 'roles'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  'flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
                  tab === t
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {t === 'names' ? 'Names' : 'Roles'}
              </button>
            ))}
          </div>

          {/* Options list */}
          <div className="max-h-[210px] overflow-y-auto divide-y divide-border/30">
            {tab === 'names' && (
              <>
                {/* Everyone option */}
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 select-none">
                  <input
                    type="checkbox"
                    checked={isEveryone}
                    onChange={() => toggle('Everyone')}
                    className="rounded accent-primary"
                  />
                  <span className="text-sm font-semibold text-foreground">Everyone</span>
                </label>

                {allNames.length === 0 && (
                  <p className="px-3 py-5 text-center text-xs text-muted-foreground italic">
                    Add people to Crew or Talent first
                  </p>
                )}

                {allNames.map(name => (
                  <label key={name} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/40 select-none">
                    <input
                      type="checkbox"
                      checked={isEveryone || selected.includes(name)}
                      onChange={() => toggle(name)}
                      disabled={isEveryone}
                      className="rounded accent-primary disabled:opacity-40"
                    />
                    <span className="text-sm text-foreground">{name}</span>
                  </label>
                ))}
              </>
            )}

            {tab === 'roles' && (
              allRoles.map(role => (
                <label key={role} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/40 select-none">
                  <input
                    type="checkbox"
                    checked={selected.includes(role)}
                    onChange={() => toggle(role)}
                    className="rounded accent-primary"
                  />
                  <span className="text-sm text-foreground">{role}</span>
                </label>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-3 py-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <div ref={triggerRef} className="relative flex-1">
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() }
        }}
        className={[
          'w-full min-h-[34px] cursor-pointer rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm',
          'hover:border-ring focus:outline-none focus:ring-1 focus:ring-ring flex items-center',
          open ? 'ring-1 ring-ring border-ring' : '',
        ].join(' ')}
      >
        {displayLabel
          ? <span className="text-foreground truncate">{displayLabel}</span>
          : <span className="text-muted-foreground">Who&apos;s needed…</span>
        }
      </div>
      {dropdown}
    </div>
  )
}
