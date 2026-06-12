import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { WrapReportData } from '@/server/actions/actuals'

// ─── No mid-word hyphenation ──────────────────────────────────────────────────
Font.registerHyphenationCallback((w) => [w])

// ─── Colors ───────────────────────────────────────────────────────────────────
const INK   = '#0A0612'
const BODY  = '#2C2C2A'
const MUT   = '#888780'
const BDR   = '#E8E0F0'
const CAN   = '#F7F4FA'
const GREEN = '#16a34a'
const RED   = '#dc2626'
const AMB   = '#d97706'

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: BODY,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    backgroundColor: '#ffffff',
  },
  // Header
  header: { marginBottom: 28 },
  projectName: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 },
  subline: { fontSize: 9, color: MUT, marginBottom: 2 },
  reportTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 10 },

  // Summary row
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  summaryCard: {
    flex: 1,
    borderRadius: 6,
    border: `1pt solid ${BDR}`,
    backgroundColor: CAN,
    padding: 10,
  },
  summaryLabel: { fontSize: 7, color: MUT, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 2 },
  summarySub:   { fontSize: 7, color: MUT, marginTop: 2 },

  // Section
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6, marginTop: 18 },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: INK,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: `0.5pt solid ${BDR}`,
  },
  tableRowAlt: { backgroundColor: CAN },

  colName:     { flex: 1, fontSize: 8 },
  colRight:    { width: 72, textAlign: 'right', fontSize: 8 },
  colRightSm:  { width: 56, textAlign: 'right', fontSize: 8 },

  thText: { color: '#ffffff', fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Overage list
  overageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: `0.5pt solid ${BDR}`,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    borderTop: `0.5pt solid ${BDR}`,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: MUT },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  const abs = Math.abs(cents)
  const str = (abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return `$${str}`
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtDate(d: Date | null | string | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: WrapReportData
  workspaceName: string
}

export function WrapReportPDF({ data, workspaceName }: Props) {
  const marginColor =
    data.marginPct >= 30 ? GREEN :
    data.marginPct >= 15 ? AMB :
    data.marginPct >= 0  ? AMB :
    RED

  const visibleAccounts = data.accounts.filter(a => a.budgetedCents > 0 || a.actualCents > 0)

  return (
    <Document title={`Wrap Report — ${data.projectName}`}>
      <Page size="LETTER" style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <Text style={s.reportTitle}>WRAP REPORT</Text>
          <Text style={s.projectName}>{data.projectName}</Text>
          <Text style={s.subline}>{data.clientName}</Text>
          <Text style={s.subline}>{data.budgetName} · {data.phaseName}</Text>
          {(data.firstEntryDate || data.lastEntryDate) && (
            <Text style={s.subline}>
              {fmtDate(data.firstEntryDate)} – {fmtDate(data.lastEntryDate)}
            </Text>
          )}
        </View>

        {/* ── Summary cards ────────────────────────────────────────────────── */}
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Billed</Text>
            <Text style={s.summaryValue}>{fmt(data.billedCents)}</Text>
            <Text style={s.summarySub}>client revenue</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Budget</Text>
            <Text style={s.summaryValue}>{fmt(data.totalBudgetCents)}</Text>
            <Text style={s.summarySub}>approved budget</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Actual Cost</Text>
            <Text style={[s.summaryValue, { color: data.totalActualCents > data.totalBudgetCents ? RED : INK }]}>
              {fmt(data.totalActualCents)}
            </Text>
            <Text style={s.summarySub}>total spent</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Margin</Text>
            <Text style={[s.summaryValue, { color: marginColor }]}>{pct(data.marginPct)}</Text>
            <Text style={s.summarySub}>
              {fmt(Math.abs(data.profitCents))} {data.profitCents >= 0 ? 'profit' : 'loss'}
            </Text>
          </View>
        </View>

        {/* ── Account breakdown ─────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Budget vs. Actuals by Department</Text>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.thText, s.colName]}>Account</Text>
          <Text style={[s.thText, s.colRight]}>Budgeted</Text>
          <Text style={[s.thText, s.colRight]}>Actual</Text>
          <Text style={[s.thText, s.colRightSm]}>Variance</Text>
          <Text style={[s.thText, s.colRightSm]}>Used</Text>
        </View>

        {visibleAccounts.map((acc, i) => {
          const over     = acc.varianceCents < 0
          const pctUsed  = acc.budgetedCents > 0
            ? (acc.actualCents / acc.budgetedCents) * 100
            : 0
          const varColor = over ? RED : GREEN

          return (
            <View key={acc.accountId} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <View style={[s.colName, { flexDirection: 'column' }]}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>{acc.accountName}</Text>
                {acc.accountCode && <Text style={{ color: MUT, fontSize: 7 }}>{acc.accountCode}</Text>}
              </View>
              <Text style={s.colRight}>{fmt(acc.budgetedCents)}</Text>
              <Text style={[s.colRight, { fontFamily: 'Helvetica-Bold' }]}>{fmt(acc.actualCents)}</Text>
              <Text style={[s.colRightSm, { color: varColor }]}>
                {over ? '−' : '+'}{fmt(Math.abs(acc.varianceCents))}
              </Text>
              <Text style={[s.colRightSm, { color: pctUsed >= 100 ? RED : pctUsed >= 80 ? AMB : GREEN }]}>
                {pct(Math.min(pctUsed, 999))}
              </Text>
            </View>
          )
        })}

        {/* ── Top overages ─────────────────────────────────────────────────── */}
        {data.topOverages.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 24 }]}>Top Overages</Text>
            {data.topOverages.map((acc, i) => (
              <View key={acc.accountId} style={s.overageRow}>
                <Text style={{ fontSize: 8, color: INK }}>
                  {i + 1}. {acc.accountName}
                  {'  '}
                  <Text style={{ color: MUT }}>
                    (budgeted {fmt(acc.budgetedCents)}, actual {fmt(acc.actualCents)})
                  </Text>
                </Text>
                <Text style={{ fontSize: 8, color: RED, fontFamily: 'Helvetica-Bold' }}>
                  +{fmt(Math.abs(acc.varianceCents))} over
                </Text>
              </View>
            ))}
          </>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{workspaceName} · Wrap Report · {data.projectName}</Text>
          <Text style={s.footerText}>Generated {fmtDate(data.generatedAt)}</Text>
        </View>
      </Page>
    </Document>
  )
}
