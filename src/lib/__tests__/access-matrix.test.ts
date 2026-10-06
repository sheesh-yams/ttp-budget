// The access matrix (roles cleanup): what each built-in role can do in every
// area, written out explicitly. Changing a preset or a rule fails here, so any
// change to who-can-do-what is deliberate and reviewed.
import {
  WORKSPACE_ROLE_PRESETS, PROJECT_ROLE_PRESETS, PROJECT_AREA_KEYS, WORKSPACE_AREA_KEYS,
  resolveProjectPermissions, readProjectPermissions,
  type Level, type ProjectArea, type WorkspaceArea, type ProjectPermissions,
} from '../permissions'

const preset  = (k: string) => WORKSPACE_ROLE_PRESETS.find(p => p.systemKey === k)!
const project = (k: string) => PROJECT_ROLE_PRESETS.find(p => p.systemKey === k)!
const E = 'EDIT', V = 'VIEW', N = 'NONE'

const WORKSPACE: Record<'OWNER' | 'PRODUCER' | 'COLLABORATOR', Record<WorkspaceArea, Level>> = {
  OWNER: {
    dashboardMoney: E, proposals: E, invoices: E, clients: E, rolodex: E, library: E, projects: E, settings: E, team: E,
  },
  PRODUCER: {
    dashboardMoney: E, proposals: E, invoices: E, clients: E, rolodex: E, library: E, projects: E, settings: N, team: N,
  },
  COLLABORATOR: {
    dashboardMoney: N, proposals: N, invoices: N, clients: N, rolodex: N, library: N, projects: N, settings: N, team: N,
  },
}

const ALL_EDIT = Object.fromEntries(PROJECT_AREA_KEYS.map(k => [k, E])) as Record<ProjectArea, Level>
const PROJECT_BASELINE: Record<'OWNER' | 'PRODUCER' | 'COLLABORATOR', Record<ProjectArea, Level>> = {
  OWNER:    ALL_EDIT,
  PRODUCER: ALL_EDIT,
  COLLABORATOR: {
    overview: V, 'budget.lines': V, 'budget.costs': N, 'budget.margin': N,
    crew: V, dealMemos: N, callSheets: E, schedule: V, delivery: N,
    proposals: N, invoices: N, actuals: N, contract: N, projectTeam: N,
  },
}

describe('access matrix — workspace areas', () => {
  for (const role of ['OWNER', 'PRODUCER', 'COLLABORATOR'] as const) {
    it.each(WORKSPACE_AREA_KEYS)(`${role} › %s`, area => {
      expect(preset(role).workspacePermissions[area]).toBe(WORKSPACE[role][area])
    })
  }
  it('covers every workspace area', () => {
    expect(Object.keys(WORKSPACE.OWNER).sort()).toEqual([...WORKSPACE_AREA_KEYS].sort())
  })
})

describe('access matrix — project baseline (no project roles)', () => {
  for (const role of ['OWNER', 'PRODUCER', 'COLLABORATOR'] as const) {
    it.each(PROJECT_AREA_KEYS)(`${role} › %s`, area => {
      expect(resolveProjectPermissions(preset(role).projectBaseline, [])[area]).toBe(PROJECT_BASELINE[role][area])
    })
  }
  it('Collaborators see only assigned projects; Owner and Producer see all', () => {
    expect(preset('COLLABORATOR').projectScope).toBe('ASSIGNED')
    expect(preset('PRODUCER').projectScope).toBe('ALL')
    expect(preset('OWNER').projectScope).toBe('ALL')
  })
})

describe('access matrix — project roles on a Collaborator', () => {
  const collab = preset('COLLABORATOR').projectBaseline
  const withRole = (k: string) => resolveProjectPermissions(collab, [project(k).permissions])

  it('Project Lead and Account Manager get everything on that project', () => {
    for (const k of ['PROJECT_LEAD', 'ACCOUNT_MANAGER']) {
      expect(PROJECT_AREA_KEYS.every(a => withRole(k)[a] === E)).toBe(true)
    }
  })

  it('Project Manager runs the job but never sees margin or the client money', () => {
    const pm = withRole('PROJECT_MANAGER')
    expect(pm['budget.lines']).toBe(E)
    expect(pm['budget.costs']).toBe(E)
    expect(pm['budget.margin']).toBe(N)
    expect(pm.dealMemos).toBe(E)
    expect(pm.actuals).toBe(E)
    expect(pm.proposals).toBe(N)
    expect(pm.invoices).toBe(N)
    expect(pm.contract).toBe(V)
  })

  it('Team member adds nothing to the Collaborator baseline', () => {
    expect(withRole('TEAM_MEMBER')).toEqual(resolveProjectPermissions(collab, []))
  })
})

describe('access matrix — the rules that shape a custom role', () => {
  const none = Object.fromEntries(PROJECT_AREA_KEYS.map(k => [k, N])) as ProjectPermissions

  it('view the budget, edit deal memos and actuals (the separation the roles were built for)', () => {
    const r = resolveProjectPermissions(none, [readProjectPermissions({ 'budget.lines': V, 'budget.costs': V, dealMemos: E, actuals: E })])
    expect([r['budget.lines'], r['budget.costs'], r['budget.margin'], r.dealMemos, r.actuals]).toEqual([V, V, N, E, E])
  })

  it('costs never exceed lines, margin never exceeds costs', () => {
    const r = resolveProjectPermissions(none, [readProjectPermissions({ 'budget.lines': V, 'budget.costs': E, 'budget.margin': E })])
    expect([r['budget.lines'], r['budget.costs'], r['budget.margin']]).toEqual([V, V, V])
  })

  it('actuals switch off without budget costs', () => {
    const r = resolveProjectPermissions(none, [readProjectPermissions({ 'budget.lines': V, actuals: E })])
    expect(r.actuals).toBe(N)
  })
})
