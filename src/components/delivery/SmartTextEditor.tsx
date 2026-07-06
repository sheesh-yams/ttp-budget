'use client'

import { useRef } from 'react'
import { Link as LinkIcon, Bold, Italic, Underline, List, ListOrdered } from 'lucide-react'

interface Props {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  rows?:        number
  label?:       string
}

export function SmartTextEditor({ value, onChange, placeholder, rows = 3, label }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // ── Inline wrap helpers ──────────────────────────────────────────────────────

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

  function handleBold()      { wrapSelection('**', '**', 'bold text') }
  function handleItalic()    { wrapSelection('_', '_', 'italic text') }
  function handleUnderline() { wrapSelection('++', '++', 'underlined text') }

  // ── List helpers ─────────────────────────────────────────────────────────────

  function prefixSelectedLines(getPrefix: (lineIndex: number) => string) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value: v } = el

    // Expand selection to include the full first line
    const regionStart = v.lastIndexOf('\n', s - 1) + 1

    if (s === e) {
      // No selection — prefix just the current line
      const prefix = getPrefix(0)
      const next = v.slice(0, regionStart) + prefix + v.slice(regionStart)
      onChange(next)
      setTimeout(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length) }, 0)
      return
    }

    const selected = v.slice(regionStart, e)
    const lines = selected.split('\n')
    const prefixed = lines.map((line, i) => getPrefix(i) + line).join('\n')
    const next = v.slice(0, regionStart) + prefixed + v.slice(e)
    onChange(next)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(regionStart, regionStart + prefixed.length)
    }, 0)
  }

  function handleBulletList()   { prefixSelectedLines(() => '- ') }
  function handleNumberedList() { prefixSelectedLines(i => `${i + 1}. `) }

  // ── Link ─────────────────────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────────

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
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleItalic() }}
            title="Italic (_text_)"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleUnderline() }}
            title="Underline (++text++)"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleBulletList() }}
            title="Bullet list (- item)"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleNumberedList() }}
            title="Numbered list (1. item)"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleLink() }}
            title="Link [text](url)"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-b-md bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none resize-y"
        />
      </div>
      <p className="text-[10px] text-muted-foreground/50">
        Select text then click a button, or click to insert at cursor.
      </p>
    </div>
  )
}
