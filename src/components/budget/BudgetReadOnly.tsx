'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMoney, lineTotal, parseQtyFormula, fmtUnit } from '@/lib/money'
import { sumAccount } from '@/lib/totals'
import { parseLocalDate } from '@/lib/time-format'
import type { PaymentMilestone } from '@/types'

// ─── Brand tokens ──────────────────────────────────────────────────────────────
// CSS vars are set on the parent (workspace layout or proposal root). Fallbacks
// match the SlateSuite defaults for unconfigured workspaces.

const V       = 'var(--brand-v, #5D00A4)'
const V_TINT  = 'var(--brand-v-tint, #F5EDFA)'
const MINT    = 'var(--brand-mint, #04FFCC)'
const INK     = '#0A0612'
const BODY    = '#2C2C2A'
const BORDER  = '#E8E0F0'
const MUTED   = '#888780'
const CANVAS  = '#FAFAF8'

// ─── Shared types ──────────────────────────────────────────────────────────────

export interface SerialLineItem {
  id: string
  description: string
  quantity: number
  unit: string
  rateCents: number
  markupPct: number | null
  notes: string | null
  quantityFormula: string | null
}

export interface SerialAccount {
  id: string
  name: string
  code: string | null
  sectionId?: string | null
  lineItems: SerialLineItem[]
  children: Array<{
    id: string
    name: string
    lineItems: SerialLineItem[]
  }>
}

export interface SerialBudgetSection {
  id: string
  title: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BudgetReadOnlyProps {
  accounts: SerialAccount[]
  /** Grand total (after markup, discount, tax) — shown in the dark total bar */
  totalCents: number
  /** Net subtotal before agency fee. Defaults to totalCents if absent. */
  productionCents?: number
  /** Agency fee multiplier as decimal, e.g. 0.15 = 15% */
  budgetMarkupPct?: number
  /** Tax multiplier as decimal */
  budgetTaxPct?: number
  discountCents?: number
  discountLabel?: string
  budgetSections?: SerialBudgetSection[]
  /** Payment milestones for the payment schedule strip. Pass [] to hide it. */
  milestones?: PaymentMilestone[]
  shootStartDate?: string | null
  showPaymentSchedule?: boolean
  /**
   * Section IDs to flash-highlight (controlled externally so the deliverables
   * section in ProposalPublicView can trigger a scroll+pulse on click).
   * If omitted, no sections are highlighted.
   */
  highlightedSectionIds?: Set<string>
  /** 'proposal' = full-width section paddings; 'overview' = no outer padding */
  variant?: 'proposal' | 'overview'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string) {
  const date = parseLocalDate(d) ?? new Date(d)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function milestoneLabel(m: PaymentMilestone, shootStartDate: string | null | undefined): string {
  if (m.trigger === 'custom_date') {
    return m.customDate ? `Due ${fmtDate(m.customDate)}` : 'Custom date'
  }
  if (m.trigger === 'on_shoot_day') {
    return shootStartDate ? `Due ${fmtDate(shootStartDate)}` : 'Due on shoot day'
  }
  const LABELS: Record<string, string> = {
    on_signing:  'Due on signing',
    on_delivery: 'Due on delivery',
    net_30:      'Net 30 from invoice',
    net_60:      'Net 60 from invoice',
    net_90:      'Net 90 from invoice',
  }
  return LABELS[m.trigger] ?? m.trigger
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BudgetReadOnly({
  accounts,
  totalCents,
  productionCents: productionCentsProp,
  budgetMarkupPct = 0,
  budgetTaxPct    = 0,
  discountCents   = 0,
  discountLabel   = 'Discount',
  budgetSections  = [],
  milestones      = [],
  shootStartDate,
  showPaymentSchedule = true,
  highlightedSectionIds,
  variant = 'proposal',
}: BudgetReadOnlyProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const multiSection     = budgetSections.length > 1
  const productionCents  = productionCentsProp ?? totalCents
  const agencyFeeCents   = budgetMarkupPct > 0 ? Math.round(productionCents * budgetMarkupPct) : 0
  const preTaxCents      = productionCents + agencyFeeCents
  const afterDiscountCents = Math.max(0, preTaxCents - discountCents)
  const taxCents         = budgetTaxPct > 0 ? Math.round(afterDiscountCents * budgetTaxPct) : 0

  if (accounts.length === 0) return null

  function renderAccountRow(account: SerialAccount, idx: number, isLast: boolean) {
    const accTotal   = sumAccount(account)
    const isOpen     = expanded.has(account.id)
    const ownCount   = account.lineItems.length
    const childCount = account.children?.reduce((s, c) => s + c.lineItems.length, 0) ?? 0
    const itemCount  = ownCount + childCount
    return (
      <div key={account.id}>
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
        {isOpen && (
          <div style={{ background: CANVAS, borderBottom: `0.5px solid ${BORDER}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                  {(['Description', 'Qty', 'Unit', 'Total'] as const).map((h, hi) => (
                    <th key={h} style={{ padding: hi === 0 ? '9px 16px 9px 44px' : '9px 16px', textAlign: hi === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, width: hi === 0 ? 'auto' : hi === 3 ? 100 : hi === 1 ? 90 : 60, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {account.lineItems.map(item => {
                  const tot = lineTotal(Number(item.quantity), item.rateCents, Number(item.markupPct) || null)
                  return (
                    <tr key={item.id} style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                      <td style={{ padding: '10px 16px 10px 44px', fontSize: 13, color: BODY }}>{item.description}</td>
                      {(() => { const [hc, days] = parseQtyFormula(Number(item.quantity), item.quantityFormula); return (<><td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums', opacity: hc === 1 ? 0.35 : 1 }}>{hc}</td><td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>{fmtUnit(days, item.unit)}</td></>); })()}
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
                        {(() => { const [hc, days] = parseQtyFormula(Number(item.quantity), item.quantityFormula); return (<><td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums', opacity: hc === 1 ? 0.35 : 1 }}>{hc}</td><td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>{fmtUnit(days, item.unit)}</td></>); })()}
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
  }

  const budgetBlock = (
    <>
      {/* Section highlight animation */}
      <style>{`
        @keyframes section-highlight-fade {
          0%   { background: var(--brand-v-tint, #F5EDFA); border-left-color: var(--brand-v, #5D00A4); }
          80%  { background: var(--brand-v-tint, #F5EDFA); border-left-color: var(--brand-v, #5D00A4); }
          100% { background: transparent; border-left-color: transparent; }
        }
        .section-highlight {
          animation: section-highlight-fade 1.8s ease-out forwards;
          border-left: 3px solid transparent;
          padding-left: 12px;
          margin-left: -12px;
        }
      `}</style>

      {/* Account accordion — single-section or multi-section */}
      {!multiSection ? (
        <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
          {accounts.map((account, idx) => renderAccountRow(account, idx, idx === accounts.length - 1))}
        </div>
      ) : (() => {
        const bySection: Record<string, SerialAccount[]> = {}
        for (const s of budgetSections) bySection[s.id] = []
        for (const acc of accounts) {
          const sid = acc.sectionId ?? budgetSections[0]?.id
          if (sid && bySection[sid]) bySection[sid].push(acc)
        }
        return (
          <div>
            {budgetSections.map(section => {
              const sectionAccounts = bySection[section.id] ?? []
              const isHighlighted   = highlightedSectionIds?.has(section.id) ?? false
              const sectionTotal    = sectionAccounts.reduce((sum, acc) => sum + sumAccount(acc), 0)
              return (
                <div
                  key={section.id}
                  id={`section-${section.id}`}
                  className={isHighlighted ? 'section-highlight' : undefined}
                  style={{ marginBottom: 36, scrollMarginTop: 24 }}
                >
                  <div style={{ marginBottom: 10, paddingLeft: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: V }}>
                      {section.title}
                    </span>
                  </div>
                  <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
                    {sectionAccounts.length === 0 ? (
                      <div style={{ padding: '16px 20px', fontSize: 13, color: MUTED, fontStyle: 'italic' }}>No accounts in this section.</div>
                    ) : (
                      sectionAccounts.map((account, idx) => renderAccountRow(account, idx, false))
                    )}
                    {sectionAccounts.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 20px', background: CANVAS, borderTop: `0.5px solid ${BORDER}` }}>
                        <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>{section.title} subtotal</span>
                        <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: BODY }}>
                          {formatMoney(sectionTotal)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Totals rows */}
      <div style={{ borderLeft: `0.5px solid ${BORDER}`, borderRight: `0.5px solid ${BORDER}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
          <span style={{ fontSize: 13, color: MUTED }}>Subtotal</span>
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(productionCents)}</span>
        </div>
        {agencyFeeCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, color: MUTED }}>
              Agency Fee{' '}
              <span style={{ fontSize: 11, color: MUTED }}>({Math.round(budgetMarkupPct * 100)}%)</span>
            </span>
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(agencyFeeCents)}</span>
          </div>
        )}
        {discountCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, color: MUTED }}>{discountLabel}</span>
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>
              -{formatMoney(discountCents)}
            </span>
          </div>
        )}
        {taxCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 20px', background: '#fff', borderBottom: `0.5px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, color: MUTED }}>
              Tax{' '}
              <span style={{ fontSize: 11, color: MUTED }}>({Math.round(budgetTaxPct * 100)}%)</span>
            </span>
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: BODY }}>{formatMoney(taxCents)}</span>
          </div>
        )}
      </div>
      {/* Dark total bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', background: INK, borderRadius: '0 0 10px 10px' }}>
        <span style={{ color: MINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Total Investment
        </span>
        <span style={{ color: '#fff', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(totalCents)}
        </span>
      </div>
    </>
  )

  const paymentBlock = showPaymentSchedule && milestones.length > 0 ? (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginTop: variant === 'overview' ? 32 : 0 }}>
      {milestones.map((m, i) => (
        <div key={m.id} style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '28px 28px 32px' }}>
          <p style={{ color: V, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 14px' }}>
            Payment {String(i + 1).padStart(2, '0')}
          </p>
          <p style={{ fontSize: 36, fontWeight: 700, color: BODY, fontVariantNumeric: 'tabular-nums', margin: '0 0 4px', lineHeight: 1 }}>
            {Math.round(m.percentPct * 100)}%
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: BODY, margin: '0 0 6px' }}>{m.name}</p>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px' }}>
            {milestoneLabel(m, shootStartDate)}
          </p>
          {totalCents > 0 && (
            <p style={{ fontSize: 15, fontWeight: 700, color: V, fontVariantNumeric: 'tabular-nums', margin: 0 }}>
              {formatMoney(Math.round(totalCents * m.percentPct))}
            </p>
          )}
        </div>
      ))}
    </div>
  ) : null

  if (variant === 'overview') {
    return (
      <>
        {budgetBlock}
        {paymentBlock}
      </>
    )
  }

  // proposal variant — matches the original section padding exactly
  return (
    <>
      <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ height: 1.5, background: V, marginBottom: 10 }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: V }}>
              Budget Summary
            </span>
          </div>
          {budgetBlock}
        </div>
      </section>
      {milestones.length > 0 && showPaymentSchedule && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: CANVAS }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div style={{ marginBottom: 36 }}>
              <div style={{ height: 1.5, background: V, marginBottom: 10 }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: V }}>
                Payment Terms
              </span>
            </div>
            {paymentBlock}
          </div>
        </section>
      )}
    </>
  )
}
