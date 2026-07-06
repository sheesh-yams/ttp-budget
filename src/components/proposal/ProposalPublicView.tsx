'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { lighten, darken, safeHex } from '@/lib/color'
import { parseLocalDate } from '@/lib/time-format'
import type { ProposalContent, PaymentMilestone } from '@/types'
import { BudgetReadOnly } from '@/components/budget/BudgetReadOnly'
import type { SerialAccount, SerialBudgetSection } from '@/components/budget/BudgetReadOnly'
import { renderSmartText } from '@/lib/smart-text'
import { resolveMergeTags, type MergeTagContext } from '@/lib/merge-tags'

// ─── Brand tokens ─────────────────────────────────────────────────────────────
// V / V_TINT / MINT / MINT_DK resolve to per-workspace CSS variables set on the
// document root (see the root <div> below), each with the SlateSuite hex as the
// var() fallback so unconfigured workspaces look exactly as before.

const V        = 'var(--brand-v, #5D00A4)'
const V_TINT   = 'var(--brand-v-tint, #F5EDFA)'
const MINT     = 'var(--brand-mint, #04FFCC)'
const MINT_DK  = 'var(--brand-mint-dk, #003D31)'
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

function fmt(d: Date | string) {
  const date = parseLocalDate(d) ?? new Date(d)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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

// ─── Serialised shapes (dates → ISO strings, Decimal → number) ────────────────

// SerialAccount, SerialBudgetSection, SerialLineItem re-exported from BudgetReadOnly

interface SerialProposal {
  id: string
  title: string
  publicToken: string
  version: number
  status: string
  content: unknown
  createdAt: string
  expiresAt: string | null
  approvedAt: string | null
  signatureName: string | null
  project: {
    name: string
    shootType: string
    shootStartDate: string | null
    shootEndDate: string | null
    client: { name: string }
  }
  workspace: {
    name: string
    legalName: string | null
    contactEmail: string | null
    website: string | null
    invoiceNumberPrefix: string
    logoUrl: string | null
    logoDarkUrl: string | null
    primaryColor: string | null
    accentColor: string | null
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ContractSection {
  id: string
  title: string
  body: string
}

interface Props {
  proposal: SerialProposal
  accounts: SerialAccount[]
  totalCents: number
  discountCents?: number
  discountLabel?: string
  isDraft?: boolean
  budgetSections?: SerialBudgetSection[]
  contractSections?: ContractSection[]
  contractEnabled?: boolean
  deliverableLinkMode?: 'scroll' | 'filter'
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProposalPublicView({
  proposal, accounts, totalCents, discountCents = 0, discountLabel = 'Discount',
  isDraft = false, budgetSections = [], contractSections = [], contractEnabled = false,
  deliverableLinkMode = 'scroll',
}: Props) {
  const content     = proposal.content as ProposalContent
  const sections    = content?.sections ?? []

  const aboutSection = sections.find(s => s.type === 'about')
  const scopeSection = sections.find(s => s.type === 'scope')
  const termsSection = sections.find(s => s.type === 'terms')

  const coverOverview = aboutSection?.type === 'about' ? (aboutSection.overview ?? '') : ''
  const aboutBody     = aboutSection?.type === 'about' ? aboutSection.body : ''
  const deliverables = scopeSection?.type === 'scope'  ? scopeSection.items : []
  const milestones: PaymentMilestone[] =
    termsSection?.type === 'terms' ? termsSection.milestones : []

  const project   = proposal.project
  const workspace = proposal.workspace
  const clientName = project.client.name

  // Per-workspace brand → CSS variables consumed by V / V_TINT / MINT / MINT_DK.
  // Falls back to the SlateSuite palette when the workspace hasn't set colors.
  const brandPrimary = safeHex(workspace.primaryColor)
  const brandAccent  = safeHex(workspace.accentColor)
  const coverGradient =
    `radial-gradient(ellipse 80% 65% at 78% 22%, ${lighten(brandPrimary, 0.18)} 0%, transparent 70%),` +
    `radial-gradient(ellipse 60% 55% at 18% 74%, ${darken(brandPrimary, 0.45)} 0%, transparent 74%),` +
    `radial-gradient(ellipse 65% 50% at 50% 48%, ${brandPrimary} 0%, transparent 82%),` +
    `${darken(brandPrimary, 0.9)}`
  const brandVars = {
    '--brand-v':        brandPrimary,
    '--brand-v-tint':   lighten(brandPrimary, 0.92),
    '--brand-mint':     brandAccent,
    '--brand-mint-dk':  darken(brandAccent, 0.55),
    '--gradient-cover': coverGradient,
  } as React.CSSProperties

  const prefix         = proposal.workspace.invoiceNumberPrefix || 'TTP'
  const proposalNumber = `${prefix}-${new Date(proposal.createdAt).getFullYear()}-${String(proposal.version).padStart(3, '0')}`

  const validThrough = proposal.expiresAt ? fmt(proposal.expiresAt) : null

  const shootDates = project.shootStartDate
    ? (() => {
        const start = parseLocalDate(project.shootStartDate)!
        const end   = parseLocalDate(project.shootEndDate)
        const sLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const eLabel = end && end.getTime() !== start.getTime()
          ? ` – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : ''
        return `${sLabel}${eLabel}, ${start.getFullYear()}`
      })()
    : null

  // Section highlight (1.8s pulse after deliverable click)
  const [highlightedSections, setHighlightedSections] = useState<Set<string>>(new Set())

  function handleDeliverableClick(sectionIds: string[]) {
    if (deliverableLinkMode === 'filter') {
      // TODO: filter-view behavior — hide sections not in sectionIds, show only matching ones
      return
    }
    const firstId = sectionIds[0]
    const el = document.getElementById(`section-${firstId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlightedSections(new Set(sectionIds))
    setTimeout(() => setHighlightedSections(new Set()), 1800)
  }

  const multiSection = budgetSections.length > 1

  // Budget-level agency fee — read from frozen snapshot stored in content
  type BudgetSnapshot = { productionCents: number; budgetMarkupPct: number; budgetTaxPct: number }
  const snap            = (proposal.content as { budgetSnapshot?: BudgetSnapshot }).budgetSnapshot
  const productionCents = snap?.productionCents ?? totalCents
  const budgetMarkupPct = snap?.budgetMarkupPct ?? 0
  const budgetTaxPct    = snap?.budgetTaxPct    ?? 0

  // Merge-tag context for contract section bodies
  const mergeCtx: MergeTagContext = {
    workspace: {
      name:      workspace.name ?? undefined,
      legalName: workspace.legalName ?? undefined,
    },
    client:   { name: clientName },
    project:  { name: project.name },
    proposal: {
      total:        totalCents > 0 ? formatMoney(totalCents) : undefined,
      validThrough: validThrough ?? undefined,
    },
    deliverables: deliverables.map(d => ({ title: d.title, quantity: d.quantity })),
  }

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
    <div style={{ ...brandVars, fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: BODY, background: '#fff', minHeight: '100vh' }}>
      {/* Load script font for signature preview */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');`}</style>

      {/* Draft preview banner */}
      {isDraft && (
        <div style={{ background: '#FFF8E1', borderBottom: '1px solid #FFD54F', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 100 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#7B5800', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Draft Preview</span>
          <span style={{ fontSize: 13, color: '#7B5800', opacity: 0.8 }}>— This proposal has not been sent. Content may change before it goes to the client.</span>
        </div>
      )}

      {/* ════════════════════ COVER (compact) ════════════════════ */}
      <section
        className="proposal-cover noise-overlay"
        style={{ padding: 'clamp(24px,4vw,48px) clamp(24px,5vw,64px)', display: 'flex', flexDirection: 'column', position: 'relative', boxSizing: 'border-box' }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, marginBottom: 'clamp(28px,4vw,48px)' }}>
          {(workspace.logoDarkUrl || workspace.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={(workspace.logoDarkUrl ?? workspace.logoUrl) as string} alt={workspace.name} style={{ height: 28, width: 'auto', maxWidth: 200, objectFit: 'contain', display: 'block' }} />
          ) : (
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{workspace.name}</span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            PROPOSAL · {proposalNumber}
          </span>
        </div>

        {/* Main content — compact */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: MINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', margin: '0 0 12px' }}>
            Prepared for {clientName}
          </p>
          <h1 style={{ color: '#fff', fontSize: 'clamp(24px, 3.5vw, 46px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 14px', maxWidth: '75%' }}>
            {proposal.title}
          </h1>
          {coverOverview && (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.6, maxWidth: 560, margin: '0 0 28px' }}>
              {coverOverview}
            </p>
          )}

          {/* Metadata strip with total on the right */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20, borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 20, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 'clamp(20px,4vw,48px)', flexWrap: 'wrap' }}>
              {shootDates && (
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Shoot Date(s)</p>
                  <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, margin: 0 }}>{shootDates}</p>
                </div>
              )}
              <div>
                <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Client</p>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, margin: 0 }}>{clientName}</p>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Type</p>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, margin: 0 }}>{SHOOT_LABELS[project.shootType] ?? project.shootType}</p>
              </div>
              {validThrough && (
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Valid Through</p>
                  <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, margin: 0 }}>{validThrough}</p>
                </div>
              )}
            </div>

            {/* Total — right-aligned in metadata strip */}
            {totalCents > 0 && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px' }}>Total</p>
                <p style={{ color: '#ffffff', fontSize: 'clamp(26px,3vw,38px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
                  {formatMoney(totalCents)}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════ THE PROJECT ════════════════════ */}
      {aboutBody && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <SectionHeader label="The Project" />
            <p style={{ fontSize: 17, lineHeight: 1.8, color: BODY, margin: 0, whiteSpace: 'pre-line' }}>
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
              {deliverables.map((item, i) => {
                const linked = (item as typeof item & { sectionIds?: string[] }).sectionIds
                const isLinked = multiSection && linked && linked.length > 0
                const cardStyle = {
                  background: '#fff',
                  border: `0.5px solid ${BORDER}`,
                  borderTop: `3px solid ${V}`,
                  borderRadius: 10,
                  padding: '24px 24px 28px',
                  cursor: isLinked ? 'pointer' : 'default',
                  transition: 'box-shadow 0.15s',
                }
                const inner = (
                  <>
                    <p style={{ color: V, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, margin: '0 0 14px' }}>
                      {item.number ?? String(i + 1).padStart(2, '0')}
                    </p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: BODY, margin: '0 0 8px' }}>{item.title}</p>
                    <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0 }}>{item.description}</p>
                    {isLinked && (
                      <p style={{ marginTop: 12, fontSize: 11, fontWeight: 700, color: V, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        See in budget →
                      </p>
                    )}
                  </>
                )
                return isLinked ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDeliverableClick(linked)}
                    style={{ ...cardStyle, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 16px ${V}22`)}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={i} style={cardStyle}>{inner}</div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ BUDGET SUMMARY + PAYMENT TERMS ════════════════════ */}
      <BudgetReadOnly
        accounts={accounts as never}
        totalCents={totalCents}
        productionCents={productionCents}
        budgetMarkupPct={budgetMarkupPct}
        budgetTaxPct={budgetTaxPct}
        discountCents={discountCents}
        discountLabel={discountLabel}
        budgetSections={budgetSections}
        milestones={milestones}
        shootStartDate={project.shootStartDate}
        highlightedSectionIds={highlightedSections}
        variant="proposal"
      />

      {/* ════════════════════ CONTRACT TERMS ════════════════════ */}
      {contractSections.length > 0 && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <SectionHeader label="Terms" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
              {contractSections.map((cs, i) => {
                // Render smart-text first, then substitute (HTML-escaped) merge
                // values into the finished HTML — resolving before rendering would
                // double-escape the body; resolving after keeps values un-injectable.
                const html = resolveMergeTags(renderSmartText(cs.body), mergeCtx)
                return (
                  <div key={cs.id}>
                    {contractSections.length > 1 && (
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: V, margin: '0 0 10px' }}>
                        {String(i + 1).padStart(2, '0')} — {cs.title}
                      </p>
                    )}
                    {contractSections.length === 1 && (
                      <p style={{ fontSize: 15, fontWeight: 700, color: BODY, margin: '0 0 10px' }}>
                        {cs.title}
                      </p>
                    )}
                    <div
                      style={{ fontSize: 13, lineHeight: 1.8, color: BODY }}
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                    {i < contractSections.length - 1 && (
                      <div style={{ height: 1, background: BORDER, marginTop: 36 }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ CONTINUE TO SIGN (contract flow) ════════════════════ */}
      {!isDraft && contractEnabled && !isAlreadyApproved && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: V_TINT }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <SectionHeader label="Ready to proceed?" />
            <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '40px 36px' }}>
              <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 10px' }}>
                If the scope of work, budget, and payment terms look good, continue to review and sign the contract.
              </p>
              <p style={{ fontSize: 13, color: MUTED, margin: '0 0 28px' }}>
                You&apos;ll have a chance to read the full terms before signing.
              </p>
              <a
                href={`/p/${proposal.publicToken}/sign`}
                style={{
                  display: 'block', width: '100%', padding: '14px', boxSizing: 'border-box',
                  background: MINT, color: MINT_DK,
                  fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
                  textDecoration: 'none', borderRadius: 6, textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                Continue to review contract →
              </a>
              <a
                href={`mailto:${proposal.workspace.contactEmail ?? ''}?subject=Changes requested: ${encodeURIComponent(proposal.title)}`}
                style={{
                  display: 'block', color: V, fontSize: 14, fontWeight: 600,
                  textDecoration: 'none', textAlign: 'center',
                }}
              >
                Request changes instead
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ ALREADY APPROVED (contract flow) ═══════════════════ */}
      {!isDraft && contractEnabled && isAlreadyApproved && (
        <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: V_TINT }}>
          <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '44px 36px' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <Check size={26} color={MINT_DK} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: BODY, margin: '0 0 10px' }}>Proposal Approved</p>
              <p style={{ fontSize: 14, color: MUTED, margin: '0 0 20px', lineHeight: 1.6 }}>
                Signed by <strong style={{ color: BODY }}>{proposal.signatureName}</strong>
                {proposal.approvedAt && <> on {fmt(proposal.approvedAt)}</>}
              </p>
              <a
                href={`/api/pdf/proposal/${proposal.publicToken}`}
                style={{ color: MUTED, fontSize: 13, textDecoration: 'underline' }}
              >
                Download signed PDF
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════ SIGN OFF (inline — no contract) ════════════════════ */}
      {!isDraft && !contractEnabled && <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: V_TINT }}>
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
                By signing below, you confirm your agreement to the scope of work, terms, and payment schedule outlined above.
              </p>

              {/* Cursive signature preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ minHeight: 52, display: 'flex', alignItems: 'flex-end', paddingBottom: 8, borderBottom: `1.5px solid ${BODY}` }}>
                  {sigName.trim() ? (
                    <span style={{
                      fontFamily: '"Dancing Script", "Brush Script MT", cursive',
                      fontSize: 38, fontWeight: 600, color: INK,
                      lineHeight: 1, letterSpacing: '-0.01em',
                    }}>
                      {sigName}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.2)', fontStyle: 'italic' }}>
                      Your signature will appear here
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 10, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0 0' }}>
                  Signature
                </p>
              </div>

              <input
                type="text"
                placeholder="Type your full name to sign"
                value={sigName}
                onChange={e => setSigName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleApprove()}
                style={{
                  display: 'block', width: '100%', padding: '12px 16px',
                  fontSize: 15,
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
                href={`/api/pdf/proposal/${proposal.publicToken}`}
                style={{ color: MUTED, fontSize: 13, textDecoration: 'underline' }}
              >
                Download PDF
              </a>
            </div>
          )}
        </div>
      </section>}

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
