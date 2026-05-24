import {
  Document, Page, Text, View, StyleSheet, Font, Link,
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
  project: {
    name: string; shootType: string;
    shootStartDate: string | null; shootEndDate: string | null;
    client: { name: string };
  };
  workspace: {
    name: string; legalName: string | null;
    contactEmail: string | null; website: string | null;
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
  page:     { fontFamily: 'Helvetica', fontSize: 10, color: BODY, backgroundColor: '#fff' },

  // Cover
  cover:    { backgroundColor: INK, padding: '40 48 36 48', minHeight: 220 },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  logoBox:  { flexDirection: 'row', alignItems: 'center' },
  logoMark: { width: 18, height: 18, borderRadius: 3, backgroundColor: MINT, marginRight: 6, justifyContent: 'center', alignItems: 'center' },
  logoT:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#003D31' },
  logoName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.5, textTransform: 'uppercase' },
  logoCreative: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: MINT },
  propNum:  { fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2, textTransform: 'uppercase' },
  coverLabel: { fontSize: 8, color: MINT, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#fff', lineHeight: 1.15, marginBottom: 12 },
  coverDesc:  { fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 400, marginBottom: 28 },
  coverMeta:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 },
  metaGroup:  { flexDirection: 'row', gap: 32 },
  metaItem:   { marginRight: 32 },
  metaLabel:  { fontSize: 7, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  metaValue:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#fff' },
  totalLabel: { fontSize: 7, color: MINT, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  totalValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' },

  // Body sections
  section:     { padding: '32 48' },
  sectionAlt:  { padding: '32 48', backgroundColor: CAN },
  sectionLine: { height: 1.5, backgroundColor: V, marginBottom: 8 },
  sectionTag:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 20 },
  bodyText:    { fontSize: 11, lineHeight: 1.75, color: BODY },

  // Deliverables
  delGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  delCard:     { width: '30%', borderTopWidth: 2.5, borderTopColor: V, borderWidth: 0.5, borderColor: BDR, borderRadius: 6, padding: '14 14 18' },
  delNum:      { fontSize: 20, fontFamily: 'Helvetica-Bold', color: V, marginBottom: 8, lineHeight: 1 },
  delTitle:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 5 },
  delDesc:     { fontSize: 9.5, color: MUT, lineHeight: 1.55 },

  // Budget table
  budgetCard:  { borderWidth: 0.5, borderColor: BDR, borderRadius: 8, overflow: 'hidden', marginBottom: 0 },
  budgetRow:   { flexDirection: 'row', alignItems: 'center', padding: '10 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  budgetHead:  { flexDirection: 'row', alignItems: 'center', padding: '8 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: CAN },
  budgetLast:  { borderBottomWidth: 0 },
  col1:        { flex: 1 },
  colR:        { width: 70, textAlign: 'right' },
  colSm:       { width: 40, textAlign: 'right' },
  colUnit:     { width: 36, textAlign: 'right' },
  headText:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUT, letterSpacing: 0.8, textTransform: 'uppercase' },
  acctName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY },
  acctCode:    { fontSize: 8.5, color: MUT, marginRight: 6 },
  lineDesc:    { fontSize: 10, color: BODY, paddingLeft: 12 },
  lineAmt:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  lineVal:     { fontSize: 10, color: MUT, textAlign: 'right' },
  acctAmt:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '9 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  subtotalLbl: { fontSize: 10, color: MUT },
  subtotalVal: { fontSize: 10, color: BODY },
  totalBar:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14 20', backgroundColor: INK, borderRadius: '0 0 8 8' },
  totalBarLbl: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: MINT, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalBarVal: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#fff' },

  // Payment terms
  milestoneGrid: { flexDirection: 'row', gap: 12 },
  milestoneCard: { flex: 1, borderWidth: 0.5, borderColor: BDR, borderRadius: 8, padding: '18 18 22' },
  milestoneNum:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  milestonePct:  { fontSize: 26, fontFamily: 'Helvetica-Bold', color: BODY, lineHeight: 1, marginBottom: 4 },
  milestoneName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 4 },
  milestoneTrig: { fontSize: 9.5, color: MUT, marginBottom: 12 },
  milestoneAmt:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: V },

  // Footer
  footer:    { flexDirection: 'row', justifyContent: 'space-between', padding: '16 48', backgroundColor: INK },
  footerLbl: { fontSize: 9, color: 'rgba(255,255,255,0.5)' },
  footerBold:{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 3 },
})

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
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
  const proposalNum  = `PRO-${new Date(proposal.createdAt).getFullYear()}-${String(proposal.version).padStart(3, '0')}`
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

  // Separate production fee
  const prodFeeAccount = accounts.find(a => /production fee/i.test(a.name))
  const mainAccounts   = accounts.filter(a => !/production fee/i.test(a.name))
  const prodFeeCents   = prodFeeAccount ? sumAccount(prodFeeAccount as unknown as AccountInput) : 0
  const subtotalCents  = totalCents - prodFeeCents

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ══ COVER ══ */}
        <View style={s.cover}>
          {/* Top bar */}
          <View style={s.coverTop}>
            <View style={s.logoBox}>
              <View style={s.logoMark}>
                <Text style={s.logoT}>T</Text>
              </View>
              <Text style={s.logoName}>The Third Place </Text>
              <Text style={s.logoCreative}>Creative</Text>
            </View>
            <Text style={s.propNum}>PROPOSAL · {proposalNum}</Text>
          </View>

          {/* Title block */}
          <Text style={s.coverLabel}>Prepared for {clientName}</Text>
          <Text style={s.coverTitle}>{proposal.title}</Text>
          {aboutBody ? (
            <Text style={s.coverDesc}>
              {aboutBody.length > 180 ? aboutBody.slice(0, 180) + '…' : aboutBody}
            </Text>
          ) : null}

          {/* Metadata strip */}
          <View style={s.coverMeta}>
            <View style={s.metaGroup}>
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
            {totalCents > 0 && (
              <View>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalValue}>{formatMoney(totalCents)}</Text>
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
          <View style={s.sectionAlt}>
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

              {mainAccounts.map((acc, ai) => {
                const accTotal = sumAccount(acc as unknown as AccountInput)
                const isLast   = ai === mainAccounts.length - 1 && !prodFeeAccount
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
                      const tot = lineTotal(item.quantity, item.rateCents, item.markupPct)
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
                              <Text style={[s.lineDesc, { color: MUT, fontSize: 8.5, marginRight: 4 }]}>{child.name} · </Text>
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

              {/* Subtotal & Production Fee rows */}
              <View style={s.subtotalRow}>
                <Text style={s.subtotalLbl}>Subtotal</Text>
                <Text style={s.subtotalVal}>{formatMoney(subtotalCents)}</Text>
              </View>
              {prodFeeAccount && prodFeeCents > 0 && (
                <View style={s.subtotalRow}>
                  <Text style={s.subtotalLbl}>Production Fee</Text>
                  <Text style={s.subtotalVal}>{formatMoney(prodFeeCents)}</Text>
                </View>
              )}

              {/* Total bar */}
              <View style={s.totalBar}>
                <View>
                  <Text style={s.totalBarLbl}>Total Investment</Text>
                  <Text style={[s.totalBarLbl, { fontSize: 7, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5, marginTop: 2 }]}>All-in, USD</Text>
                </View>
                <Text style={s.totalBarVal}>{formatMoney(totalCents)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ══ PAYMENT TERMS ══ */}
        {milestones.length > 0 && (
          <View style={s.sectionAlt}>
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

        {/* ══ FOOTER ══ */}
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
