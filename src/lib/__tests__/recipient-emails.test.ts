import { normalizeRecipientEmails, buildProposalSendList, MAX_RECIPIENTS } from '@/lib/email'

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

describe('buildProposalSendList', () => {
  it('puts the client email first, then recipients, deduped', () => {
    expect(buildProposalSendList('Client@X.com', ['extra@x.com', 'client@x.com']))
      .toEqual(['client@x.com', 'extra@x.com'])
  })

  it('works with no client email (manual-send / mark-as-sent case)', () => {
    expect(buildProposalSendList(null, ['a@b.com'])).toEqual(['a@b.com'])
  })

  it('returns empty when nothing is available', () => {
    expect(buildProposalSendList(null, [])).toEqual([])
    expect(buildProposalSendList('', undefined)).toEqual([])
  })
})
