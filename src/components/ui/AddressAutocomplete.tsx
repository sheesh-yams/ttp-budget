'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

interface Suggestion {
  display: string
  value: string  // cleaned address to put in the field
}

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function AddressAutocomplete({ id, value, onChange, placeholder, disabled, className }: Props) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external value changes (e.g. on reset)
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 4) { setSuggestions([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/address-autocomplete?q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (!res.ok) throw new Error('search failed')
      const data: Suggestion[] = await res.json()
      setSuggestions(data)
      setOpen(data.length > 0)
      setActiveIdx(-1)
    } catch {
      setSuggestions([])
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    onChange(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 350)
  }

  function handleSelect(s: Suggestion) {
    setQuery(s.value)
    onChange(s.value)
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          placeholder={placeholder}
          disabled={disabled}
          className={
            className ??
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed'
          }
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md py-1 text-sm max-h-60 overflow-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={i}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={e => { e.preventDefault(); handleSelect(s) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-2 cursor-pointer leading-snug ${
                i === activeIdx ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {s.display}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
