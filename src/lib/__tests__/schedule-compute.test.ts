import { computeEntryTimes, dayWrapTime, buildScheduleSnapshot, snapshotToScheduleBlocks, latestBlockEnd, overlapFlags, isValidClockTime, blockOverlapFlags, sceneLocationLabel } from '@/lib/schedule-compute'

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

describe('hand-set start times', () => {
  const at = (id: string, dur: number, fixedStartTime: string | null, concurrentWithPrevious = false) =>
    ({ id, kind: 'BANNER' as const, bannerDurationMin: dur, scene: null, fixedStartTime, concurrentWithPrevious })

  it('runs during the item above when set inside it (Talent call during Setup)', () => {
    const r = computeEntryTimes([at('setup', 120, null), at('talent', 30, '09:00'), at('next', 30, null)], '08:00')
    expect(times(r)).toEqual(['08:00-10:00', '09:00-09:30', '10:00-10:30'])
    expect(overlapFlags(r)).toEqual([false, true, false])
  })

  it('pushes the next item when it ends later than everything above', () => {
    expect(times(computeEntryTimes([at('setup', 120, null), at('hmu', 60, '09:30'), at('next', 15, null)], '08:00')))
      .toEqual(['08:00-10:00', '09:30-10:30', '10:30-10:45'])
  })

  it('leaves a gap when set after everything above', () => {
    const r = computeEntryTimes([at('a', 270, null), at('lunch', 60, '13:00'), at('b', 30, null)], '08:00')
    expect(times(r)).toEqual(['08:00-12:30', '13:00-14:00', '14:00-14:30'])
    expect(overlapFlags(r)).toEqual([false, false, false])
  })

  it('"alongside" now starts with the item directly above, including a hand-set one', () => {
    expect(times(computeEntryTimes([at('setup', 120, null), at('talent', 30, '09:00'), at('hmu', 60, null, true)], '08:00')))
      .toEqual(['08:00-10:00', '09:00-09:30', '09:00-10:00'])
  })

  it('a set time beats the alongside flag, and works on the first row', () => {
    expect(times(computeEntryTimes([at('a', 30, '07:00'), at('b', 30, '08:15', true)], '08:00')))
      .toEqual(['07:00-07:30', '08:15-08:45'])
  })

  it('treats a time well before the call as after midnight', () => {
    expect(times(computeEntryTimes([at('a', 300, null), at('b', 30, '01:00')], '20:00')))
      .toEqual(['20:00-25:00', '25:00-25:30'])
    // An early load-in an hour before call stays the same day.
    expect(times(computeEntryTimes([at('a', 30, '07:00')], '08:00'))).toEqual(['07:00-07:30'])
    // A 07:30 load-in on a 14:00 call is that morning, not the next day.
    expect(times(computeEntryTimes([at('a', 30, '07:30')], '14:00'))).toEqual(['07:30-08:00'])
    expect(times(computeEntryTimes([at('a', 30, '02:00')], '14:00'))).toEqual(['26:00-26:30'])
  })

  it('ignores an invalid stored time', () => {
    expect(times(computeEntryTimes([at('a', 30, null), at('b', 30, '9am')], '08:00'))).toEqual(['08:00-08:30', '08:30-09:00'])
    expect(isValidClockTime('09:00')).toBe(true)
    expect(isValidClockTime('24:00')).toBe(false)
    expect(isValidClockTime('9:00')).toBe(false)
  })

  it('marks a hand-set overlap as concurrent in the call sheet snapshot', () => {
    const r = computeEntryTimes([at('setup', 120, null), at('talent', 30, '09:00')], '08:00')
    const snap = buildScheduleSnapshot(r.map((t, i) => ({
      kind: 'BANNER' as const, bannerLabel: i ? 'Talent call' : 'Setup', bannerType: 'CUSTOM', bannerNote: null, bannerDurationMin: 0,
      computedStartTime: t.computedStartTime, computedEndTime: t.computedEndTime, scene: null,
    })))
    expect(snapshotToScheduleBlocks(snap).map(b => [b.startTime, b.endTime, b.label, !!b.concurrent]))
      .toEqual([['08:00', '10:00', 'Setup', false], ['09:00', '09:30', 'Talent call', true]])
  })
})

describe('blockOverlapFlags (call sheet sub-rows)', () => {
  it('flags a block that starts during the ones above', () => {
    expect(blockOverlapFlags([
      { startTime: '08:00', endTime: '10:00' }, { startTime: '09:00', endTime: '09:30' },
      { startTime: '08:00', endTime: '08:30' }, { startTime: '10:00', endTime: '10:30' },
    ])).toEqual([false, true, true, false])
  })
  it('does not flag back-to-back or overnight sequences', () => {
    expect(blockOverlapFlags([
      { startTime: '22:00', endTime: '23:30' }, { startTime: '23:30', endTime: '00:30' }, { startTime: '00:30', endTime: '01:30' },
    ])).toEqual([false, false, false])
    expect(blockOverlapFlags([{ startTime: '23:00', endTime: '01:00' }, { startTime: '00:00', endTime: '00:30' }])).toEqual([false, true])
  })
})

describe('overlap markers (review fixes)', () => {
  const row = (start: string, end: string, extra: { concurrentWithPrevious?: boolean; fixedStartTime?: string | null } = {}) =>
    ({ computedStartTime: start, computedEndTime: end, ...extra })

  it('a pinned row in a gap is not "during", even with an old alongside flag', () => {
    expect(overlapFlags([row('08:00', '10:00'), row('13:00', '14:00', { concurrentWithPrevious: true, fixedStartTime: '13:00' })]))
      .toEqual([false, false])
  })
  it('a row pinned before the one above is not "during" it', () => {
    expect(overlapFlags([row('08:00', '10:00'), row('07:00', '07:30', { fixedStartTime: '07:00' })])).toEqual([false, false])
  })
  it('alongside a 0-minute row above still counts', () => {
    expect(overlapFlags([row('08:00', '08:00'), row('08:00', '09:00', { concurrentWithPrevious: true })])).toEqual([false, true])
  })
  it('call sheet: honours a synced flag only when it starts with the block above', () => {
    expect(blockOverlapFlags([{ startTime: '08:00', endTime: '08:00' }, { startTime: '08:00', endTime: '09:00', concurrent: true }]))
      .toEqual([false, true])
    expect(blockOverlapFlags([{ startTime: '08:00', endTime: '09:00' }, { startTime: '09:00', endTime: '10:00', concurrent: true }]))
      .toEqual([false, false])
    expect(blockOverlapFlags([{ startTime: '09:00' }, { startTime: '09:00', concurrent: true }])).toEqual([false, true])
  })
  it('call sheet: an early block before the one above is not a sub-row', () => {
    expect(blockOverlapFlags([{ startTime: '08:00', endTime: '10:00' }, { startTime: '07:00', endTime: '07:30' }])).toEqual([false, false])
  })
})

describe('sceneLocationLabel', () => {
  it('joins a saved location and free text, or shows either alone', () => {
    expect(sceneLocationLabel('Smith House', 'Master bedroom')).toBe('Smith House · Master bedroom')
    expect(sceneLocationLabel(null, ' Garage ')).toBe('Garage')
    expect(sceneLocationLabel('Smith House', null)).toBe('Smith House')
    expect(sceneLocationLabel(null, '  ')).toBeNull()
  })
  it('leaves the call sheet snapshot unchanged for scenes without free text', () => {
    const entry = (detail?: string | null) => ({
      kind: 'SCENE' as const, bannerLabel: null, bannerType: null, bannerNote: null, bannerDurationMin: null,
      computedStartTime: '08:00', computedEndTime: '09:00',
      scene: { sceneNumber: '1', setting: 'Kitchen', estimatedDuration: 60, notes: null, castContactIds: [], location: { name: 'Smith House' }, ...(detail !== undefined ? { locationDetail: detail } : {}) },
    })
    expect(buildScheduleSnapshot([entry(null)])).toEqual(buildScheduleSnapshot([entry()]))
    expect(buildScheduleSnapshot([entry('Master bedroom')])[0]!.locationName).toBe('Smith House · Master bedroom')
    expect(snapshotToScheduleBlocks(buildScheduleSnapshot([entry('Master bedroom')]))[0]!.location).toBe('Smith House · Master bedroom')
  })
})
