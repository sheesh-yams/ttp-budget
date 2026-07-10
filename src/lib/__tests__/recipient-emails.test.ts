import { normalizeRecipientEmails, buildCcList, MAX_RECIPIENTS } from '@/lib/email'

describe('normalizeRecipientEmails', () => {
  it('trims, lowercases, and keeps only valid addresses', () => {
    expect(normalizeRecipientEmails(['  Foo@Bar.COM ', 'not-an-email', 'a@b.co']))
      .toEqual(['foo@bar.com', 'a@b.co'])
  })

  it('dedupes case-insensitively', () => {
    expect(normalizeRecipientEmails(['a@b.com', 'A@B.com', 'a@b.com'])).toEqual(['a@b.com'])
  })

  it('caps the number of recipients', () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 5 }, (_, i) => `user${i}@x.com`)
    expect(normalizeRecipientEmails(many)).toHaveLength(MAX_RECIPIENTS)
  })

  it('handles null/undefined and non-string junk', () => {
    expect(normalizeRecipientEmails(undefined)).toEqual([])
    expect(normalizeRecipientEmails(null)).toEqual([])
    // @ts-expect-error — exercising runtime robustness against bad input
    expect(normalizeRecipientEmails([123, '', 'ok@x.com'])).toEqual(['ok@x.com'])
  })
})

describe('buildCcList (sender + extra recipients, minus the To address)', () => {
  it('puts the sender first, then recipients, deduped', () => {
    expect(buildCcList('client@x.com', ['extra@x.com'], 'Me@Studio.com'))
      .toEqual(['me@studio.com', 'extra@x.com'])
  })

  it('removes the To (client) address so it is never both To and CC', () => {
    expect(buildCcList('Client@X.com', ['client@x.com', 'extra@x.com'], 'me@studio.com'))
      .toEqual(['me@studio.com', 'extra@x.com'])
  })

  it('works with just the sender (no extra recipients)', () => {
    expect(buildCcList('client@x.com', [], 'me@studio.com')).toEqual(['me@studio.com'])
    expect(buildCcList('client@x.com', undefined, 'me@studio.com')).toEqual(['me@studio.com'])
  })

  it('returns empty when there is no sender and no recipients', () => {
    expect(buildCcList('client@x.com', [], null)).toEqual([])
  })

  it('does not duplicate the sender if also listed as a recipient', () => {
    expect(buildCcList('client@x.com', ['me@studio.com'], 'me@studio.com')).toEqual(['me@studio.com'])
  })
})
