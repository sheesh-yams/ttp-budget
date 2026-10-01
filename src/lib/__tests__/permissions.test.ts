import {
  atLeast, maxLevel, applyProjectDependencies, resolveProjectPermissions,
  readProjectPermissions, readWorkspacePermissions,
  WORKSPACE_ROLE_PRESETS, PROJECT_ROLE_PRESETS, PROJECT_AREA_KEYS, WORKSPACE_AREA_KEYS,
  MAX_ROLES, workspacePresetFor,
  type ProjectPermissions,
} from '../permissions'

const none = Object.fromEntries(PROJECT_AREA_KEYS.map(k => [k, 'NONE'])) as ProjectPermissions
const preset = (key: string) => WORKSPACE_ROLE_PRESETS.find(p => p.systemKey === key)!
const projectPreset = (key: string) => PROJECT_ROLE_PRESETS.find(p => p.systemKey === key)!

describe('levels', () => {
  it('EDIT implies VIEW, not the other way round', () => {
    expect(atLeast('EDIT', 'VIEW')).toBe(true)
    expect(atLeast('VIEW', 'EDIT')).toBe(false)
    expect(atLeast('NONE', 'VIEW')).toBe(false)
    expect(maxLevel('VIEW', 'NONE')).toBe('VIEW')
  })
})

describe('reading stored JSON', () => {
  it('defaults missing areas to NONE and drops unknown keys and values', () => {
    const p = readProjectPermissions({ crew: 'EDIT', bogus: 'EDIT', overview: 'ADMIN' })
    expect(p.crew).toBe('EDIT')
    expect(p.overview).toBe('NONE')
    expect(Object.keys(p).sort()).toEqual([...PROJECT_AREA_KEYS].sort())
  })

  it('survives null / non-object JSON', () => {
    expect(readWorkspacePermissions(null).settings).toBe('NONE')
    expect(readProjectPermissions('x').crew).toBe('NONE')
  })

  it('applies dependency caps on read', () => {
    const p = readProjectPermissions({ 'budget.margin': 'EDIT', 'budget.costs': 'VIEW', 'budget.lines': 'EDIT' })
    expect(p['budget.margin']).toBe('VIEW')
  })
})

describe('dependencies', () => {
  it('costs cannot exceed lines, margin cannot exceed costs', () => {
    const p = applyProjectDependencies({ ...none, 'budget.lines': 'VIEW', 'budget.costs': 'EDIT', 'budget.margin': 'EDIT' })
    expect(p['budget.costs']).toBe('VIEW')
    expect(p['budget.margin']).toBe('VIEW')
  })

  it('no lines means no costs or margin at all', () => {
    const p = applyProjectDependencies({ ...none, 'budget.costs': 'EDIT', 'budget.margin': 'EDIT' })
    expect(p['budget.costs']).toBe('NONE')
    expect(p['budget.margin']).toBe('NONE')
  })
})

describe('resolveProjectPermissions (baseline + project roles add)', () => {
  const collab = preset('COLLABORATOR').projectBaseline

  it('with no project role, the baseline applies', () => {
    expect(resolveProjectPermissions(collab, [])).toEqual(applyProjectDependencies(collab))
  })

  it('a project role only adds — never lowers the baseline', () => {
    const r = resolveProjectPermissions(preset('PRODUCER').projectBaseline, [projectPreset('TEAM_MEMBER').permissions])
    expect(PROJECT_AREA_KEYS.every(k => r[k] === 'EDIT')).toBe(true)
  })

  it('takes the highest level across several roles', () => {
    const vendor = { ...none, crew: 'EDIT', dealMemos: 'EDIT', 'budget.lines': 'VIEW' } as ProjectPermissions
    const viewer = { ...none, actuals: 'VIEW', crew: 'VIEW' } as ProjectPermissions
    const r = resolveProjectPermissions(collab, [vendor, viewer])
    expect(r.crew).toBe('EDIT')
    expect(r.dealMemos).toBe('EDIT')
    expect(r.actuals).toBe('VIEW')
    expect(r['budget.costs']).toBe('NONE')
  })

  it('the vendor-coordinator example: manage vendors, see lines, no money', () => {
    const vendor = { ...none, crew: 'EDIT', dealMemos: 'EDIT', 'budget.lines': 'VIEW' } as ProjectPermissions
    const r = resolveProjectPermissions(collab, [vendor])
    expect(r['budget.lines']).toBe('VIEW')
    expect(r['budget.costs']).toBe('NONE')
    expect(r['budget.margin']).toBe('NONE')
    expect(r.invoices).toBe('NONE')
  })
})

describe('presets', () => {
  it('stay within the role limit', () => {
    expect(WORKSPACE_ROLE_PRESETS.length).toBeLessThanOrEqual(MAX_ROLES)
    expect(PROJECT_ROLE_PRESETS.length).toBeLessThanOrEqual(MAX_ROLES)
  })

  it('define every area', () => {
    for (const p of WORKSPACE_ROLE_PRESETS) {
      expect(Object.keys(p.workspacePermissions).sort()).toEqual([...WORKSPACE_AREA_KEYS].sort())
      expect(Object.keys(p.projectBaseline).sort()).toEqual([...PROJECT_AREA_KEYS].sort())
    }
    for (const p of PROJECT_ROLE_PRESETS) {
      expect(Object.keys(p.permissions).sort()).toEqual([...PROJECT_AREA_KEYS].sort())
    }
  })

  it('Owner is full everywhere', () => {
    const o = preset('OWNER')
    expect(o.projectScope).toBe('ALL')
    expect(Object.values(o.workspacePermissions).every(l => l === 'EDIT')).toBe(true)
    expect(Object.values(o.projectBaseline).every(l => l === 'EDIT')).toBe(true)
  })

  it('Producer matches today: everything except settings and team', () => {
    const p = preset('PRODUCER')
    expect(p.projectScope).toBe('ALL')
    expect(p.workspacePermissions.settings).toBe('NONE')
    expect(p.workspacePermissions.team).toBe('NONE')
    expect(p.workspacePermissions.invoices).toBe('EDIT')
    expect(Object.values(p.projectBaseline).every(l => l === 'EDIT')).toBe(true)
  })

  it('Collaborator: assigned projects only, no workspace pages, lines without money', () => {
    const c = preset('COLLABORATOR')
    expect(c.projectScope).toBe('ASSIGNED')
    expect(Object.values(c.workspacePermissions).every(l => l === 'NONE')).toBe(true)
    expect(c.projectBaseline['budget.lines']).toBe('VIEW')
    expect(c.projectBaseline['budget.costs']).toBe('NONE')
    expect(c.projectBaseline['budget.margin']).toBe('NONE')
    expect(c.projectBaseline.dealMemos).toBe('NONE')
    expect(c.projectBaseline.callSheets).toBe('EDIT')
    expect(c.projectBaseline.actuals).toBe('NONE')
  })

  it('Project Manager sees costs but not margin or client money', () => {
    const pm = projectPreset('PROJECT_MANAGER').permissions
    expect(pm['budget.costs']).toBe('EDIT')
    expect(pm['budget.margin']).toBe('NONE')
    expect(pm.invoices).toBe('NONE')
    expect(pm.proposals).toBe('NONE')
  })

  it('Team member adds nothing', () => {
    expect(Object.values(projectPreset('TEAM_MEMBER').permissions).every(l => l === 'NONE')).toBe(true)
  })

  it('maps every legacy User.role to a preset', () => {
    for (const r of ['OWNER', 'PRODUCER', 'COLLABORATOR'] as const) {
      expect(workspacePresetFor(r).systemKey).toBe(r)
    }
  })
})

describe('legacyRoleFor (custom roles never exceed what they grant)', () => {
  const { legacyRoleFor } = jest.requireActual('../permissions') as typeof import('../permissions')
  it('system presets map to themselves', () => {
    for (const p of WORKSPACE_ROLE_PRESETS) expect(legacyRoleFor(p)).toBe(p.systemKey)
  })
  it('a Producer copy with one area lowered is a Collaborator for legacy checks', () => {
    const p = preset('PRODUCER')
    expect(legacyRoleFor({ ...p, systemKey: null, workspacePermissions: { ...p.workspacePermissions, invoices: 'VIEW' } })).toBe('COLLABORATOR')
    expect(legacyRoleFor({ ...p, systemKey: null, projectScope: 'ASSIGNED' })).toBe('COLLABORATOR')
    expect(legacyRoleFor({ ...p, systemKey: null, projectBaseline: { ...p.projectBaseline, actuals: 'VIEW' } })).toBe('COLLABORATOR')
  })
  it('a Producer copy with settings added is still Producer, not Owner', () => {
    const p = preset('PRODUCER')
    expect(legacyRoleFor({ ...p, systemKey: null, workspacePermissions: { ...p.workspacePermissions, settings: 'EDIT', team: 'EDIT' } })).toBe('PRODUCER')
  })
  it('only the Owner system role is Owner', () => {
    const o = preset('OWNER')
    expect(legacyRoleFor({ ...o, systemKey: null })).toBe('PRODUCER')
  })
})
