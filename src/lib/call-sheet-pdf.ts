// Call sheet PDF: turns a saved call sheet into CallSheetPDFData and renders
// it. Server-only plain module; the route is /api/pdf/call-sheet/[token].
// `buildCallSheetPdfData` is pure (tested in __tests__/call-sheet-pdf.test.ts).

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { CallSheetPDF, type CallSheetPDFData } from '@/components/call-sheets/CallSheetPDF'
import { formatTime, type TimeFormat } from '@/lib/time-format'
import { loadPdfLogo } from '@/lib/pdf-logo'
import { safeHex } from '@/lib/color'
import type { CrewDept, TalentMember, OtherContact, ScheduleBlock, WeatherInfo, HospitalInfo, PointOfContact } from '@/server/actions/call-sheets'

export interface CallSheetForPdf {
  title: string
  status: string
  shootDate: Date
  generalCall: string
  sentAt: Date | null
  locationName: string | null
  locationAddress: string | null
  parkingAddress: string | null
  locationNotes: string | null
  crew: unknown
  talent: unknown
  schedule: unknown
  otherContacts: unknown
  pointOfContact: unknown
  weather: unknown
  hospitalInfo: unknown
  cateringInfo: string | null
  notes: string | null
  project: { name: string; client: { name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null } | null }
  workspace: { name: string; logoUrl: string | null; primaryColor: string | null; accentColor: string | null; callTimeFormat: string | null }
}

const blank = (s: string | null | undefined) => !s || !s.trim()
const clean = (s: string | null | undefined) => (blank(s) ? null : s!.trim())

/** 10-digit (or 1 + 10) US numbers as 516-508-6411; anything else as typed. */
export function prettyPhone(s: string | null | undefined): string | null {
  const v = clean(s)
  if (!v) return null
  const digits = v.replace(/\D/g, '')
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return d.length === 10 && /^[\d\s().+-]+$/.test(v) ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : v
}

/** A long "who's needed" list: the first few names, then "+N more". */
export function shortWho(s: string | null | undefined, max = 4): string | null {
  const v = clean(s)
  if (!v) return null
  const parts = v.split(',').map(x => x.trim()).filter(Boolean)
  return parts.length > max + 1 ? `${parts.slice(0, max).join(', ')} +${parts.length - max} more` : v
}

/** "9:00–9:30 AM", "11:30 AM–1:00 PM", "09:00–09:30" (24H). */
export function timeRange(start: string, end: string | undefined, fmt: TimeFormat): string {
  const a = formatTime(start, fmt)
  if (!end) return a
  const b = formatTime(end, fmt)
  if (fmt === '12H') {
    const [aT, aM] = a.split(' '), [bT, bM] = b.split(' ')
    if (aM && aM === bM) return `${aT}–${bT} ${bM}`
  }
  return `${a}–${b}`
}

const KEY_ROLES: { label: string; re: RegExp }[] = [
  { label: 'Producer', re: /^(executive |line )?producer\b/i },
  { label: 'Director', re: /^director$/i },
  { label: '1st AD', re: /^(1st|first) ?(ad|a\.d\.|assistant director)\b/i },
]

export function buildCallSheetPdfData(cs: CallSheetForPdf, extras: { dayLabel: string | null; logoSrc?: string }): CallSheetPDFData {
  const fmt = ((cs.workspace.callTimeFormat as TimeFormat | null) ?? '12H')
  const t = (hhmm: string | null | undefined) => (blank(hhmm) ? null : formatTime(hhmm!, fmt))
  const crew = ((cs.crew as CrewDept[] | null) ?? [])
  const talent = ((cs.talent as TalentMember[] | null) ?? [])
  const others = ((cs.otherContacts as OtherContact[] | null) ?? [])
  const blocks = ((cs.schedule as ScheduleBlock[] | null) ?? [])
  const weather = cs.weather as WeatherInfo | null
  const hospital = cs.hospitalInfo as HospitalInfo | null
  const poc = cs.pointOfContact as PointOfContact | null
  // Like the public /cs page: the client only appears with their contact
  // details (a code-named job's brand stays off a sheet with no client contact).
  const rawClient = cs.project.client
  const client = rawClient && (clean(rawClient.contactName) || clean(rawClient.contactPhone) || clean(rawClient.contactEmail)) ? rawClient : null

  // Key contacts: the first crew member in each key role, then the client.
  const everyone = crew.flatMap(d => d.members ?? []).filter(m => !blank(m.name))
  const keyContacts: CallSheetPDFData['keyContacts'] = []
  for (const k of KEY_ROLES) {
    const m = everyone.find(x => k.re.test(x.role?.trim() ?? ''))
    if (m) keyContacts.push({ label: k.label, name: m.name.trim(), phone: prettyPhone(m.phone) })
  }
  if (client && (clean(client.contactName) || clean(client.contactPhone))) {
    keyContacts.push({ label: 'Client', name: clean(client.contactName) ?? client.name, phone: prettyPhone(client.contactPhone) })
  }

  const crewCalls = everyone.map(m => m.callTime).filter((x): x is string => !blank(x)).sort()
  const firstScene = blocks.find(b => /^Sc\b/i.test(b.label ?? ''))
  const [y, mo, dd] = cs.shootDate.toISOString().slice(0, 10).split('-').map(Number)
  const dateLabel = new Date(y!, mo! - 1, dd!).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const fmtClock = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const sunrise = weather?.sunrise ? fmtClock(weather.sunrise) : null
  const sunset = weather?.sunset ? fmtClock(weather.sunset) : null

  const contacts: CallSheetPDFData['contacts'] = []
  if (client && (clean(client.contactName) || clean(client.contactPhone) || clean(client.contactEmail))) {
    contacts.push({ name: clean(client.contactName) ?? client.name, role: `Client · ${client.name}`, phone: prettyPhone(client.contactPhone), email: clean(client.contactEmail) })
  }
  for (const o of others) {
    if (blank(o.name)) continue
    contacts.push({ name: o.name.trim(), role: [clean(o.role), clean(o.company)].filter(Boolean).join(' · ') || null, phone: prettyPhone(o.phone), email: clean(o.email) })
  }

  const sentLabel = cs.sentAt ? `Sent ${cs.sentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : null

  return {
    workspaceName: cs.workspace.name,
    logoSrc: extras.logoSrc,
    brand: safeHex(cs.workspace.primaryColor),
    accent: cs.workspace.accentColor && /^#[0-9a-f]{6}$/i.test(cs.workspace.accentColor) ? cs.workspace.accentColor : '#04FFCC',
    projectName: cs.project.name,
    title: cs.title,
    clientName: client?.name ?? null,
    keyContacts,
    dayLabel: extras.dayLabel,
    generalCall: formatTime(cs.generalCall, fmt),
    dateLabel,
    crewCall: crewCalls[0] ? formatTime(crewCalls[0], fmt) : null,
    shootingCall: firstScene ? t(firstScene.startTime ?? firstScene.time) : null,
    weather: weather ? {
      summary: `${weather.conditions} · ${Math.round(weather.high)}° / ${Math.round(weather.low)}°`,
      rain: `${Math.round(weather.precipPct)}%`,
      wind: `${Math.round(weather.windMph)} mph`,
      daylight: sunrise && sunset ? `${sunrise} / ${sunset}` : null,
    } : null,
    hospital: hospital ? {
      name: hospital.name, address: hospital.address, phone: prettyPhone(hospital.phone),
      distance: typeof hospital.distanceKm === 'number' && hospital.distanceKm >= 0.05 ? `${hospital.distanceKm.toFixed(1)} km` : null,
    } : null,
    location: { name: clean(cs.locationName), address: clean(cs.locationAddress) },
    parking: { address: clean(cs.parkingAddress), notes: clean(cs.locationNotes) },
    pointOfContact: poc && !blank(poc.name) ? { name: poc.name.trim(), title: clean(poc.title), phone: prettyPhone(poc.phone) } : null,
    // Concurrent items are listed in time order, not indented, on the PDF.
    schedule: blocks.filter(b => !blank(b.startTime ?? b.time) || !blank(b.label)).map(b => ({
      time: b.startTime ?? b.time ? timeRange((b.startTime ?? b.time)!, b.endTime || undefined, fmt) : '',
      label: b.label ?? '', notes: clean(b.notes), where: clean(b.location), who: shortWho(b.whoNeeded),
    })),
    talent: talent.filter(x => !blank(x.name) || !blank(x.role)).map(x => ({ name: x.name?.trim() ?? '', role: clean(x.role), call: t(x.callTime) })),
    crew: crew
      .map(dpt => ({ dept: dpt.dept, members: (dpt.members ?? []).filter(m => !blank(m.name) || !blank(m.role)).map(m => ({ role: m.role?.trim() ?? '', name: m.name?.trim() ?? '', phone: prettyPhone(m.phone), call: t(m.callTime) })) }))
      .filter(dpt => dpt.members.length > 0),
    contacts,
    catering: clean(cs.cateringInfo),
    notes: clean(cs.notes),
    isDraft: cs.status === 'DRAFT',
    footerLeft: [cs.project.name, extras.dayLabel ? extras.dayLabel.replace(/^DAY/, 'Day').replace(' OF ', ' of ') : null, sentLabel ?? (cs.status === 'DRAFT' ? 'Draft' : null)].filter(Boolean).join(' · '),
  }
}

function safeFilePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Call sheet'
}

export async function renderCallSheetPdf(cs: CallSheetForPdf, dayLabel: string | null): Promise<{ filename: string; buffer: Buffer }> {
  const logoSrc = await loadPdfLogo(cs.workspace.logoUrl)
  const data = buildCallSheetPdfData(cs, { dayLabel, logoSrc })
  const buffer = await renderToBuffer(
    React.createElement(CallSheetPDF, { d: data }) as unknown as Parameters<typeof renderToBuffer>[0],
  )
  return { filename: `Call sheet - ${safeFilePart(cs.title)}.pdf`, buffer }
}
