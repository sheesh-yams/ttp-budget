'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The vendor's signature block at the bottom of /dm/[token]. Posts to the
 * public sign route, which checks the email against the one the memo was
 * sent to and records name, email, IP and time.
 */
export function DealMemoSignForm({
  memoId, token, sentAt, brand, vendorName,
}: {
  memoId: string; token: string; sentAt: string; brand: string; vendorName: string
}) {
  const router = useRouter()
  const [name, setName]     = useState(vendorName)
  const [email, setEmail]   = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed) { setError('Tick the box to confirm you agree.'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/deal-memos/${memoId}/sign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signatureName: name, signatureEmail: email, token, sentAt, agreedToTerms: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Something went wrong — please try again.'); return }
      router.refresh()
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 print:hidden">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: brand }}>Sign</p>
        <p className="mt-1 text-sm text-[#555]">
          By signing you agree to the rates and terms above. Use the email address this deal memo was sent to.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[#888780]">Full name</span>
          <input
            value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={120}
            className="w-full rounded-lg border border-[#E8E0F0] px-3 py-2 text-sm outline-none focus:border-[#5D00A4]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[#888780]">Email</span>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
            className="w-full rounded-lg border border-[#E8E0F0] px-3 py-2 text-sm outline-none focus:border-[#5D00A4]"
          />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-[#2C2C2A]">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>I have read and agree to this deal memo, and this is my electronic signature.</span>
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: brand }}
      >
        {busy ? 'Signing…' : 'Sign deal memo'}
      </button>
    </form>
  )
}
