import { mergeTemplateSections } from '@/lib/contract-templates'

const b = (id: string) => ({ id, title: id.toUpperCase(), body: `${id} body` })

describe('mergeTemplateSections', () => {
  it('adds only blocks not already on the memo/proposal, in template order', () => {
    const out = mergeTemplateSections(['parties', null, 'payment'], [b('parties'), b('sow-social'), b('payment'), b('usage')])
    expect(out.map(x => x.id)).toEqual(['sow-social', 'usage'])
  })
  it('ignores ad-hoc sections (no source block) and adds everything to an empty one', () => {
    expect(mergeTemplateSections([null, null], [b('a'), b('b')]).map(x => x.id)).toEqual(['a', 'b'])
    expect(mergeTemplateSections([], [b('a')]).map(x => x.id)).toEqual(['a'])
  })
  it('never adds the same block twice', () => {
    expect(mergeTemplateSections([], [b('a'), b('a'), b('b')]).map(x => x.id)).toEqual(['a', 'b'])
  })
  it('returns nothing when everything is already there', () => {
    expect(mergeTemplateSections(['a', 'b'], [b('b'), b('a')])).toEqual([])
  })
})
