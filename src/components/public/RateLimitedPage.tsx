import { ShieldAlert } from 'lucide-react'

export function RateLimitedPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: '#0A0612' }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full mb-6"
        style={{ background: 'rgba(93,0,164,0.2)', border: '1px solid rgba(93,0,164,0.4)' }}
      >
        <ShieldAlert className="h-7 w-7" style={{ color: '#04FFCC' }} />
      </div>

      <h1 className="text-2xl font-semibold text-white mb-3">
        Too many requests
      </h1>

      <p className="text-white/50 max-w-sm leading-relaxed">
        You&apos;ve made too many requests in a short period. Please wait a moment and try again.
      </p>
    </div>
  )
}
