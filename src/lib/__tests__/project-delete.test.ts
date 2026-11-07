import { deleteNameMatches, describeDeletePreview } from '@/lib/project-delete'

describe('project delete', () => {
  it('the typed name must match, ignoring case and outer spaces', () => {
    expect(deleteNameMatches('  project test 2 ', 'Project Test 2')).toBe(true)
    expect(deleteNameMatches('Project Test', 'Project Test 2')).toBe(false)
    expect(deleteNameMatches('', '')).toBe(false)
    expect(deleteNameMatches('   ', 'x')).toBe(false)
  })
  it('lists only what exists', () => {
    const base = { name: 'X', budgets: 1, proposals: 5, invoices: 1, paidCents: 0, callSheets: 0, dealMemos: 2, receipts: 0 }
    expect(describeDeletePreview(base)).toBe('1 budget · 5 proposals · 1 invoice · 2 deal memos')
    expect(describeDeletePreview({ ...base, budgets: 0, proposals: 0, invoices: 0, dealMemos: 0 })).toBe('No budgets, proposals or invoices')
  })
})
