'use client'

import { useState } from 'react'
import { Check, ArrowLeft } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { lighten, darken, safeHex } from '@/lib/color'
import { parseLocalDate } from '@/lib/time-format'
import { renderSmartText } from '@/lib/smart-text'
import { resolveMergeTags, type MergeTagContext } from '@/lib/merge-tags'

const V       = 'var(--brand-v, #5D00A4)'
const V_TINT  = 'var(--brand-v-tint, #F5EDFA)'
const MINT    = 'var(--brand-mint, #04FFCC)'
const MINT_DK = 'var(--brand-mint-dk, #003D31)'
const INK     = '#0A0612'
const BODY    = '#2C2C2A'
const BORDER  = '#E8E0F0'
const MUTED   = '#888780'

function fmt(d: Date | string) {
  const date = parseLocalDate(d) ?? new Date(d)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

interface ContractSection {
  id:         string
  title:      string
  body:       string
  orderIndex: number
  /** Pre-resolved HTML from the signing snapshot — takes precedence over live rendering. */
  resolvedHtml?: string
}

interface SerialProposal {
  id:            string
  title:         string
  publicToken:   string
  version:       number
  status:        string
  expiresAt:     string | null
  approvedAt:    string | null
  signatureName: string | null
  totalCents:    number
  project: {
    name:   string
    client: { name: string }
  }
  workspace: {
    name:                string
    legalName:           string | null
    contactEmail:        string | null
    website:             string | null
    invoiceNumberPrefix: string
    logoUrl:             string | null
    logoDarkUrl:         string | null
    primaryColor:        string | null
    accentColor:         string | null
  }
}

interface Props {
  proposal:         SerialProposal
  contractSections: ContractSection[]
}

export function ProposalSignView({ proposal, contractSections }: Props) {
  const workspace  = proposal.workspace
  const clientName = proposal.project.client.name

  const brandPrimary = safeHex(workspace.primaryColor)
  const brandAccent  = safeHex(workspace.accentColor)
  const brandVars = {
    '--brand-v':       brandPrimary,
    '--brand-v-tint':  lighten(brandPrimary, 0.92),
    '--brand-mint':    brandAccent,
    '--brand-mint-dk': darken(brandAccent, 0.55),
  } as React.CSSProperties

  const prefix         = workspace.invoiceNumberPrefix || 'TTP'
  const proposalNumber = `${prefix}-${new Date().getFullYear()}-${String(proposal.version).padStart(3, '0')}`
  const validThrough   = proposal.expiresAt ? fmt(proposal.expiresAt) : null

  const mergeCtx: MergeTagContext = {
    workspace: { name: workspace.name ?? undefined, legalName: workspace.legalName ?? undefined },
    client:    { name: clientName },
    project:   { name: proposal.project.name },
    proposal: {
      total:        proposal.totalCents > 0 ? formatMoney(proposal.totalCents) : undefined,
      validThrough: validThrough ?? undefined,
    },
  }

  // Sign-off state
  const isAlreadyApproved = proposal.status === 'APPROVED'
  const [agreed,    setAgreed]    = useState(false)
  const [sigName,   setSigName]   = useState(proposal.signatureName ?? '')
  const [sigState,  setSigState]  = useState<'idle' | 'submitting' | 'done' | 'error'>(
    isAlreadyApproved ? 'done' : 'idle'
  )
  const [sigError, setSigError] = useState('')
  const [signedAt, setSignedAt] = useState<string | null>(proposal.approvedAt)

  async function handleApprove() {
    if (!agreed) { setSigError('Please check the box confirming you agree to the terms above.'); return }
    const name = sigName.trim()
    if (name.length < 2) { setSigError('Please enter your full name'); return }
    setSigState('submitting')
    setSigError('')
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signatureName: name, proposalToken: proposal.publicToken, agreedToTerms: true }),
      })
      if (res.ok) {
        const d = await res.json().catch(() => ({}))
        setSignedAt((d as { approvedAt?: string }).approvedAt ?? new Date().toISOString())
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

  return (
    <div style={{ ...brandVars, fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: BODY, background: '#fff', minHeight: '100vh' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');`}</style>

      {/* ── Sticky header ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '14px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a
            href={`/p/${proposal.publicToken}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: MUTED, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
          >
            <ArrowLeft size={14} />
            Back to proposal
          </a>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
              {workspace.name} · {proposalNumber}
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: BODY, margin: 0 }}>{proposal.title}</p>
          </div>
        </div>
      </header>

      {/* ── Page title ── */}
      <section style={{ padding: 'clamp(40px,6vw,72px) clamp(24px,6vw,80px) 32px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: V, margin: '0 0 10px' }}>
            Step 2 of 2 — Contract review
          </p>
          <h1 style={{ fontSize: 'clamp(22px,3vw,34px)', fontWeight: 700, color: INK, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            Review &amp; sign the contract
          </h1>
          <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.6 }}>
            Prepared for <strong style={{ color: BODY }}>{clientName}</strong>
            {proposal.totalCents > 0 && <> · Total: <strong style={{ color: BODY }}>{formatMoney(proposal.totalCents)}</strong></>}
          </p>
        </div>
      </section>

      {/* ── Contract sections ── */}
      <section style={{ padding: 'clamp(48px,7vw,80px) clamp(24px,6vw,80px)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Terms header */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ height: 1.5, background: V, marginBottom: 10 }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: V }}>
              Terms &amp; Conditions
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {contractSections.map((cs, i) => {
              // Signed proposals carry pre-resolved snapshot HTML (frozen at
              // approval). Otherwise: render smart-text first, then substitute
              // (HTML-escaped) merge values into the finished HTML — resolving
              // before rendering would double-escape; after keeps values inert.
              const html = cs.resolvedHtml ?? resolveMergeTags(renderSmartText(cs.body), mergeCtx, { warnUnresolved: false })
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
                    style={{ fontSize: 13, lineHeight: 1.85, color: BODY }}
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

      {/* ── Sign off ── */}
      <section style={{ padding: 'clamp(48px,7vw,96px) clamp(24px,6vw,80px)', background: V_TINT }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ height: 1.5, background: V, marginBottom: 10 }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: V }}>
              Sign Off
            </span>
          </div>

          {sigState === 'done' ? (
            <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '44px 36px' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <Check size={26} color={MINT_DK} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: BODY, margin: '0 0 10px' }}>Contract Signed</p>
              <p style={{ fontSize: 14, color: MUTED, margin: '0 0 20px', lineHeight: 1.6 }}>
                Signed by <strong style={{ color: BODY }}>{proposal.signatureName || sigName}</strong>
                {signedAt && <> on {fmt(signedAt)}</>}
              </p>
              <a
                href={`/api/pdf/proposal/${proposal.publicToken}`}
                style={{ color: MUTED, fontSize: 13, textDecoration: 'underline' }}
              >
                Download signed PDF
              </a>
            </div>
          ) : (
            <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '40px 36px', textAlign: 'left' }}>
              {/* Agree checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 28 }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => { setAgreed(e.target.checked); if (sigError) setSigError('') }}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: brandPrimary, flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, color: BODY, lineHeight: 1.6 }}>
                  I have read and agree to the contract terms above, and I understand this constitutes a legally binding agreement.
                </span>
              </label>

              <p style={{ fontSize: 14, color: BODY, lineHeight: 1.7, margin: '0 0 24px' }}>
                By signing below, you confirm your agreement to the scope of work, terms, and payment schedule outlined in this proposal.
              </p>

              {/* Cursive signature preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ minHeight: 52, display: 'flex', alignItems: 'flex-end', paddingBottom: 8, borderBottom: `1.5px solid ${BODY}` }}>
                  {sigName.trim() ? (
                    <span style={{ fontFamily: '"Dancing Script", "Brush Script MT", cursive', fontSize: 38, fontWeight: 600, color: INK, lineHeight: 1, letterSpacing: '-0.01em' }}>
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
                <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 14px' }}>{sigError}</p>
              )}

              <button
                type="button"
                onClick={handleApprove}
                disabled={sigState === 'submitting' || !agreed}
                style={{
                  display: 'block', width: '100%', padding: '14px',
                  background: (!agreed || sigState === 'submitting') ? `${MINT}99` : MINT,
                  color: MINT_DK, fontSize: 15, fontWeight: 700,
                  letterSpacing: '0.02em', border: 'none', borderRadius: 6,
                  cursor: (!agreed || sigState === 'submitting') ? 'not-allowed' : 'pointer',
                  marginBottom: 12, transition: 'opacity 0.15s',
                }}
              >
                {sigState === 'submitting' ? 'Signing…' : 'Sign & approve →'}
              </button>

              <a
                href={`mailto:${workspace.contactEmail ?? ''}?subject=Changes requested: ${encodeURIComponent(proposal.title)}`}
                style={{ display: 'block', textAlign: 'center', color: V, fontSize: 14, fontWeight: 600, textDecoration: 'none', marginBottom: 20 }}
              >
                Request changes instead
              </a>

              <a
                href={`/api/pdf/proposal/${proposal.publicToken}`}
                style={{ display: 'block', textAlign: 'center', color: MUTED, fontSize: 13, textDecoration: 'underline' }}
              >
                Download PDF
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: INK, padding: 'clamp(32px,4vw,48px) clamp(24px,6vw,80px)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>{workspace.name}</p>
            {workspace.contactEmail && (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 3px' }}>{workspace.contactEmail}</p>
            )}
            {workspace.website && (
              <a href={workspace.website} target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textDecoration: 'none', display: 'block' }}>
                {workspace.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
          {validThrough && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 5px' }}>Valid Through</p>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0 }}>{validThrough}</p>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
