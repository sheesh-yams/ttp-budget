import {
  Document, Page, Text, View, StyleSheet, Link, Font, Image,
} from '@react-pdf/renderer'
import { lineTotal, formatMoney } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { ProposalContent, PaymentMilestone } from '@/types'

// ─── Brand colours ────────────────────────────────────────────────────────────
const V    = '#5D00A4'
const MINT = '#04FFCC'
const INK  = '#0A0612'
const BODY = '#2C2C2A'
const MUT  = '#888780'
const BDR  = '#E8E0F0'
const CAN  = '#F7F4FA'
const LAV  = '#EDE9FE'   // lavender tint for total row

// ─── No mid-word hyphenation ──────────────────────────────────────────────────
Font.registerHyphenationCallback((w) => [w])

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string; description: string; quantity: number; unit: string;
  rateCents: number; markupPct: number | null;
}
interface Account {
  id: string; name: string; code: string | null;
  lineItems: LineItem[];
  children: Array<{ id: string; name: string; lineItems: LineItem[] }>;
}
interface ProposalData {
  id: string; title: string; publicToken: string; version: number;
  content: unknown; createdAt: string; expiresAt: string | null;
  logoSrc?: string;
  project: {
    name: string; shootType: string;
    shootStartDate: string | null; shootEndDate: string | null;
    client: { name: string };
  };
  workspace: {
    name: string; legalName: string | null;
    contactEmail: string | null; website: string | null;
    invoiceNumberPrefix: string;
  };
}

interface Props {
  proposal: ProposalData
  accounts: Account[]
  totalCents: number
}

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
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Page — paddingBottom leaves room for pinned footer
  page: { fontFamily: 'Helvetica', fontSize: 10, color: BODY, backgroundColor: '#fff', paddingBottom: 52 },

  // ── Cover (compact) ─────────────────────────────────────────────────────────
  cover:    { backgroundColor: INK, padding: '22 48 18 48' },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  logoImg:  { height: 22 },
  logoBox:  { flexDirection: 'row', alignItems: 'center' },
  logoMark: { width: 14, height: 14, borderRadius: 2, backgroundColor: MINT, marginRight: 5, justifyContent: 'center', alignItems: 'center' },
  logoT:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#003D31' },
  logoName: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.2 },
  logoCreative: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MINT },
  propNum:  { fontSize: 7.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 },

  coverLabel: { fontSize: 7.5, color: MINT, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#fff', lineHeight: 1.15, marginBottom: 10 },
  coverDesc:  { fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 420, marginBottom: 20 },

  // Total — displayed above the metadata strip
  coverTotalLabel: { fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  coverTotalAmt:   { fontSize: 26, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: '-0.02em', marginBottom: 16 },

  // Metadata strip — shoot dates / client / type / valid through
  coverMeta:  { flexDirection: 'row', gap: 28, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  metaItem:   { marginRight: 24 },
  metaLabel:  { fontSize: 6.5, color: 'rgba(255,255,255,0.38)', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 3 },
  metaValue:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fff' },

  // ── Body sections ────────────────────────────────────────────────────────────
  section:     { padding: '28 48' },
  sectionAlt:  { padding: '28 48', backgroundColor: CAN },
  sectionLine: { height: 1.5, backgroundColor: V, marginBottom: 7 },
  sectionTag:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 18 },
  bodyText:    { fontSize: 11, lineHeight: 1.75, color: BODY },

  // ── Deliverables ─────────────────────────────────────────────────────────────
  delGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  delCard:  { width: '30%', borderTopWidth: 2.5, borderTopColor: V, borderWidth: 0.5, borderColor: BDR, borderRadius: 6, padding: '12 12 16' },
  delNum:   { fontSize: 18, fontFamily: 'Helvetica-Bold', color: V, marginBottom: 6, lineHeight: 1 },
  delTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 4 },
  delDesc:  { fontSize: 9, color: MUT, lineHeight: 1.5 },

  // ── Budget table ─────────────────────────────────────────────────────────────
  budgetCard:  { borderWidth: 0.5, borderColor: BDR, borderRadius: 8, overflow: 'hidden' },
  budgetRow:   { flexDirection: 'row', alignItems: 'center', padding: '9 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  budgetHead:  { flexDirection: 'row', alignItems: 'center', padding: '7 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: CAN },
  budgetLast:  { borderBottomWidth: 0 },
  col1:        { flex: 1 },
  colR:        { width: 70, textAlign: 'right' },
  colSm:       { width: 38, textAlign: 'right' },
  colUnit:     { width: 34, textAlign: 'right' },
  headText:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUT, letterSpacing: 0.7, textTransform: 'uppercase' },
  // Account header row
  acctCode:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: V, marginRight: 7 },
  acctName:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY },
  acctAmt:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  // Line item rows
  lineDesc:    { fontSize: 9.5, color: BODY, paddingLeft: 12 },
  lineAmt:     { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  lineVal:     { fontSize: 9.5, color: MUT, textAlign: 'right' },

  // Subtotal rows
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '8 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  subtotalLbl: { fontSize: 9.5, color: MUT },
  subtotalVal: { fontSize: 9.5, color: BODY },

  // Big total — sits above the accent bar, separated from line items
  totalBigRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14 20', backgroundColor: LAV },
  totalBigLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 3 },
  totalBigAmt:   { fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK },

  // Mint accent bar — replaces the old INK grandBar
  accentBar:    { padding: '9 20', backgroundColor: MINT },
  accentBarLbl: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#003D31', letterSpacing: 1.4, textTransform: 'uppercase' },

  // ── Payment terms ─────────────────────────────────────────────────────────────
  milestoneGrid: { flexDirection: 'row', gap: 10 },
  milestoneCard: { flex: 1, borderWidth: 0.5, borderColor: BDR, borderRadius: 8, padding: '16 16 20' },
  milestoneNum:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 7 },
  milestonePct:  { fontSize: 24, fontFamily: 'Helvetica-Bold', color: BODY, lineHeight: 1, marginBottom: 4 },
  milestoneName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 3 },
  milestoneTrig: { fontSize: 9, color: MUT, marginBottom: 10 },
  milestoneAmt:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: V },

  // ── Footer — pinned absolutely ────────────────────────────────────────────────
  footer:    { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '11 48', backgroundColor: INK },
  footerLbl: { fontSize: 8, color: 'rgba(255,255,255,0.45)' },
  footerBold:{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 2 },
})

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={s.sectionLine} />
      <Text style={s.sectionTag}>{label}</Text>
    </View>
  )
}

// ─── Main PDF component ───────────────────────────────────────────────────────

export function ProposalPDF({ proposal, accounts, totalCents }: Props) {
  const content  = proposal.content as ProposalContent
  const sections = content?.sections ?? []

  const aboutSection = sections.find(s => s.type === 'about')
  const scopeSection = sections.find(s => s.type === 'scope')
  const termsSection = sections.find(s => s.type === 'terms')

  const aboutBody    = aboutSection?.type === 'about' ? (aboutSection.body ?? '') : ''
  const deliverables = scopeSection?.type === 'scope'  ? scopeSection.items : []
  const milestones: PaymentMilestone[] = termsSection?.type === 'terms' ? termsSection.milestones : []

  const clientName   = proposal.project.client.name
  const prefix       = proposal.workspace.invoiceNumberPrefix || 'TTP'
  const proposalNum  = `${prefix}-${new Date(proposal.createdAt).getFullYear()}-${String(proposal.version).padStart(3, '0')}`
  const shootType    = SHOOT_LABELS[proposal.project.shootType] ?? proposal.project.shootType
  const validThrough = proposal.expiresAt ? fmtDate(proposal.expiresAt) : null

  const shootDates = proposal.project.shootStartDate
    ? (() => {
        const start = new Date(proposal.project.shootStartDate!)
        const end   = proposal.project.shootEndDate ? new Date(proposal.project.shootEndDate) : null
        const sLbl  = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const eLbl  = end && end.getTime() !== start.getTime()
          ? ` – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : ''
        return `${sLbl}${eLbl}, ${start.getFullYear()}`
      })()
    : null

  // Budget snapshot values for agency fee display
  type BudgetSnapshot = { productionCents: number; budgetMarkupPct: number; budgetTaxPct: number }
  const snap            = (proposal.content as { budgetSnapshot?: BudgetSnapshot }).budgetSnapshot
  const productionCents = snap?.productionCents ?? totalCents
  const budgetMarkupPct = snap?.budgetMarkupPct ?? 0
  const budgetTaxPct    = snap?.budgetTaxPct    ?? 0
  const agencyFeeCents  = budgetMarkupPct > 0 ? Math.round(productionCents * budgetMarkupPct) : 0
  const preTaxCents     = productionCents + agencyFeeCents
  const taxCents        = budgetTaxPct   > 0 ? Math.round(preTaxCents * budgetTaxPct) : 0

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>

        {/* ══ COVER ══ */}
        <View style={s.cover}>
          {/* Top bar — logo + proposal number */}
          <View style={s.coverTop}>
            {proposal.logoSrc ? (
              <Image src={proposal.logoSrc} style={s.logoImg} />
            ) : (
              <View style={s.logoBox}>
                <View style={s.logoMark}><Text style={s.logoT}>T</Text></View>
                <Text style={s.logoName}>The Third Place </Text>
                <Text style={s.logoCreative}>Creative</Text>
              </View>
            )}
            <Text style={s.propNum}>PROPOSAL · {proposalNum}</Text>
          </View>

          {/* Prepared for + title */}
          <Text style={s.coverLabel}>Prepared for {clientName}</Text>
          <Text style={s.coverTitle}>{proposal.title}</Text>
          {aboutBody ? (
            <Text style={s.coverDesc}>
              {aboutBody.length > 180 ? aboutBody.slice(0, 180) + '…' : aboutBody}
            </Text>
          ) : null}

          {/* Total — above the metadata strip */}
          {totalCents > 0 && (
            <View style={{ marginBottom: 0 }}>
              <Text style={s.coverTotalLabel}>Total Investment</Text>
              <Text style={s.coverTotalAmt}>{formatMoney(totalCents)}</Text>
            </View>
          )}

          {/* Metadata strip — shoot dates, client, type, valid through */}
          <View style={s.coverMeta}>
            {shootDates && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Shoot Dates</Text>
                <Text style={s.metaValue}>{shootDates}</Text>
              </View>
            )}
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Client</Text>
              <Text style={s.metaValue}>{clientName}</Text>
            </View>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Type</Text>
              <Text style={s.metaValue}>{shootType}</Text>
            </View>
            {validThrough && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Valid Through</Text>
                <Text style={s.metaValue}>{validThrough}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ══ THE PROJECT ══ */}
        {aboutBody ? (
          <View style={s.section}>
            <SectionLabel label="The Project" />
            <Text style={s.bodyText}>{aboutBody}</Text>
          </View>
        ) : null}

        {/* ══ DELIVERABLES ══ */}
        {deliverables.length > 0 && (
          <View style={s.sectionAlt} wrap={false}>
            <SectionLabel label="Deliverables" />
            <View style={s.delGrid}>
              {deliverables.map((d, i) => (
                <View key={i} style={s.delCard}>
                  <Text style={s.delNum}>{d.number ?? String(i + 1).padStart(2, '0')}</Text>
                  <Text style={s.delTitle}>{d.title}</Text>
                  <Text style={s.delDesc}>{d.description}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ══ BUDGET SUMMARY ══ */}
        {accounts.length > 0 && (
          <View style={s.section} break>
            <SectionLabel label="Budget Summary" />

            <View style={s.budgetCard}>
              {/* Column headers */}
              <View style={s.budgetHead}>
                <Text style={[s.col1, s.headText]}>Description</Text>
                <Text style={[s.colSm, s.headText]}>Qty</Text>
                <Text style={[s.colUnit, s.headText]}>Unit</Text>
                <Text style={[s.colR, s.headText]}>Total</Text>
              </View>

              {accounts.map((acc, ai) => {
                const accTotal = sumAccount(acc as unknown as AccountInput)
                const isLast   = ai === accounts.length - 1
                return (
                  <View key={acc.id}>
                    {/* Account header row */}
                    <View style={[s.budgetRow, { backgroundColor: '#F9F7FC' }, isLast && !acc.lineItems.length ? s.budgetLast : {}]}>
                      <View style={[s.col1, { flexDirection: 'row', alignItems: 'center' }]}>
                        {acc.code && <Text style={s.acctCode}>{acc.code}</Text>}
                        <Text style={s.acctName}>{acc.name}</Text>
                      </View>
                      <Text style={[s.colSm, s.headText]} />
                      <Text style={[s.colUnit, s.headText]} />
                      <Text style={[s.acctAmt, s.colR]}>{formatMoney(accTotal)}</Text>
                    </View>

                    {/* Own line items */}
                    {acc.lineItems.map((item, ii) => {
                      const tot  = lineTotal(item.quantity, item.rateCents, item.markupPct)
                      const last = ii === acc.lineItems.length - 1 && (!acc.children || acc.children.length === 0)
                      return (
                        <View key={item.id} style={[s.budgetRow, last && isLast ? s.budgetLast : {}]}>
                          <Text style={[s.col1, s.lineDesc]}>{item.description}</Text>
                          <Text style={[s.colSm, s.lineVal]}>{item.quantity}</Text>
                          <Text style={[s.colUnit, s.lineVal, { fontSize: 8 }]}>{item.unit.toUpperCase()}</Text>
                          <Text style={[s.colR, s.lineAmt]}>{formatMoney(tot)}</Text>
                        </View>
                      )
                    })}

                    {/* Child accounts */}
                    {acc.children?.flatMap(child =>
                      child.lineItems.map((item, ii) => {
                        const tot = lineTotal(item.quantity, item.rateCents, item.markupPct)
                        return (
                          <View key={item.id} style={s.budgetRow}>
                            <View style={[s.col1, { flexDirection: 'row' }]}>
                              <Text style={[s.lineDesc, { color: MUT, fontSize: 8, marginRight: 4 }]}>{child.name} · </Text>
                              <Text style={s.lineDesc}>{item.description}</Text>
                            </View>
                            <Text style={[s.colSm, s.lineVal]}>{item.quantity}</Text>
                            <Text style={[s.colUnit, s.lineVal, { fontSize: 8 }]}>{item.unit.toUpperCase()}</Text>
                            <Text style={[s.colR, s.lineAmt]}>{formatMoney(tot)}</Text>
                          </View>
                        )
                      })
                    )}
                  </View>
                )
              })}
            </View>

            {/* Totals — wrap={false} keeps them from splitting onto a new page */}
            <View
              wrap={false}
              style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: BDR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden', marginTop: -0.5 }}
            >
              {/* Subtotal row */}
              <View style={s.subtotalRow}>
                <Text style={s.subtotalLbl}>Subtotal</Text>
                <Text style={s.subtotalVal}>{formatMoney(productionCents)}</Text>
              </View>
              {agencyFeeCents > 0 && (
                <View style={s.subtotalRow}>
                  <Text style={s.subtotalLbl}>{`Agency Fee (${Math.round(budgetMarkupPct * 100)}%)`}</Text>
                  <Text style={s.subtotalVal}>{formatMoney(agencyFeeCents)}</Text>
                </View>
              )}
              {taxCents > 0 && (
                <View style={s.subtotalRow}>
                  <Text style={s.subtotalLbl}>{`Tax (${Math.round(budgetTaxPct * 100)}%)`}</Text>
                  <Text style={s.subtotalVal}>{formatMoney(taxCents)}</Text>
                </View>
              )}

              {/* Big total amount — above the accent bar */}
              <View style={s.totalBigRow}>
                <View>
                  <Text style={s.totalBigLabel}>Total Investment</Text>
                  <Text style={s.totalBigAmt}>{formatMoney(totalCents)}</Text>
                </View>
              </View>

              {/* Mint accent bar */}
              <View style={s.accentBar}>
                <Text style={s.accentBarLbl}>All-in · USD</Text>
              </View>
            </View>
          </View>
        )}

        {/* ══ PAYMENT TERMS ══ */}
        {milestones.length > 0 && (
          <View style={s.sectionAlt} wrap={false}>
            <SectionLabel label="Payment Terms" />
            <View style={s.milestoneGrid}>
              {milestones.map((m, i) => (
                <View key={m.id} style={s.milestoneCard}>
                  <Text style={s.milestoneNum}>Payment {String(i + 1).padStart(2, '0')}</Text>
                  <Text style={s.milestonePct}>{m.percentPct}%</Text>
                  <Text style={s.milestoneName}>{m.name}</Text>
                  <Text style={s.milestoneTrig}>{MILESTONE_LABELS[m.trigger] ?? m.trigger}</Text>
                  {totalCents > 0 && (
                    <Text style={s.milestoneAmt}>{formatMoney(Math.round(totalCents * m.percentPct / 100))}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ══ FOOTER — pinned to every page ══ */}
        <View style={s.footer} fixed>
          <View>
            <Text style={s.footerBold}>{proposal.workspace.name}</Text>
            {proposal.workspace.contactEmail && (
              <Text style={s.footerLbl}>{proposal.workspace.contactEmail}</Text>
            )}
            {proposal.workspace.website && (
              <Link src={proposal.workspace.website} style={[s.footerLbl, { color: MUT, textDecoration: 'none' }]}>
                {proposal.workspace.website.replace(/^https?:\/\//, '')}
              </Link>
            )}
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={s.footerLbl}>{proposalNum}</Text>
            {validThrough && <Text style={s.footerLbl}>Valid through {validThrough}</Text>}
          </View>
        </View>

      </Page>
    </Document>
  )
}
