// The shot list as a printable PDF (landscape): scenes as headings, one row
// per shot with its ★ frame, number, description and camera specs, and a
// status box you can tick on paper. Data comes from src/lib/shot-list-pdf.ts.
// No page-level lineHeight (react-pdf spaces inherited unitless lineHeight
// far too wide on small text — see FEATURE_LOG, call sheet PDF).

import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'

Font.registerHyphenationCallback(w => [w])

const INK = '#1A1A1A'
const MUTED = '#6B6B6B'
const RULE = '#E2E0DC'
const BAND = '#F6F5F2'

export interface ShotListPDFRow {
  code: string
  status: 'TO_SHOOT' | 'DONE' | 'SKIPPED'
  imageSrc?: string
  description: string
  subject: string | null
  specs: string
  extra: string | null
}

export interface ShotListPDFData {
  workspaceName: string
  logoSrc?: string
  brand: string
  projectName: string
  subtitle: string
  generatedLabel: string
  sections: { label: string; color: string; dayLabel: string | null; rows: ShotListPDFRow[] }[]
}

const s = StyleSheet.create({
  page:    { paddingTop: 30, paddingBottom: 36, paddingHorizontal: 34, fontFamily: 'Helvetica', fontSize: 8.5, color: INK },
  head:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 10, marginBottom: 6 },
  logo:    { height: 20, maxWidth: 120, objectFit: 'contain', marginBottom: 6 },
  ws:      { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  kicker:  { fontSize: 7.5, color: MUTED, letterSpacing: 0.6, marginBottom: 2 },
  title:   { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  sub:     { fontSize: 8.5, color: MUTED, marginTop: 3 },
  meta:    { fontSize: 7.5, color: MUTED, textAlign: 'right' },
  secHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: BAND, paddingVertical: 5, paddingHorizontal: 6, marginTop: 10 },
  swatch:  { width: 6, height: 6, borderRadius: 1, marginRight: 6 },
  secText: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  day:     { fontSize: 7.5, marginLeft: 8 },
  row:     { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 5 },
  box:     { width: 10, height: 10, borderWidth: 1, borderColor: '#B9B5AE', borderRadius: 1.5, marginLeft: 4, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  img:     { width: 88, height: 49.5, objectFit: 'cover', borderRadius: 2 },
  noImg:   { width: 88, height: 49.5, backgroundColor: BAND, borderRadius: 2 },
  code:    { width: 40, fontSize: 9.5, fontFamily: 'Helvetica-Bold', paddingLeft: 10 },
  body:    { flex: 1, paddingRight: 12 },
  desc:    { fontSize: 9, lineHeight: 1.3 },
  subject: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  specs:   { width: 230, fontSize: 8, color: '#3A3A3A', lineHeight: 1.3 },
  extra:   { fontSize: 7, color: MUTED, marginTop: 2, lineHeight: 1.3 },
  footer:  { position: 'absolute', bottom: 16, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: MUTED },
})

function Row({ r, brand }: { r: ShotListPDFRow; brand: string }) {
  const done = r.status === 'DONE'
  const skipped = r.status === 'SKIPPED'
  return (
    <View style={s.row} wrap={false}>
      <View style={[s.box, done ? { backgroundColor: brand, borderColor: brand } : {}]}>
        {skipped && <Text style={{ fontSize: 8, color: '#9A9A9A' }}>–</Text>}
      </View>
      {r.imageSrc ? <Image src={r.imageSrc} style={s.img} /> : <View style={s.noImg} />}
      <Text style={[s.code, skipped ? { color: '#9A9A9A' } : {}]}>{r.code}</Text>
      <View style={s.body}>
        <Text style={[s.desc, skipped ? { color: '#9A9A9A', textDecoration: 'line-through' } : {}]}>{r.description || ' '}</Text>
        {r.subject && <Text style={s.subject}>{r.subject}</Text>}
      </View>
      <View style={s.specs}>
        <Text>{r.specs || ' '}</Text>
        {r.extra && <Text style={s.extra}>{r.extra}</Text>}
      </View>
    </View>
  )
}

export function ShotListPDF({ d }: { d: ShotListPDFData }) {
  return (
    <Document title={`${d.projectName} — Shot list`} author={d.workspaceName}>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.head} fixed>
          <View>
            {d.logoSrc ? <Image src={d.logoSrc} style={s.logo} /> : <Text style={s.ws}>{d.workspaceName}</Text>}
            <Text style={s.kicker}>SHOT LIST</Text>
            <Text style={s.title}>{d.projectName}</Text>
            <Text style={s.sub}>{d.subtitle}</Text>
          </View>
          <Text style={s.meta}>{d.generatedLabel}</Text>
        </View>

        {d.sections.map((sec, i) => (
          <View key={i}>
            {/* Heading stays with its first shot (no orphaned headings). */}
            <View wrap={false}>
              <View style={s.secHead}>
                <View style={[s.swatch, { backgroundColor: sec.color }]} />
                <Text style={s.secText}>{sec.label}</Text>
                {sec.dayLabel && <Text style={[s.day, { color: d.brand }]}>{sec.dayLabel}</Text>}
              </View>
              {sec.rows[0] && <Row r={sec.rows[0]} brand={d.brand} />}
            </View>
            {sec.rows.slice(1).map((r, j) => <Row key={j} r={r} brand={d.brand} />)}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>{d.workspaceName} · {d.projectName}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
