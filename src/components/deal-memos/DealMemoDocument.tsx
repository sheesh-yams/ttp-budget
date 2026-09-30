import { formatMoney } from '@/lib/money'
import type { VendorDealMemo } from '@/lib/deal-memo-vendor-view'
import { QTY_NOUN, UNIT_SUFFIX } from './labels'

/**
 * The deal memo exactly as the vendor sees it. Renders ONLY the whitelisted
 * VendorDealMemo DTO — never a DealMemo row — so internal fields can't show
 * up here. HTML fields were produced by renderSmartText + resolveMergeTags,
 * which escape all user data.
 */
export function DealMemoDocument({ memo }: { memo: VendorDealMemo }) {
  const dates = memo.startDate
    ? memo.endDate && memo.endDate !== memo.startDate
      ? `${memo.startDate} – ${memo.endDate}`
      : memo.startDate
    : null

  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-[#2C2C2A] sm:px-12">
      <header className="mb-8 border-b-2 border-[#5D00A4] pb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#5D00A4]">Deal memo</p>
        <h1 className="mt-2 text-2xl font-semibold">{memo.position}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-[10px] uppercase tracking-wider text-[#888780]">Crew member</dt><dd className="font-medium">{memo.vendorName}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-[#888780]">Production</dt><dd className="font-medium">{memo.projectName}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-[#888780]">Company</dt><dd className="font-medium">{memo.workspaceName}</dd></div>
          {dates && <div><dt className="text-[10px] uppercase tracking-wider text-[#888780]">Dates</dt><dd className="font-medium">{dates}</dd></div>}
        </dl>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#5D00A4]">Fee structure</h2>
        {memo.fees.length === 0 ? (
          <p className="text-sm italic text-[#888780]">No fees entered yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E8E0F0] text-left text-[10px] uppercase tracking-wider text-[#888780]">
                <th className="py-2 pr-4 font-semibold">Fee</th>
                <th className="py-2 pr-4 font-semibold">Rate / amount</th>
                <th className="py-2 font-semibold">Details &amp; terms</th>
              </tr>
            </thead>
            <tbody>
              {memo.fees.map(f => (
                <tr key={f.id} className="border-b border-[#E8E0F0] align-top">
                  <td className="py-3 pr-4 font-medium">{f.label}</td>
                  <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                    {formatMoney(f.rateCents)}{UNIT_SUFFIX[f.unit]}
                    {f.quantity > 0 && f.unit !== 'FLAT' && (
                      <span className="block text-xs text-[#888780]">
                        {f.quantity} {QTY_NOUN[f.unit]} · {formatMoney(f.expectedCents)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: f.termsHtml }} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {memo.expectedTotalCents > 0 && (
          <p className="mt-3 text-right text-sm">
            Estimated total <span className="ml-2 font-semibold tabular-nums">{formatMoney(memo.expectedTotalCents)}</span>
          </p>
        )}
      </section>

      {memo.sections.length > 0 && (
        <section>
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#5D00A4]">Terms</h2>
          <div className="space-y-6">
            {memo.sections.map((s, i) => (
              <div key={s.id}>
                <p className="mb-1.5 text-sm font-semibold">{String(i + 1).padStart(2, '0')} — {s.title}</p>
                <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: s.bodyHtml }} />
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
