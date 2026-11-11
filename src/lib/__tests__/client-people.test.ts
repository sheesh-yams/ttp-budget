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
