import { dealMemoTermsKey, isCancelConfirmation, normEmail, vendorViewChanged } from '../deal-memo-signing'
import type { VendorDealMemo } from '../deal-memo-vendor-view'

describe('isCancelConfirmation', () => {
  it('accepts CANCEL, ignoring case and surrounding spaces', () => {
    expect(isCancelConfirmation('CANCEL')).toBe(true)
    expect(isCancelConfirmation(' cancel ')).toBe(true)
  })
  it('rejects anything else', () => {
    for (const v of ['', 'CANCELL', 'cancel it', 'yes', null, undefined, 1]) expect(isCancelConfirmation(v)).toBe(false)
  })
})

describe('normEmail', () => {
  it('trims and lowercases', () => expect(normEmail('  Ashish@TheThirdPlaceCreative.co ')).toBe('ashish@thethirdplacecreative.co'))
})

describe('vendorViewChanged', () => {
  const base: VendorDealMemo = {
    position: 'Associate Producer', vendorName: 'A', projectName: 'P', workspaceName: 'W',
    startDate: 'October 10, 2026', endDate: null, days: 4, workDayHours: 10,
    fees: [{ id: 'f1', label: 'Day rate', rateCents: 75000, unit: 'DAY', quantity: 4, expectedCents: 300000, termsHtml: '<p>x</p>', termsText: 'x' }],
    expectedTotalCents: 300000,
    sections: [{ id: 's1', title: 'Payment', bodyHtml: '<p>Net 30</p>', bodyText: 'Net 30' }],
  }
  it('same terms → unchanged (ids and HTML rendering don\'t matter)', () => {
    const resent = { ...base, fees: [{ ...base.fees[0], id: 'other', termsHtml: '<p>x </p>' }] }
    expect(vendorViewChanged(base, JSON.parse(JSON.stringify(resent)))).toBe(false)
  })
  it('a rate change → changed', () => {
    expect(vendorViewChanged({ ...base, fees: [{ ...base.fees[0], rateCents: 80000 }] }, base)).toBe(true)
  })
  it('a terms text change → changed', () => {
    expect(vendorViewChanged({ ...base, sections: [{ ...base.sections[0], bodyText: 'Net 15' }] }, base)).toBe(true)
  })
  it('nothing sent yet → changed', () => {
    expect(vendorViewChanged(base, null)).toBe(true)
  })
})

describe('dealMemoTermsKey', () => {
  const base = {
    position: 'Gaffer', startDate: new Date('2026-10-01T00:00:00Z'), endDate: null, days: 2,
    workDayHours: 10, otMultiplier: 1.5, doubleTimeAfterHours: 14, doubleTimeMultiplier: 2, productionZoneMiles: 30,
    fees:     [{ label: 'Day rate', rateCents: 65000, unit: 'DAY', quantity: 2, termsText: 'For {{project.name}}' }],
    sections: [{ title: 'Payment', body: 'Between {{workspace.name}} and {{vendor.name}}.' }],
  }

  it('is stable across Decimal-like and number inputs', () => {
    expect(dealMemoTermsKey({ ...base, days: '2', otMultiplier: { toString: () => '1.5' } })).toBe(dealMemoTermsKey(base))
  })

  it('changes when a rate, a section or a work-day term changes', () => {
    const k = dealMemoTermsKey(base)
    expect(dealMemoTermsKey({ ...base, fees: [{ ...base.fees[0], rateCents: 70000 }] })).not.toBe(k)
    expect(dealMemoTermsKey({ ...base, sections: [{ title: 'Payment', body: 'Net 30.' }] })).not.toBe(k)
    expect(dealMemoTermsKey({ ...base, otMultiplier: 2 })).not.toBe(k)
  })

  it('ignores zero-rate fees the vendor never sees', () => {
    const extra = { label: 'Kit', rateCents: 0, unit: 'DAY', quantity: 1, termsText: null }
    expect(dealMemoTermsKey({ ...base, fees: [...base.fees, extra] })).toBe(dealMemoTermsKey(base))
  })
})
