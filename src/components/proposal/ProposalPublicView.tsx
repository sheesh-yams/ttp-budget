'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import { formatMoney, lineTotal } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { ProposalContent, PaymentMilestone } from '@/types'

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const V        = '#5D00A4'
const V_TINT   = '#F5EDFA'
const MINT     = '#04FFCC'
const MINT_DK  = '#003D31'
const INK      = '#0A0612'
const BODY     = '#2C2C2A'
const BORDER   = '#E8E0F0'
const MUTED    = '#888780'
const CANVAS   = '#FAFAF8'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHOOT_LABELS: Record<string, string> = {
  MUSIC_VIDEO: 'Music Video', BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT: 'Product Shoot', EVENT_RECAP: 'Event Recap',
  SOCIAL_CONTENT: 'Social Content', INFLUENCER: 'Influencer',
  DOCUMENTARY: 'Documentary', OTHER: 'Other',
}

const MILESTONE_LABELS: Record<string, string> = {
  on_signing: 'Due on signing', on_shoot_day: 'Due on shoot day',
  on_delivery: 'Due on delivery', net_30: 'Net 30 from invoice',
  net_60: 'Net 60 from invoice', net_90: 'Net 90 from invoice',
  custom_date: 'Custom date',
}

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
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

// ─── Props ────────────────────────────────────────────────────────────────────
// Dates arrive as ISO strings (serialised from the server component)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialProps = any

interface Props {
  proposal: SerialProps
  accounts: SerialProps[]
  totalCents: number
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProposalPublicView({ proposal, accounts, totalCents }: Props) {
  const content     = proposal.content as unknown as ProposalContent
  const sections    = content?.sections ?? []

  const aboutSection = sections.find(s => s.type === 'about')
  const scopeSection = sections.find(s => s.type === 'scope')
  const termsSection = sections.find(s => s.type === 'terms')

  const aboutBody    = aboutSection?.type === 'about' ? aboutSection.body : ''
  const deliverables = scopeSection?.type === 'scope'  ? scopeSection.items : []
  const milestones: PaymentMilestone[] =
    termsSection?.type === 'terms' ? termsSection.milestones : []

  const { project, workspace } = proposal
  const clientName = project.client.name

  const proposalNumber = `PRO-${new Date(proposal.createdAt).getFullYear()}-${String(proposal.version).padStart(3, '0')}`

  const validThrough = proposal.expiresAt ? fmt(proposal.expiresAt) : null

  const shootDates = project.shootStartDate
    ? (() => {
        const start = new Date(project.shootStartDate)
        const end   = project.shootEndDate ? new Date(project.shootEndDate) : null
        const sLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const eLabel = end && end.getTime() !== start.getTime()
          ? ` – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : ''
        return `${sLabel}${eLabel}, ${start.getFullYear()}`
      })()
    : null

  // Budget accordion
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Separate production fee account for callout row
  const prodFeeAccount  = accounts.find(a => /production fee/i.test(a.name))
  const mainAccounts    = accounts.filter(a => !/production fee/i.test(a.name))
  const prodFeeCents    = prodFeeAccount
    ? sumAccount(prodFeeAccount as unknown as AccountInput) : 0
  const subtotalCents   = totalCents - prodFeeCents

  // Sign-off
  const isAlreadyApproved = proposal.status === 'APPROVED'
  const [sigName, setSigName]   = useState(proposal.signatureName ?? '')
  const [sigState, setSigState] = useState<'idle' | 'submitting' | 'done' | 'error'>(
    isAlreadyApproved ? 'done' : 'idle'
  )
  const [sigError, setSigError] = useState('')

  async function handleApprove() {
    const name = sigName.trim()
    if (name.length < 2) { setSigError('Please enter your full name'); return }
    setSigState('submitting')
    setSigError('')
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureName: name, proposalToken: proposal.publicToken }),
      })
      if (res.ok) {
        setSigState('done')
      } else {
        const d = await res.json().catch(() => ({}))
        setSigError((d as { error?: string }).error ?? 'Something went wrong')
        setSigState('idle')
      }
    } catch {
      setSigError('Network error — please try again.')
      setSigState('idle')
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: BODY, background: '#fff', minHeight: '100vh' }}>

      {/* ════════════════════ COVER ════════════════════ */}
      <section
        className="proposal-cover noise-overlay"
        style={{ minHeight: '100vh', padding: 'clamp(32px,5vw,64px)', display: 'flex', flexDirection: 'column', position: 'relative', boxSizing: 'border-box' }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              The Third Place
            </span>
            <span style={{ color: MINT, fontSize: 13, fontWeight: 800, marginLeft: 4 }}>Creative</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', paddingTop: 2 }}>
            {proposalNumber}
          </span>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1, paddingTop: 80, paddingBottom: 40 }}>
          <p style={{ color: MINT, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 18, marginTop: 0 }}>
            Prepared for {clientName}
          </p>
          <h1 style={{ color: '#fff', fontSize: 'clamp(28px, 4.5vw, 58px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 20px', maxWidth: '72%' }}>
            {proposal.title}
          </h1>
          {aboutBody && (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, lineHeight: 1.7, maxWidth: 540, margin: '0 0 52px' }}>
              {aboutBody.length > 220 ? aboutBody.slice(0, 220) + '…' : aboutBody}
            </p>
          )}

          {/* Metadata strip */}
          <div style={{ display: 'flex', gap: 'clamp(24px,4vw,56px)', flexWrap: 'wrap', marginBottom: 64 }}>
            {shootDates && (
              <div>
                <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>Shoot Dates</p>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0 }}>{shootDates}</p>
              </div>
            )}
            <div>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>Client</p>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0 }}>{clientName}</p>
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>Type</p>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0 }}>{SHOOT_LABELS[project.shootType] ?? project.shootType}</p>
            </div>
            {validThrough && (
              <div>
                <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>Valid Through</p>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0 }}>{validThrough}</p>
              </div>
            )}
          </div>

          {/* Total */}
          {totalCents > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 32 }}>
              <p style={{ color: MINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 10px' }}>
                Total Investment
              </p>
              <p style={{ color: '#fff', fontSize: 'clamp(36px,5.5vw,68px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
                {formatMoney(totalCents)}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════ THE PROJECT ════════════════════ */}
      {aboutBody && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <SectionHeader label="The Project" />
            <p style={{ fontSize: 17, lineHeight: 1.8, color: BODY, margin: 0 }}>
              {aboutBody}
            </p>
          </div>
        </section>
      )}

      {/* ════════════════════ DELIVERABLES ════════════════════ */}
      {deliverables.length > 0 && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: CANVAS }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <SectionHeader label="Deliverables" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 20 }}>
              {deliverables.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: '#fff',
                    border: `0.5px solid ${BORDER}`,
                    borderTop: `3px solid ${V}`,
                    borderRadius: 10,
                    padding: '24px 24px 28px',
                  }}
                >
                  <p style={{ color: V, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, margin: '0 0 14px' }}>
                    {item.number ?? String(i + 1).padStart(2, '0')}
                  </p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: BODY, margin: '0 0 8px' }}>{item.title}</p>
                  <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0 }}>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ BUDGET SUMMARY ════════════════════ */}
      {accounts.length > 0 && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <SectionHeader label="Budget Summary" />

            {/* Accordion */}
            <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
              {mainAccounts.map((account, idx) => {
                const accTotal   = sumAccount(account as unknown as AccountInput)
                const isOpen     = expanded.has(account.id)
                const ownCount   = account.lineItems.length
                const childCount = account.children?.reduce((s, c) => s + c.lineItems.length, 0) ?? 0
                const itemCount  = ownCount + childCount
                const isLast     = idx === mainAccounts.length - 1

                return (
                  <div key={account.id}>
                    {/* Row header */}
                    <button
                      type="button"
                      onClick={() => toggle(account.id)}
                      style={{
                        display: 'flex', alignItems: 'center', width: '100%',
                        padding: '15px 20px', background: '#fff', border: 'none',
                        borderBottom: (!isOpen || isLast) ? `0.5px solid ${BORDER}` : 'none',
                        cursor: 'pointer', textAlign: 'left', gap: 10,
                      }}
                    >
                      {isOpen
                        ? <ChevronDown  size={13} style={{ color: MUTED, flexShrink: 0 }} />
                        : <ChevronRight size={13} style={{ color: MUTED, flexShrink: 0 }} />
                      }
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: BODY }}>
                        {account.code && (
                          <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 11, color: MUTED, marginRight: 8 }}>
                            {account.code}
                          </span>
                        )}
                        {account.name}
                      </span>
                      <span style={{ background: V_TINT, color: V, fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 9px', marginRight: 14, whiteSpace: 'nowrap' }}>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: BODY, minWidth: 90, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatMoney(accTotal)}
                      </span>
                    </button>

                    {/* Expanded line items */}
                    {isOpen && (
                      <div style={{ background: CANVAS, borderBottom: `0.5px solid ${BORDER}` }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                              {(['Description', 'Qty', 'Unit', 'Total'] as const).map((h, hi) => (
                                <th
                                  key={h}
                                  style={{
                                    padding: hi === 0 ? '9px 16px 9px 44px' : '9px 16px',
                                    textAlign: hi === 0 ? 'left' : 'right',
                                    fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                                    textTransform: 'uppercase', color: MUTED,
                                    width: hi === 0 ? 'auto' : hi === 3 ? 100 : 60,
                                  }}
                                >{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {account.lineItems.map(item => {
                              const tot = lineTotal(Number(item.quantity), item.rateCents, Number(item.markupPct) || null)
                              return (
                                <tr key={item.id} style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                                  <td style={{ padding: '10px 16px 10px 44px', fontSize: 13, color: BODY }}>{item.description}</td>
                                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{Number(item.quantity)}</td>
                                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: MUTED, textTransform: 'uppercase' }}>{item.unit}</td>
                                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(tot)}</td>
                                </tr>
                              )
                            })}
                            {account.children?.flatMap(child =>
                              child.lineItems.map(item => {
                                const tot = lineTotal(Number(item.quantity), item.rateCents, Number(item.markupPct) || null)
                                return (
                                  <tr key={item.id} style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                                    <td style={{ padding: '10px 16px 10px 56px', fontSize: 13, color: BODY }}>
                                      <span style={{ color: MUTED, fontSize: 11, marginRight: 6 }}>{child.name} ·</span>
                                      {item.description}
                                    </td>
                                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{Number(item.quantity)}</td>
                                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: MUTED, textTransform: 'uppercase' }}>{item.unit}</td>
                                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(tot)}</td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totals rows */}
            <div style={{ borderLeft: `0.5px solid ${BORDER}`, borderRight: `0.5px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: MUTED }}>Subtotal</span>
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(subtotalCents)}</span>
              </div>
              {prodFeeAccount && prodFeeCents > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Production Fee</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(prodFeeCents)}</span>
                </div>
              )}
            </div>
            {/* Dark total bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px', background: INK, borderRadius: '0 0 10px 10px',
            }}>
              <span style={{ color: MINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                Total Investment
              </span>
              <span style={{ color: '#fff', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(totalCents)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ PAYMENT TERMS ════════════════════ */}
      {milestones.length > 0 && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: CANVAS }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <SectionHeader label="Payment Terms" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              {milestones.map((m, i) => (
                <div
                  key={m.id}
                  style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '28px 28px 32px' }}
                >
                  <p style={{ color: V, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 14px' }}>
                    Payment {String(i + 1).padStart(2, '0')}
                  </p>
                  <p style={{ fontSize: 36, fontWeight: 700, color: BODY, fontVariantNumeric: 'tabular-nums', margin: '0 0 4px', lineHeight: 1 }}>
                    {m.percentPct}%
                  </p>
                  <p style={{ fontSize: 15, fontWeight: 600, color: BODY, margin: '0 0 6px' }}>{m.name}</p>
                  <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px' }}>
                    {MILESTONE_LABELS[m.trigger] ?? m.trigger}
                  </p>
                  {totalCents > 0 && (
                    <p style={{ fontSize: 15, fontWeight: 700, color: V, fontVariantNumeric: 'tabular-nums', margin: 0 }}>
                      {formatMoney(Math.round(totalCents * m.percentPct / 100))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ SIGN OFF ════════════════════ */}
      <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: V_TINT }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <SectionHeader label="Sign Off" />

          {sigState === 'done' ? (
            <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '44px 36px' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <Check size={26} color={MINT_DK} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: BODY, margin: '0 0 10px' }}>Proposal Approved</p>
              <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.6 }}>
                Signed by <strong style={{ color: BODY }}>{proposal.signatureName || sigName}</strong>
                {proposal.approvedAt && (
                  <> on {fmt(proposal.approvedAt)}</>
                )}
              </p>
            </div>
          ) : (
            <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '40px 36px' }}>
              <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 28px', textAlign: 'left' }}>
                By typing your name and clicking <em>Approve</em>, you agree to the scope, budget, and payment terms outlined in this proposal.
              </p>

              <input
                type="text"
                placeholder="Type your full name to sign"
                value={sigName}
                onChange={e => setSigName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleApprove()}
                style={{
                  display: 'block', width: '100%', padding: '13px 16px',
                  fontSize: 16, fontFamily: 'Georgia, "Times New Roman", serif',
                  border: `1.5px solid ${sigError ? '#ef4444' : BORDER}`,
                  borderRadius: 8, outline: 'none', color: BODY, background: '#fff',
                  boxSizing: 'border-box', marginBottom: sigError ? 6 : 14,
                }}
              />
              {sigError && (
                <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 14px', textAlign: 'left' }}>{sigError}</p>
              )}

              <button
                type="button"
                onClick={handleApprove}
                disabled={sigState === 'submitting'}
                style={{
                  display: 'block', width: '100%', padding: '14px',
                  background: sigState === 'submitting' ? '#00D9A8' : MINT,
                  color: MINT_DK, fontSize: 15, fontWeight: 700,
                  letterSpacing: '0.02em', border: 'none', borderRadius: 6,
                  cursor: sigState === 'submitting' ? 'not-allowed' : 'pointer',
                  marginBottom: 12,
                }}
              >
                {sigState === 'submitting' ? 'Approving…' : 'Approve proposal →'}
              </button>

              <a
                href={`mailto:${proposal.workspace.contactEmail ?? ''}?subject=Changes requested: ${encodeURIComponent(proposal.title)}`}
                style={{
                  display: 'block', width: '100%', padding: '13px', boxSizing: 'border-box',
                  color: V, fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  border: `1.5px solid ${V}`, borderRadius: 6, marginBottom: 20,
                  textAlign: 'center',
                }}
              >
                Request changes
              </a>

              <a
                href={`/api/pdf/proposal/${proposal.id}`}
                style={{ color: MUTED, fontSize: 13, textDecoration: 'underline' }}
              >
                Download PDF
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer style={{ background: INK, padding: 'clamp(32px,4vw,48px) clamp(24px,6vw,80px)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
              {workspace.legalName ?? workspace.name}
            </p>
            {workspace.contactEmail && (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 3px' }}>
                {workspace.contactEmail}
              </p>
            )}
            {workspace.website && (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0 }}>
                {workspace.website}
              </p>
            )}
          </div>
          {validThrough && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>
                Valid Through
              </p>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0 }}>{validThrough}</p>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
