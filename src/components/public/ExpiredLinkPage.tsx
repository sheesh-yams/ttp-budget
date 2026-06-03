import { Clock } from 'lucide-react'

interface Props {
  type: 'proposal' | 'invoice' | 'call-sheet'
}

const COPY = {
  proposal:   { noun: 'proposal',   verb: 'proposal' },
  invoice:    { noun: 'invoice',    verb: 'invoice'  },
  'call-sheet': { noun: 'call sheet', verb: 'call sheet' },
}

export function ExpiredLinkPage({ type }: Props) {
  const { noun } = COPY[type]

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: '#0A0612' }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full mb-6"
        style={{ background: 'rgba(93,0,164,0.2)', border: '1px solid rgba(93,0,164,0.4)' }}
      >
        <Clock className="h-7 w-7" style={{ color: '#04FFCC' }} />
      </div>

      <h1 className="text-2xl font-semibold text-white mb-3">
        This link has expired
      </h1>

      <p className="text-white/50 max-w-sm leading-relaxed mb-8">
        The {noun} you&apos;re looking for is no longer accessible via this link.
        Please contact the sender to request an updated link.
      </p>

      <div
        className="rounded-xl border px-6 py-4 text-sm text-white/40 max-w-sm text-left"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="font-medium text-white/60 mb-1">What to do next</p>
        <p>
          Reach out to whoever sent you this {noun} and ask them to share a
          new link. Links expire for security reasons to protect sensitive information.
        </p>
      </div>
    </div>
  )
}
