'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Copy, Check, ExternalLink } from 'lucide-react'

interface Props {
  /** The server action to call — returns { success, data: { token } } or { success: false, error } */
  onRegenerate: () => Promise<{ success: true; data: { token: string } } | { success: false; error: string }>
  /** Current public URL (shown + copyable) */
  currentUrl: string
  /** Route prefix: 'p', 'i', or 'cs' */
  prefix: 'p' | 'i' | 'cs'
}

export function RegenerateTokenButton({ onRegenerate, currentUrl, prefix }: Props) {
  const [url, setUrl]           = useState(currentUrl)
  const [copied, setCopied]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  function handleRegenerate() {
    setError(null)
    startTransition(async () => {
      const result = await onRegenerate()
      setShowConfirm(false)
      if (result.success) {
        const newUrl = `${window.location.origin}/${prefix}/${result.data.token}`
        setUrl(newUrl)
      } else if (!result.success) {
        const r = result as { success: false; error: string }
        setError(r.error)
      }
    })
  }

  return (
    <div className="space-y-2">
      {/* URL display + copy button */}
      <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2">
        <span className="flex-1 truncate text-xs font-mono text-muted-foreground">{url}</span>
        <button
          onClick={copyUrl}
          className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy link"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Open link"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Regenerate button */}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
        Regenerate link
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}
        >
          <div
            className="w-[380px] rounded-xl border border-white/[0.1] p-6 shadow-2xl"
            style={{ background: '#130B22' }}
          >
            <h2 className="mb-1 text-[15px] font-semibold text-white">Regenerate shared link?</h2>
            <p className="mb-5 text-[12.5px] text-white/50 leading-relaxed">
              This will permanently invalidate the current shared link. Anyone using the old link
              will immediately lose access and see an &ldquo;expired&rdquo; page.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-white/[0.12] py-2 text-[12.5px] font-medium text-white/50 hover:text-white/75 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isPending}
                className="flex-1 rounded-lg py-2 text-[12.5px] font-semibold text-[#003D31] transition-opacity disabled:opacity-40"
                style={{ background: '#04FFCC' }}
              >
                {isPending ? 'Regenerating…' : 'Yes, regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
