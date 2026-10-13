// The call sheet as a printable PDF — "Option A · SlateSuite Classic":
// production info | big general call | weather & hospital across the top,
// a location strip, the schedule, then talent/contacts/notes beside crew by
// department. Black-and-white friendly; brand colour as accents only.
// Data is prepared by src/lib/call-sheet-pdf.ts.

import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'

Font.registerHyphenationCallback(w => [w])

const INK = '#111014'
const MUTED = '#6b6475'
const RULE = '#d9d4e0'
const SOFT = '#f6f3f9'
const WARN = '#b42318'

export interface CallSheetPDFData {
  workspaceName: string
  logoSrc?: string
  brand: string
  accent: string
  projectName: string
  title: string
  clientName: string | null
  /** Producer / Director / 1st AD (from crew roles) and the client's contact. */
  keyContacts: { label: string; name: string; phone: string | null }[]
  dayLabel: string | null          // "DAY 1 OF 2"
  generalCall: string              // "9:00 AM"
  dateLabel: string                // "Tuesday, October 13, 2026"
  crewCall: string | null
  shootingCall: string | null
  weather: { summary: string; rain: string; wind: string; daylight: string | null } | null
  hospital: { name: string; address: string; phone: string | null; distance: string | null } | null
  location: { name: string | null; address: string | null }
  parking: { address: string | null; notes: string | null }
  pointOfContact: { name: string; title: string | null; phone: string | null } | null
  schedule: { time: string; label: string; notes: string | null; where: string | null; who: string | null }[]
  talent: { name: string; role: string | null; call: string | null }[]
  crew: { dept: string; members: { role: string; name: string; phone: string | null; call: string | null }[] }[]
  /** The client's contact first (when there's a client), then other contacts. */
  contacts: { name: string; role: string | null; phone: string | null; email: string | null }[]
  catering: string | null
  notes: string | null
  isDraft: boolean
  footerLeft: string
}

const s = StyleSheet.create({
  // No lineHeight anywhere it would be inherited: react-pdf drops
  // render-prop text (the page numbers) under an inherited lineHeight, and
  // an inherited unitless value spaces small text far too wide.
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 32, fontFamily: 'Helvetica', fontSize: 8.2, color: INK },
  body: {},
  lbl: { fontSize: 6.2, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  b: { fontFamily: 'Helvetica-Bold' },
  muted: { color: MUTED },
  top: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 8 },
  topLeft: { width: 205 },
  topRight: { flex: 1 },
  wordmark: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, letterSpacing: 0.4 },
  prod: { fontFamily: 'Helvetica-Bold', fontSize: 13, lineHeight: 1.25, marginTop: 6, marginBottom: 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.6, borderBottomWidth: 0.5, borderBottomColor: RULE, borderBottomStyle: 'dashed' },
  callbox: { width: 150, marginHorizontal: 12, borderWidth: 2, borderColor: INK, alignItems: 'center', paddingBottom: 7 },
  dayBar: { alignSelf: 'stretch', paddingVertical: 2.5, alignItems: 'center', marginBottom: 5 },
  callTime: { fontFamily: 'Helvetica-Bold', fontSize: 26, lineHeight: 1.15, marginTop: 2, marginBottom: 3 },
  strip: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: INK },
  stripCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 7, borderRightWidth: 1, borderRightColor: INK },
  h3: { marginTop: 10, marginBottom: 3, backgroundColor: INK, paddingVertical: 2.5, paddingHorizontal: 6, flexDirection: 'row', justifyContent: 'space-between' },
  h3Text: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 2.5 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 3 },
  pairRow: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48.5%' },
  cell: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 3 },
  dept: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 0.7, textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 2, marginTop: 5 },
  noteBox: { borderWidth: 0.5, borderColor: RULE, padding: 6 },
  footRule: { position: 'absolute', left: 32, right: 32, bottom: 28, borderTopWidth: 1.5, borderTopColor: INK },
  // Only left set: a render-prop Text with both left and right drops out.
  footL: { position: 'absolute', left: 32, bottom: 16, fontSize: 6.4, color: MUTED },
  footR: { position: 'absolute', right: 32, bottom: 16, fontSize: 6.4, color: MUTED },
  draft: { position: 'absolute', top: 10, right: 32, fontFamily: 'Helvetica-Bold', fontSize: 7, color: WARN, letterSpacing: 1 },
})

function Kv({ k, v }: { k: string; v: string }) {
  return <View style={s.kv}><Text>{k}</Text><Text style={s.b}>{v}</Text></View>
}

function Section({ title, right }: { title: string; right?: string }) {
  return (
    // minPresenceAhead: never leave a heading alone at the bottom of a page.
    <View style={s.h3} wrap={false} minPresenceAhead={36}>
      <Text style={s.h3Text}>{title.toUpperCase()}</Text>
      {right ? <Text style={[s.h3Text, { fontFamily: 'Helvetica', letterSpacing: 0.3 }]}>{right}</Text> : null}
    </View>
  )
}

/** Rows of two, for the two-up lists. */
function pairs<T>(list: T[]): [T, T | null][] {
  const out: [T, T | null][] = []
  for (let i = 0; i < list.length; i += 2) out.push([list[i]!, list[i + 1] ?? null])
  return out
}

function TalentCell({ t }: { t: CallSheetPDFData['talent'][number] }) {
  return (
    <View style={[s.half, s.cell]}>
      <Text style={[s.b, { flex: 1.1 }]}>{t.name || '—'}</Text>
      <Text style={[s.muted, { flex: 1.2 }]}>{t.role ?? ''}</Text>
      <Text style={[s.b, { width: 44, textAlign: 'right' }]}>{t.call ?? ''}</Text>
    </View>
  )
}

function ContactCell({ c }: { c: CallSheetPDFData['contacts'][number] }) {
  return (
    <View style={[s.half, s.cell]}>
      <View style={{ flex: 1.1 }}>
        <Text style={s.b}>{c.name}</Text>
        {c.role && <Text style={[s.muted, { fontSize: 7 }]}>{c.role}</Text>}
      </View>
      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
        {c.phone && <Text>{c.phone}</Text>}
        {c.email && <Text style={[s.muted, { fontSize: 7 }]}>{c.email}</Text>}
      </View>
    </View>
  )
}

function CrewCell({ m }: { m: CallSheetPDFData['crew'][number]['members'][number] }) {
  return (
    <View style={[s.half, s.cell]}>
      <Text style={[s.muted, { flex: 1 }]}>{m.role}</Text>
      <Text style={[s.b, { flex: 1.15 }]}>{m.name || '—'}</Text>
      <Text style={[s.muted, { width: 62 }]}>{m.phone ?? ''}</Text>
      <Text style={[s.b, { width: 40, textAlign: 'right' }]}>{m.call ?? ''}</Text>
    </View>
  )
}

export function CallSheetPDF({ d }: { d: CallSheetPDFData }) {
  const words = d.workspaceName.trim().split(/\s+/)
  const wmLast = words.length > 1 ? words.pop()! : ''

  return (
    <Document title={`${d.title} — Call Sheet`} author={d.workspaceName} creator="SlateSuite" producer="SlateSuite">
      <Page size="LETTER" style={s.page}>
        {d.isDraft && <Text style={s.draft} fixed>DRAFT — NOT YET SENT</Text>}
        <View style={s.body}>

        {/* ── Top band ── */}
        <View style={s.top}>
          <View style={s.topLeft}>
            {d.logoSrc
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
              ? <Image src={d.logoSrc} style={{ height: 22, objectFit: 'contain', alignSelf: 'flex-start' }} />
              : <Text style={s.wordmark}>{words.join(' ').toUpperCase()}{wmLast ? ' ' : ''}<Text style={{ color: d.brand }}>{wmLast.toUpperCase()}</Text></Text>}
            <Text style={s.prod}>{d.projectName}</Text>
            {/* The sheet title only when it says more than "<project> — Call Sheet" */}
            {!d.title.toLowerCase().startsWith(d.projectName.toLowerCase()) && <Text style={s.muted}>{d.title}</Text>}
            {d.clientName && <Text style={s.muted}>Client: {d.clientName}</Text>}
            <View style={{ marginTop: 6 }}>
              {d.keyContacts.map((c, i) => <Kv key={i} k={c.label} v={[c.name, c.phone].filter(Boolean).join(' · ')} />)}
            </View>
          </View>

          <View style={s.callbox}>
            <View style={[s.dayBar, { backgroundColor: d.brand }]}>
              <Text style={{ color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.4, letterSpacing: 0.8 }}>{d.dayLabel ?? 'CALL SHEET'}</Text>
            </View>
            <Text style={s.lbl}>General call</Text>
            <Text style={s.callTime}>{d.generalCall}</Text>
            <Text style={[s.b, { fontSize: 8 }]}>{d.dateLabel}</Text>
            {(d.crewCall || d.shootingCall) && (
              <Text style={[s.muted, { marginTop: 3, fontSize: 7.2, textAlign: 'center', paddingHorizontal: 6 }]}>
                {[d.crewCall && `Crew call ${d.crewCall}`, d.shootingCall && `Shooting call ${d.shootingCall}`].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>

          <View style={s.topRight}>
            {d.weather ? (
              <>
                <Text style={s.lbl}>Weather</Text>
                <Text style={[s.b, { fontSize: 11, marginVertical: 2 }]}>{d.weather.summary}</Text>
                <Kv k="Rain" v={d.weather.rain} />
                <Kv k="Wind" v={d.weather.wind} />
                {d.weather.daylight && <Kv k="Sunrise / Sunset" v={d.weather.daylight} />}
              </>
            ) : (
              <><Text style={s.lbl}>Weather</Text><Text style={s.muted}>Not fetched yet</Text></>
            )}
            {d.hospital && (
              <View style={{ marginTop: 7 }}>
                <Text style={s.lbl}>Nearest hospital</Text>
                <Text style={s.b}>{d.hospital.name}</Text>
                <Text style={s.muted}>{[d.hospital.address, d.hospital.phone, d.hospital.distance].filter(Boolean).join(' · ')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Location strip ── */}
        <View style={s.strip}>
          <View style={s.stripCell}>
            <Text style={s.lbl}>Location</Text>
            {d.location.name && <Text style={s.b}>{d.location.name}</Text>}
            <Text>{d.location.address ?? (d.location.name ? '' : 'To be confirmed')}</Text>
          </View>
          <View style={s.stripCell}>
            <Text style={s.lbl}>Parking / notes</Text>
            {d.parking.address && <Text>{d.parking.address}</Text>}
            {!d.parking.address && !d.parking.notes && <Text>—</Text>}
            {d.parking.notes && <Text style={s.muted}>{d.parking.notes}</Text>}
          </View>
          <View style={[s.stripCell, { borderRightWidth: 0 }]}>
            <Text style={s.lbl}>Point of contact</Text>
            {d.pointOfContact ? (
              <>
                <Text><Text style={s.b}>{d.pointOfContact.name}</Text>{d.pointOfContact.title ? ` · ${d.pointOfContact.title}` : ''}</Text>
                <Text>{d.pointOfContact.phone ?? ''}</Text>
              </>
            ) : <Text>—</Text>}
          </View>
        </View>

        {/* ── Schedule ── */}
        {d.schedule.length > 0 && (
          <View>
            <Section title="Schedule" />
            <View style={s.th} wrap={false}>
              <Text style={[s.lbl, { width: 92 }]}>Time</Text>
              <Text style={[s.lbl, { flex: 1 }]}>Description</Text>
              <Text style={[s.lbl, { width: 100 }]}>Where</Text>
              <Text style={[s.lbl, { width: 110 }]}>Who</Text>
            </View>
            {d.schedule.map((b, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.b, { width: 92 }]}>{b.time}</Text>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text>{b.label}</Text>
                  {b.notes && <Text style={[s.muted, { fontSize: 7.2 }]}>{b.notes}</Text>}
                </View>
                <Text style={[s.muted, { width: 100, paddingRight: 4 }]}>{b.where ?? ''}</Text>
                <Text style={[s.muted, { width: 110, fontSize: 7.2 }]}>{b.who ?? ''}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Talent · contacts · crew · notes ──
            One flowing column (react-pdf can't split side-by-side columns
            across pages cleanly); the two-column look comes from rows that
            hold two people each. Headings never sit alone at a page bottom. */}
        {d.talent.length > 0 && (
          <View>
            {pairs(d.talent).map((row, i) => (
              // The heading travels with the first row (never alone at a page bottom).
              <View key={i} wrap={false}>
                {i === 0 && <Section title="Talent" />}
                <View style={s.pairRow}>
                  {row.map((t, j) => t ? <TalentCell key={j} t={t} /> : <View key={j} style={s.half} />)}
                </View>
              </View>
            ))}
          </View>
        )}

        {d.contacts.length > 0 && (
          <View>
            {pairs(d.contacts).map((row, i) => (
              <View key={i} wrap={false}>
                {i === 0 && <Section title="Contacts" />}
                <View style={s.pairRow}>
                  {row.map((c, j) => c ? <ContactCell key={j} c={c} /> : <View key={j} style={s.half} />)}
                </View>
              </View>
            ))}
          </View>
        )}

        {d.crew.length > 0 && (
          <View>
            {d.crew.map((dept, di) => (
              <View key={di}>
                {pairs(dept.members).map((row, i) => (
                  // Crew heading / department name travel with their first row.
                  <View key={i} wrap={false}>
                    {di === 0 && i === 0 && <Section title="Crew" />}
                    {i === 0 && <Text style={[s.dept, { color: d.brand }]}>{dept.dept}</Text>}
                    <View style={s.pairRow}>
                      {row.map((m, j) => m ? <CrewCell key={j} m={m} /> : <View key={j} style={s.half} />)}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {(d.catering || d.notes) && (
          <View>
            <Section title="Notes" />
            <View style={s.noteBox}>
              {d.catering && <Text><Text style={s.b}>Catering: </Text>{d.catering}</Text>}
              {d.notes && <Text style={{ marginTop: d.catering ? 4 : 0 }}>{d.notes}</Text>}
            </View>
          </View>
        )}

        </View>

        {/* ── Footer (every page) — separate fixed pieces render most reliably ── */}
        <View style={s.footRule} fixed />
        <Text style={s.footL} fixed render={({ pageNumber, totalPages }) => `${d.footerLeft}   ·   Page ${pageNumber} of ${totalPages}`} />
        <Text style={s.footR} fixed>Made with SlateSuite</Text>
      </Page>
    </Document>
  )
}
