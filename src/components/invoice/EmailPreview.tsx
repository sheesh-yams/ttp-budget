'use client'

// The invoice email as the client receives it (SendInvoiceModal → Preview).
// Client-facing: always light (.light-scope); its fixed colours mirror the
// real branded email (sendInvoiceEmail), so it's exempt from the dark-mode
// guard in scripts/dark-overrides.ts.

import { format } from 'date-fns'
import { formatMoney } from '@/lib/money'

export interface EmailPreviewData {
  brandAccent: string | null
  brandPrimary: string | null
  dueDate: Date | string
  number: string
  projectName: string
  publicToken: string
  totalCents: number
  workspaceName: string
}

// ── Email HTML preview renderer ────────────────────────────────────────────

export function EmailPreview({
  data,
  subject,
  message,
}: {
  data: EmailPreviewData
  subject: string
  message: string
}) {
  const amount  = formatMoney(data.totalCents)
  const dueDate = format(new Date(data.dueDate), 'MMMM d, yyyy')
  // Mirror the real branded email (sendInvoiceEmail) so the preview is accurate.
  const primary   = data.brandPrimary || '#5D00A4'
  const accent    = data.brandAccent  || '#04FFCC'
  const brandName = data.workspaceName || 'The Third Place Creative'

  const messageHtml = message
    .split('\n')
    .map(line =>
      line.trim() === ''
        ? '<br>'
        : `<p style="margin:0 0 12px;font-size:14px;color:#333;line-height:1.6">${line}</p>`
    )
    .join('')

  const invoiceUrl = `${window.location.origin}/i/${data.publicToken}`

  return (
    // The email as the client receives it — always light (.light-scope).
    <div className="light-scope" style={{ fontFamily: 'system-ui, sans-serif', background: '#F7F4FA', padding: 24, minHeight: '100%' }}>
      {/* Subject line */}
      <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fff', borderRadius: 6, border: '1px solid #E8E3EF' }}>
        <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Subject: </span>
        <span style={{ fontSize: 13, color: '#333' }}>{subject}</span>
      </div>

      {/* Email body */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E8E3EF', maxWidth: 520, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: '#0A0612', padding: '20px 28px' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>
            {brandName}
          </p>
        </div>

        {/* Brand-colored invoice badge */}
        <div style={{ background: primary, padding: '12px 28px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>Invoice</p>
          <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{data.number}</p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px' }}>
          <div dangerouslySetInnerHTML={{ __html: messageHtml }} />

          {/* Detail table */}
          <div style={{ background: '#F7F4FA', borderRadius: 8, padding: '16px 20px', margin: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Project</span>
              <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{data.projectName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount due</span>
              <span style={{ fontSize: 18, color: primary, fontWeight: 700 }}>{amount}</span>
            </div>
            <div style={{ paddingTop: 12, borderTop: '1px solid #E8E3EF', fontSize: 12, color: '#888' }}>
              Due by <strong style={{ color: '#1a1a1a' }}>{dueDate}</strong>
            </div>
          </div>

          {/* CTA */}
          <a
            href={invoiceUrl}
            style={{ display: 'inline-block', background: primary, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '11px 22px', borderRadius: 8 }}
          >
            View &amp; Pay Invoice →
          </a>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #F0EBF7', padding: '12px 28px' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#ccc' }}>The Third Place Creative · Sent via TTP Budget</p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

