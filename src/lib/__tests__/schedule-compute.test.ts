import { computeEntryTimes, dayWrapTime, buildScheduleSnapshot, snapshotToScheduleBlocks, latestBlockEnd } from '@/lib/schedule-compute'

const banner = (id: string, dur: number, concurrentWithPrevious = false) =>
  ({ id, kind: 'BANNER' as const, bannerDurationMin: dur, scene: null, concurrentWithPrevious })
const scene = (id: string, dur: number, concurrentWithPrevious = false) =>
  ({ id, kind: 'SCENE' as const, bannerDurationMin: null, scene: { estimatedDuration: dur }, concurrentWithPrevious })
const times = (r: ReturnType<typeof computeEntryTimes>) => r.map(t => `${t.computedStartTime}-${t.computedEndTime}`)

describe('computeEntryTimes', () => {
  it('runs entries back to back when nothing is concurrent (unchanged behaviour)', () => {
    expect(times(computeEntryTimes([banner('a', 30), scene('b', 60), banner('c', 0), scene('d', 15)], '07:00')))
      .toEqual(['07:00-07:30', '07:30-08:30', '08:30-08:30', '08:30-08:45'])
    expect(computeEntryTimes([banner('a', 10)], null)[0]!.computedStartTime).toBe('08:00')
  })

  it('starts a concurrent entry with the one above; the next waits for the longest', () => {
    const r = computeEntryTimes([
      banner('loadIn', 30), banner('talentCall', 0, true), banner('hmu', 60, true), banner('setUp', 120),
    ], '08:00')
    expect(times(r)).toEqual(['08:00-08:30', '08:00-08:00', '08:00-09:00', '09:00-11:00'])
  })

  it('handles a group whose longest entry is not first', () => {
    expect(times(computeEntryTimes([scene('a', 120), scene('b', 30, true), scene('c', 15)], '08:00')))
      .toEqual(['08:00-10:00', '08:00-08:30', '10:00-10:15'])
    expect(times(computeEntryTimes([scene('a', 15), scene('b', 90, true), scene('c', 15)], '08:00')))
      .toEqual(['08:00-08:15', '08:00-09:30', '09:30-09:45'])
  })

  it('ignores the flag on the first entry', () => {
    expect(times(computeEntryTimes([banner('a', 30, true), banner('b', 30)], '08:00')))
      .toEqual(['08:00-08:30', '08:30-09:00'])
  })

  it('keeps separate groups separate', () => {
    expect(times(computeEntryTimes([
      banner('a', 60), banner('b', 30, true), banner('c', 30), banner('d', 45, true), banner('e', 10),
    ], '08:00'))).toEqual(['08:00-09:00', '08:00-08:30', '09:00-09:30', '09:00-09:45', '09:45-09:55'])
  })

  it('wraps past midnight with hours above 24', () => {
    expect(times(computeEntryTimes([scene('a', 60), scene('b', 120, true), scene('c', 30)], '23:30')))
      .toEqual(['23:30-24:30', '23:30-25:30', '25:30-26:00'])
  })
})

describe('dayWrapTime', () => {
  it('is the latest end, not the last row', () => {
    expect(dayWrapTime([{ computedEndTime: '10:00' }, { computedEndTime: '08:30' }])).toBe('10:00')
    expect(dayWrapTime([{ computedEndTime: '23:00' }, { computedEndTime: '25:30' }])).toBe('25:30')
    expect(dayWrapTime([])).toBeNull()
    expect(dayWrapTime([{ computedEndTime: null }])).toBeNull()
  })
})

describe('snapshot and call sheet blocks', () => {
  const entry = (label: string, start: string, end: string, concurrentWithPrevious: boolean) => ({
    kind: 'BANNER' as const, bannerLabel: label, bannerType: 'CUSTOM', bannerNote: null, bannerDurationMin: 30,
    computedStartTime: start, computedEndTime: end, concurrentWithPrevious, scene: null,
  })

  it('omits `concurrent` when unset, so older synced snapshots still match', () => {
    const snap = buildScheduleSnapshot([entry('Load In', '08:00', '08:30', false), entry('Set Up', '08:30', '09:00', false)])
    expect(snap.every(e => !('concurrent' in e))).toBe(true)
  })

  it('carries `concurrent` into the snapshot and the call sheet blocks (not on the first entry)', () => {
    const snap = buildScheduleSnapshot([entry('Load In', '08:00', '08:30', true), entry('Talent call', '08:00', '08:00', true)])
    expect(snap.map(e => e.concurrent)).toEqual([undefined, true])
    const blocks = snapshotToScheduleBlocks(snap)
    expect(blocks.map(b => [b.label, b.startTime, b.concurrent])).toEqual([['Load In', '08:00', undefined], ['Talent call', '08:00', true]])
  })
})

describe('latestBlockEnd (call sheet "Add block")', () => {
  it('uses the latest end when blocks overlap, not the last row', () => {
    expect(latestBlockEnd([{ startTime: '08:00', endTime: '10:00' }, { startTime: '08:00', endTime: '08:30' }])).toBe('10:00')
  })
  it('handles hand-typed overnight times', () => {
    expect(latestBlockEnd([
      { startTime: '22:00', endTime: '23:30' }, { startTime: '23:30', endTime: '00:30' }, { startTime: '00:30', endTime: '01:30' },
    ])).toBe('01:30')
    expect(latestBlockEnd([{ startTime: '23:00', endTime: '01:00' }, { startTime: '23:00', endTime: '23:30', }])).toBe('01:00')
  })
  it('falls back when empty and treats a missing end as the start', () => {
    expect(latestBlockEnd([])).toBe('07:00')
    expect(latestBlockEnd([{ startTime: '09:15' }])).toBe('09:15')
  })
})
