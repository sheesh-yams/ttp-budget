import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { trustedClientIp } from '@/lib/client-ip'
import { ExpiredLinkPage } from '@/components/public/ExpiredLinkPage'
import { RateLimitedPage } from '@/components/public/RateLimitedPage'
import { DealMemoDocument } from '@/components/deal-memos/DealMemoDocument'
import { DealMemoSignForm } from '@/components/deal-memos/DealMemoSignForm'
import { loadDealMemoByToken, recordDealMemoView } from '@/lib/deal-memo-signing'
import type { VendorDealMemo } from '@/lib/deal-memo-vendor-view'

export const metadata = { title: 'Deal memo' }

// The vendor's deal memo — public, token-only. Renders ONLY the snapshot
// frozen at send (the whitelisted vendor DTO), never live memo rows, so it
// shows exactly what they're signing and nothing internal.
export default async function VendorDealMemoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const reqHeaders = await headers()
  const ip = trustedClientIp(name => reqHeaders.get(name))
  const { success } = await checkRateLimit('publicDoc', ip)
  if (!success) return <RateLimitedPage />

  const memo = await loadDealMemoByToken(token)
  if (!memo || !memo.sentAt || !memo.sentSnapshot) notFound()

  const cancelled = memo.status === 'CANCELLED'
  const signed    = !!memo.signedAt && !cancelled
  // An unsigned link expires; a signed copy stays viewable.
  if (!signed && !cancelled && memo.publicTokenExpiresAt && memo.publicTokenExpiresAt < new Date()) {
    return <ExpiredLinkPage type="deal-memo" />
  }

  if (!signed && !cancelled) void recordDealMemoView(memo.id)

  const doc = memo.sentSnapshot as unknown as VendorDealMemo
  const brand = memo.workspace.primaryColor || '#5D00A4'
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#F7F4FA] py-10 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4 print:px-0">
        <div className="mb-4 flex items-center justify-between print:hidden">
          {memo.workspace.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={memo.workspace.logoUrl} alt={memo.workspace.name} className="h-7" />
            : <p className="text-xs font-semibold uppercase tracking-widest text-[#888780]">{memo.workspace.name}</p>}
        </div>

        {cancelled && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This deal memo was cancelled{memo.cancelledAt ? ` on ${fmt(memo.cancelledAt)}` : ''} and can no longer be signed.
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-[#E8E3EF] shadow-sm print:border-0 print:shadow-none">
          <DealMemoDocument memo={doc} />

          <div className="border-t border-[#E8E0F0] bg-white px-8 py-8 sm:px-12">
            {signed ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">Signed</p>
                <p className="mt-0.5 text-sm text-emerald-800">
                  Signed by <span className="font-semibold">{memo.signatureName}</span> on {fmt(memo.signedAt!)}.
                </p>
              </div>
            ) : cancelled ? null : (
              <DealMemoSignForm memoId={memo.id} token={token} sentAt={memo.sentAt!.toISOString()} brand={brand} vendorName={doc.vendorName} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
