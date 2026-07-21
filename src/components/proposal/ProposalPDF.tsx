import {
  Document, Page, Text, View, StyleSheet, Link, Font, Image,
} from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { lineTotal, formatMoney, parseQtyFormula, fmtUnit } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import { parseLocalDate } from '@/lib/time-format'
import type { ProposalContent, PaymentMilestone } from '@/types'

// ─── Brand colours ────────────────────────────────────────────────────────────
const V    = '#5D00A4'
const MINT = '#04FFCC'
const INK  = '#0A0612'
const BODY = '#2C2C2A'
const MUT  = '#888780'
const BDR  = '#E8E0F0'
const CAN  = '#F7F4FA'

// ─── No mid-word hyphenation ──────────────────────────────────────────────────
Font.registerHyphenationCallback((w) => [w])

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string; description: string; quantity: number; unit: string;
  rateCents: number; markupPct: number | null; quantityFormula?: string | null;
}
interface Account {
  id: string; name: string; code: string | null;
  sectionId?: string | null;
  lineItems: LineItem[];
  children: Array<{ id: string; name: string; lineItems: LineItem[] }>;
}

interface BudgetSection {
  id:    string
  title: string
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

interface ContractSection {
  id:    string
  title: string
  body:  string
}

interface Props {
  proposal: ProposalData
  accounts: Account[]
  totalCents: number
  discountCents?: number
  discountLabel?: string
  budgetSections?: BudgetSection[]
  contractSections?: ContractSection[]
  /** Present once the proposal is signed — renders the signature block. */
  signature?: { name: string; dateISO: string }
  pageBreakBetweenAccounts?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHOOT_LABELS: Record<string, string> = {
  MUSIC_VIDEO: 'Music Video', BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT: 'Product Shoot', EVENT_RECAP: 'Event Recap',
  SOCIAL_CONTENT: 'Social Content', INFLUENCER: 'Influencer',
  DOCUMENTARY: 'Documentary', OTHER: 'Other',
}
function milestoneLabelPdf(m: PaymentMilestone, shootStartDate: string | null): string {
  if (m.trigger === 'custom_date') {
    return m.customDate ? `Due ${fmtDate(m.customDate)}` : 'Custom date'
  }
  if (m.trigger === 'on_shoot_day') {
    return shootStartDate ? `Due ${fmtDate(shootStartDate)}` : 'Due on shoot day'
  }
  const LABELS: Record<string, string> = {
    on_signing: 'Due on signing', on_delivery: 'Due on delivery',
    net_30: 'Net 30 from invoice', net_60: 'Net 60 from invoice', net_90: 'Net 90 from invoice',
  }
  return LABELS[m.trigger] ?? m.trigger
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return (parseLocalDate(d) ?? new Date(d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Smart-text → PDF plain-text ──────────────────────────────────────────────
// react-pdf renders plain text only, so we strip inline markers and convert
// list prefixes to visible characters.

interface PdfLine { text: string; bullet?: boolean; numbered?: string }

function parsePdfLines(raw: string): PdfLine[] {
  return raw.split('\n').map(line => {
    if (/^- /.test(line)) return { text: stripInline(line.slice(2)), bullet: true }
    const numMatch = line.match(/^(\d+)\. (.*)/)
    if (numMatch) return { text: stripInline(numMatch[2]), numbered: `${numMatch[1]}.` }
    return { text: stripInline(line) }
  })
}

function stripInline(s: string): string {
  return s
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/_([\s\S]+?)_/g, '$1')
    .replace(/\+\+([\s\S]+?)\+\+/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:     { fontFamily: 'Helvetica', fontSize: 10, color: BODY, backgroundColor: '#fff', paddingBottom: 56 },

  // Cover
  cover:    { backgroundColor: INK, padding: '24 48 20 48', minHeight: 180 },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logoBox:  { flexDirection: 'row', alignItems: 'center' },
  logoImg:  { width: 104, height: 22 },
  logoMark: { width: 18, height: 18, borderRadius: 3, backgroundColor: MINT, marginRight: 6, justifyContent: 'center', alignItems: 'center' },
  logoT:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#003D31' },
  logoName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.5 },
  logoCreative: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: MINT },
  propNum:  { fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2 },
  coverLabel: { fontSize: 8, color: MINT, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#fff', lineHeight: 1.15, marginBottom: 10 },
  coverDesc:  { fontSize: 10.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 400, marginBottom: 18 },
  coverMeta:  { flexDirection: 'row', borderTopWidth: 1, borderTopColor: MINT, paddingTop: 12 },
  metaGroup:  { flexDirection: 'row', gap: 28 },
  metaItem:   { marginRight: 28 },
  metaLabel:  { fontSize: 7, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  metaValue:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fff' },

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
  delSeeRef:   { fontSize: 8.5, color: V, marginTop: 8, fontStyle: 'italic' },

  // Budget table
  budgetCard:  { borderWidth: 0.5, borderColor: BDR, borderRadius: 8, overflow: 'hidden', marginBottom: 0 },
  budgetRow:   { flexDirection: 'row', alignItems: 'center', padding: '10 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  budgetHead:  { flexDirection: 'row', alignItems: 'center', padding: '8 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: CAN },
  budgetLast:  { borderBottomWidth: 0 },
  col1:        { flex: 1 },
  colR:        { width: 70, textAlign: 'right' },
  colSm:       { width: 40, textAlign: 'right' },
  colUnit:     { width: 56, textAlign: 'right' },
  headText:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUT, letterSpacing: 0.8, textTransform: 'uppercase' },
  acctName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY },
  acctCode:    { fontSize: 8.5, color: V, fontFamily: 'Helvetica-Bold', marginRight: 6 },
  lineDesc:    { fontSize: 10, color: BODY, paddingLeft: 12 },
  lineAmt:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  lineVal:     { fontSize: 10, color: MUT, textAlign: 'right' },
  acctAmt:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '9 16', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  subtotalLbl: { fontSize: 10, color: MUT },
  subtotalVal: { fontSize: 10, color: BODY },
  totalBar:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14 20', backgroundColor: MINT, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  totalBarLbl: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalBarVal: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK },

  // Payment terms
  milestoneGrid: { flexDirection: 'row', gap: 12 },
  milestoneCard: { flex: 1, borderWidth: 0.5, borderColor: BDR, borderRadius: 8, padding: '18 18 22' },
  milestoneNum:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  milestonePct:  { fontSize: 26, fontFamily: 'Helvetica-Bold', color: BODY, lineHeight: 1, marginBottom: 4 },
  milestoneName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 4 },
  milestoneTrig: { fontSize: 9.5, color: MUT, marginBottom: 12 },
  milestoneAmt:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: V },

  // Contract terms
  contractBlock:     { marginBottom: 20 },
  contractSectionNum:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 5 },
  contractTitle:     { fontSize: 12, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 8 },
  contractBody:      { fontSize: 10, lineHeight: 1.7, color: BODY },
  contractBullet:    { fontSize: 10, lineHeight: 1.7, color: BODY, flexDirection: 'row' },
  contractBulletDot: { width: 12, fontSize: 10, color: BODY },
  contractDivider:   { height: 0.5, backgroundColor: BDR, marginVertical: 16 },

  // Signature block (rendered when the proposal is signed)
  sigBlock:   { marginTop: 28, paddingTop: 20, borderTop: `1 solid ${BDR}` },
  sigLabel:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 14 },
  sigName:    { fontSize: 24, fontFamily: 'Helvetica-Oblique', color: BODY, marginBottom: 6 },
  sigLine:    { height: 1, backgroundColor: BODY, width: 220, marginBottom: 6 },
  sigMeta:    { fontSize: 9, color: MUT, marginBottom: 2 },

  // Footer — pinned absolutely
  footer:    { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '12 48', backgroundColor: INK },
  footerLbl: { fontSize: 8, color: 'rgba(255,255,255,0.45)' },
  footerBold:{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 2 },
})

// ─── Smart-text lines → PDF nodes ──────────────────────────────────────────────
// Shared by "The Project" body and contract sections — renders bullet/numbered
// lines with a hanging marker, plain lines as a single Text node.

function renderPdfLines(lines: PdfLine[], textStyle: Style) {
  return lines.map((line, li) => {
    if (!line.text && !line.bullet && !line.numbered) {
      return <Text key={li} style={{ fontSize: 5 }}>{' '}</Text>
    }
    if (line.bullet) {
      return (
        <View key={li} style={s.contractBullet}>
          <Text style={s.contractBulletDot}>•</Text>
          <Text style={[textStyle, { flex: 1 }]}>{line.text}</Text>
        </View>
      )
    }
    if (line.numbered) {
      return (
        <View key={li} style={s.contractBullet}>
          <Text style={[s.contractBulletDot, { width: 18 }]}>{line.numbered}</Text>
          <Text style={[textStyle, { flex: 1 }]}>{line.text}</Text>
        </View>
      )
    }
    return <Text key={li} style={textStyle}>{line.text}</Text>
  })
}

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

export function ProposalPDF({ proposal, accounts, totalCents, discountCents = 0, discountLabel = 'Discount', budgetSections = [], contractSections = [], signature, pageBreakBetweenAccounts = false }: Props) {
  const content  = proposal.content as ProposalContent
  const sections = content?.sections ?? []

  const aboutSection = sections.find(s => s.type === 'about')
  const scopeSection = sections.find(s => s.type === 'scope')
  const termsSection = sections.find(s => s.type === 'terms')

  const coverOverview = aboutSection?.type === 'about' ? (aboutSection.overview ?? '') : ''
  const aboutBody     = aboutSection?.type === 'about' ? (aboutSection.body ?? '') : ''
  const deliverables = scopeSection?.type === 'scope'  ? scopeSection.items : []
  const milestones: PaymentMilestone[] = termsSection?.type === 'terms' ? termsSection.milestones : []

  const clientName   = proposal.project.client.name
  const prefix       = proposal.workspace.invoiceNumberPrefix || 'TTP'
  const proposalNum  = `${prefix}-${new Date(proposal.createdAt).getFullYear()}-${String(proposal.version).padStart(3, '0')}`
  const shootType    = SHOOT_LABELS[proposal.project.shootType] ?? proposal.project.shootType
  const validThrough = proposal.expiresAt ? fmtDate(proposal.expiresAt) : null

  const shootDates = proposal.project.shootStartDate
    ? (() => {
        const start = parseLocalDate(proposal.project.shootStartDate)!
        const end   = parseLocalDate(proposal.project.shootEndDate)
        const sLbl  = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const eLbl  = end && end.getTime() !== start.getTime()
          ? ` – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : ''
        return `${sLbl}${eLbl}, ${start.getFullYear()}`
      })()
    : null

  // Agency fee from frozen snapshot
  type BudgetSnapshot = { productionCents: number; budgetMarkupPct: number; budgetTaxPct: number }
  const snap            = (proposal.content as { budgetSnapshot?: BudgetSnapshot }).budgetSnapshot
  const productionCents = snap?.productionCents ?? totalCents
  const budgetMarkupPct = snap?.budgetMarkupPct ?? 0
  const budgetTaxPct    = snap?.budgetTaxPct    ?? 0
  const agencyFeeCents  = budgetMarkupPct > 0 ? Math.round(productionCents * budgetMarkupPct) : 0
  const preTaxCents     = productionCents + agencyFeeCents
  // Tax applies after discount
  const afterDiscountCents = Math.max(0, preTaxCents - discountCents)
  const taxCents           = budgetTaxPct > 0 ? Math.round(afterDiscountCents * budgetTaxPct) : 0

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>

        {/* ══ COVER ══ */}
        <View style={s.cover}>
          <View style={s.coverTop}>
            <View style={s.logoBox}>
              {proposal.logoSrc ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={proposal.logoSrc} style={s.logoImg} />
              ) : (
                <>
                  <View style={s.logoMark}>
                    <Text style={s.logoT}>T</Text>
                  </View>
                  <Text style={s.logoName}>The Third Place </Text>
                  <Text style={s.logoCreative}>Creative</Text>
                </>
              )}
            </View>
            <Text style={s.propNum}>PROPOSAL · {proposalNum}</Text>
          </View>

          <Text style={s.coverLabel}>Prepared for {clientName}</Text>
          <Text style={s.coverTitle}>{proposal.title}</Text>
          {coverOverview ? (
            <Text style={s.coverDesc}>
              {coverOverview.length > 180 ? coverOverview.slice(0, 180) + '…' : coverOverview}
            </Text>
          ) : null}

          <View style={s.coverMeta}>
            <View style={s.metaGroup}>
              {shootDates && (
                <View style={s.metaItem}>
                  <Text style={s.metaLabel}>Shoot Date(s)</Text>
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
        </View>

        {/* ══ THE PROJECT ══ */}
        {aboutBody ? (
          <View style={s.section}>
            <SectionLabel label="The Project" />
            {renderPdfLines(parsePdfLines(aboutBody), s.bodyText)}
          </View>
        ) : null}

        {/* ══ DELIVERABLES ══ */}
        {deliverables.length > 0 && (
          <View style={s.sectionAlt} wrap={false}>
            <SectionLabel label="Deliverables" />
            <View style={s.delGrid}>
              {deliverables.map((d, i) => {
                const linked = (d as typeof d & { sectionIds?: string[] }).sectionIds
                const sectionTitles = linked?.length
                  ? linked.map(sid => budgetSections.find(s => s.id === sid)?.title).filter((t): t is string => !!t)
                  : []
                return (
                  <View key={i} style={s.delCard}>
                    <Text style={s.delNum}>{d.number ?? String(i + 1).padStart(2, '0')}</Text>
                    <Text style={s.delTitle}>{d.title}</Text>
                    <Text style={s.delDesc}>{d.description}</Text>
                    {sectionTitles.length > 0 && (
                      <Text style={s.delSeeRef}>See: {sectionTitles.map(t => `§${t}`).join(', ')}</Text>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* ══ BUDGET SUMMARY ══ */}
        {accounts.length > 0 && (() => {
          const multiSection = budgetSections.length > 1

          // ── shared account renderer ──────────────────────────────────────────
          function renderAccount(acc: Account, isLast: boolean, forceBreak: boolean) {
            const accTotal = sumAccount(acc as unknown as AccountInput)
            return (
              <View key={acc.id} break={forceBreak || undefined}>
                <View style={[s.budgetRow, { backgroundColor: '#F9F7FC' }, isLast && !acc.lineItems.length ? s.budgetLast : {}]}>
                  <View style={[s.col1, { flexDirection: 'row', alignItems: 'center' }]}>
                    {acc.code && <Text style={s.acctCode}>{acc.code}</Text>}
                    <Text style={s.acctName}>{acc.name}</Text>
                  </View>
                  <Text style={[s.colSm, s.headText]} />
                  <Text style={[s.colUnit, s.headText]} />
                  <Text style={[s.acctAmt, s.colR]}>{formatMoney(accTotal)}</Text>
                </View>
                {acc.lineItems.map((item, ii) => {
                  const tot  = lineTotal(item.quantity, item.rateCents, item.markupPct)
                  const last = ii === acc.lineItems.length - 1 && (!acc.children || acc.children.length === 0)
                  return (
                    <View key={item.id} style={[s.budgetRow, last && isLast ? s.budgetLast : {}]}>
                      <Text style={[s.col1, s.lineDesc]}>{item.description}</Text>
                      {(() => { const [hc, days] = parseQtyFormula(Number(item.quantity), item.quantityFormula); return (<><Text style={[s.colSm, s.lineVal, { opacity: hc === 1 ? 0.35 : 1 }]}>{hc}</Text><Text style={[s.colUnit, s.lineVal]}>{fmtUnit(days, item.unit)}</Text></>); })()}
                      <Text style={[s.colR, s.lineAmt]}>{formatMoney(tot)}</Text>
                    </View>
                  )
                })}
                {acc.children?.flatMap(child =>
                  child.lineItems.map(item => {
                    const tot = lineTotal(item.quantity, item.rateCents, item.markupPct)
                    return (
                      <View key={item.id} style={s.budgetRow}>
                        <View style={[s.col1, { flexDirection: 'row' }]}>
                          <Text style={[s.lineDesc, { color: MUT, fontSize: 8.5, marginRight: 4 }]}>{child.name} · </Text>
                          <Text style={s.lineDesc}>{item.description}</Text>
                        </View>
                        {(() => { const [hc, days] = parseQtyFormula(Number(item.quantity), item.quantityFormula); return (<><Text style={[s.colSm, s.lineVal, { opacity: hc === 1 ? 0.35 : 1 }]}>{hc}</Text><Text style={[s.colUnit, s.lineVal]}>{fmtUnit(days, item.unit)}</Text></>); })()}
                        <Text style={[s.colR, s.lineAmt]}>{formatMoney(tot)}</Text>
                      </View>
                    )
                  })
                )}
              </View>
            )
          }

          const tableHeader = (
            <View style={s.budgetHead}>
              <Text style={[s.col1, s.headText]}>Description</Text>
              <Text style={[s.colSm, s.headText]}>Qty</Text>
              <Text style={[s.colUnit, s.headText]}>Unit</Text>
              <Text style={[s.colR, s.headText]}>Total</Text>
            </View>
          )

          return (
          <View style={s.section} break>
            <SectionLabel label="Budget Summary" />

            {!multiSection ? (
              // ── Single-section: flat render (today's behaviour) ─────────────
              <View style={s.budgetCard}>
                {tableHeader}
                {accounts.map((acc, ai) => renderAccount(acc, ai === accounts.length - 1, pageBreakBetweenAccounts && ai > 0))}
              </View>
            ) : (
              // ── Multi-section: section page breaks + per-section headings ──
              (() => {
                const bySection: Record<string, Account[]> = {}
                for (const sec of budgetSections) bySection[sec.id] = []
                for (const acc of accounts) {
                  const sid = acc.sectionId ?? budgetSections[0]?.id
                  if (sid && bySection[sid]) bySection[sid].push(acc)
                }
                return budgetSections.map((sec, si) => {
                  const sectionAccounts = bySection[sec.id] ?? []
                  const sectionTotal    = sectionAccounts.reduce((sum, acc) => sum + sumAccount(acc as unknown as AccountInput), 0)
                  return (
                    <View key={sec.id} break={si > 0}>
                      {/* Section heading */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 3, height: 14, backgroundColor: V, borderRadius: 2 }} />
                          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase' }}>{sec.title}</Text>
                        </View>
                        {sectionAccounts.length > 0 && (
                          <Text style={{ fontSize: 9, color: MUT }}>{formatMoney(sectionTotal)}</Text>
                        )}
                      </View>
                      <View style={s.budgetCard}>
                        {tableHeader}
                        {sectionAccounts.length === 0 ? (
                          <View style={s.budgetRow}>
                            <Text style={[s.col1, s.lineDesc, { color: MUT, fontStyle: 'italic' }]}>No accounts in this section.</Text>
                          </View>
                        ) : (
                          sectionAccounts.map((acc, ai) => renderAccount(acc, ai === sectionAccounts.length - 1, pageBreakBetweenAccounts && ai > 0))
                        )}
                      </View>
                    </View>
                  )
                })
              })()
            )}

            {/* Totals — kept together with wrap={false} */}
            <View
              wrap={false}
              style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: BDR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden', marginTop: -0.5 }}
            >
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
              {discountCents > 0 && (
                <View style={s.subtotalRow}>
                  <Text style={s.subtotalLbl}>{discountLabel}</Text>
                  <Text style={[s.subtotalVal, { color: '#dc2626' }]}>{`-${formatMoney(discountCents)}`}</Text>
                </View>
              )}
              {taxCents > 0 && (
                <View style={s.subtotalRow}>
                  <Text style={s.subtotalLbl}>{`Tax (${Math.round(budgetTaxPct * 100)}%)`}</Text>
                  <Text style={s.subtotalVal}>{formatMoney(taxCents)}</Text>
                </View>
              )}
              <View style={s.totalBar}>
                <View>
                  <Text style={s.totalBarLbl}>Total Investment</Text>
                  <Text style={[s.totalBarLbl, { fontSize: 7, color: '#2A2A28', letterSpacing: 0.5, marginTop: 2 }]}>All-in, USD</Text>
                </View>
                <Text style={s.totalBarVal}>{formatMoney(totalCents)}</Text>
              </View>
            </View>
          </View>
          )
        })()}

        {/* ══ PAYMENT TERMS ══ */}
        {milestones.length > 0 && (
          <View style={s.sectionAlt} wrap={false}>
            <SectionLabel label="Payment Terms" />
            <View style={s.milestoneGrid}>
              {milestones.map((m, i) => (
                <View key={m.id} style={s.milestoneCard}>
                  <Text style={s.milestoneNum}>Payment {String(i + 1).padStart(2, '0')}</Text>
                  <Text style={s.milestonePct}>{Math.round(m.percentPct * 100)}%</Text>
                  <Text style={s.milestoneName}>{m.name}</Text>
                  <Text style={s.milestoneTrig}>{milestoneLabelPdf(m, proposal.project.shootStartDate)}</Text>
                  {totalCents > 0 && (
                    <Text style={s.milestoneAmt}>{formatMoney(Math.round(totalCents * m.percentPct))}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ══ CONTRACT TERMS ══ */}
        {contractSections.length > 0 && (
          <View style={s.section} break>
            <SectionLabel label="Terms" />
            {contractSections.map((cs, i) => {
              return (
                <View key={cs.id} style={s.contractBlock}>
                  {contractSections.length > 1 ? (
                    <Text style={s.contractSectionNum}>{String(i + 1).padStart(2, '0')} — {cs.title}</Text>
                  ) : (
                    <Text style={s.contractTitle}>{cs.title}</Text>
                  )}
                  {renderPdfLines(parsePdfLines(cs.body), s.contractBody)}
                  {i < contractSections.length - 1 && <View style={s.contractDivider} />}
                </View>
              )
            })}
          </View>
        )}

        {/* ══ SIGNATURE ══ */}
        {signature && (
          <View style={[s.section, s.sigBlock]} wrap={false}>
            <Text style={s.sigLabel}>Signed &amp; Approved</Text>
            <Text style={s.sigName}>{signature.name}</Text>
            <View style={s.sigLine} />
            <Text style={s.sigMeta}>
              Signed electronically by {signature.name} on{' '}
              {new Date(signature.dateISO).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
            {totalCents > 0 && (
              <Text style={s.sigMeta}>Approved total: {formatMoney(totalCents)}</Text>
            )}
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
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.footerLbl}>{proposalNum}</Text>
            {validThrough && <Text style={s.footerLbl}>Valid through {validThrough}</Text>}
          </View>
        </View>

      </Page>
    </Document>
  )
}
