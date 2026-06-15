'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, FileImage, FileText, X, Loader2, AlertCircle } from 'lucide-react'
import { getReceiptUploadUrl, createReceiptRecord } from '@/server/actions/receipts'
import type { ReceiptDb } from '@/server/actions/receipts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  projectId:     string
  actualEntryId?: string | null  // if set, newly uploaded receipts link to this entry immediately
  onUploaded:    (receipt: ReceiptDb) => void
  // When true, listens for global paste events (use on a page with no other paste targets)
  listenPaste?:  boolean
  compact?:      boolean          // smaller drop zone for the sidebar
}

interface UploadItem {
  id:       string
  file:     File
  status:   'uploading' | 'done' | 'error'
  error?:   string
  preview?: string  // blob URL for images
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPTED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
])

function isImage(type: string) {
  return type.startsWith('image/')
}

function formatBytes(bytes: number) {
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME.has(file.type)) return 'Only JPEG, PNG, WebP, and PDF files are allowed.'
  if (file.size > 10 * 1024 * 1024)  return 'File must be under 10 MB.'
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReceiptUploader({
  projectId,
  actualEntryId = null,
  onUploaded,
  listenPaste = false,
  compact = false,
}: Props) {
  const [queue, setQueue]       = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)
  const dragCounter             = useRef(0)

  // ── Upload a single file ──────────────────────────────────────────────────

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    const item: UploadItem = {
      id:      crypto.randomUUID(),
      file,
      status:  validationError ? 'error' : 'uploading',
      error:   validationError ?? undefined,
      preview: isImage(file.type) ? URL.createObjectURL(file) : undefined,
    }

    setQueue(q => [...q, item])
    if (validationError) return

    try {
      // 1. Get presigned PUT ticket from our server
      const ticket = await getReceiptUploadUrl(projectId, file.type, file.size, file.name)
      if ('error' in ticket) {
        setQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: ticket.error } : i))
        return
      }

      // 2. PUT binary directly to R2 — Next.js server never touches the bytes
      const put = await fetch(ticket.data.uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) throw new Error(`R2 PUT failed: ${put.status}`)

      // 3. Persist the DB record
      const record = await createReceiptRecord(
        projectId,
        ticket.data.publicUrl,
        file.name,
        file.type,
        file.size,
        actualEntryId,
      )
      if ('error' in record) {
        setQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: record.error } : i))
        return
      }

      setQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'done' } : i))
      onUploaded(record.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      setQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: msg } : i))
    }
  }, [projectId, actualEntryId, onUploaded])

  // ── Accept a FileList from any source ────────────────────────────────────

  const enqueue = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(f => uploadFile(f))
  }, [uploadFile])

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current += 1
    setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current === 0) setDragging(false)
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files)
  }

  // ── Global paste listener ─────────────────────────────────────────────────

  useEffect(() => {
    if (!listenPaste) return
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        enqueue(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [listenPaste, enqueue])

  // ── File input change ─────────────────────────────────────────────────────

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) enqueue(e.target.files)
    e.target.value = ''
  }

  function dismissItem(id: string) {
    setQueue(q => {
      const item = q.find(i => i.id === id)
      if (item?.preview) URL.revokeObjectURL(item.preview)
      return q.filter(i => i.id !== id)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        className={`
          relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed
          transition-colors
          ${compact ? 'gap-1 py-4' : 'gap-2 py-8'}
          ${dragging
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50'
          }
        `}
      >
        <Upload className={compact ? 'h-5 w-5' : 'h-8 w-8'} />
        <p className={compact ? 'text-xs' : 'text-sm font-medium'}>
          {dragging ? 'Drop to upload' : 'Drop files or click to browse'}
        </p>
        {!compact && (
          <p className="text-xs">JPEG, PNG, WebP, PDF · max 10 MB</p>
        )}
        {listenPaste && !compact && (
          <p className="text-xs opacity-70">Or paste from clipboard (⌘V)</p>
        )}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onInputChange}
        />
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map(item => (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                item.status === 'error' ? 'border-red-200 bg-red-50' : 'border-border bg-card'
              }`}
            >
              {/* Thumbnail or icon */}
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Name + status */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{item.file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatBytes(item.file.size)}
                  {item.status === 'error' && (
                    <span className="ml-1 text-red-600"> · {item.error}</span>
                  )}
                </p>
              </div>

              {/* Status indicator */}
              <div className="shrink-0">
                {item.status === 'uploading' && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {item.status === 'error' && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                {item.status === 'done' && (
                  <FileImage className="h-4 w-4 text-emerald-500" />
                )}
              </div>

              {/* Dismiss */}
              {item.status !== 'uploading' && (
                <button
                  onClick={e => { e.stopPropagation(); dismissItem(item.id) }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
