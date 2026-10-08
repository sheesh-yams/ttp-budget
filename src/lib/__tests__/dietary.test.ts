import { normalizeDietaryTags, summarizeDietary, hasDietary, dietaryLabel } from '@/lib/dietary'

describe('dietary', () => {
  it('keeps known tags only, de-duplicated, in the standard order', () => {
    expect(normalizeDietaryTags(['NUT_ALLERGY', 'VEGAN', 'VEGAN', 'MADE_UP', 3])).toEqual(['VEGAN', 'NUT_ALLERGY'])
    expect(normalizeDietaryTags('VEGAN')).toEqual([])
  })
  it('summarises counts for catering, one per person per tag', () => {
    expect(summarizeDietary([
      { tags: ['VEGETARIAN'], notes: null },
      { tags: ['VEGETARIAN', 'NUT_ALLERGY', 'VEGETARIAN'], notes: 'EpiPen' },
      { tags: [], notes: 'No cilantro' },
      { tags: [], notes: '  ' },
    ])).toBe('2 Vegetarian · 1 Nut allergy · 1 other note')
    expect(summarizeDietary([])).toBe('')
  })
  it('hasDietary / labels', () => {
    expect(hasDietary({ tags: [], notes: ' ' })).toBe(false)
    expect(hasDietary({ tags: ['HALAL'], notes: null })).toBe(true)
    expect(dietaryLabel('SHELLFISH')).toBe('Shellfish allergy')
  })
})
