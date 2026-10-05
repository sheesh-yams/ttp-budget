import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { formatMoney } from '@/lib/money'
import type { VendorDealMemo } from '@/lib/deal-memo-vendor-view'
import { parsePdfLines } from '@/components/proposal/ProposalPDF'
import { QTY_NOUN, UNIT_SUFFIX } from './labels'

// The signed deal memo as a PDF — attached to the post-signing emails and
// served by /api/pdf/deal-memo/[token]. Renders ONLY the frozen vendor
// snapshot (what was signed) plus the signature, mirroring DealMemoDocument.

const INK  = '#2C2C2A'
const MUT  = '#888780'
const BDR  = '#E8E0F0'

export interface DealMemoPdfProps {
  memo:      VendorDealMemo
  brand:     string            // workspace primary colour
  logoSrc?:  string            // data: URI (png/jpeg) — falls back to the workspace name
  signature: { name: string; email: string; ip: string | null; signedAtISO: string }
  cancelledAtISO?: string | null
}

const s = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', fontSize: 10, color: INK, padding: '40 48 64 48' },
  top:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logo:      { maxWidth: 120, maxHeight: 28, objectFit: 'contain' },
  wsName:    { fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, textTransform: 'uppercase', color: MUT },
  eyebrow:   { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1.8, textTransform: 'uppercase' },
  title:     { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 14 },
  meta:      { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 14, marginBottom: 22, borderBottomWidth: 2 },
  metaItem:  { width: '25%', marginBottom: 8, paddingRight: 8 },
  metaLabel: { fontSize: 7, color: MUT, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  h2:        { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 },
  thead:     { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BDR, paddingBottom: 5 },
  th:        { fontSize: 7, color: MUT, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  tr:        { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BDR, paddingVertical: 8 },
  cFee:      { width: '28%', paddingRight: 8 },
  cRate:     { width: '24%', paddingRight: 8 },
  cTerms:    { width: '48%' },
  feeName:   { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  small:     { fontSize: 8.5, color: MUT, marginTop: 2 },
  body:      { fontSize: 9.5, lineHeight: 1.6 },
  bullet:    { flexDirection: 'row' },
  bulletDot: { width: 12, fontSize: 9.5 },
  total:     { textAlign: 'right', marginTop: 8, fontSize: 10 },
  section:   { marginBottom: 14 },
  secTitle:  { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  sigBlock:  { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: BDR },
  sigName:   { fontSize: 22, fontFamily: 'Helvetica-Oblique', marginBottom: 4 },
  sigLine:   { height: 1, backgroundColor: INK, width: 220, marginBottom: 6 },
  sigMeta:   { fontSize: 8.5, color: MUT, marginBottom: 2 },
  cancelled: { borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', color: '#B91C1C', padding: 8, fontSize: 9, marginBottom: 14 },
  footer:    { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUT },
})

function Lines({ raw, style }: { raw: string; style: Style }) {
  return (
    <>
      {parsePdfLines(raw).map((line, i) => {
        if (!line.text && !line.bullet && !line.numbered) return <Text key={i} style={{ fontSize: 4 }}>{' '}</Text>
        if (line.bullet || line.numbered) {
          return (
            <View key={i} style={s.bullet}>
              <Text style={[s.bulletDot, line.numbered ? { width: 16 } : {}]}>{line.numbered ?? '•'}</Text>
              <Text style={[style, { flex: 1 }]}>{line.text}</Text>
            </View>
          )
        }
        return <Text key={i} style={style}>{line.text}</Text>
      })}
    </>
  )
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

export function DealMemoPDF({ memo, brand, logoSrc, signature, cancelledAtISO }: DealMemoPdfProps) {
  const dates = memo.startDate
    ? memo.endDate && memo.endDate !== memo.startDate ? `${memo.startDate} – ${memo.endDate}` : memo.startDate
    : null
  const meta: [string, string][] = [
    ['Name', memo.vendorName], ['Role', memo.position], ['Production', memo.projectName], ['Company', memo.workspaceName],
    ...(dates ? [['Dates', dates] as [string, string]] : []),
  ]

  return (
    <Document title={`Deal memo — ${memo.position} — ${memo.projectName}`} author={memo.workspaceName}>
      <Page size="LETTER" style={s.page}>
        <View style={s.top}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logoSrc ? <Image src={logoSrc} style={s.logo} /> : <Text style={s.wsName}>{memo.workspaceName}</Text>}
        </View>

        {cancelledAtISO && (
          <Text style={s.cancelled}>
            This deal memo was cancelled on {new Date(cancelledAtISO).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </Text>
        )}

        <Text style={[s.eyebrow, { color: brand }]}>Deal memo</Text>
        <Text style={s.title}>{memo.position}</Text>
        <View style={[s.meta, { borderBottomColor: brand }]}>
          {meta.map(([label, value]) => (
            <View key={label} style={s.metaItem}>
              <Text style={s.metaLabel}>{label}</Text>
              <Text style={s.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.h2, { color: brand }]}>Fee structure</Text>
        <View style={s.thead}>
          <Text style={[s.th, s.cFee]}>Fee</Text>
          <Text style={[s.th, s.cRate]}>Rate / amount</Text>
          <Text style={[s.th, s.cTerms]}>Details &amp; terms</Text>
        </View>
        {memo.fees.map(f => (
          <View key={f.id} style={s.tr} wrap={false}>
            <View style={s.cFee}><Text style={s.feeName}>{f.label}</Text></View>
            <View style={s.cRate}>
              <Text>{formatMoney(f.rateCents)}{UNIT_SUFFIX[f.unit]}</Text>
              {f.quantity > 0 && f.unit !== 'FLAT' && (
                <Text style={s.small}>{f.quantity} {QTY_NOUN[f.unit]} · {formatMoney(f.expectedCents)}</Text>
              )}
            </View>
            <View style={s.cTerms}>{f.termsText ? <Lines raw={f.termsText} style={s.body} /> : <Text style={s.small}>—</Text>}</View>
          </View>
        ))}
        {memo.fees.length > 0 && (
          <Text style={s.total}>
            Estimated total <Text style={{ fontFamily: 'Helvetica-Bold' }}>{formatMoney(memo.expectedTotalCents)}</Text>
          </Text>
        )}

        {memo.sections.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <Text style={[s.h2, { color: brand }]}>Terms</Text>
            {memo.sections.map((sec, i) => (
              <View key={sec.id} style={s.section} wrap>
                <Text style={s.secTitle}>{String(i + 1).padStart(2, '0')} — {sec.title}</Text>
                <Lines raw={sec.bodyText} style={s.body} />
              </View>
            ))}
          </View>
        )}

        <View style={s.sigBlock} wrap={false}>
          <Text style={[s.h2, { color: brand }]}>Signed</Text>
          <Text style={s.sigName}>{signature.name}</Text>
          <View style={s.sigLine} />
          <Text style={s.sigMeta}>Signed electronically by {signature.name} ({signature.email}) on {fmtWhen(signature.signedAtISO)}.</Text>
          {signature.ip && <Text style={s.sigMeta}>IP address: {signature.ip}</Text>}
        </View>

        <View style={s.footer} fixed>
          <Text>{memo.workspaceName} · Deal memo · {memo.position} — {memo.projectName}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
