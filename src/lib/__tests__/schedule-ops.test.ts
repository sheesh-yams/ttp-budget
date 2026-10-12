import { applyScheduleOps, newScheduleId, isScheduleId, moveOrder, type ScheduleEntryRow, type ScheduleOp, type ScheduleState, type ScheduleSceneRow } from '@/lib/schedule-ops'

const ctx = { scheduleId: 's1', dayStart: new Map<string, string | null>([['d1', '08:00'], ['d2', '07:00']]) }

const banner = (id: string, shootDayId: string | null, orderIndex: number, dur: number, extra: Partial<ScheduleEntryRow> = {}): ScheduleEntryRow => ({
  id, scheduleId: 's1', shootDayId, orderIndex, kind: 'BANNER', concurrentWithPrevious: false, fixedStartTime: null,
  computedStartTime: null, computedEndTime: null, sceneId: null, scene: null,
  bannerType: 'CUSTOM', bannerLabel: id, bannerDurationMin: dur, bannerNote: null, ...extra,
})

const base = (): ScheduleState => ({
  entries: [banner('a', 'd1', 0, 30), banner('b', 'd1', 1, 60), banner('c', 'd1', 2, 15), banner('x', 'd2', 0, 45)],
  scenes: [], locations: [],
})

const day = (s: ScheduleState, d: string | null) =>
  s.entries.filter(e => e.shootDayId === d).sort((a, b) => a.orderIndex - b.orderIndex)
    .map(e => `${e.id}@${e.computedStartTime ?? '-'}`)

// A move as the editor records it: the target day's order at the time.
const mv = (s: ScheduleState, entryIds: string[], toShootDayId: string | null, beforeEntryId: string | null, resetConcurrent?: boolean) =>
  ({ type: 'move' as const, entryIds, toShootDayId, order: moveOrder(s.entries, entryIds, toShootDayId, beforeEntryId), ...(resetConcurrent ? { resetConcurrent } : {}) })

let seq = 0
const op = <T extends Omit<ScheduleOp, 'seq'>>(body: T) => ({ ...body, seq: ++seq }) as ScheduleOp

describe('applyScheduleOps', () => {
  it('add → move → set a time in one batch; times follow', () => {
    const ops = [
      op({ type: 'addBanner', entryId: 'n', shootDayId: 'd1', bannerType: 'CUSTOM', label: 'Load In', durationMin: 30 }),
      op(mv(base(), ['n'], 'd1', 'a')),
      op({ type: 'updateEntry', entryId: 'b', patch: { fixedStartTime: '08:15' } }),
    ]
    const s = applyScheduleOps(base(), ops, ctx)
    expect(day(s, 'd1')).toEqual(['n@08:00', 'a@08:30', 'b@08:15', 'c@09:15'])
  })

  it('deletes a just-added entry and ignores ops on missing ids', () => {
    const s = applyScheduleOps(base(), [
      op({ type: 'addBanner', entryId: 'n', shootDayId: 'd1', bannerType: 'NOTE', label: 'n', durationMin: 0 }),
      op({ type: 'deleteEntry', entryId: 'n' }),
      op({ type: 'updateEntry', entryId: 'gone', patch: { bannerLabel: 'x' } }),
      op(mv(base(), ['gone'], 'd2', null)),
    ], ctx)
    expect(day(s, 'd1')).toEqual(['a@08:00', 'b@08:30', 'c@09:30'])
    expect(day(s, 'd2')).toEqual(['x@07:00'])
  })

  it('a move re-indexes both days and clears "alongside" when changing day', () => {
    const start = base()
    start.entries[1] = { ...start.entries[1]!, concurrentWithPrevious: true }
    const s = applyScheduleOps(start, [op(mv(start, ['b'], 'd2', 'x'))], ctx)
    expect(day(s, 'd1')).toEqual(['a@08:00', 'c@08:30'])
    expect(s.entries.filter(e => e.shootDayId === 'd1').map(e => e.orderIndex).sort()).toEqual([0, 1])
    expect(day(s, 'd2')).toEqual(['b@07:00', 'x@08:00'])
    expect(s.entries.find(e => e.id === 'b')!.concurrentWithPrevious).toBe(false)
  })

  it('keeps "alongside" on a move within the day, drops it on a sort, the Boneyard and the first row', () => {
    const start = base()
    start.entries[2] = { ...start.entries[2]!, concurrentWithPrevious: true }   // c alongside b
    const within = applyScheduleOps(start, [op(mv(start, ['a'], 'd1', null))], ctx)
    expect(within.entries.find(e => e.id === 'c')!.concurrentWithPrevious).toBe(true)
    const sorted = applyScheduleOps(start, [op(mv(start, ['c', 'b', 'a'], 'd1', null, true))], ctx)
    expect(sorted.entries.every(e => !e.concurrentWithPrevious)).toBe(true)
    const yard = applyScheduleOps(start, [op(mv(start, ['c'], null, null))], ctx)
    expect(yard.entries.find(e => e.id === 'c')!.concurrentWithPrevious).toBe(false)
    const first = applyScheduleOps(start, [op({ type: 'deleteEntry', entryId: 'a' }), op({ type: 'deleteEntry', entryId: 'b' })], ctx)
    expect(first.entries.find(e => e.id === 'c')!.concurrentWithPrevious).toBe(false)
  })

  it('setting a start time clears "alongside"', () => {
    const s = applyScheduleOps(base(), [
      op({ type: 'updateEntry', entryId: 'c', patch: { concurrentWithPrevious: true } }),
      op({ type: 'updateEntry', entryId: 'c', patch: { fixedStartTime: '12:00' } }),
    ], ctx)
    expect(s.entries.find(e => e.id === 'c')).toMatchObject({ concurrentWithPrevious: false, fixedStartTime: '12:00', computedStartTime: '12:00' })
  })

  it('is idempotent: replaying ops over a state that already has them changes nothing', () => {
    const ops = [
      op({ type: 'addBanner', entryId: 'n', shootDayId: 'd1', bannerType: 'CUSTOM', label: 'L', durationMin: 10 }),
      op(mv(base(), ['n', 'c'], 'd1', 'a')),
      op(mv(base(), ['x'], 'd1', null)),
      op({ type: 'deleteEntry', entryId: 'b' }),
      op({ type: 'updateEntry', entryId: 'a', patch: { bannerDurationMin: 90 } }),
    ]
    const once = applyScheduleOps(base(), ops, ctx)
    const twice = applyScheduleOps(once, ops, ctx)
    expect(twice).toEqual(once)
  })

  it('creates a scene (with entry and new location) and updates it everywhere', () => {
    const s = applyScheduleOps(base(), [
      op({ type: 'createScene', sceneId: 'sc', input: { setting: 'Kitchen', estimatedDuration: 20, intExt: 'EXT', locationId: 'loc' },
        entry: { entryId: 'e-sc', shootDayId: 'd1' }, newLocation: { locationId: 'loc', name: 'Studio B' } }),
      op({ type: 'updateScene', sceneId: 'sc', input: { estimatedDuration: 45 } }),
    ], ctx)
    expect(s.locations).toEqual([{ id: 'loc', name: 'Studio B', address: null }])
    const scene = s.scenes.find(x => x.id === 'sc') as ScheduleSceneRow
    expect(scene).toMatchObject({ setting: 'Kitchen', intExt: 'EXT', estimatedDuration: 45, location: { id: 'loc', name: 'Studio B' } })
    const entry = s.entries.find(e => e.id === 'e-sc')!
    expect(entry).toMatchObject({ kind: 'SCENE', sceneId: 'sc', orderIndex: 3, computedStartTime: '09:45', computedEndTime: '10:30' })
    expect(entry.scene!.estimatedDuration).toBe(45)
  })

  it('free-text location: set, shown on the entry, and cleared', () => {
    const s0 = applyScheduleOps(base(), [op({ type: 'createScene', sceneId: 'sc', input: { setting: 'K', locationDetail: 'Garage' }, entry: { entryId: 'e', shootDayId: 'd1' } })], ctx)
    expect(s0.entries.find(e => e.id === 'e')!.scene!.locationDetail).toBe('Garage')
    const s1 = applyScheduleOps(s0, [op({ type: 'updateScene', sceneId: 'sc', input: { locationDetail: null } })], ctx)
    expect(s1.scenes[0]!.locationDetail).toBeNull()
    expect(s1.entries.find(e => e.id === 'e')!.scene!.locationDetail).toBeNull()
  })

  it('archives a scene on its entries too', () => {
    const s0 = applyScheduleOps(base(), [op({ type: 'createScene', sceneId: 'sc', input: { setting: 'K' }, entry: { entryId: 'e', shootDayId: null } })], ctx)
    const s1 = applyScheduleOps(s0, [op({ type: 'setSceneArchived', sceneId: 'sc', archived: true })], ctx)
    expect(s1.scenes[0]!.archived).toBe(true)
    expect(s1.entries.find(e => e.id === 'e')!.scene!.archived).toBe(true)
  })

  it('leaves untouched days alone (no renumbering, no re-timing)', () => {
    const start = base()
    // d2 has stale times and a gap; an edit on d1 must not rewrite it.
    start.entries[3] = { ...start.entries[3]!, orderIndex: 5, computedStartTime: '06:00', computedEndTime: '06:45' }
    const s = applyScheduleOps(start, [op({ type: 'updateEntry', entryId: 'a', patch: { bannerLabel: 'A' } })], ctx)
    expect(s.entries.find(e => e.id === 'x')).toEqual(start.entries[3])
    expect(day(s, 'd1')).toEqual(['a@08:00', 'b@08:30', 'c@09:30'])
  })

  it('a replayed move lands the same even when its neighbour is gone (retry after a lost response)', () => {
    const start = base()
    const batch = [op(mv(start, ['c'], 'd1', 'b')), op({ type: 'deleteEntry', entryId: 'b' })]
    const once = applyScheduleOps(start, batch, ctx)
    expect(day(once, 'd1')).toEqual(['a@08:00', 'c@08:30'])
    expect(applyScheduleOps(once, batch, ctx)).toEqual(once)
  })

  it('a move keeps rows added to that day by someone else (they go last)', () => {
    const start = base()
    const moveOp = op(mv(start, ['x'], 'd1', 'a'))
    const elsewhere = { ...start, entries: [...start.entries, banner('z', 'd1', 3, 10)] }
    expect(day(applyScheduleOps(elsewhere, [moveOp], ctx), 'd1').map(t => t.split('@')[0])).toEqual(['x', 'a', 'b', 'c', 'z'])
  })

  it('changes an item\'s type: scene → banner keeps name and length; banner → scene makes one', () => {
    const s0 = applyScheduleOps(base(), [op({ type: 'createScene', sceneId: 'sc', input: { setting: 'LUNCH', sceneNumber: '4', estimatedDuration: 45 }, entry: { entryId: 'e', shootDayId: 'd1' } })], ctx)
    const toBanner = applyScheduleOps(s0, [op({ type: 'changeEntryType', entryId: 'e', to: 'MEAL_BREAK' })], ctx)
    expect(toBanner.entries.find(x => x.id === 'e')).toMatchObject({ kind: 'BANNER', sceneId: null, scene: null, bannerType: 'MEAL_BREAK', bannerLabel: 'Sc 4 — LUNCH', bannerDurationMin: 45, computedStartTime: '09:45', computedEndTime: '10:30' })
    expect(toBanner.scenes.some(x => x.id === 'sc')).toBe(true)   // the scene itself stays

    const recolour = applyScheduleOps(base(), [op({ type: 'changeEntryType', entryId: 'a', to: 'SETUP' })], ctx)
    expect(recolour.entries.find(x => x.id === 'a')).toMatchObject({ kind: 'BANNER', bannerType: 'SETUP', bannerLabel: 'a', bannerDurationMin: 30 })

    const conv = [op({ type: 'changeEntryType', entryId: 'b', to: 'SCENE', sceneId: 'new-sc' })]
    const toScene = applyScheduleOps(base(), conv, ctx)
    expect(toScene.entries.find(x => x.id === 'b')).toMatchObject({ kind: 'SCENE', sceneId: 'new-sc', bannerType: null, bannerLabel: null, computedStartTime: '08:30', computedEndTime: '09:30' })
    expect(toScene.scenes.find(x => x.id === 'new-sc')).toMatchObject({ setting: 'b', estimatedDuration: 60 })
    expect(applyScheduleOps(toScene, conv, ctx)).toEqual(toScene)   // replay-safe
  })

  it('makes valid ids', () => {
    const ids = new Set(Array.from({ length: 50 }, newScheduleId))
    expect(ids.size).toBe(50)
    expect([...ids].every(isScheduleId)).toBe(true)
    expect(isScheduleId('tmp-1')).toBe(false)
  })
})
