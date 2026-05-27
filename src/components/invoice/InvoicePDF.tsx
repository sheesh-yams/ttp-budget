import { Document, Page, Text, View, StyleSheet, Link, Image, Font } from '@react-pdf/renderer'
import { formatMoney } from '@/lib/money'
import type { InvoiceLineItem } from '@/types'

// ─── Brand colours ────────────────────────────────────────────────────────────
const V    = '#5D00A4'
const MINT = '#04FFCC'
const INK  = '#0A0612'
const BODY = '#2C2C2A'
const MUT  = '#888780'
const BDR  = '#E8E0F0'
const CAN  = '#F7F4FA'
const LAV  = '#EDE9FE'   // lavender tint
const GRN  = '#15803D'

// ─── No mid-word hyphenation ──────────────────────────────────────────────────
Font.registerHyphenationCallback((w) => [w])

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceWorkspace {
  name: string
  legalName: string | null
  contactEmail: string | null
  website: string | null
  wireInstructions: string | null
  achInstructions: string | null
  checkPayableTo: string | null
  checkMailingAddress: string | null
}

interface InvoiceClient {
  name: string
  contactName: string | null
  contactEmail: string | null
  billingAddress: string | null
}

interface InvoiceProject {
  name: string
}

export interface InvoicePDFData {
  number: string
  title: string | null
  kind: string
  status: string
  issueDate: string
  dueDate: string
  poNumber: string | null
  lineItems: InvoiceLineItem[]
  subtotalCents: number
  taxPct: number
  taxCents: number
  discountCents: number
  totalCents: number
  amountPaidCents: number
  notes: string | null
  terms: string | null
  publicToken: string
  logoSrc?: string          // base64 or file path, passed from the route
  workspace: InvoiceWorkspace
  client: InvoiceClient
  project: InvoiceProject
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const KIND_LABELS: Record<string, string> = {
  DEPOSIT:    'Deposit Invoice',
  PROGRESS:   'Progress Invoice',
  FINAL:      'Final Invoice',
  STANDALONE: 'Invoice',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Page — paddingBottom reserves space for the pinned footer
  page:     { fontFamily: 'Helvetica', fontSize: 10, color: BODY, backgroundColor: '#fff', paddingBottom: 48 },

  // ── Header (compact) ──────────────────────────────────────────────────────
  cover:    { backgroundColor: INK, padding: '22 48 18 48' },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  logoImg:  { height: 22, width: 'auto' },
  // fallback text logo when no image
  logoBox:  { flexDirection: 'row', alignItems: 'center' },
  logoMark: { width: 14, height: 14, borderRadius: 2, backgroundColor: MINT, marginRight: 5, justifyContent: 'center', alignItems: 'center' },
  logoT:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#003D31' },
  logoName: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.2 },
  logoCreative: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MINT },
  invNum:   { fontSize: 7.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 },
  invKind:  { fontSize: 7.5, color: MINT, letterSpacing: 1.8, fontFamily: 'Helvetica-Bold', marginBottom: 5, textTransform: 'uppercase' },
  invTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#fff', lineHeight: 1.15, marginBottom: 14 },

  // Meta strip
  metaStrip:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 },
  metaGroup:  { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  metaItem:   { marginRight: 20 },
  metaLabel:  { fontSize: 6.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase' },
  metaValue:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fff' },

  // ── Body ──────────────────────────────────────────────────────────────────
  section:    { padding: '22 48' },
  sectionAlt: { padding: '22 48', backgroundColor: CAN },
  secLine:    { height: 1.5, backgroundColor: V, marginBottom: 7 },
  secTag:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.6, marginBottom: 14, textTransform: 'uppercase' },

  // ── Line items table ──────────────────────────────────────────────────────
  tableHead:  { flexDirection: 'row', padding: '7 14', backgroundColor: CAN, borderBottomWidth: 0.5, borderBottomColor: BDR },
  tableRow:   { flexDirection: 'row', padding: '9 14', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  tableLast:  { borderBottomWidth: 0 },
  colNum:     { width: 22, textAlign: 'left' },
  colDesc:    { flex: 1 },
  colQty:     { width: 30, textAlign: 'right' },
  colUnit:    { width: 36, textAlign: 'right' },
  colRate:    { width: 66, textAlign: 'right' },
  colTotal:   { width: 70, textAlign: 'right' },
  thText:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUT, letterSpacing: 0.7, textTransform: 'uppercase' },
  tdNum:      { fontSize: 8.5, color: MUT, textAlign: 'right' },
  tdDesc:     { fontSize: 9.5, color: BODY },
  tdMut:      { fontSize: 9.5, color: MUT, textAlign: 'right' },
  tdAmt:      { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },
  rowNum:     { fontSize: 8, color: MUT, fontFamily: 'Helvetica-Bold' },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalsWrap:     { borderTopWidth: 0.5, borderTopColor: BDR },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', padding: '8 14', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  totalLbl:       { fontSize: 9.5, color: MUT },
  totalVal:       { fontSize: 9.5, color: BODY },
  // Big total — sits between rows and the accent bar
  totalBigRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14 18', backgroundColor: LAV, borderBottomWidth: 0 },
  totalBigLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 3 },
  totalBigAmt:    { fontSize: 24, fontFamily: 'Helvetica-Bold', color: INK },
  // Mint accent bar below the amount
  accentBar:      { padding: '8 18', backgroundColor: MINT },
  accentBarLbl:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#003D31', letterSpacing: 1.4, textTransform: 'uppercase' },

  // ── Payment instructions ──────────────────────────────────────────────────
  payCard:     { flex: 1, borderTopWidth: 2.5, borderTopColor: V, borderWidth: 0.5, borderColor: BDR, borderRadius: 6, padding: '12 14 16', marginRight: 8 },
  payCardLast: { marginRight: 0 },
  payTitle:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase' },
  payBody:     { fontSize: 9, color: BODY, lineHeight: 1.55 },
  payRow:      { flexDirection: 'row' },

  // ── Notes / Terms ─────────────────────────────────────────────────────────
  bodyText:    { fontSize: 10, lineHeight: 1.75, color: BODY },
  termsText:   { fontSize: 9, lineHeight: 1.7, color: MUT },

  // ── Footer — pinned absolutely ────────────────────────────────────────────
  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '11 48', backgroundColor: INK },
  footerName:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 2 },
  footerLbl:   { fontSize: 7.5, color: 'rgba(255,255,255,0.4)' },
})

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicePDF({ invoice }: { invoice: InvoicePDFData }) {
  const lineItems  = invoice.lineItems ?? []
  const taxPct     = Number(invoice.taxPct)
  const isPaid     = invoice.amountPaidCents >= invoice.totalCents || invoice.status === 'PAID'
  const balanceDue = invoice.totalCents - invoice.amountPaidCents
  const isPartial  = invoice.amountPaidCents > 0 && !isPaid
  const kindLabel  = KIND_LABELS[invoice.kind] ?? 'Invoice'
  const hasPayInfo = invoice.workspace.wireInstructions || invoice.workspace.achInstructions || invoice.workspace.checkPayableTo

  const amtLabel = isPaid ? 'PAID IN FULL' : isPartial ? 'BALANCE DUE' : 'AMOUNT DUE'
  const amtValue = isPaid ? invoice.totalCents : balanceDue
  const barLabel = isPaid ? 'PAID — THANK YOU' : isPartial ? 'PARTIAL PAYMENT APPLIED' : 'PAYMENT REQUESTED'

  return (
    <Document>
      <Page size="LETTER" style={s.page} wrap>

        {/* ══ HEADER ══ */}
        <View style={s.cover}>
          {/* Logo + invoice number */}
          <View style={s.coverTop}>
            {invoice.logoSrc ? (
              <Image src={invoice.logoSrc} style={s.logoImg} />
            ) : (
              <View style={s.logoBox}>
                <View style={s.logoMark}><Text style={s.logoT}>T</Text></View>
                <Text style={s.logoName}>THE THIRD PLACE </Text>
                <Text style={s.logoCreative}>CREATIVE</Text>
              </View>
            )}
            <Text style={s.invNum}>{kindLabel.toUpperCase()} · {invoice.number}</Text>
          </View>

          {/* Invoice type + title */}
          <Text style={s.invKind}>{kindLabel}</Text>
          {invoice.title && <Text style={s.invTitle}>{invoice.title}</Text>}

          {/* Meta strip — bill-to / dates only, no amount */}
          <View style={s.metaStrip}>
            <View style={s.metaGroup}>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Bill To</Text>
                <Text style={s.metaValue}>{invoice.client.name}</Text>
              </View>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Project</Text>
                <Text style={s.metaValue}>{invoice.project.name}</Text>
              </View>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Issue Date</Text>
                <Text style={s.metaValue}>{fmtDate(invoice.issueDate)}</Text>
              </View>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Due Date</Text>
                <Text style={s.metaValue}>{fmtDate(invoice.dueDate)}</Text>
              </View>
              {invoice.poNumber && (
                <View style={s.metaItem}>
                  <Text style={s.metaLabel}>PO #</Text>
                  <Text style={s.metaValue}>{invoice.poNumber}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ══ LINE ITEMS ══ */}
        {lineItems.length > 0 && (
          <View style={s.section}>
            <View style={s.secLine} />
            <Text style={s.secTag}>Services</Text>

            {/* Table */}
            <View style={{ borderWidth: 0.5, borderColor: BDR, borderRadius: 8, overflow: 'hidden' }}>
              <View style={s.tableHead}>
                <Text style={[s.thText, s.colNum]}>#</Text>
                <Text style={[s.thText, s.colDesc]}>Description</Text>
                <Text style={[s.thText, s.colQty]}>Qty</Text>
                <Text style={[s.thText, s.colUnit]}>Unit</Text>
                <Text style={[s.thText, s.colRate]}>Rate</Text>
                <Text style={[s.thText, s.colTotal]}>Total</Text>
              </View>
              {lineItems.map((item, idx) => (
                <View key={item.id ?? idx} style={[s.tableRow, idx === lineItems.length - 1 ? s.tableLast : {}]}>
                  <Text style={[s.rowNum, s.colNum]}>{String(idx + 1).padStart(2, '0')}</Text>
                  <Text style={[s.tdDesc, s.colDesc]}>{item.description}</Text>
                  <Text style={[s.tdMut, s.colQty]}>{item.quantity}</Text>
                  <Text style={[s.tdMut, s.colUnit]}>{String(item.unit)}</Text>
                  <Text style={[s.tdMut, s.colRate]}>{formatMoney(item.rateCents)}</Text>
                  <Text style={[s.tdAmt, s.colTotal]}>{formatMoney(item.lineTotalCents)}</Text>
                </View>
              ))}
            </View>

            {/* Totals — wrap={false} keeps subtotal+amount+bar together */}
            <View
              wrap={false}
              style={[s.totalsWrap, { borderWidth: 0.5, borderColor: BDR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden', marginTop: -0.5 }]}
            >
              <View style={s.totalRow}>
                <Text style={s.totalLbl}>Subtotal</Text>
                <Text style={s.totalVal}>{formatMoney(invoice.subtotalCents)}</Text>
              </View>
              {taxPct > 0 && (
                <View style={s.totalRow}>
                  <Text style={s.totalLbl}>Tax ({(taxPct * 100).toFixed(1)}%)</Text>
                  <Text style={s.totalVal}>{formatMoney(invoice.taxCents)}</Text>
                </View>
              )}
              {invoice.discountCents > 0 && (
                <View style={s.totalRow}>
                  <Text style={s.totalLbl}>Discount</Text>
                  <Text style={[s.totalVal, { color: GRN }]}>−{formatMoney(invoice.discountCents)}</Text>
                </View>
              )}
              {isPartial && (
                <View style={s.totalRow}>
                  <Text style={s.totalLbl}>Payments received</Text>
                  <Text style={[s.totalVal, { color: GRN }]}>−{formatMoney(invoice.amountPaidCents)}</Text>
                </View>
              )}

              {/* ─ Big total amount — above the accent bar ─ */}
              <View style={s.totalBigRow}>
                <View>
                  <Text style={s.totalBigLabel}>{amtLabel}</Text>
                  <Text style={s.totalBigAmt}>{formatMoney(amtValue)}</Text>
                </View>
              </View>

              {/* ─ Mint accent bar ─ */}
              <View style={s.accentBar}>
                <Text style={s.accentBarLbl}>{barLabel}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ══ PAYMENT INSTRUCTIONS ══ */}
        {hasPayInfo && !isPaid && (
          <View style={s.sectionAlt} wrap={false}>
            <View style={s.secLine} />
            <Text style={s.secTag}>How to Pay</Text>
            <View style={s.payRow}>
              {invoice.workspace.wireInstructions && (
                <View style={s.payCard}>
                  <Text style={s.payTitle}>Wire Transfer</Text>
                  <Text style={s.payBody}>{invoice.workspace.wireInstructions}</Text>
                </View>
              )}
              {invoice.workspace.achInstructions && (
                <View style={s.payCard}>
                  <Text style={s.payTitle}>ACH / Direct Deposit</Text>
                  <Text style={s.payBody}>{invoice.workspace.achInstructions}</Text>
                </View>
              )}
              {invoice.workspace.checkPayableTo && (
                <View style={[s.payCard, s.payCardLast]}>
                  <Text style={s.payTitle}>Check</Text>
                  <Text style={[s.payBody, { marginBottom: 5 }]}>Make payable to:</Text>
                  <Text style={[s.payBody, { fontFamily: 'Helvetica-Bold' }]}>{invoice.workspace.checkPayableTo}</Text>
                  {invoice.workspace.checkMailingAddress && (
                    <Text style={[s.payBody, { marginTop: 6 }]}>{invoice.workspace.checkMailingAddress}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ══ NOTES ══ */}
        {invoice.notes && (
          <View style={s.section} wrap={false}>
            <View style={s.secLine} />
            <Text style={s.secTag}>Notes</Text>
            <Text style={s.bodyText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ══ TERMS ══ */}
        {invoice.terms && (
          <View style={s.sectionAlt} wrap={false}>
            <View style={s.secLine} />
            <Text style={s.secTag}>Terms</Text>
            <Text style={s.termsText}>{invoice.terms}</Text>
          </View>
        )}

        {/* ══ FOOTER — pinned to bottom of every page ══ */}
        <View style={s.footer} fixed>
          <View>
            <Text style={s.footerName}>{invoice.workspace.name}</Text>
            {invoice.workspace.contactEmail && (
              <Text style={s.footerLbl}>{invoice.workspace.contactEmail}</Text>
            )}
            {invoice.workspace.website && (
              <Link src={invoice.workspace.website} style={[s.footerLbl, { textDecoration: 'none' }]}>
                {invoice.workspace.website.replace(/^https?:\/\//, '')}
              </Link>
            )}
          </View>
          <Text style={s.footerLbl}>{invoice.number}</Text>
        </View>

      </Page>
    </Document>
  )
}
