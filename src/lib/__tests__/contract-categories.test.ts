import { blockLabel, categoryNeedsReview, categoryTone } from '@/lib/contract-categories'

describe('contract block names and review colours', () => {
  it('the library name is the internal name when set, else the public title', () => {
    expect(blockLabel({ title: 'PROJECT & SCOPE OF WORK', internalName: 'SOW – Talent' })).toBe('SOW – Talent')
    expect(blockLabel({ title: 'PROJECT & SCOPE OF WORK', internalName: '   ' })).toBe('PROJECT & SCOPE OF WORK')
    expect(blockLabel({ title: 'PARTIES', internalName: null })).toBe('PARTIES')
  })
  it('SOW / Custom are blue, IP & usage rights orange, the rest unflagged', () => {
    expect(categoryTone('SOW')).toBe('blue')
    expect(categoryTone('CUSTOM')).toBe('blue')
    expect(categoryTone('IP_RIGHTS')).toBe('orange')
    expect(categoryTone('TERMS')).toBeNull()
    expect(categoryNeedsReview('IP_RIGHTS')).toBe(true)
    expect(categoryNeedsReview('PAYMENT')).toBe(false)
  })
})
