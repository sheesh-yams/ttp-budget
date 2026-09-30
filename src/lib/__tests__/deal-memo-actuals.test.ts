import { planActualsFromDealMemos, type PlannerEntry, type PlannerLine, type PlannerMemo } from '../deal-memo-actuals'

const entry = (over: Partial<PlannerEntry> & { id: string }): PlannerEntry => ({
  lineItemId: null, isAdHoc: false, actualCents: 0, dealMemoSourced: false, dealMemoFeeId: null,
  amountUserOwned: false, ...over,
})

// Budget lines that currently exist in the sheet's phase.
const LINES: PlannerLine[] = [
  { id: 'line-video',    accountId: 'acc-camera',   contactId: null, category: 'CREW' },
  { id: 'line-wardrobe', accountId: 'acc-wardrobe', contactId: null, category: null },
  { id: 'line-pa',       accountId: 'acc-prod',     contactId: null, category: 'CREW' },
]

const videographer = (over: Partial<PlannerMemo> = {}): PlannerMemo => ({
  id: 'memo-1', status: 'CONFIRMED', lineItemId: 'line-video', roleLabel: 'Videographer',
  contactId: 'c-ana', contactName: 'Ana',
  fees: [
    { id: 'fee-day',  kind: 'DAY_RATE', label: 'Day Rate', rateCents: 200000, quantity: 2, budgetLineItemId: null },
    { id: 'fee-ot',   kind: 'OVERTIME', label: 'Overtime', rateCents: 30000,  quantity: 0, budgetLineItemId: null },
    { id: 'fee-diem', kind: 'PER_DIEM', label: 'Per Diem', rateCents: 7500,   quantity: 1, budgetLineItemId: null },
  ],
  ...over,
})

const sheet = () => [
  entry({ id: 'e-video',    lineItemId: 'line-video' }),
  entry({ id: 'e-wardrobe', lineItemId: 'line-wardrobe' }),
]

describe('planActualsFromDealMemos', () => {
  it('prefills the role line with day rate × days and gives per diem its own entry', () => {
    const plan = planActualsFromDealMemos([videographer()], sheet(), LINES)
    expect(plan.updates).toEqual([{ entryId: 'e-video', actualCents: 400000, vendorContactId: 'c-ana' }])
    expect(plan.creates).toEqual([{
      dealMemoFeeId: 'fee-diem', accountId: 'acc-camera', description: 'Videographer — Per Diem (Ana)', actualCents: 7500, vendorContactId: 'c-ana',
    }])
    expect(plan.clears).toEqual([])
  })

  it('ignores fees with no expected amount (overtime before the shoot)', () => {
    const plan = planActualsFromDealMemos([videographer()], sheet(), LINES)
    expect(plan.creates.some(c => c.dealMemoFeeId === 'fee-ot')).toBe(false)
  })

  it('sends a fee to the budget line it was pointed at (stylist kit → Wardrobe)', () => {
    const memo = videographer({
      fees: [{ id: 'fee-kit', kind: 'KIT', label: 'Kit', rateCents: 50000, quantity: 1, budgetLineItemId: 'line-wardrobe' }],
    })
    const plan = planActualsFromDealMemos([memo], sheet(), LINES)
    expect(plan.updates).toEqual([{ entryId: 'e-wardrobe', actualCents: 50000, vendorContactId: 'c-ana' }])
    expect(plan.creates).toEqual([])
  })

  it('defaults an unmapped kit fee to the person’s EQUIPMENT line', () => {
    const memo = videographer({
      fees: [{ id: 'fee-kit', kind: 'KIT', label: 'Kit', rateCents: 50000, quantity: 2, budgetLineItemId: null }],
    })
    const entries = [...sheet(), entry({ id: 'e-kit', lineItemId: 'line-kit' })]
    const plan = planActualsFromDealMemos([memo], entries, [...LINES, { id: 'line-kit', accountId: 'acc-cam', contactId: 'c-ana', category: 'EQUIPMENT' }])
    expect(plan.updates).toEqual([{ entryId: 'e-kit', actualCents: 100000, vendorContactId: 'c-ana' }])
  })

  it('never overwrites a number the user typed', () => {
    const entries = [entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 350000, dealMemoSourced: false })]
    const plan = planActualsFromDealMemos([videographer({ fees: [videographer().fees[0]] })], entries, LINES)
    expect(plan.updates).toEqual([])
    expect(plan.clears).toEqual([])
  })

  it('keeps a memo-sourced entry current when the memo changes', () => {
    const entries = [entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 400000, dealMemoSourced: true })]
    const memo = videographer({ fees: [{ ...videographer().fees[0], quantity: 3 }] })
    expect(planActualsFromDealMemos([memo], entries, LINES).updates).toEqual([
      { entryId: 'e-video', actualCents: 600000, vendorContactId: 'c-ana' },
    ])
  })

  it('skips a sourced entry that is already up to date', () => {
    const entries = [entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 400000, dealMemoSourced: true })]
    const plan = planActualsFromDealMemos([videographer({ fees: [videographer().fees[0]] })], entries, LINES)
    expect(plan).toEqual({ updates: [], creates: [], clears: [] })
  })

  it('clears entries a cancelled memo used to fill, but not user-owned ones', () => {
    const entries = [
      entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 400000, dealMemoSourced: true }),
      entry({ id: 'e-diem', isAdHoc: true, dealMemoFeeId: 'fee-diem', actualCents: 7500, dealMemoSourced: true }),
      entry({ id: 'e-mine', lineItemId: 'line-wardrobe', actualCents: 12300, dealMemoSourced: false }),
    ]
    const plan = planActualsFromDealMemos([videographer({ status: 'CANCELLED' })], entries, LINES)
    expect(plan.clears.map(c => c.entryId).sort()).toEqual(['e-diem', 'e-video'])
    expect(plan.updates).toEqual([])
  })

  it('reuses an existing unbudgeted entry for a fee instead of duplicating it', () => {
    const entries = [...sheet(), entry({ id: 'e-diem', isAdHoc: true, dealMemoFeeId: 'fee-diem', actualCents: 0 })]
    const plan = planActualsFromDealMemos([videographer()], entries, LINES)
    expect(plan.creates).toEqual([])
    expect(plan.updates).toContainEqual({ entryId: 'e-diem', actualCents: 7500, vendorContactId: 'c-ana' })
  })

  it('sums several people on one line and drops the single-vendor tag', () => {
    const pa = (id: string, contactId: string): PlannerMemo => ({
      id, status: 'CONFIRMED', lineItemId: 'line-pa', roleLabel: 'PA', contactId, contactName: id,
      fees: [{ id: `${id}-day`, kind: 'DAY_RATE', label: 'Day Rate', rateCents: 30000, quantity: 2, budgetLineItemId: null }],
    })
    const plan = planActualsFromDealMemos([pa('m1', 'c1'), pa('m2', 'c2')], [entry({ id: 'e-pa', lineItemId: 'line-pa' })], LINES)
    expect(plan.updates).toEqual([{ entryId: 'e-pa', actualCents: 120000, vendorContactId: null }])
  })

  it('treats a role line missing from the sheet as unbudgeted', () => {
    const memo = videographer({ lineItemId: 'line-gone', fees: [videographer().fees[0]] })
    const plan = planActualsFromDealMemos([memo], sheet(), LINES)
    expect(plan.updates).toEqual([])
    expect(plan.creates).toEqual([expect.objectContaining({ dealMemoFeeId: 'fee-day', actualCents: 400000 })])
  })

  it('files unbudgeted memo entries under the role line’s account so they show in Actuals', () => {
    const lines = [{ id: 'line-video', accountId: 'acc-camera', contactId: null, category: 'CREW' as const }]
    const plan = planActualsFromDealMemos([videographer()], sheet(), lines)
    expect(plan.creates[0]).toMatchObject({ dealMemoFeeId: 'fee-diem', accountId: 'acc-camera' })
  })

  it('never overwrites a $0 the user typed (amountUserOwned)', () => {
    const entries = [entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 0, amountUserOwned: true })]
    expect(planActualsFromDealMemos([videographer()], entries, LINES).updates).toEqual([])
  })

  it('never overwrites an amount set from receipts, and never clears it on cancel', () => {
    const entries = [entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 85000, dealMemoSourced: false, amountUserOwned: true })]
    expect(planActualsFromDealMemos([videographer()], entries, LINES).updates).toEqual([])
    expect(planActualsFromDealMemos([videographer({ status: 'CANCELLED' })], entries, LINES).clears).toEqual([])
  })

  it('keeps a user-owned $0 per diem at $0 instead of recreating it', () => {
    const entries = [...sheet(), entry({ id: 'e-diem', isAdHoc: true, dealMemoFeeId: 'fee-diem', actualCents: 0, amountUserOwned: true })]
    const plan = planActualsFromDealMemos([videographer()], entries, LINES)
    expect(plan.creates).toEqual([])
    expect(plan.updates.some(u => u.entryId === 'e-diem')).toBe(false)
  })

  it('stops writing to a leftover entry whose budget line was deleted, and clears it', () => {
    const entries = [entry({ id: 'e-video', lineItemId: 'line-video', actualCents: 400000, dealMemoSourced: true })]
    const linesWithoutVideo = LINES.filter(l => l.id !== 'line-video')
    const plan = planActualsFromDealMemos([videographer({ fees: [videographer().fees[0]] })], entries, linesWithoutVideo)
    expect(plan.updates).toEqual([])
    expect(plan.clears).toEqual([{ entryId: 'e-video' }])
    expect(plan.creates).toEqual([expect.objectContaining({ dealMemoFeeId: 'fee-day', actualCents: 400000 })])
  })

  it('does nothing for bids — only confirmed memos count', () => {
    expect(planActualsFromDealMemos([videographer({ status: 'BID' })], sheet(), LINES)).toEqual({ updates: [], creates: [], clears: [] })
  })
})
