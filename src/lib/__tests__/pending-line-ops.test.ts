import { applyPendingOps, findRow, replaceRowId, rollbackRow, rowFromInput, type PendingLineOp } from '@/lib/pending-line-ops'
import type { AccountWithItems } from '@/types'

const item = (id: string, order: number, over: Record<string, unknown> = {}) => ({ id, order, description: id, quantity: 1, unit: 'DAY', rateCents: 100, markupPct: null, ...over })
const tree = () => ([
  { id: 'A', lineItems: [item('a1', 0), item('a2', 1)], children: [
    { id: 'A1', lineItems: [item('c1', 0)], children: [] },
  ] },
  { id: 'B', lineItems: [], children: [] },
] as unknown as AccountWithItems[])
const input = (accountId: string, description: string, rateCents = 500) => ({ accountId, description, quantity: 2, unit: 'DAY', rateCents }) as never
const op = (key: string, rowId: string, isNew: boolean, accountId: string, desc: string, rate?: number): [string, PendingLineOp] =>
  [key, { key, rowId, isNew, accountId, row: rowFromInput(rowId, input(accountId, desc, rate)) }]

describe('pending line ops', () => {
  it('returns the same tree when nothing is pending', () => {
    const t = tree()
    expect(applyPendingOps(t, new Map())).toBe(t)
  })

  it('patches an edited row and appends a new one (also in a child account)', () => {
    const out = applyPendingOps(tree(), new Map([op('k1', 'a2', false, 'A', 'Gaffer'), op('k2', 'tmp-1', true, 'A1', 'Best boy')]))
    expect(out[0].lineItems[1]).toMatchObject({ id: 'a2', description: 'Gaffer', rateCents: 500 })
    const child = out[0].children![0] as unknown as AccountWithItems
    expect(child.lineItems.map(i => i.id)).toEqual(['c1', 'tmp-1'])
  })

  it('two edits of one row apply in order — the newest wins', () => {
    const out = applyPendingOps(tree(), new Map([op('k1', 'a1', false, 'A', 'First', 100), op('k2', 'a1', false, 'A', 'Second', 900)]))
    expect(out[0].lineItems[0]).toMatchObject({ description: 'Second', rateCents: 900 })
  })

  it('is idempotent and survives a refresh without the new row yet', () => {
    const ops = new Map([op('k', 'tmp-1', true, 'B', 'Van')])
    const twice = applyPendingOps(applyPendingOps(tree(), ops), ops)
    expect(twice[1].lineItems.map(i => i.id)).toEqual(['tmp-1'])
    expect(applyPendingOps(tree(), ops)[1].lineItems.map(i => i.id)).toEqual(['tmp-1'])
  })

  it('replaceRowId swaps the temporary id for the real one', () => {
    const withNew = applyPendingOps(tree(), new Map([op('k', 'tmp-1', true, 'B', 'Van')]))
    expect(replaceRowId(withNew, 'tmp-1', 'real-9')[1].lineItems[0].id).toBe('real-9')
  })

  it('rollbackRow undoes only that row, keeping other on-screen changes', () => {
    const t = tree()
    const prev = findRow(t, 'a1')!
    const edited = applyPendingOps(t, new Map([op('k1', 'a1', false, 'A', 'Bad edit'), op('k2', 'tmp-2', true, 'A', 'Other new line')]))
    const rolled = rollbackRow(edited, 'a1', prev)
    expect(rolled[0].lineItems.map(i => i.description)).toEqual(['a1', 'a2', 'Other new line'])
    expect(rollbackRow(edited, 'tmp-2', null)[0].lineItems.map(i => i.id)).toEqual(['a1', 'a2'])
  })
})
