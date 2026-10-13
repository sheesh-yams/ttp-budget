import { planTeamReconcile } from '@/lib/proposal-won'

const roles = (...r: [string, number][]) => new Map(r.map(([role, count]) => [role, { dept: 'G&E', count, rateCents: 50000, unit: 'DAY' }]))

describe('planTeamReconcile', () => {
  it('keeps the old rules: placeholders for missing slots, flag or delete roles that left', () => {
    const plan = planTeamReconcile(roles(['Gaffer', 1], ['Lighting Asst', 2]), [
      { id: 'm1', name: 'Dot', role: 'Gaffer' },
      { id: 'm2', name: 'Unassigned', role: 'Old Role' },
      { id: 'm3', name: 'Sam', role: 'Old Role' },
    ], new Map())
    expect(plan).toEqual({
      toDelete: ['m2'], toMismatch: ['m3'], toClearMismatch: ['m1'],
      placeholders: [{ role: 'Lighting Asst', dept: 'G&E', rateCents: 50000, unit: 'DAY' }, { role: 'Lighting Asst', dept: 'G&E', rateCents: 50000, unit: 'DAY' }],
    })
  })

  it('a deal memo re-allocation (Lighting Asst → Key Grip) still fills its budget slot', () => {
    const plan = planTeamReconcile(roles(['Lighting Asst', 1]), [
      { id: 'm1', name: 'Dot Perryman', role: 'Key Grip' },          // awarded via a memo for "Lighting Asst"
    ], new Map([['m1', 'Lighting Asst']]))
    expect(plan).toEqual({ toDelete: [], toMismatch: [], toClearMismatch: ['m1'], placeholders: [] })
  })

  it('falls back to the member\'s own role when the memo\'s budget line has gone', () => {
    const plan = planTeamReconcile(roles(['Key Grip', 1]), [{ id: 'm1', name: 'Dot', role: 'Key Grip' }], new Map([['m1', 'Lighting Asst']]))
    expect(plan.toClearMismatch).toEqual(['m1'])
    expect(plan.placeholders).toEqual([])
  })
})
