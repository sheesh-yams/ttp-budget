import { extraCents, budgetBilledCents, clientInvoiceLines, internalInvoiceLines, invoicedActualKeys, billedExtrasCents, groupInvoiceableActuals } from '@/lib/invoice-lines'
import { remainingBalance } from '@/lib/invoice-balance'
import { addedScopeCents } from '@/lib/project-value'
import { projectToInvoiceCents } from '@/lib/project-billing'

const line = (cents: number, extra?: Partial<{ extra: boolean; actualEntryId: string; actualPart: 'overage'; costCents: number }>) =>
  ({ id: Math.random().toString(36), description: 'x', quantity: 1, unit: 'FLAT', rateCents: cents, lineTotalCents: cents, ...extra })
const inv = (status: string, lines: ReturnType<typeof line>[], o: Partial<{ totalCents: number; isScopeAddition: boolean; number: string }> = {}) =>
  ({ status, number: o.number ?? 'TTP-1', isScopeAddition: o.isScopeAddition ?? false, lineItems: lines, totalCents: o.totalCents ?? lines.reduce((s, l) => s + l.lineTotalCents, 0) })

describe('remaining balance (Salute)', () => {
  const paid = inv('PAID', [line(3_945_00)], { number: 'TTP-2026-026' })
  const sent = inv('SENT', [line(2_500_00)], { number: 'TTP-2026-030' })
  it('counts paid and outstanding invoices', () => {
    const b = remainingBalance({ agreedCents: 13_215_00, invoices: [paid, sent] })
    expect(b.remainingCents).toBe(6_770_00)
    expect(b.counted.map(c => c.number)).toEqual(['TTP-2026-026', 'TTP-2026-030'])
  })
  it('voiding the outstanding one grows it; drafts count; extras and added scope do not', () => {
    expect(remainingBalance({ agreedCents: 13_215_00, invoices: [paid, { ...sent, status: 'VOID' }] }).remainingCents).toBe(9_270_00)
    expect(remainingBalance({ agreedCents: 13_215_00, invoices: [paid, { ...sent, status: 'DRAFT' }] }).remainingCents).toBe(6_770_00)
    const withExtras = inv('SENT', [line(6_770_00), line(1_000_00, { extra: true })])
    expect(remainingBalance({ agreedCents: 13_215_00, invoices: [paid, sent, withExtras] }).remainingCents).toBe(0)
    const scope = inv('SENT', [line(5_000_00)], { isScopeAddition: true })
    expect(remainingBalance({ agreedCents: 13_215_00, invoices: [paid, sent, scope] }).remainingCents).toBe(6_770_00)
    expect(remainingBalance({ agreedCents: 1_000_00, invoices: [inv('PAID', [line(2_000_00)])] }).remainingCents).toBe(0)
  })
})

describe('extras on an invoice', () => {
  it("are the extras' share of the total, tax and discount shared pro rata", () => {
    const i = inv('SENT', [line(9_000_00), line(1_000_00, { extra: true })], { totalCents: 10_800_00 }) // +8% tax
    expect(extraCents(i)).toBe(1_080_00)
    expect(budgetBilledCents(i)).toBe(9_720_00)
    expect(extraCents(inv('SENT', [line(500, { extra: true })]))).toBe(500)
    expect(extraCents(inv('SENT', [line(500)]))).toBe(0)
  })
  it('the budget discount comes off the budget part, not the extras', () => {
    // Full invoice: $10,000 of budget lines − $1,000 budget discount, + a $1,000 extra.
    const i = { ...inv('SENT', [line(10_000_00), line(1_000_00, { extra: true })], { totalCents: 10_000_00 }), discountCents: 1_000_00 }
    expect(extraCents(i)).toBe(1_000_00)
    expect(budgetBilledCents(i)).toBe(9_000_00)
    // Same with 10% tax on (subtotal − discount): the extra carries its own tax.
    const t = { ...inv('SENT', [line(10_000_00), line(1_000_00, { extra: true })], { totalCents: 11_000_00 }), discountCents: 1_000_00 }
    expect(extraCents(t)).toBe(1_100_00)
  })
  it('add to the project value once (a scope invoice already counts whole) and not when void', () => {
    const extra = inv('SENT', [line(9_000_00), line(1_000_00, { extra: true })])
    const scope = inv('SENT', [line(2_000_00, { extra: true })], { isScopeAddition: true })
    expect(addedScopeCents([extra, scope])).toBe(3_000_00)
    expect(addedScopeCents([{ ...extra, status: 'VOID' }])).toBe(0)
    expect(billedExtrasCents([extra, { ...extra, status: 'VOID' }])).toBe(1_000_00)
  })
  it('keep to-invoice right: billing an extra does not eat into the budget left', () => {
    const p = { budgetCents: 10_000_00, approvedTotalCents: null, won: true, archived: false, invoices: [inv('SENT', [line(5_000_00), line(1_000_00, { extra: true })])] }
    expect(projectToInvoiceCents(p)).toBe(5_000_00)
  })
})

describe('what leaves the server', () => {
  const raw = [line(1_000_00, { extra: true, actualEntryId: 'ae1', costCents: 800_00 }), line(500)]
  it('the client sees no cost or source', () => {
    const out = clientInvoiceLines(raw)
    expect(JSON.stringify(out)).not.toMatch(/costCents|actualEntryId|actualPart/)
    expect(out[0].extra).toBe(true)
    expect(out[1].extra).toBeUndefined()
  })
  it('the app sees the cost only with margin access', () => {
    expect(internalInvoiceLines(raw, false)[0]).not.toHaveProperty('costCents')
    expect(internalInvoiceLines(raw, false)[0].actualEntryId).toBe('ae1')
    expect(internalInvoiceLines(raw, true)[0].costCents).toBe(800_00)
  })
})

describe('the Add from actuals list', () => {
  const budgetLines = [
    { id: 'l-acam', description: 'A Cam', quantity: 1, rateCents: 1_000_00, markupPct: null },
    { id: 'l-prop', description: 'Prop Rental', quantity: 1, rateCents: 1_000_00, markupPct: null },
  ]
  const entries = [
    { id: 'e1', description: 'Backdrop Rental - Oliphant', actualCents: 718_58, isAdHoc: true, lineItemId: null },
    { id: 'e2', description: 'A Cam — Day Rate / Service Fee (Sarowar Ahmed)', actualCents: 850_00, isAdHoc: true, lineItemId: null, dealMemoSourced: true },
    { id: 'e3', description: 'Prop Rental', actualCents: 1_360_94, isAdHoc: false, lineItemId: 'l-prop' },
    { id: 'e4', description: 'Nothing spent', actualCents: 0, isAdHoc: true, lineItemId: null },
  ]
  it('puts unplanned first, offers only the overage, warns on look-alikes', () => {
    const list = groupInvoiceableActuals({ entries, budgetLines, invoices: [] })
    expect(list.map(i => `${i.group}:${i.entryId}`)).toEqual(['unplanned:e1', 'unplanned:e2', 'over:e3', 'budgeted:e3'])
    expect(list.find(i => i.entryId === 'e2')!.looksLike).toBe('A Cam')
    expect(list.find(i => i.entryId === 'e1')!.looksLike).toBeNull()
    expect(list.find(i => i.group === 'over')!.costCents).toBe(360_94)
    expect(list.find(i => i.entryId === 'e2')!.fromDealMemo).toBe(true)
  })
  it("catches a vendor named after a budget line's leading words, not a shared single word", () => {
    const lines = [{ id: 'l-w3', description: 'West Third Photography', quantity: 1, rateCents: 5_000_00, markupPct: null }, ...budgetLines]
    const es = [
      { id: 'w', description: 'Activation Photographer — Day Rate / Service Fee (West Third Films)', actualCents: 5_000_00, isAdHoc: true, lineItemId: null },
      { id: 'c', description: 'Prop Courier - DHL', actualCents: 50_00, isAdHoc: true, lineItemId: null },
    ]
    const list = groupInvoiceableActuals({ entries: es, budgetLines: lines, invoices: [] })
    expect(list.find(i => i.entryId === 'w')!.looksLike).toBe('West Third Photography')
    expect(list.find(i => i.entryId === 'c')!.looksLike).toBeNull()
  })
  it('marks what is already on a non-void invoice', () => {
    const billed = inv('SENT', [line(900_00, { extra: true, actualEntryId: 'e1' }), line(400_00, { extra: true, actualEntryId: 'e3', actualPart: 'overage' })], { number: 'TTP-2026-031' })
    const list = groupInvoiceableActuals({ entries, budgetLines, invoices: [billed] })
    expect(list.find(i => i.entryId === 'e1')!.invoicedOn).toEqual([{ number: 'TTP-2026-031', status: 'SENT' }])
    expect(list.find(i => i.group === 'over')!.invoicedOn).toHaveLength(1)
    expect(list.find(i => i.group === 'budgeted')!.invoicedOn).toHaveLength(0)
    expect(invoicedActualKeys([{ ...billed, status: 'VOID' }]).size).toBe(0)
  })
})
