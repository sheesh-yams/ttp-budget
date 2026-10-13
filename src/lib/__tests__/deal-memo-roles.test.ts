import { budgetRoleFor } from '@/lib/deal-memo-roles'

const memos = [
  { contactId: 'dot', roleLabel: 'Lighting Asst', position: 'Key Grip' },
  { contactId: 'sam', roleLabel: 'Gaffer', position: 'Gaffer' },
]

describe('budgetRoleFor', () => {
  it('a member renamed by their awarded memo counts as the budget line', () => {
    expect(budgetRoleFor({ contactId: 'dot', role: 'Key Grip' }, memos)).toBe('Lighting Asst')
  })
  it('someone moved to another role by hand counts as that role', () => {
    expect(budgetRoleFor({ contactId: 'dot', role: 'Best Boy' }, memos)).toBe('Best Boy')
  })
  it('a different person in that role, or no contact, keeps their own role', () => {
    expect(budgetRoleFor({ contactId: 'sam', role: 'Key Grip' }, memos)).toBe('Key Grip')
    expect(budgetRoleFor({ contactId: null, role: 'Key Grip' }, memos)).toBe('Key Grip')
  })
  it('a blank memo role falls back to the budget line', () => {
    expect(budgetRoleFor({ contactId: 'x', role: 'PA' }, [{ contactId: 'x', roleLabel: 'PA', position: '  ' }])).toBe('PA')
  })
})
