import {
  shotCode, shotCounts, shareExpiry, sceneDayMap, sceneHeading, sceneSectionTitle,
  defaultSectionCode, readColumnPrefs, sizeValue, dayLabel,
} from '@/lib/shot-list'

describe('shotCode', () => {
  const sceneSec = { sceneId: 's1', code: null, title: 'Sc. 1 · INT. KITCHEN — DAY' }
  it('numbers scene sections as scene.n', () => {
    expect(shotCode(sceneSec, { sceneNumber: '12' }, 0, 1)).toBe('12.2')
  })
  it('uses the section position when the scene has no number', () => {
    expect(shotCode(sceneSec, { sceneNumber: null }, 2, 0)).toBe('3.1')
    expect(shotCode(sceneSec, { sceneNumber: '  ' }, 0, 0)).toBe('1.1')
  })
  it('numbers free sections with their code', () => {
    expect(shotCode({ sceneId: null, code: 'B', title: 'Product / B-roll' }, null, 2, 1)).toBe('B2')
  })
  it('falls back to the title letter when a free section has no code', () => {
    expect(shotCode({ sceneId: null, code: null, title: 'product' }, null, 0, 0)).toBe('P1')
  })
  it('a scene section whose scene was deleted numbers like a free section', () => {
    expect(shotCode({ sceneId: 's1', code: null, title: 'Sc. 4 · EXT. ROOF' }, null, 0, 0)).toBe('S1')
  })
})

describe('defaultSectionCode', () => {
  it('takes the first letter, upper-cased', () => expect(defaultSectionCode('  b-roll')).toBe('B'))
  it('falls back to S', () => expect(defaultSectionCode('123')).toBe('S'))
})

describe('scene headings', () => {
  it('formats INT/EXT, setting and time of day', () => {
    expect(sceneHeading({ intExt: 'EXT', setting: 'rooftop', timeOfDay: 'DUSK' })).toBe('EXT. ROOFTOP — DUSK')
    expect(sceneHeading({ intExt: 'INT_EXT', setting: 'Car', timeOfDay: 'NIGHT' })).toBe('INT./EXT. CAR — NIGHT')
  })
  it('section title includes the scene number when present', () => {
    expect(sceneSectionTitle({ sceneNumber: '1', intExt: 'INT', setting: 'Kitchen', timeOfDay: 'MORNING' })).toBe('Sc. 1 · INT. KITCHEN — MORNING')
    expect(sceneSectionTitle({ sceneNumber: null, intExt: 'INT', setting: 'Kitchen', timeOfDay: 'DAY' })).toBe('INT. KITCHEN — DAY')
  })
})

describe('shotCounts', () => {
  it('counts statuses and excludes skipped from planned', () => {
    const c = shotCounts([{ status: 'DONE' }, { status: 'DONE' }, { status: 'SKIPPED' }, { status: 'TO_SHOOT' }])
    expect(c).toEqual({ total: 4, done: 2, skipped: 1, toShoot: 1, planned: 3 })
  })
  it('handles an empty list', () => {
    expect(shotCounts([])).toEqual({ total: 0, done: 0, skipped: 0, toShoot: 0, planned: 0 })
  })
})

describe('shareExpiry', () => {
  const on = new Date('2026-11-01T10:00:00Z')
  it('is null while sharing is off', () => expect(shareExpiry(null, new Date())).toBeNull())
  it('runs 14 days past the last shoot day (to the end of that day)', () => {
    expect(shareExpiry(on, new Date('2026-11-19T00:00:00Z'))!.toISOString()).toBe('2026-12-04T00:00:00.000Z')
  })
  it('is 30 days after enabling with no shoot days', () => {
    expect(shareExpiry(on, null)!.toISOString()).toBe('2026-12-01T10:00:00.000Z')
  })
  it('is 30 days after enabling when the shoot is long past', () => {
    expect(shareExpiry(on, new Date('2026-01-01T00:00:00Z'))!.toISOString()).toBe('2026-12-01T10:00:00.000Z')
  })
})

describe('sceneDayMap', () => {
  const days = [
    { id: 'd1', date: new Date('2026-11-18T00:00:00Z') },
    { id: 'd2', date: new Date('2026-11-19T00:00:00Z') },
  ]
  it('maps a scene to its earliest shoot day', () => {
    const m = sceneDayMap([
      { sceneId: 'a', shootDayId: 'd2' }, { sceneId: 'a', shootDayId: 'd1' },
      { sceneId: 'b', shootDayId: 'd2' }, { sceneId: 'c', shootDayId: null },
      { sceneId: null, shootDayId: 'd1' }, { sceneId: 'd', shootDayId: 'gone' },
    ], days)
    expect(m.get('a')).toEqual({ dayKey: 'd1', dayLabel: 'Day 1 · Wed 18 Nov' })
    expect(m.get('b')?.dayLabel).toBe('Day 2 · Thu 19 Nov')
    expect(m.has('c')).toBe(false)
    expect(m.has('d')).toBe(false)
  })
  it('labels use UTC dates (no off-by-one)', () => {
    expect(dayLabel(0, new Date('2026-11-18T00:00:00Z'))).toBe('Day 1 · Wed 18 Nov')
  })
})

describe('column prefs and presets', () => {
  it('drops unknown keys and keeps the canonical order', () => {
    expect(readColumnPrefs({ visible: ['notes', 'bogus', 'camera', 3] })).toEqual({ visible: ['camera', 'notes'] })
    expect(readColumnPrefs(null)).toEqual({ visible: [] })
  })
  it('stores the short size code', () => {
    expect(sizeValue('MCU — Medium close-up')).toBe('MCU')
    expect(sizeValue('Insert')).toBe('Insert')
  })
})
