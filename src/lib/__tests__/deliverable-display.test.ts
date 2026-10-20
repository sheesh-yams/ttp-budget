import { toScopeItems, deliverableBadges } from '@/lib/deliverable-display'
import { buildProposalContent } from '@/lib/proposal-snapshot'

describe('deliverable display', () => {
  it('scope items keep type and quantity (they used to be dropped)', () => {
    const items = toScopeItems([
      { title: 'Hero Video', description: 'Film', type: 'DELIVERABLE', quantity: 2 },
      { title: 'Casting', description: 'Couples', type: 'SERVICE', quantity: 1, sectionIds: ['s1'] },
      { title: 'Old row', description: 'No type or qty' },
    ])
    expect(items[0]).toEqual({ number: '01', title: 'Hero Video', description: 'Film', type: 'DELIVERABLE', quantity: 2 })
    expect(items[1]).toMatchObject({ number: '02', type: 'SERVICE', quantity: 1, sectionIds: ['s1'] })
    expect(items[2]).toEqual({ number: '03', title: 'Old row', description: 'No type or qty' })
  })

  it('the frozen proposal content carries them too', () => {
    const c = buildProposalContent({ overview: '', about: '', deliverables: [{ title: 'Photoshoot', description: '', type: 'DELIVERABLE', quantity: 2 }], milestones: [], totalCents: 0 })
    const scope = c.sections.find(s => s.type === 'scope') as { items: { quantity?: number }[] }
    expect(scope.items[0]!.quantity).toBe(2)
  })

  it('badges: × N only above 1; type only when not the default', () => {
    const n = { number: '01' }
    expect(deliverableBadges({ ...n, type: 'DELIVERABLE', quantity: 2 })).toEqual({ qty: '× 2', typeLabel: null })
    expect(deliverableBadges({ ...n, type: 'SERVICE', quantity: 1 })).toEqual({ qty: null, typeLabel: 'Service' })
    expect(deliverableBadges({ ...n, type: 'RAW_FOOTAGE' })).toEqual({ qty: null, typeLabel: 'Raw footage' })
    expect(deliverableBadges(n)).toEqual({ qty: null, typeLabel: null })
    expect(deliverableBadges({ ...n, type: 'NONSENSE', quantity: Number.NaN })).toEqual({ qty: null, typeLabel: null })
  })

  it('raw option deliverables frozen before this change (no number) get no badges', () => {
    expect(deliverableBadges({ type: 'SERVICE', quantity: 8 })).toEqual({ qty: null, typeLabel: null })
    // New sends build options through toScopeItems, so they do.
    expect(deliverableBadges(toScopeItems([{ title: 'A', description: '', type: 'SERVICE', quantity: 8 }])[0]!)).toEqual({ qty: '× 8', typeLabel: 'Service' })
  })
})
