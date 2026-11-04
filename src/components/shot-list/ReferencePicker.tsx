'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Link2, Loader2, Star, Trash2, ImagePlus } from 'lucide-react'
import { getPresignedUploadUrl } from '@/server/actions/upload'
import { addLinkReference, addUploadedReference, deleteReference, makeHeroReference } from '@/server/actions/shot-list'
import type { ShotReferenceView } from '@/lib/shot-list'
import { downscaleToJpeg } from './downscale'
import { SL } from './styles'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic']

function errorOf(res: { success: boolean }): string {
  return (res as { success: false; error: string }).error ?? 'Something went wrong.'
}

/**
 * References for one shot: upload (click / drop / ⌘V), or paste a link and
 * we save its preview. The first reference is the ★ thumbnail.
 */
export function ReferencePicker({
  shotId, references, canEdit, onChange,
}: {
  shotId:     string
  references: ShotReferenceView[]
  canEdit:    boolean
  onChange:   (refs: ShotReferenceView[]) => void
}) {
  const [busy, setBusy]       = useState<string | null>(null) // what we're doing, for the line under the box
  const [error, setError]     = useState<string | null>(null)
  const [link, setLink]       = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const refsRef  = useRef(references)
  refsRef.current = references

  async function uploadFile(file: File) {
    if (!ACCEPT.includes(file.type) && !file.type.startsWith('image/')) { setError('That file isn’t an image.'); return }
    setError(null); setBusy('Uploading…')
    try {
      const jpeg = await downscaleToJpeg(file)
      const presign = await getPresignedUploadUrl('reference.jpg', 'image/jpeg', jpeg.size, 'shot-references')
      if (!presign.success) { setError(errorOf(presign)); return }
      const put = await fetch(presign.data.uploadUrl, { method: 'PUT', body: jpeg, headers: { 'Content-Type': 'image/jpeg' } })
      if (!put.ok) { setError('Upload failed — try again.'); return }
      const res = await addUploadedReference(shotId, presign.data.publicUrl)
      if (!res.success) { setError(errorOf(res)); return }
      onChange([...refsRef.current, res.data])
    } catch {
      setError('Couldn’t read that image.')
    } finally {
      setBusy(null)
    }
  }

  async function addLink(raw: string) {
    if (!raw.trim()) return
    setError(null); setBusy('Fetching the preview…')
    try {
      const res = await addLinkReference(shotId, raw)
      if (!res.success) { setError(errorOf(res)); return }
      onChange([...refsRef.current, res.data])
      setLink('')
      if (!res.data.imageUrl) setError('Saved as a link — that site doesn’t share a preview. Paste a screenshot to show a frame.')
    } finally {
      setBusy(null)
    }
  }

  async function makeHero(id: string) {
    const ref = references.find(r => r.id === id)
    if (!ref) return
    onChange([ref, ...references.filter(r => r.id !== id)])
    const res = await makeHeroReference(id)
    if (!res.success) setError(errorOf(res))
  }

  async function remove(id: string) {
    onChange(references.filter(r => r.id !== id))
    const res = await deleteReference(id)
    if (!res.success) setError(errorOf(res))
  }

  // ⌘V anywhere in the drawer: an image uploads; a link is added.
  useEffect(() => {
    if (!canEdit) return
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.dataset.refLink !== '1'
      const items = Array.from(e.clipboardData?.items ?? [])
      const img = items.find(i => i.kind === 'file' && i.type.startsWith('image/'))
      if (img) {
        const f = img.getAsFile()
        if (f) { e.preventDefault(); void uploadFile(f) }
        return
      }
      if (inField) return // ordinary typing / pasting into a shot field
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  // uploadFile reads refs through refsRef; re-binding per shot is enough.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotId, canEdit])

  return (
    <div>
      {references.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {references.map((r, i) => (
            <div key={r.id} className={`group relative aspect-video overflow-hidden rounded-[3px] bg-[#F3F2EF] ${i === 0 ? 'outline outline-2 outline-offset-1 outline-primary' : ''}`}>
              {r.imageUrl
                ? <a href={r.sourceUrl ?? r.imageUrl} target="_blank" rel="noopener noreferrer"><img src={r.imageUrl} alt="" className="h-full w-full object-cover" /></a>
                : <a href={r.sourceUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-[#6B6B6B]"><Link2 className="h-4 w-4" />{r.sourceHost ?? 'Link'}</a>}
              {r.sourceHost && r.imageUrl && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] text-white">
                  {r.sourceHost} <ExternalLink className="inline h-2.5 w-2.5" />
                </span>
              )}
              {canEdit && (
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {i > 0 && (
                    <button type="button" title="Use as the thumbnail" onClick={() => makeHero(r.id)} className="grid h-6 w-6 place-items-center rounded-[3px] bg-black/60 text-white hover:bg-black/80">
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button type="button" title="Remove" onClick={() => remove(r.id)} className="grid h-6 w-6 place-items-center rounded-[3px] bg-black/60 text-white hover:bg-black/80">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
              {i === 0 && <Star className="pointer-events-none absolute left-1.5 top-1.5 h-3 w-3 fill-[#04FFCC] text-[#04FFCC] drop-shadow" />}
            </div>
          ))}
        </div>
      )}
      {references.length === 0 && !canEdit && <p className={`text-sm ${SL.mut}`}>No references yet.</p>}

      {canEdit && (
        <div
          className={`mt-2.5 rounded-[4px] border border-dashed p-3 text-[13px] ${dragging ? 'border-primary bg-secondary' : `border-[#D3D0CB] ${SL.band}`} ${SL.t2}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) { void uploadFile(f); return }
            const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
            if (text) void addLink(text.split('\n')[0])
          }}
        >
          <button type="button" onClick={() => fileRef.current?.click()} className={`inline-flex items-center gap-1.5 font-medium ${SL.ink} hover:underline`}>
            <ImagePlus className="h-4 w-4" /> Drop, click or paste (⌘V)
          </button>{' '}an image, or paste a link:
          <form className="mt-2 flex gap-1.5" onSubmit={e => { e.preventDefault(); void addLink(link) }}>
            <input
              data-ref-link="1"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://… ShotDeck, FilmGrab, Pinterest, YouTube"
              className={SL.input}
              disabled={!!busy}
            />
            <button type="submit" className={SL.btnPrimary} disabled={!!busy || !link.trim()}>Add</button>
          </form>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = '' }} />
        </div>
      )}
      {busy && <p className={`mt-2 flex items-center gap-1.5 text-xs ${SL.t2}`}><Loader2 className="h-3 w-3 animate-spin" /> {busy}</p>}
      {error && <p className="mt-2 text-xs text-amber-700" role="status">{error}</p>}
      {canEdit && !busy && !error && (
        <p className={`mt-2 text-xs leading-relaxed ${SL.mut}`}>★ is the frame shown on the list, storyboard and PDF. For a link we save a copy of its preview, so it never breaks.</p>
      )}
    </div>
  )
}
