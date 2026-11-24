import { primaryEmailOf } from '@/lib/account-email'

jest.mock('@/lib/db', () => ({ db: {} }))

describe('primaryEmailOf', () => {
  it('picks the primary address from a webhook payload, lowercased', () => {
    expect(primaryEmailOf({
      primary_email_address_id: 'b',
      email_addresses: [{ id: 'a', email_address: 'old@gmail.com' }, { id: 'b', email_address: 'Ashish@TheThirdPlaceCreative.co' }],
    })).toBe('ashish@thethirdplacecreative.co')
  })
  it('handles the API (camelCase) shape', () => {
    expect(primaryEmailOf({ primaryEmailAddressId: 'x', emailAddresses: [{ id: 'x', emailAddress: 'a@b.co' }] })).toBe('a@b.co')
  })
  it('falls back to the first address, or null with none', () => {
    expect(primaryEmailOf({ email_addresses: [{ id: 'a', email_address: 'first@x.co' }] })).toBe('first@x.co')
    expect(primaryEmailOf({ email_addresses: [] })).toBeNull()
  })
})
