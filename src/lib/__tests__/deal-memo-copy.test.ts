import { buildDealMemoCopy, type CopySource } from '@/lib/deal-memo-copy'

const start = new Date('2026-11-10T00:00:00Z')
const end   = new Date('2026-11-12T00:00:00Z')

const source = (o: Partial<CopySource> = {}): CopySource => ({
  projectId: 'p1', lineItemId: 'line-a', roleLabel: 'Production Assistant', position: 'Set PA',
  days: '3', startDate: start, endDate: end,
  workDayHours: 12, otMultiplier: '1.5', doubleTimeAfterHours: 14, doubleTimeMultiplier: '2', productionZoneMiles: 50,
  fees: [
    { kind: 'OVERTIME', label: 'Overtime', rateCents: 4_875, unit: 'HOUR', quantity: '0', termsText: 'After {{dealMemo.workDayHours}}h', budgetLineItemId: null, isAutoRate: true, order: 1 },
    { kind: 'DAY_RATE', label: 'Day Rate', rateCents: 39_000, unit: 'DAY', quantity: '3', termsText: null, budgetLineItemId: 'line-a', isAutoRate: false, order: 0 },
    { kind: 'KIT', label: 'Kit', rateCents: 5_000, unit: 'DAY', quantity: '2', termsText: null, budgetLineItemId: null, isAutoRate: false, order: 2 },
    { kind: 'CUSTOM', label: 'Prep', rateCents: 20_000, unit: 'FLAT', quantity: '1', termsText: null, budgetLineItemId: null, isAutoRate: false, order: 3 },
  ],
  sections: [
    { title: 'Payment', body: 'Net 30, edited', sourceBlockId: 'b1', editedFromSource: true, orderIndex: 4 },
    { title: 'Scope', body: 'Hand-written scope', sourceBlockId: null, editedFromSource: false, orderIndex: 2 },
  ],
  ...o,
})

const target = (o: Partial<Parameters<typeof buildDealMemoCopy>[1]> = {}) => ({
  projectId: 'p1', line: { id: 'line-a', quantity: 3, quantityFormula: null } as { id: string; quantity: number; quantityFormula: string | null } | null,
  roleLabel: 'Production Assistant',
  project: { shootStartDate: new Date('2027-01-05T00:00:00Z'), shootEndDate: new Date('2027-01-06T00:00:00Z') },
  ...o,
})

describe('buildDealMemoCopy', () => {
  it('same project, same role: keeps days, dates, title, work day and fee mappings', () => {
    const c = buildDealMemoCopy(source(), target())
    expect(c.position).toBe('Set PA')
    expect(c.days).toBe(3)
    expect(c.startDate).toBe(start)
    expect(c.endDate).toBe(end)
    expect([c.workDayHours, c.otMultiplier, c.doubleTimeAfterHours, c.doubleTimeMultiplier, c.productionZoneMiles]).toEqual([12, 1.5, 14, 2, 50])
    expect(c.fees.map(f => [f.kind, f.rateCents, f.quantity, f.budgetLineItemId, f.isAutoRate, f.order])).toEqual([
      ['DAY_RATE', 39_000, 3, 'line-a', false, 0],
      ['OVERTIME', 4_875, 0, null, true, 1],
      ['KIT', 5_000, 2, null, false, 2],
      ['CUSTOM', 20_000, 1, null, false, 3],
    ])
    expect(c.fees[1].termsText).toBe('After {{dealMemo.workDayHours}}h')
  })

  it('another project: line days and shoot dates; only fees that ran for the memo days follow; mappings cleared', () => {
    const c = buildDealMemoCopy(source(), target({ projectId: 'p2', line: { id: 'line-z', quantity: 10, quantityFormula: '2x5' } }))
    expect(c.days).toBe(5)
    expect(c.startDate?.toISOString()).toBe('2027-01-05T00:00:00.000Z')
    expect(c.fees.find(f => f.kind === 'DAY_RATE')?.quantity).toBe(5)  // was 3 = memo days
    expect(c.fees.find(f => f.kind === 'KIT')?.quantity).toBe(2)       // 2 of 3 days — kept
    expect(c.fees.find(f => f.kind === 'CUSTOM')?.quantity).toBe(1)    // flat — kept
    expect(c.fees.every(f => f.budgetLineItemId === null)).toBe(true)
  })

  it('another project with no line keeps the source days', () => {
    const c = buildDealMemoCopy(source(), target({ projectId: 'p2', line: null }))
    expect(c.days).toBe(3)
    expect(c.fees.find(f => f.kind === 'DAY_RATE')?.quantity).toBe(3)
  })

  it('another line on the same project: its own days, and fees pinned to the source line are reset', () => {
    const src = source()
    src.fees.push({ kind: 'CUSTOM', label: 'Truck', rateCents: 10_000, unit: 'DAY', quantity: '3', termsText: null, budgetLineItemId: 'line-truck', isAutoRate: false, order: 4 })
    const c = buildDealMemoCopy(src, target({ line: { id: 'line-b', quantity: 5, quantityFormula: '1x5' }, roleLabel: 'Grip' }))
    expect(c.days).toBe(5)
    expect(c.startDate).toBe(start)  // same shoot
    expect(c.fees.find(f => f.kind === 'DAY_RATE')).toMatchObject({ quantity: 5, budgetLineItemId: null })
    expect(c.fees.find(f => f.label === 'Truck')?.budgetLineItemId).toBe('line-truck')  // another line, kept
    // Off budget on the same project keeps the source days.
    expect(buildDealMemoCopy(src, target({ line: null, roleLabel: 'Grip' })).days).toBe(3)
  })

  it('a different role takes its own title; the same role in any case keeps the custom one', () => {
    expect(buildDealMemoCopy(source(), target({ roleLabel: 'Grip' })).position).toBe('Grip')
    expect(buildDealMemoCopy(source(), target({ roleLabel: 'Grip' })).roleLabel).toBe('Grip')
    expect(buildDealMemoCopy(source(), target({ roleLabel: ' production assistant ' })).position).toBe('Set PA')
    expect(buildDealMemoCopy(source(), target({ roleLabel: '' })).roleLabel).toBe('Production Assistant')
  })

  it('sections come across verbatim, re-indexed in order', () => {
    expect(buildDealMemoCopy(source(), target()).sections).toEqual([
      { title: 'Scope', body: 'Hand-written scope', sourceBlockId: null, editedFromSource: false, orderIndex: 0 },
      { title: 'Payment', body: 'Net 30, edited', sourceBlockId: 'b1', editedFromSource: true, orderIndex: 1 },
    ])
  })

  it('never carries the person, notes, status or vendor-link fields', () => {
    const c = buildDealMemoCopy(source(), target()) as Record<string, unknown>
    for (const k of ['contactId', 'internalNotes', 'status', 'publicToken', 'sentAt', 'signedAt', 'sentSnapshot', 'projectMemberId', 'awardedAt']) {
      expect(k in c).toBe(false)
    }
  })
})
