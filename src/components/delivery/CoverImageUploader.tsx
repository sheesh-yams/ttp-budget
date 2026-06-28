'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, X, ImageIcon } from 'lucide-react'
import { getPresignedUploadUrl } from '@/server/actions/upload'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES     = 5 * 1024 * 1024 // 5 MB for covers

interface Props {
  currentUrl:       string | null
  onUploadComplete: (url: string) => void
}

export function CoverImageUploader({ currentUrl, onUploadComplete }: Props) {
  const inputRef              = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, or WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 5 MB.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setLoading(true)

    try {
      const ticketResult = await getPresignedUploadUrl(file.name, file.type, file.size, 'delivery-covers')
      if (!ticketResult.success) {
        setError('error' in ticketResult ? ticketResult.error : 'Upload failed.')
        setPreview(currentUrl)
        return
      }

      const { uploadUrl, publicUrl } = ticketResult.data
      const res = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })

      if (!res.ok) {
        setError(`Upload failed (HTTP ${res.status}).`)
        setPreview(currentUrl)
        return
      }

      onUploadComplete(publicUrl)
    } catch {
      setError('Upload failed. Check your connection.')
      setPreview(currentUrl)
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="relative w-full overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer"
        style={{ aspectRatio: '16/5' }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Cover preview"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted/40 text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
            <span className="text-[11px] font-medium">Click or drop to upload cover image</span>
            <span className="text-[10px]">JPEG, PNG or WebP · max 5 MB</span>
          </div>
        )}

        {/* Hover overlay when image is set */}
        {preview && !loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 hover:bg-black/40 transition-colors">
            <Upload className="h-4 w-4 text-white opacity-0 hover:opacity-100" />
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Upload className="h-3 w-3" />
          {preview ? 'Replace' : 'Upload cover'}
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => { setPreview(null); onUploadComplete('') }}
            disabled={loading}
            className="text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        className="sr-only"
        aria-hidden
      />
    </div>
  )
}
