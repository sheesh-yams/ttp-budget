import { proposalTo, storedToEmail } from '@/lib/proposal-recipients'

describe('proposal To address', () => {
  it('blank or the client contact email stores null (follows the client)', () => {
    expect(storedToEmail('', 'a@client.com')).toEqual({ value: null, error: null })
    expect(storedToEmail('  A@Client.com ', 'a@client.com')).toEqual({ value: null, error: null })
    expect(storedToEmail(undefined, null)).toEqual({ value: null, error: null })
  })
  it('a different address is stored normalised', () => {
    expect(storedToEmail(' Boss@Client.com ', 'a@client.com')).toEqual({ value: 'boss@client.com', error: null })
    expect(storedToEmail('boss@client.com', null)).toEqual({ value: 'boss@client.com', error: null })
  })
  it('rejects something that is not an email', () => {
    expect(storedToEmail('not an email', 'a@client.com').error).toMatch(/isn’t a valid To/)
  })
  it('sends to the saved To, else the client contact, else nowhere', () => {
    expect(proposalTo('boss@client.com', 'a@client.com')).toBe('boss@client.com')
    expect(proposalTo(null, 'a@client.com')).toBe('a@client.com')
    expect(proposalTo(null, null)).toBeNull()
  })
})
