jest.mock('@/components/call-sheets/CallSheetPDF', () => ({ CallSheetPDF: () => null }))
jest.mock('@react-pdf/renderer', () => ({ renderToBuffer: jest.fn() }))
import { buildCallSheetPdfData, timeRange, prettyPhone, shortWho, type CallSheetForPdf } from '@/lib/call-sheet-pdf'

const base = (over: Partial<CallSheetForPdf> = {}): CallSheetForPdf => ({
  title: 'Daadi — Call Sheet', status: 'SENT', shootDate: new Date('2026-10-13T00:00:00Z'), generalCall: '09:00', sentAt: new Date('2026-10-12T22:04:00Z'),
  locationName: 'The Artist House', locationAddress: '418 E 134th St', parkingAddress: null, locationNotes: 'Use the side door',
  crew: [{ dept: 'Production', members: [
    { name: 'Ali Ahmad', role: 'Producer', callTime: '08:00', phone: '5165086411' },
    { name: 'Rohan', role: '1st AD', callTime: '07:30', phone: '+1 (646) 555-0119' },
    { name: '', role: 'PA', callTime: '' },
  ] }, { dept: 'Empty', members: [{ name: '', role: '', callTime: '' }] }],
  talent: [{ name: 'Sunita', role: 'Lead Talent', callTime: '09:30' }],
  schedule: [{ startTime: '09:00', endTime: '09:30', label: 'Load In' }, { startTime: '11:30', endTime: '13:00', label: 'Sc 1 — Kitchen', whoNeeded: 'A, B, C, D, E, F', location: 'Kitchen' }],
  otherContacts: [{ name: 'Venue Mgr', role: 'Manager', company: 'Hall', phone: '2125550100' }],
  pointOfContact: { name: 'Anjali', title: 'Producer', phone: '4088967344' },
  weather: { high: 71.4, low: 55, conditions: 'Partly cloudy', windMph: 10, precipPct: 5, sunrise: '2026-10-13T07:04', sunset: '2026-10-13T18:18', fetchedAt: '' },
  hospitalInfo: { name: 'Lincoln', address: '234 E 149th St', phone: '8446924692', distanceKm: 0, lat: 0, lng: 0 },
  cateringInfo: null, notes: null,
  project: { name: 'Daadi', client: { name: 'Taptap Send', contactName: 'Sristi', contactEmail: 's@x.com', contactPhone: null } },
  workspace: { name: 'The Third Place', logoUrl: null, primaryColor: '#5D00A4', accentColor: null, callTimeFormat: '12H' },
  ...over,
})

describe('call sheet PDF data', () => {
  it('formats times, phones and long who lists', () => {
    expect(timeRange('09:00', '09:30', '12H')).toBe('9:00–9:30 AM')
    expect(timeRange('11:30', '13:00', '12H')).toBe('11:30 AM–1:00 PM')
    expect(timeRange('09:00', '09:30', '24H')).toBe('09:00–09:30')
    expect(prettyPhone('5165086411')).toBe('516-508-6411')
    expect(prettyPhone('+1 (646) 555-0119')).toBe('646-555-0119')
    expect(prettyPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(shortWho('A, B, C, D, E, F')).toBe('A, B, C, D +2 more')
    expect(shortWho('A, B, C, D, E')).toBe('A, B, C, D, E')
  })

  it('builds the sheet: key contacts, client contacts, calls, no empty rows', () => {
    const d = buildCallSheetPdfData(base(), { dayLabel: 'DAY 1 OF 2' })
    expect(d.keyContacts).toEqual([
      { label: 'Producer', name: 'Ali Ahmad', phone: '516-508-6411' },
      { label: '1st AD', name: 'Rohan', phone: '646-555-0119' },
      { label: 'Client', name: 'Sristi', phone: null },
    ])
    expect(d.contacts[0]).toEqual({ name: 'Sristi', role: 'Client · Taptap Send', phone: null, email: 's@x.com' })
    expect(d.contacts[1]).toMatchObject({ name: 'Venue Mgr', role: 'Manager · Hall', phone: '212-555-0100' })
    expect(d.generalCall).toBe('9:00 AM')
    expect(d.crewCall).toBe('7:30 AM')
    expect(d.shootingCall).toBe('11:30 AM')
    expect(d.dateLabel).toBe('Tuesday, October 13, 2026')
    expect(d.crew).toHaveLength(1)                                   // the empty department is dropped
    expect(d.crew[0]!.members.map(m => m.role)).toEqual(['Producer', '1st AD', 'PA'])
    expect(d.schedule[1]).toEqual({ time: '11:30 AM–1:00 PM', label: 'Sc 1 — Kitchen', notes: null, where: 'Kitchen', who: 'A, B, C, D +2 more' })
    expect(d.hospital?.distance).toBeNull()                         // 0 km isn't shown
    expect(d.weather?.summary).toBe('Partly cloudy · 71° / 55°')
    expect(d.footerLeft).toBe('Daadi · Day 1 of 2 · Sent Oct 12, 2026')
    expect(d.isDraft).toBe(false)
  })

  it('leaves the client off when they have no contact details (like the crew page)', () => {
    const d = buildCallSheetPdfData(base({ project: { name: 'Daadi', client: { name: 'Secret Brand', contactName: null, contactEmail: null, contactPhone: null } } }), { dayLabel: null })
    expect(d.clientName).toBeNull()
    expect(d.contacts.some(c => (c.role ?? '').includes('Secret Brand'))).toBe(false)
    expect(d.keyContacts.some(c => c.label === 'Client')).toBe(false)
  })

  it('copes with a bare draft (no client, weather, crew or schedule)', () => {
    const d = buildCallSheetPdfData(base({
      status: 'DRAFT', sentAt: null, crew: [], talent: [], schedule: [], otherContacts: [], pointOfContact: null, weather: null, hospitalInfo: null,
      project: { name: 'Daadi', client: null }, locationName: null, locationAddress: null, locationNotes: null,
    }), { dayLabel: null })
    expect(d).toMatchObject({ isDraft: true, keyContacts: [], contacts: [], crew: [], schedule: [], weather: null, hospital: null, crewCall: null, shootingCall: null, footerLeft: 'Daadi · Draft' })
  })
})
