'use client'

import { formatMoney } from '@/lib/money'
import type { InvoiceWithRelations, InvoiceLineItem } from '@/types'
import { HelcimPayButton } from './HelcimPayButton'

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const V      = '#5D00A4'
const MINT   = '#04FFCC'
const MINT_DK = '#003D31'
const INK    = '#0A0612'
const BODY   = '#2C2C2A'
const BORDER = '#E8E0F0'
const MUTED  = '#888780'
const CANVAS = '#FAFAF8'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ height: 1.5, background: V, marginBottom: 10 }} />
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: V,
      }}>
        {label}
      </span>
    </div>
  )
}

const KIND_LABELS: Record<string, string> = {
  DEPOSIT:    'Deposit Invoice',
  PROGRESS:   'Progress Invoice',
  FINAL:      'Final Invoice',
  STANDALONE: 'Invoice',
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:   { label: 'Draft',   color: '#888780', bg: '#F3F3F0' },
  SENT:    { label: 'Sent',    color: '#1D4ED8', bg: '#EFF6FF' },
  VIEWED:  { label: 'Viewed',  color: '#6D28D9', bg: '#F5F3FF' },
  PAID:    { label: 'Paid',    color: '#15803D', bg: '#F0FDF4' },
  OVERDUE: { label: 'Overdue', color: '#B91C1C', bg: '#FEF2F2' },
  VOID:    { label: 'Void',    color: '#9CA3AF', bg: '#F9FAFB' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicePublicView({
  invoice,
  paymentEnabled = false,
}: {
  invoice: InvoiceWithRelations
  paymentEnabled?: boolean
}) {
  const lineItems = (invoice.lineItems as unknown as InvoiceLineItem[]) ?? []
  const workspace = invoice.workspace
  const client    = invoice.client
  const project   = invoice.project

  const statusCfg = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.SENT
  const kindLabel = KIND_LABELS[invoice.kind] ?? 'Invoice'
  const isOverdue =
    !['PAID', 'VOID'].includes(invoice.status) &&
    new Date(invoice.dueDate) < new Date()

  const balanceDueCents = invoice.totalCents - invoice.amountPaidCents
  const isPartiallyPaid = invoice.amountPaidCents > 0 && invoice.amountPaidCents < invoice.totalCents
  const isPaid = invoice.amountPaidCents >= invoice.totalCents || invoice.status === 'PAID'

  const taxPct = Number(invoice.taxPct)
  const hasPaymentInfo =
    workspace.wireInstructions ||
    workspace.achInstructions ||
    workspace.checkPayableTo

  const isVoid = invoice.status === 'VOID'

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: BODY, background: '#fff', minHeight: '100vh' }}>

      {/* ════════════════════ VOID BANNER ════════════════════ */}
      {isVoid && (
        <div style={{
          background: '#111827',
          borderBottom: '3px solid #6B7280',
          padding: '14px clamp(24px,5vw,64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <span style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            This invoice has been voided and is no longer payable
          </span>
        </div>
      )}

      {/* ════════════════════ HEADER ════════════════════ */}
      <section
        style={{
          background: INK,
          padding: 'clamp(24px,4vw,48px) clamp(24px,5vw,64px)',
          position: 'relative',
        }}
        className="noise-overlay"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(28px,4vw,48px)', position: 'relative', zIndex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="The Third Place Creative" style={{ height: 28, width: 'auto' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {kindLabel.toUpperCase()}
          </span>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Invoice number + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <p style={{ color: MINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', margin: 0 }}>
              {invoice.number}
            </p>
            <span style={{
              background: isOverdue ? '#FEF2F2' : isPaid ? '#F0FDF4' : 'rgba(255,255,255,0.12)',
              color: isOverdue ? '#B91C1C' : isPaid ? '#15803D' : 'rgba(255,255,255,0.75)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              borderRadius: 999, padding: '3px 10px',
            }}>
              {isOverdue ? 'Overdue' : isPaid ? 'Paid' : isPartiallyPaid ? 'Partially Paid' : statusCfg.label}
            </span>
          </div>

          {/* Title */}
          {invoice.title && (
            <h1 style={{ color: '#fff', fontSize: 'clamp(20px, 2.5vw, 34px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 20px', maxWidth: '70%' }}>
              {invoice.title}
            </h1>
          )}

          {/* Meta strip */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20, borderTop: '1px solid rgba(0,0,0,0.18)', paddingTop: 20, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 'clamp(20px,4vw,48px)', flexWrap: 'wrap' }}>
              <div>
                <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Bill to</p>
                <p style={{ color: '#0A0612', fontSize: 13, fontWeight: 700, margin: 0 }}>{client.name}</p>
                {client.contactName && (
                  <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, margin: '2px 0 0' }}>{client.contactName}</p>
                )}
              </div>
              <div>
                <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Project</p>
                <p style={{ color: '#0A0612', fontSize: 13, fontWeight: 700, margin: 0 }}>{project.name}</p>
              </div>
              <div>
                <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Issue date</p>
                <p style={{ color: '#0A0612', fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt(invoice.issueDate)}</p>
              </div>
              <div>
                <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Due date</p>
                <p style={{ color: isOverdue ? '#B91C1C' : '#0A0612', fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt(invoice.dueDate)}</p>
              </div>
              {invoice.poNumber && (
                <div>
                  <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>PO #</p>
                  <p style={{ color: '#0A0612', fontSize: 13, fontWeight: 700, margin: 0 }}>{invoice.poNumber}</p>
                </div>
              )}
            </div>

            {/* Balance due */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isVoid ? (
                <>
                  <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px' }}>Status</p>
                  <p style={{
                    color: '#6B7280',
                    fontSize: 'clamp(22px,2.5vw,34px)',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                    margin: 0,
                    textDecoration: 'line-through',
                    textDecorationThickness: 3,
                  }}>
                    {formatMoney(invoice.totalCents)}
                  </p>
                  <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', margin: '6px 0 0' }}>
                    Voided
                  </p>
                </>
              ) : (
                <>
                  <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px' }}>
                    {isPaid ? 'Total Paid' : isPartiallyPaid ? 'Balance Due' : 'Amount Due'}
                  </p>
                  <p style={{ color: isPaid ? '#15803D' : isOverdue ? '#B91C1C' : '#0A0612', fontSize: 'clamp(26px,3vw,40px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
                    {formatMoney(isPaid ? invoice.totalCents : balanceDueCents)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ LINE ITEMS ════════════════════ */}
      {lineItems.length > 0 && (
        <section style={{ padding: 'clamp(48px,7vw,80px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <SectionHeader label="Services" />

            <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: CANVAS, borderBottom: `0.5px solid ${BORDER}` }}>
                    {['Description', 'Qty', 'Unit', 'Rate', 'Total'].map((h, hi) => (
                      <th
                        key={h}
                        style={{
                          padding: hi === 0 ? '10px 20px' : '10px 16px',
                          textAlign: hi === 0 ? 'left' : 'right',
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                          textTransform: 'uppercase', color: MUTED,
                          width: hi === 0 ? 'auto' : hi === 4 ? 110 : hi === 3 ? 110 : 60,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={item.id ?? idx} style={{ borderBottom: `0.5px solid ${BORDER}`, background: '#fff' }}>
                      <td style={{ padding: '13px 20px', fontSize: 14, color: BODY }}>
                        {item.description}
                        {item.notes && (
                          <p style={{ fontSize: 12, color: MUTED, margin: '3px 0 0' }}>{item.notes}</p>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                        {item.quantity}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 11, color: MUTED, textTransform: 'uppercase' }}>
                        {item.unit}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(item.rateCents)}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: BODY }}>
                        {formatMoney(item.lineTotalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ borderLeft: `0.5px solid ${BORDER}`, borderRight: `0.5px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: MUTED }}>Subtotal</span>
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(invoice.subtotalCents)}</span>
              </div>
              {taxPct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Tax ({(taxPct * 100).toFixed(1)}%)</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(invoice.taxCents)}</span>
                </div>
              )}
              {invoice.discountCents > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Discount</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#15803D' }}>−{formatMoney(invoice.discountCents)}</span>
                </div>
              )}
              {isPartiallyPaid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Payments received</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#15803D' }}>−{formatMoney(invoice.amountPaidCents)}</span>
                </div>
              )}
            </div>

            {/* Dark total bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px', background: INK, borderRadius: '0 0 10px 10px',
            }}>
              <span style={{ color: MINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                {isPaid ? 'Paid in Full' : isPartiallyPaid ? 'Balance Due' : 'Total Due'}
              </span>
              <span style={{ color: '#fff', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(isPaid ? invoice.totalCents : balanceDueCents)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ PAY ONLINE ════════════════════ */}
      {paymentEnabled && !isPaid && ['SENT', 'VIEWED'].includes(invoice.status) && balanceDueCents > 0 && (
        <section style={{ padding: 'clamp(48px,7vw,80px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <SectionHeader label="Pay Online" />
            <HelcimPayButton
              invoicePublicToken={invoice.publicToken as string}
              amountCents={balanceDueCents}
            />
          </div>
        </section>
      )}

      {/* ════════════════════ PAYMENT INSTRUCTIONS ════════════════════ */}
      {hasPaymentInfo && !isPaid && (
        <section style={{ padding: 'clamp(48px,7vw,80px) clamp(24px,6vw,80px)', background: CANVAS }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <SectionHeader label={paymentEnabled ? 'Other Payment Methods' : 'How to Pay'} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {workspace.wireInstructions && (
                <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderTop: `3px solid ${V}`, borderRadius: 10, padding: '24px 28px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: V, margin: '0 0 14px' }}>Wire Transfer</p>
                  <pre style={{ fontSize: 13, color: BODY, lineHeight: 1.7, margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {workspace.wireInstructions}
                  </pre>
                </div>
              )}
              {workspace.achInstructions && (
                <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderTop: `3px solid ${V}`, borderRadius: 10, padding: '24px 28px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: V, margin: '0 0 14px' }}>ACH / Direct Deposit</p>
                  <pre style={{ fontSize: 13, color: BODY, lineHeight: 1.7, margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {workspace.achInstructions}
                  </pre>
                </div>
              )}
              {workspace.checkPayableTo && (
                <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderTop: `3px solid ${V}`, borderRadius: 10, padding: '24px 28px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: V, margin: '0 0 14px' }}>Check</p>
                  <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px' }}>Make payable to:</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: BODY, margin: '0 0 12px' }}>{workspace.checkPayableTo}</p>
                  {workspace.checkMailingAddress && (
                    <pre style={{ fontSize: 13, color: BODY, lineHeight: 1.7, margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>
                      {workspace.checkMailingAddress}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ PAID CONFIRMATION ════════════════════ */}
      {isPaid && (
        <section style={{ padding: 'clamp(48px,7vw,80px) clamp(24px,6vw,80px)', background: '#F0FDF4' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={MINT_DK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: BODY, margin: '0 0 10px' }}>Invoice Paid</p>
            <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
              Thank you! This invoice has been paid in full.
              {invoice.paidAt && ` Payment received ${fmt(invoice.paidAt)}.`}
            </p>
          </div>
        </section>
      )}

      {/* ════════════════════ NOTES + TERMS ════════════════════ */}
      {(invoice.notes || invoice.terms) && (
        <section style={{ padding: 'clamp(48px,7vw,80px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {invoice.notes && (
              <>
                <SectionHeader label="Notes" />
                <p style={{ fontSize: 15, lineHeight: 1.75, color: BODY, margin: '0 0 48px' }}>
                  {invoice.notes}
                </p>
              </>
            )}
            {invoice.terms && (
              <>
                <SectionHeader label="Terms" />
                <p style={{ fontSize: 14, lineHeight: 1.75, color: MUTED, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {invoice.terms}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer style={{ background: INK, padding: 'clamp(32px,4vw,48px) clamp(24px,6vw,80px)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
              {workspace.name}
            </p>
            {workspace.contactEmail && (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 3px' }}>
                {workspace.contactEmail}
              </p>
            )}
            {workspace.website && (
              <a
                href={workspace.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0, textDecoration: 'none', display: 'block' }}
              >
                {workspace.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>
              Download
            </p>
            <a
              href={`/api/pdf/invoice/${invoice.publicToken}`}
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textDecoration: 'underline' }}
            >
              Save as PDF
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
