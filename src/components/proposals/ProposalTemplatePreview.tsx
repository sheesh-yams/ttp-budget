'use client'

/**
 * ProposalTemplatePreview — a live, client-facing proposal mockup that proves
 * out workspace branding. The R2 logo sits at the top and the brand color is
 * applied dynamically (inline styles, not Tailwind statics) to every accent:
 * the rule under the wordmark, section markers, the estimate total, and the CTA.
 *
 * This is the foundation of the custom proposal engine — content here is sample
 * data; the branding is real (driven by Workspace.logoUrl / primaryColor / bodyFont).
 */

import { Check } from 'lucide-react'

export interface ProposalBranding {
  workspaceName: string
  logoUrl:       string | null
  /** Workspace.primaryColor — the brand accent. */
  brandColor:    string
  /** Workspace.bodyFont — applied to the document. */
  fontFamily:    string
}

const SAMPLE_SCOPE = [
  'Pre-production: creative treatment, shot list, and call sheets',
  'One (1) production day — crew, camera package, and lighting',
  'Post-production: editorial, color, sound design, and one revision round',
  'Final delivery: 1× hero film (60s) + 3× social cutdowns',
]

const SAMPLE_ESTIMATE: { label: string; amount: string }[] = [
  { label: 'Pre-production',  amount: '$6,500' },
  { label: 'Production day',  amount: '$18,250' },
  { label: 'Post-production', amount: '$9,800' },
  { label: 'Agency fee (15%)', amount: '$5,182' },
]

function brandTint(hex: string, alpha: number): string {
  // Render the brand color at low opacity for subtle fills, with a safe fallback.
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return `rgba(93, 0, 164, ${alpha})`
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function SectionHeading({ children, brandColor }: { children: React.ReactNode; brandColor: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-4 w-1 rounded-full" style={{ backgroundColor: brandColor }} />
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">{children}</h3>
    </div>
  )
}

export function ProposalTemplatePreview({ branding }: { branding: ProposalBranding }) {
  const { workspaceName, logoUrl, brandColor, fontFamily } = branding

  return (
    <div className="mx-auto max-w-3xl">
      {/* Browser-chrome framing to read as a polished client-facing doc. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-xl">

        {/* ── Letterhead ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-10 pt-10" style={{ fontFamily }}>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={workspaceName} className="h-10 w-auto max-w-[180px] object-contain" />
            ) : (
              <div
                className="flex h-10 items-center rounded-md px-3 text-sm font-black uppercase tracking-tight text-white"
                style={{ backgroundColor: brandColor }}
              >
                {workspaceName}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: brandColor }}>
              Proposal
            </p>
            <p className="mt-1 text-[11px] text-neutral-400">
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Brand rule under the letterhead */}
        <div className="mx-10 mt-6 h-px" style={{ backgroundColor: brandTint(brandColor, 0.25) }} />

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <div className="px-10 pt-8" style={{ fontFamily }}>
          <p className="text-[12px] font-medium text-neutral-400">Prepared for Aurora Athletica</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight text-neutral-900">
            Spring Brand Campaign — Hero Film &amp; Social
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-neutral-500">
            A cinematic brand film and a suite of social cutdowns to launch the
            Spring collection — produced end-to-end by {workspaceName}.
          </p>
        </div>

        {/* ── Overview ───────────────────────────────────────────────────── */}
        <div className="px-10 pt-10" style={{ fontFamily }}>
          <SectionHeading brandColor={brandColor}>Overview</SectionHeading>
          <p className="text-[14px] leading-relaxed text-neutral-600">
            This engagement covers a single-day shoot with a full creative and
            production team, delivering one hero film and three platform-native
            cutdowns. Our approach pairs a lean, senior crew with a clear
            post-production pipeline so you get broadcast-grade work on a
            predictable timeline.
          </p>
        </div>

        {/* ── Scope ──────────────────────────────────────────────────────── */}
        <div className="px-10 pt-10" style={{ fontFamily }}>
          <SectionHeading brandColor={brandColor}>Scope of Work</SectionHeading>
          <ul className="space-y-3">
            {SAMPLE_SCOPE.map(item => (
              <li key={item} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
                <span className="text-[14px] leading-relaxed text-neutral-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Estimate ───────────────────────────────────────────────────── */}
        <div className="px-10 pt-10" style={{ fontFamily }}>
          <SectionHeading brandColor={brandColor}>Estimate</SectionHeading>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-[14px]">
              <tbody>
                {SAMPLE_ESTIMATE.map((row, i) => (
                  <tr key={row.label} className={i % 2 ? 'bg-neutral-50/60' : 'bg-white'}>
                    <td className="px-5 py-3 text-neutral-600">{row.label}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-neutral-800">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: brandTint(brandColor, 0.08) }}>
                  <td className="px-5 py-3.5 text-[12px] font-bold uppercase tracking-wider" style={{ color: brandColor }}>
                    Total Estimate
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg font-bold tabular-nums" style={{ color: brandColor }}>
                    $39,732
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <div className="px-10 pb-2 pt-9" style={{ fontFamily }}>
          <button
            type="button"
            className="w-full rounded-xl py-3.5 text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: brandColor }}
          >
            Approve &amp; Sign Proposal
          </button>
          <p className="mt-3 text-center text-[11px] text-neutral-400">
            Valid for 30 days · Questions? Reply to this proposal anytime.
          </p>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="mt-8 border-t border-neutral-100 px-10 py-5" style={{ fontFamily }}>
          <p className="text-[11px] text-neutral-400">
            © {new Date().getFullYear()} {workspaceName}. This proposal and its contents are confidential.
          </p>
        </div>
      </div>
    </div>
  )
}
