import { invoiceSendRecipients, invoiceRecipientDefaults, proposalCcDefaults, invoiceDueDays, parseEmailList, normalizeEmails } from '@/lib/client-recipients'

describe('invoiceRecipientDefaults', () => {
  const client = { contactEmail: 'Main@Brand.com', invoiceCcEmails: ['ap@brand.com', 'AP@brand.com'] }
  it('billing contact: To billing, main copied, plus the standard CC (deduped)', () => {
    expect(invoiceRecipientDefaults(client, [{ email: 'Billing@Brand.com ', roles: ['BILLING'] }])).toEqual({
      to: 'billing@brand.com', cc: ['main@brand.com', 'ap@brand.com'],
    })
  })
  it('no billing contact: To main, standard CC only', () => {
    expect(invoiceRecipientDefaults(client, [{ email: 'x@brand.com', roles: [] }])).toEqual({ to: 'main@brand.com', cc: ['ap@brand.com'] })
  })
  it('a billing contact without an email is ignored', () => {
    expect(invoiceRecipientDefaults(client, [{ email: null, roles: ['BILLING'] }]).to).toBe('main@brand.com')
  })
  it('never repeats the To in CC', () => {
    expect(invoiceRecipientDefaults({ contactEmail: 'a@b.co', invoiceCcEmails: ['A@b.co', 'c@b.co'] }, []).cc).toEqual(['c@b.co'])
    expect(invoiceRecipientDefaults({ contactEmail: 'a@b.co', invoiceCcEmails: ['bill@b.co'] }, [{ email: 'bill@b.co', roles: ['BILLING'] }]).cc).toEqual(['a@b.co'])
  })
  it('no main contact email: empty To, billing still works', () => {
    expect(invoiceRecipientDefaults({ contactEmail: null }, [])).toEqual({ to: '', cc: [] })
    expect(invoiceRecipientDefaults({ contactEmail: null }, [{ email: 'b@x.co', roles: ['BILLING'] }])).toEqual({ to: 'b@x.co', cc: [] })
  })
})

describe('proposalCcDefaults', () => {
  it('drops the main contact and bad entries', () => {
    expect(proposalCcDefaults({ contactEmail: 'm@x.co', proposalCcEmails: ['M@x.co', 'p@x.co', 'nope'] })).toEqual(['p@x.co'])
  })
})

describe('invoiceDueDays', () => {
  it('client terms win, 0 included; else the workspace default', () => {
    expect(invoiceDueDays({ paymentTermsDays: 45 }, 30)).toBe(45)
    expect(invoiceDueDays({ paymentTermsDays: 0 }, 30)).toBe(0)
    expect(invoiceDueDays({ paymentTermsDays: null }, 30)).toBe(30)
    expect(invoiceDueDays(null, 14)).toBe(14)
  })
})

describe('parseEmailList / normalizeEmails', () => {
  it('splits on commas, spaces and newlines; reports invalid entries', () => {
    expect(parseEmailList('a@x.co, B@x.co\nnot-an-email; a@x.co')).toEqual({ emails: ['a@x.co', 'b@x.co'], invalid: ['not-an-email'] })
  })
  it('caps at 10', () => {
    expect(normalizeEmails(Array.from({ length: 12 }, (_, i) => `u${i}@x.co`))).toHaveLength(10)
  })
})

describe('invoiceSendRecipients', () => {
  const client   = { contactEmail: 'pm@x.co', invoiceCcEmails: ['ap-inbox@x.co'] }
  const billing  = [{ email: 'ap@x.co', roles: ['BILLING'] }]
  it('never sent: the client defaults', () => {
    expect(invoiceSendRecipients({ client, contacts: billing, sentAt: null, savedCc: [], withDefaults: true }))
      .toEqual({ to: 'ap@x.co', cc: ['pm@x.co', 'ap-inbox@x.co'] })
  })
  it('resend keeps the billing To and the saved CC (the To was stripped from it at send)', () => {
    expect(invoiceSendRecipients({ client, contacts: billing, sentAt: new Date(), savedCc: ['pm@x.co'], withDefaults: true }))
      .toEqual({ to: 'ap@x.co', cc: ['pm@x.co'] })
  })
  it('sent before a billing contact existed: billing To, main contact still copied', () => {
    expect(invoiceSendRecipients({ client, contacts: billing, sentAt: new Date(), savedCc: [], withDefaults: true }))
      .toEqual({ to: 'ap@x.co', cc: ['pm@x.co'] })
  })
  it('no billing contact: unchanged behaviour on resend', () => {
    expect(invoiceSendRecipients({ client, contacts: [], sentAt: new Date(), savedCc: ['other@x.co'], withDefaults: true }))
      .toEqual({ to: 'pm@x.co', cc: ['other@x.co'] })
  })
  it('without send permission: no billing/CC defaults leak', () => {
    expect(invoiceSendRecipients({ client, contacts: billing, sentAt: null, savedCc: [], withDefaults: false }))
      .toEqual({ to: 'pm@x.co', cc: [] })
  })
})

describe('invoiceRecipientDefaults with several Billing people and a chosen bill-to', () => {
  const client = { contactEmail: 'pm@x.co', invoiceCcEmails: ['inbox@x.co'] }
  const people = [{ email: 'ap1@x.co', roles: ['BILLING'] }, { email: 'ap2@x.co', roles: ['BILLING', 'PROPOSALS'] }, { email: 'p@x.co', roles: ['ON_SET'] }]
  it('To the first Billing person; the other Billing people, main and standard CC copied', () => {
    expect(invoiceRecipientDefaults(client, people)).toEqual({ to: 'ap1@x.co', cc: ['ap2@x.co', 'pm@x.co', 'inbox@x.co'] })
  })
  it('a chosen bill-to wins', () => {
    expect(invoiceRecipientDefaults(client, people, 'AP2@x.co')).toEqual({ to: 'ap2@x.co', cc: ['ap1@x.co', 'pm@x.co', 'inbox@x.co'] })
  })
})
