'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BookUser } from 'lucide-react'

export interface RolodexContact {
  id:          string
  name:        string
  primaryRole: string
  email:       string | null
  phone:       string | null
}

interface DropdownPos {
  top:   number
  left:  number
  width: number
}

interface Props {
  value:        string
  contacts:     RolodexContact[]
  placeholder?: string
  className?:   string
  onChange:     (value: string) => void
  onSelect:     (contact: RolodexContact) => void
}

export function RolodexNameInput({
  value,
  contacts,
  placeholder = 'Name',
  className = '',
  onChange,
  onSelect,
}: Props) {
  const inputRef    = useRef<HTMLInputElement>(null)
  const [focused,   setFocused]   = useState(false)
  const [pos,       setPos]       = useState<DropdownPos | null>(null)
  const [mounted,   setMounted]   = useState(false)

  // Wait for client mount before using portals
  useEffect(() => { setMounted(true) }, [])

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(value.toLowerCase().trim())
  ).slice(0, 8)

  const showDropdown = focused && filtered.length > 0 && value.trim() !== ''

  // Recompute dropdown position whenever it becomes visible
  useEffect(() => {
    if (!showDropdown || !inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setPos({
      top:   rect.bottom + 4,
      left:  rect.left,
      width: Math.max(rect.width, 224),
    })
  }, [showDropdown, value])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Close on scroll (reposition or hide)
  useEffect(() => {
    function handle() { setFocused(false) }
    window.addEventListener('scroll', handle, true)
    return () => window.removeEventListener('scroll', handle, true)
  }, [])

  const dropdown = mounted && showDropdown && pos
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            top:      pos.top,
            left:     pos.left,
            width:    pos.width,
            zIndex:   9999,
          }}
          className="rounded-lg border bg-card shadow-xl overflow-hidden"
        >
          {/* Purple header */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5"
            style={{ background: 'var(--brand-primary, #5D00A4)' }}
          >
            <BookUser className="h-3 w-3 text-white/70" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white">
              Rolodex
            </span>
          </div>

          {/* Contact rows */}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                onSelect(c)
                setFocused(false)
              }}
              className={`flex w-full flex-col px-2.5 py-2 text-left hover:bg-muted/60 transition-colors ${
                i > 0 ? 'border-t border-border/30' : ''
              }`}
            >
              <span className="text-sm font-medium text-foreground leading-tight">{c.name}</span>
              <span className="text-[10px] text-muted-foreground">{c.primaryRole}</span>
            </button>
          ))}
        </div>,
        document.body
      )
    : null

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        className={className}
        onChange={e => { onChange(e.target.value); setFocused(true) }}
        onFocus={() => setFocused(true)}
        onKeyDown={e => { if (e.key === 'Escape') setFocused(false) }}
      />
      {dropdown}
    </div>
  )
}
