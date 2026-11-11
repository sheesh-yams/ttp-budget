import { defaultBillTo, defaultOnSet, defaultPreparedFor, greetingName, normalizeRoles, readSnapshot, readSnapshots, snapshotOf } from '@/lib/client-people'

const p = (id: string, o: Partial<{ email: string | null; isMain: boolean; roles: string[] }> = {}) =>
  ({ id, name: id.toUpperCase(), title: null, phone: null, email: `${id}@x.co`, isMain: false, roles: [], ...o })

describe('role defaults', () => {
  const main = p('main', { isMain: true })
  it('fall back to Main when no one has the role', () => {
    expect(defaultBillTo([main, p('a')])?.id).toBe('main')
    expect(defaultPreparedFor([main, p('a')]).map(x => x.id)).toEqual(['main'])
    expect(defaultOnSet([main, p('a')]).map(x => x.id)).toEqual(['main'])
  })
  it('use the tagged people', () => {
    const people = [main, p('ap', { roles: ['BILLING'] }), p('prod', { roles: ['ON_SET', 'PROPOSALS'] }), p('brand', { roles: ['PROPOSALS'] })]
    expect(defaultBillTo(people)?.id).toBe('ap')
    expect(defaultPreparedFor(people).map(x => x.id)).toEqual(['prod', 'brand'])
    expect(defaultOnSet(people).map(x => x.id)).toEqual(['prod'])
  })
  it('a Billing person without an email is skipped for bill-to', () => {
    expect(defaultBillTo([main, p('ap', { roles: ['BILLING'], email: null })])?.id).toBe('main')
  })
  it('no people at all', () => {
    expect(defaultBillTo([])).toBeNull()
    expect(defaultPreparedFor([])).toEqual([])
  })
})

describe('snapshots', () => {
  it('round-trip and tolerate junk', () => {
    const s = snapshotOf(p('a', { email: 'A@x.co' }))
    expect(readSnapshot(JSON.parse(JSON.stringify(s)))).toEqual({ ...s, email: 'a@x.co' })
    expect(readSnapshot(null)).toBeNull()
    expect(readSnapshot({ title: 'x' })).toBeNull()
    expect(readSnapshot({ email: 'only@x.co' })?.name).toBe('only@x.co')
  })
  it('null list = never chosen (legacy); junk entries dropped', () => {
    expect(readSnapshots(null)).toBeNull()
    expect(readSnapshots([{ name: 'A' }, 5, {}])).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('normalizeRoles drops unknowns and orders', () => {
    expect(normalizeRoles(['ON_SET', 'nope', 'BILLING', 'BILLING'])).toEqual(['BILLING', 'ON_SET'])
  })
  it('greetingName', () => {
    expect(greetingName({ name: 'Jamie Lee' }, 'Brand')).toBe('Jamie')
    expect(greetingName(null, 'Brand')).toBe('Brand')
  })
})

import { resolveBillTo } from '@/lib/client-people'

describe('resolveBillTo', () => {
  const main = p('main', { isMain: true })
  const ap = p('ap', { roles: ['BILLING'] })
  const stored = { contactId: 'ap', name: 'AP', title: null, email: 'old@x.co', phone: null }
  it('refreshes the stored person from the client (new email)', () => {
    const r = resolveBillTo(stored, [main, { ...ap, email: 'new@x.co' }], false)
    expect([r.person?.id, r.snapshot?.email]).toEqual(['ap', 'new@x.co'])
  })
  it('person gone, never sent: follows the role default', () => {
    expect(resolveBillTo(stored, [main], false).snapshot?.contactId).toBe('main')
  })
  it('person gone, already sent: keeps what it went to', () => {
    const r = resolveBillTo(stored, [main], true)
    expect([r.person, r.snapshot?.email]).toEqual([null, 'old@x.co'])
  })
  it('legacy invoice (nothing stored), never sent: role default', () => {
    expect(resolveBillTo(null, [main, ap], false).person?.id).toBe('ap')
  })
})

import { retargetPreparedFor } from '@/lib/client-people'

describe('retargetPreparedFor', () => {
  const emails: Record<string, string | null> = { jamie: 'jamie@x.co', sam: 'sam@x.co', pat: 'pat@x.co', nomail: null }
  const emailOf = (id: string) => emails[id] ?? null
  it('ticking someone adds only them; standard CC and typed addresses stay', () => {
    expect(retargetPreparedFor({ to: 'jamie@x.co', cc: ['pat@x.co', 'typed@else.co'], prev: ['jamie'], next: ['jamie', 'sam'], emailOf }))
      .toEqual({ to: 'jamie@x.co', cc: ['pat@x.co', 'typed@else.co', 'sam@x.co'] })
  })
  it('unticking removes only that person', () => {
    expect(retargetPreparedFor({ to: 'jamie@x.co', cc: ['sam@x.co', 'pat@x.co'], prev: ['jamie', 'sam'], next: ['jamie'], emailOf }))
      .toEqual({ to: 'jamie@x.co', cc: ['pat@x.co'] })
  })
  it('unticking the To moves the next picked person up', () => {
    expect(retargetPreparedFor({ to: 'jamie@x.co', cc: ['sam@x.co'], prev: ['jamie', 'sam'], next: ['sam'], emailOf }))
      .toEqual({ to: 'sam@x.co', cc: [] })
  })
  it('a To set to someone not picked stays put', () => {
    expect(retargetPreparedFor({ to: 'pat@x.co', cc: [], prev: [], next: ['jamie'], emailOf }))
      .toEqual({ to: 'pat@x.co', cc: ['jamie@x.co'] })
  })
  it('people without an email change nothing', () => {
    expect(retargetPreparedFor({ to: 'jamie@x.co', cc: [], prev: ['jamie'], next: ['jamie', 'nomail'], emailOf }))
      .toEqual({ to: 'jamie@x.co', cc: [] })
  })
})

import { readSheetContacts, sheetClientContacts } from '@/lib/client-people'

describe('call sheet client contacts — what the crew sees', () => {
  const stored = [
    { contactId: 'a', name: 'Jamie Lee', title: null, email: 'jamie@x.co', phone: '2125550111', hidePhone: true },
    { contactId: 'b', name: 'Sam Ko', title: null, email: 'sam@x.co', phone: '2125550122', hideEmail: true },
  ]
  it('keeps the flags (and the real email, for sending)', () => {
    expect(readSheetContacts(stored)?.map(c => [c.email, c.hidePhone, c.hideEmail])).toEqual([['jamie@x.co', true, false], ['sam@x.co', false, true]])
  })
  it('blanks hidden details on the crew copy', () => {
    expect(sheetClientContacts(stored, null).map(c => [c.name, c.phone, c.email])).toEqual([
      ['Jamie Lee', null, 'jamie@x.co'],
      ['Sam Ko', '2125550122', null],
    ])
  })
  it('legacy sheet: the main contact, shown in full', () => {
    expect(sheetClientContacts(null, { name: 'Co', contactName: 'Pat', contactEmail: 'P@x.co', contactPhone: '1' })[0])
      .toMatchObject({ name: 'Pat', email: 'p@x.co', phone: '1', hidePhone: false })
  })
})

describe('call sheet: a person named by their email', () => {
  it('a hidden email doesn’t leak through the name', () => {
    const [c] = sheetClientContacts([{ contactId: 'a', name: 'jamie@brand.co', title: null, email: 'jamie@brand.co', phone: '1', hideEmail: true }], null)
    expect([c.name, c.email, c.phone]).toEqual(['Client contact', null, '1'])
    const [t] = sheetClientContacts([{ contactId: 'a', name: 'jamie@brand.co', title: 'Producer', email: 'jamie@brand.co', phone: null, hideEmail: true }], null)
    expect(t.name).toBe('Producer')
  })
})
