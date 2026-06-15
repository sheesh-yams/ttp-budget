'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, X } from 'lucide-react'
import { getPresignedUploadUrl } from '@/server/actions/upload'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES     = 2 * 1024 * 1024 // 2 MB

interface Props {
  /** URL of the current image (shown as preview). Pass null for no image. */
  currentUrl:        string | null
  /** Called with the permanent public R2 URL once the upload succeeds. */
  onUploadComplete:  (url: string) => void
  /** R2 folder prefix — keeps avatars separate from workspace logos. */
  folder:            'avatars' | 'logos'
  /** Pixel size of the circular preview (default: 80). */
  size?:             number
  /** Initials or fallback icon shown when currentUrl is null. */
  fallback?:         React.ReactNode
  className?:        string
}

/**
 * Circular avatar uploader.
 *
 * Flow:
 *  1. User picks a file (click or drop).
 *  2. Client validates MIME type, byte size.
 *  3. Server action returns a 60 s presigned PUT URL + permanent public URL.
 *  4. Browser PUTs the binary directly to R2 — our server never sees the bytes.
 *  5. onUploadComplete fires with the permanent URL for the caller to persist.
 */
export function ImageUploader({
  currentUrl,
  onUploadComplete,
  folder,
  size = 80,
  fallback,
  className = '',
}: Props) {
  const inputRef              = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

  // Keep preview in sync if the parent prop changes (e.g. edit mode reload)
  // Use a ref to avoid stale closure without useEffect dep noise
  const prevCurrentUrl = useRef(currentUrl)
  if (currentUrl !== prevCurrentUrl.current) {
    prevCurrentUrl.current = currentUrl
    setPreview(currentUrl)
  }

  async function handleFile(file: File) {
    setError(null)

    // ── Client-side validation ───────────────────────────────────────────────
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, or WebP images are allowed.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 2 MB.')
      return
    }

    // Optimistic local preview so the UI feels instant
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setLoading(true)

    try {
      // Step 1: ask the server for a signed ticket
      const ticketResult = await getPresignedUploadUrl(
        file.name,
        file.type,
        file.size,
        folder,
      )
      if (!ticketResult.success) {
        setError('error' in ticketResult ? ticketResult.error : 'Upload failed.')
        setPreview(currentUrl)  // revert optimistic preview
        return
      }

      const { uploadUrl, publicUrl } = ticketResult.data

      // Step 2: PUT binary directly to R2 (no Next.js server in the data path)
      const res = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })

      if (!res.ok) {
        setError(`Upload failed (HTTP ${res.status}). Please try again.`)
        URL.revokeObjectURL(objectUrl)
        setPreview(currentUrl)
        return
      }

      // Keep the local blob URL as the preview — it's already rendering correctly
      // and avoids depending on the R2 public URL being immediately readable.
      // The public URL is only needed for DB persistence via the callback.
      onUploadComplete(publicUrl)
    } catch {
      setError('Upload failed. Check your connection and try again.')
      setPreview(currentUrl)
    } finally {
      setLoading(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so the same file can be re-selected if the user clears the error
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const dim = `${size}px`

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* Avatar circle — click to pick, drag to drop */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        disabled={loading}
        className="relative rounded-full overflow-hidden border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
        style={{ width: dim, height: dim, flexShrink: 0 }}
        title="Click or drop to upload image"
        aria-label="Upload avatar"
      >
        {/* Preview or fallback */}
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Avatar preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
            {fallback ?? <Upload className="w-5 h-5" />}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        )}

        {/* Hover overlay with camera icon when an image is already set */}
        {!loading && preview && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors">
            <Upload className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
          </div>
        )}
      </button>

      {/* Clear button — only when an image is set */}
      {preview && !loading && (
        <button
          type="button"
          onClick={() => { setPreview(null); onUploadComplete('') }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="w-3 h-3" />
          Remove photo
        </button>
      )}

      {/* Hint */}
      {!preview && !error && (
        <p className="text-[11px] text-muted-foreground text-center leading-tight">
          JPEG, PNG or WebP<br />max 2 MB
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-[11px] text-destructive text-center leading-tight max-w-[120px]">
          {error}
        </p>
      )}

      {/* Hidden native file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden
      />
    </div>
  )
}
