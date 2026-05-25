import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer'
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
const GRN  = '#15803D'

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
  page:     { fontFamily: 'Helvetica', fontSize: 10, color: BODY, backgroundColor: '#fff' },

  // Cover / header
  cover:    { backgroundColor: INK, padding: '40 48 32 48' },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  logoMark: { width: 16, height: 16, borderRadius: 3, backgroundColor: MINT, marginRight: 6, justifyContent: 'center', alignItems: 'center' },
  logoT:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#003D31' },
  logoName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.5 },
  logoCreative: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: MINT },
  invNum:   { fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2 },
  invKind:  { fontSize: 8, color: MINT, letterSpacing: 2, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  invTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#fff', lineHeight: 1.15, marginBottom: 20 },

  // Meta strip
  metaStrip:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 14 },
  metaGroup:  { flexDirection: 'row', gap: 28 },
  metaItem:   { marginRight: 24 },
  metaLabel:  { fontSize: 7, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 3 },
  metaValue:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#fff' },
  amtLabel:   { fontSize: 7, color: MINT, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginBottom: 3 },
  amtValue:   { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' },

  // Body
  section:    { padding: '28 48' },
  sectionAlt: { padding: '28 48', backgroundColor: CAN },
  secLine:    { height: 1.5, backgroundColor: V, marginBottom: 8 },
  secTag:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.6, marginBottom: 18 },

  // Line items table
  tableHead:  { flexDirection: 'row', padding: '7 14', backgroundColor: CAN, borderBottomWidth: 0.5, borderBottomColor: BDR },
  tableRow:   { flexDirection: 'row', padding: '10 14', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  tableLast:  { borderBottomWidth: 0 },
  colDesc:    { flex: 1 },
  colQty:     { width: 32, textAlign: 'right' },
  colUnit:    { width: 38, textAlign: 'right' },
  colRate:    { width: 68, textAlign: 'right' },
  colTotal:   { width: 72, textAlign: 'right' },
  thText:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUT, letterSpacing: 0.8 },
  tdDesc:     { fontSize: 10, color: BODY },
  tdNum:      { fontSize: 10, color: MUT, textAlign: 'right' },
  tdAmt:      { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'right' },

  // Totals
  totalsWrap: { borderTopWidth: 0.5, borderTopColor: BDR },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', padding: '9 14', borderBottomWidth: 0.5, borderBottomColor: BDR, backgroundColor: '#fff' },
  totalLbl:   { fontSize: 10, color: MUT },
  totalVal:   { fontSize: 10, color: BODY },
  grandBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14 18', backgroundColor: INK },
  grandLbl:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: MINT, letterSpacing: 1.5 },
  grandVal:   { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#fff' },

  // Payment instructions
  payCard:    { flex: 1, borderTopWidth: 2.5, borderTopColor: V, borderWidth: 0.5, borderColor: BDR, borderRadius: 6, padding: '14 16 18', marginRight: 10 },
  payCardLast:{ marginRight: 0 },
  payTitle:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: V, letterSpacing: 1.4, marginBottom: 10 },
  payBody:    { fontSize: 9.5, color: BODY, lineHeight: 1.6 },
  payRow:     { flexDirection: 'row', gap: 10 },

  // Notes/terms
  bodyText:   { fontSize: 10.5, lineHeight: 1.75, color: BODY },
  termsText:  { fontSize: 9.5, lineHeight: 1.7, color: MUT },

  // Footer
  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14 48', backgroundColor: INK },
  footerName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 3 },
  footerLbl:  { fontSize: 8, color: 'rgba(255,255,255,0.4)' },
})

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicePDF({ invoice }: { invoice: InvoicePDFData }) {
  const lineItems = invoice.lineItems ?? []
  const taxPct = Number(invoice.taxPct)
  const isPaid = invoice.amountPaidCents >= invoice.totalCents || invoice.status === 'PAID'
  const balanceDue = invoice.totalCents - invoice.amountPaidCents
  const isPartial = invoice.amountPaidCents > 0 && !isPaid
  const kindLabel = KIND_LABELS[invoice.kind] ?? 'Invoice'
  const hasPayInfo = invoice.workspace.wireInstructions || invoice.workspace.achInstructions || invoice.workspace.checkPayableTo

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ── COVER ── */}
        <View style={s.cover}>
          {/* Top bar */}
          <View style={s.coverTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={s.logoMark}>
                <Text style={s.logoT}>T</Text>
              </View>
              <Text style={s.logoName}>THE THIRD PLACE </Text>
              <Text style={s.logoCreative}>CREATIVE</Text>
            </View>
            <Text style={s.invNum}>{kindLabel.toUpperCase()} · {invoice.number}</Text>
          </View>

          {/* Title */}
          <Text style={s.invKind}>{kindLabel.toUpperCase()}</Text>
          {invoice.title && <Text style={s.invTitle}>{invoice.title}</Text>}

          {/* Meta strip */}
          <View style={s.metaStrip}>
            <View style={s.metaGroup}>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>BILL TO</Text>
                <Text style={s.metaValue}>{invoice.client.name}</Text>
              </View>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>PROJECT</Text>
                <Text style={s.metaValue}>{invoice.project.name}</Text>
              </View>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>ISSUE DATE</Text>
                <Text style={s.metaValue}>{fmtDate(invoice.issueDate)}</Text>
              </View>
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>DUE DATE</Text>
                <Text style={s.metaValue}>{fmtDate(invoice.dueDate)}</Text>
              </View>
              {invoice.poNumber && (
                <View style={s.metaItem}>
                  <Text style={s.metaLabel}>PO #</Text>
                  <Text style={s.metaValue}>{invoice.poNumber}</Text>
                </View>
              )}
            </View>
            <View>
              <Text style={s.amtLabel}>{isPaid ? 'TOTAL PAID' : isPartial ? 'BALANCE DUE' : 'AMOUNT DUE'}</Text>
              <Text style={s.amtValue}>{formatMoney(isPaid ? invoice.totalCents : balanceDue)}</Text>
            </View>
          </View>
        </View>

        {/* ── LINE ITEMS ── */}
        {lineItems.length > 0 && (
          <View style={s.section}>
            <View style={s.secLine} />
            <Text style={s.secTag}>SERVICES</Text>

            <View style={{ borderWidth: 0.5, borderColor: BDR, borderRadius: 8, overflow: 'hidden' }}>
              {/* Header */}
              <View style={s.tableHead}>
                <Text style={[s.thText, s.colDesc]}>Description</Text>
                <Text style={[s.thText, s.colQty]}>Qty</Text>
                <Text style={[s.thText, s.colUnit]}>Unit</Text>
                <Text style={[s.thText, s.colRate]}>Rate</Text>
                <Text style={[s.thText, s.colTotal]}>Total</Text>
              </View>

              {/* Rows */}
              {lineItems.map((item, idx) => (
                <View key={item.id ?? idx} style={[s.tableRow, idx === lineItems.length - 1 ? s.tableLast : {}]}>
                  <Text style={[s.tdDesc, s.colDesc]}>{item.description}</Text>
                  <Text style={[s.tdNum, s.colQty]}>{item.quantity}</Text>
                  <Text style={[s.tdNum, s.colUnit]}>{String(item.unit)}</Text>
                  <Text style={[s.tdNum, s.colRate]}>{formatMoney(item.rateCents)}</Text>
                  <Text style={[s.tdAmt, s.colTotal]}>{formatMoney(item.lineTotalCents)}</Text>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={[s.totalsWrap, { borderWidth: 0.5, borderColor: BDR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden', marginTop: -0.5 }]}>
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
              <View style={s.grandBar}>
                <Text style={s.grandLbl}>{isPaid ? 'PAID IN FULL' : isPartial ? 'BALANCE DUE' : 'TOTAL DUE'}</Text>
                <Text style={s.grandVal}>{formatMoney(isPaid ? invoice.totalCents : balanceDue)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── PAYMENT INSTRUCTIONS ── */}
        {hasPayInfo && !isPaid && (
          <View style={s.sectionAlt}>
            <View style={s.secLine} />
            <Text style={s.secTag}>HOW TO PAY</Text>
            <View style={s.payRow}>
              {invoice.workspace.wireInstructions && (
                <View style={s.payCard}>
                  <Text style={s.payTitle}>WIRE TRANSFER</Text>
                  <Text style={s.payBody}>{invoice.workspace.wireInstructions}</Text>
                </View>
              )}
              {invoice.workspace.achInstructions && (
                <View style={s.payCard}>
                  <Text style={s.payTitle}>ACH / DIRECT DEPOSIT</Text>
                  <Text style={s.payBody}>{invoice.workspace.achInstructions}</Text>
                </View>
              )}
              {invoice.workspace.checkPayableTo && (
                <View style={[s.payCard, s.payCardLast]}>
                  <Text style={s.payTitle}>CHECK</Text>
                  <Text style={[s.payBody, { marginBottom: 6 }]}>Make payable to:</Text>
                  <Text style={[s.payBody, { fontFamily: 'Helvetica-Bold' }]}>{invoice.workspace.checkPayableTo}</Text>
                  {invoice.workspace.checkMailingAddress && (
                    <Text style={[s.payBody, { marginTop: 8 }]}>{invoice.workspace.checkMailingAddress}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── NOTES ── */}
        {invoice.notes && (
          <View style={s.section}>
            <View style={s.secLine} />
            <Text style={s.secTag}>NOTES</Text>
            <Text style={s.bodyText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── TERMS ── */}
        {invoice.terms && (
          <View style={s.sectionAlt}>
            <View style={s.secLine} />
            <Text style={s.secTag}>TERMS</Text>
            <Text style={s.termsText}>{invoice.terms}</Text>
          </View>
        )}

        {/* ── FOOTER ── */}
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
