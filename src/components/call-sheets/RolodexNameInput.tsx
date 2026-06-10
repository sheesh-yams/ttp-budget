'use client'

import { useState, useRef, useEffect } from 'react'
import { BookUser } from 'lucide-react'

export interface RolodexContact {
  id:          string
  name:        string
  primaryRole: string
  email:       string | null
  phone:       string | null
}

interface Props {
  value:       string
  contacts:    RolodexContact[]
  placeholder?: string
  className?:  string
  onChange:    (value: string) => void
  onSelect:    (contact: RolodexContact) => void
}

export function RolodexNameInput({
  value,
  contacts,
  placeholder = 'Name',
  className = '',
  onChange,
  onSelect,
}: Props) {
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(value.toLowerCase().trim())
  ).slice(0, 8)

  const showDropdown = focused && filtered.length > 0 && value.trim() !== ''

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        placeholder={placeholder}
        value={value}
        className={className}
        onChange={e => { onChange(e.target.value); setFocused(true) }}
        onFocus={() => setFocused(true)}
        onKeyDown={e => { if (e.key === 'Escape') { setFocused(false) } }}
      />

      {showDropdown && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border bg-card shadow-lg overflow-hidden">
          <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
            <BookUser className="h-3 w-3 text-primary/60" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Rolodex</span>
          </div>
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                onSelect(c)
                setFocused(false)
              }}
              className="flex w-full flex-col gap-0 px-2.5 py-2 text-left hover:bg-muted/60 transition-colors"
            >
              <span className="text-sm font-medium text-foreground leading-tight">{c.name}</span>
              <span className="text-[10px] text-muted-foreground">{c.primaryRole}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
