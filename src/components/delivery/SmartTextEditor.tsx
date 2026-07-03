'use client'

import { useRef } from 'react'
import { Link as LinkIcon } from 'lucide-react'

interface Props {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  rows?:        number
  label?:       string
}

export function SmartTextEditor({ value, onChange, placeholder, rows = 3, label }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function wrapSelection(open: string, close: string, fallback: string) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value: v } = el
    const selected = v.slice(s, e) || fallback
    const next = v.slice(0, s) + open + selected + close + v.slice(e)
    onChange(next)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(s + open.length, s + open.length + selected.length)
    }, 0)
  }

  function handleBold() {
    wrapSelection('**', '**', 'bold text')
  }

  function handleLink() {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value: v } = el
    const selected = v.slice(s, e) || 'link text'
    const url = prompt('Link URL:', 'https://')
    if (!url?.trim()) return
    const next = v.slice(0, s) + `[${selected}](${url.trim()})` + v.slice(e)
    onChange(next)
    setTimeout(() => el.focus(), 0)
  }

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          {label}
        </label>
      )}
      <div className="rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-b border-input bg-muted/30 px-2 py-1 rounded-t-md">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleBold() }}
            title="Bold (**text**)"
            className="rounded px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            B
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleLink() }}
            title="Link [text](url)"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <LinkIcon className="h-3 w-3" />
          </button>
        </div>
        {/* Textarea */}
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-b-md bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none resize-none"
        />
      </div>
      <p className="text-[10px] text-muted-foreground/50">
        <span className="font-bold">B</span> = **bold** &nbsp;·&nbsp; link = [text](https://...)
      </p>
    </div>
  )
}
