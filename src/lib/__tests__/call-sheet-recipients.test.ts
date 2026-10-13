import { peopleOnSheet, personKeyFor, sendSnapshot, changesSince, confirmationStillValid, recipientStatus, matchRecipients } from '@/lib/call-sheet-recipients'

describe('peopleOnSheet', () => {
  const crew = [
    { dept: 'Camera', members: [
      { name: 'Ali', role: 'DP', callTime: '07:00', email: 'Ali@X.com', contactId: 'c1' },
      { name: '', role: 'AC', callTime: '07:30' },                                  // empty row → skipped
      { name: 'Rohita', role: 'AC', callTime: '07:30' },                            // no email, not linked
    ] },
    { dept: 'Grip', members: [{ name: 'Ali', role: 'Gaffer', callTime: '06:30', contactId: 'c1' }] }, // same person
  ]
  const talent = [{ name: 'Chef Vikas', role: 'Host', callTime: '09:00', email: 'vikas@x.com' }]
  const others = [{ name: 'Venue', role: 'Manager', company: 'Hall', email: ' venue@x.com ' }]

  it('lists people once, in sheet order, with identity and position', () => {
    const p = peopleOnSheet(crew, talent, others)
    expect(p.map(x => x.name)).toEqual(['Ali', 'Rohita', 'Chef Vikas', 'Venue'])
    expect(p[0]).toMatchObject({ personKey: 'contact:c1', callTime: '06:30', email: 'Ali@X.com', group: 'CREW' })
    expect(p[1]).toMatchObject({ personKey: null, ref: 'row:CREW:0:2', email: null, rowRef: { group: 'CREW', dept: 0, member: 2 } })
    expect(p[2]).toMatchObject({ personKey: 'email:vikas@x.com|chef vikas', group: 'TALENT', role: 'Host' })
    expect(p[3]).toMatchObject({ personKey: 'email:venue@x.com|venue', email: 'venue@x.com', callTime: null, role: 'Manager · Hall' })
  })

  it('keys by contact first, then lowercased email', () => {
    expect(personKeyFor('c9', 'a@b.com')).toBe('contact:c9')
    expect(personKeyFor(null, ' A@B.com ', ' Jo  Smith')).toBe('email:a@b.com|jo smith')
    expect(personKeyFor(null, '')).toBeNull()
  })
})

describe('people sharing an email, and the same person twice', () => {
  it('keeps two people who share an address apart (an agent\'s email)', () => {
    const p = peopleOnSheet([], [
      { name: 'Ana', role: 'Lead', callTime: '08:00', email: 'agent@x.com' },
      { name: 'Ben', role: 'Support', callTime: '10:00', email: 'agent@x.com' },
    ], [])
    expect(p.map(x => `${x.name}:${x.callTime}`)).toEqual(['Ana:08:00', 'Ben:10:00'])
  })
  it('merges a linked and an unlinked row for the same person', () => {
    const p = peopleOnSheet(
      [{ dept: 'Camera', members: [{ name: 'Ali', role: 'DP', callTime: '07:00', email: 'ali@x.com', contactId: 'c1' }] }],
      [], [{ name: 'ali', role: 'Owner', email: 'ALI@x.com' }],
    )
    expect(p).toHaveLength(1)
    expect(p[0]!.personKey).toBe('contact:c1')
  })
})

describe('matchRecipients', () => {
  const row = (id: string, personKey: string, email: string, name: string, contactId: string | null = null, group = 'CREW') => ({ id, personKey, email, name, contactId, group })
  it('keeps someone\'s row when they get linked to the Rolodex or their email is fixed', () => {
    const people = peopleOnSheet([{ dept: 'Camera', members: [
      { name: 'Ali', role: 'DP', callTime: '07:00', email: 'ali@x.com', contactId: 'c1' },  // now linked
      { name: 'Rohita', role: 'AC', callTime: '07:00', email: 'rohita@fixed.com' },          // typo fixed
      { name: 'New Person', role: 'PA', callTime: '07:00', email: 'new@x.com' },
    ] }], [], [])
    const rows = [row('r1', 'email:ali@x.com|ali', 'ali@x.com', 'Ali'), row('r2', 'email:rohita@typo.com|rohita', 'rohita@typo.com', 'Rohita')]
    const m = matchRecipients(people, rows)
    expect(m.get(people[0]!.ref)?.id).toBe('r1')
    expect(m.get(people[1]!.ref)?.id).toBe('r2')
    expect(m.has(people[2]!.ref)).toBe(false)
  })
  it('never gives one row to two people', () => {
    const people = peopleOnSheet([], [
      { name: 'Ana', role: 'Lead', callTime: '08:00', email: 'agent@x.com' },
      { name: 'Ben', role: 'Support', callTime: '10:00', email: 'agent@x.com' },
    ], [])
    const m = matchRecipients(people, [row('r1', 'email:agent@x.com|ben', 'agent@x.com', 'Ben', null, 'TALENT')])
    expect(m.get(people[1]!.ref)?.id).toBe('r1')
    expect(m.has(people[0]!.ref)).toBe(false)
  })
})

describe('changes and confirmations', () => {
  const sheet = { shootDate: '2026-10-13T00:00:00.000Z', generalCall: '07:00', locationName: 'Studio', locationAddress: '1 Main St' }
  const before = sendSnapshot(sheet, { callTime: '07:30' })

  it('snapshots what was sent', () => {
    expect(before).toEqual({ date: '2026-10-13', generalCall: '07:00', callTime: '07:30', location: 'Studio — 1 Main St' })
  })

  it('lists what changed, and nothing when nothing did', () => {
    expect(changesSince(before, before)).toEqual([])
    expect(changesSince(null, before)).toEqual([])
    const now = sendSnapshot({ ...sheet, generalCall: '06:30', locationName: 'Barn', shootDate: '2026-10-14' }, { callTime: '07:00' })
    expect(changesSince(before, now)).toEqual([
      'Date: Tue, Oct 13 → Wed, Oct 14',
      'Your call: 7:30 AM → 7:00 AM',
      'General call: 7:00 AM → 6:30 AM',
      'Location: Barn — 1 Main St',
    ])
  })

  it('resets a confirmation when their call, the date or the place changes', () => {
    expect(confirmationStillValid(before, before)).toBe(true)
    expect(confirmationStillValid(before, { ...before, callTime: '08:00' })).toBe(false)
    expect(confirmationStillValid(before, { ...before, location: 'Elsewhere' })).toBe(false)
    expect(confirmationStillValid(before, { ...before, date: '2026-10-20' })).toBe(false)
    // Someone with their own call time isn't affected by a general call change…
    expect(confirmationStillValid(before, { ...before, generalCall: '06:00' })).toBe(true)
    // …someone without one is.
    const noCall = { ...before, callTime: null }
    expect(confirmationStillValid(noCall, { ...noCall, generalCall: '06:00' })).toBe(false)
  })

  it('derives a status', () => {
    const t = new Date()
    expect(recipientStatus(null)).toBe('NOT_SENT')
    expect(recipientStatus({ lastSentAt: t, firstViewedAt: null, confirmedAt: null })).toBe('SENT')
    expect(recipientStatus({ lastSentAt: t, firstViewedAt: t, confirmedAt: null })).toBe('OPENED')
    expect(recipientStatus({ lastSentAt: t, firstViewedAt: null, confirmedAt: t })).toBe('CONFIRMED')
  })
})
