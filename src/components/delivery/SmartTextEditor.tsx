'use client'

import { useRef, useState, useEffect } from 'react'
import { Link as LinkIcon, Bold, Italic, Underline, List, ListOrdered, Braces, Pilcrow } from 'lucide-react'

// Merge tags available for insertion in contract/template contexts
const MERGE_TAGS = [
  { group: 'Company',  label: 'Company name',     tag: '{{workspace.name}}'        },
  { group: 'Company',  label: 'Legal name',        tag: '{{workspace.legalName}}'   },
  { group: 'Client',   label: 'Client name',       tag: '{{client.name}}'           },
  { group: 'Project',  label: 'Project name',      tag: '{{project.name}}'          },
  { group: 'Proposal', label: 'Proposal total',    tag: '{{proposal.total}}'        },
  { group: 'Proposal', label: 'Valid through date', tag: '{{proposal.validThrough}}' },
]

interface Props {
  value:          string
  onChange:       (v: string) => void
  placeholder?:   string
  rows?:          number
  label?:         string
  showMergeTags?: boolean
}

export function SmartTextEditor({ value, onChange, placeholder, rows = 3, label, showMergeTags = false }: Props) {
  const ref        = useRef<HTMLTextAreaElement>(null)
  const tagMenuRef = useRef<HTMLDivElement>(null)
  const [tagMenuOpen, setTagMenuOpen] = useState(false)

  // Close tag menu on outside click
  useEffect(() => {
    if (!tagMenuOpen) return
    function handle(e: MouseEvent) {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setTagMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [tagMenuOpen])

  // ── Insert at cursor ─────────────────────────────────────────────────────────

  function insertAtCursor(text: string) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value: v } = el
    const next = v.slice(0, s) + text + v.slice(e)
    onChange(next)
    setTagMenuOpen(false)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(s + text.length, s + text.length)
    }, 0)
  }

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

    const regionStart = v.lastIndexOf('\n', s - 1) + 1

    if (s === e) {
      const prefix = getPrefix(0)
      const next = v.slice(0, regionStart) + prefix + v.slice(regionStart)
      onChange(next)
      setTimeout(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length) }, 0)
      return
    }

    const selected = v.slice(regionStart, e)
    const lines    = selected.split('\n')
    const prefixed = lines.map((line, i) => getPrefix(i) + line).join('\n')
    const next     = v.slice(0, regionStart) + prefixed + v.slice(e)
    onChange(next)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(regionStart, regionStart + prefixed.length)
    }, 0)
  }

  function handleBulletList()     { prefixSelectedLines(() => '- ') }
  function handleNumberedList()   { prefixSelectedLines(i => `${i + 1}. `) }
  function handleParagraphBreak() { insertAtCursor('\n\n') }

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
        <div className="flex items-center gap-0.5 border-b border-input bg-muted/30 px-2 py-1 rounded-t-md flex-wrap">
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
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleParagraphBreak() }}
            title="New paragraph (blank line)"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none"
          >
            <Pilcrow className="h-3.5 w-3.5" />
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

          {/* ── Merge tags dropdown ── */}
          {showMergeTags && (
            <>
              <div className="w-px h-4 bg-border mx-0.5" />
              <div ref={tagMenuRef} className="relative">
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setTagMenuOpen(v => !v) }}
                  title="Insert merge tag"
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono font-medium select-none transition-colors ${
                    tagMenuOpen
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Braces className="h-3.5 w-3.5" />
                  <span>Tags</span>
                </button>

                {tagMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-md border border-border bg-popover shadow-md py-1">
                    {MERGE_TAGS.map(({ label: tLabel, tag, group }) => (
                      <button
                        key={tag}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); insertAtCursor(tag) }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                      >
                        <span className="text-muted-foreground text-[10px] uppercase tracking-wide block leading-none mb-0.5">{group}</span>
                        <span className="font-medium text-foreground">{tLabel}</span>
                        <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">{tag}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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
        {showMergeTags && ' Use Tags to insert dynamic values like company or client name.'}
      </p>
    </div>
  )
}
