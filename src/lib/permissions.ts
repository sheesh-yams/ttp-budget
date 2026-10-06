/**
 * permissions.ts — the roles & permissions catalog (roles Phase 1).
 *
 * Two levels:
 *  - Workspace role: workspace areas (pages outside a project), which projects
 *    the member can open (projectScope), and a baseline for every project area.
 *  - Project role: project areas, held per person per project.
 * Effective level on a project = max(baseline, every project role held there),
 * then dependency caps. Owner is always EDIT everywhere.
 *
 * Pure module (no DB, no auth) so the rules are unit-testable and shareable by
 * server code and UI. Stored permissions are JSON maps { area: level }; read
 * them through readWorkspacePermissions / readProjectPermissions, which drop
 * unknown keys and default missing ones to NONE.
 */


// The built-in workspace roles every workspace is seeded with.
export type SystemRoleKey = 'OWNER' | 'PRODUCER' | 'COLLABORATOR'

// ─── Levels ───────────────────────────────────────────────────────────────────

export type Level = 'NONE' | 'VIEW' | 'EDIT'
export const LEVELS: readonly Level[] = ['NONE', 'VIEW', 'EDIT']

const RANK: Record<Level, number> = { NONE: 0, VIEW: 1, EDIT: 2 }

/** EDIT implies VIEW. */
export function atLeast(have: Level, need: Level): boolean {
  return RANK[have] >= RANK[need]
}

export function maxLevel(a: Level, b: Level): Level {
  return RANK[a] >= RANK[b] ? a : b
}

export function minLevel(a: Level, b: Level): Level {
  return RANK[a] <= RANK[b] ? a : b
}

function toLevel(v: unknown): Level {
  return v === 'VIEW' || v === 'EDIT' ? v : 'NONE'
}

// ─── Areas ────────────────────────────────────────────────────────────────────

export const WORKSPACE_AREAS = [
  { key: 'dashboardMoney', label: 'Dashboard money',   group: 'Money',  hint: 'Revenue, outstanding invoices and project values on the dashboard' },
  { key: 'proposals',      label: 'Proposals',         group: 'Money',  hint: 'The proposals list across all projects' },
  { key: 'invoices',       label: 'Invoices',          group: 'Money',  hint: 'The invoices list and payment settings' },
  { key: 'clients',        label: 'Clients',           group: 'Data',   hint: 'Client companies and their contact details' },
  { key: 'rolodex',        label: 'Rolodex',           group: 'Data',   hint: 'Crew and vendor contacts, with their rates' },
  { key: 'library',        label: 'Rates & templates', group: 'Data',   hint: 'Rate cards, budget templates and the library' },
  { key: 'projects',       label: 'Projects',          group: 'Data',   hint: 'Create, archive and restore projects (Edit)' },
  { key: 'settings',       label: 'Settings',          group: 'Admin',  hint: 'Workspace settings, branding, contracts and payments' },
  { key: 'team',           label: 'Team & roles',      group: 'Admin',  hint: 'Invite people, change roles, edit role permissions' },
] as const

export type WorkspaceArea = (typeof WORKSPACE_AREAS)[number]['key']

export const PROJECT_AREAS = [
  { key: 'overview',      label: 'Overview',        group: 'Project', hint: 'Project details, proposal overview and deliverables' },
  { key: 'budget.lines',  label: 'Budget lines',    group: 'Budget',  hint: 'Line items, quantities and units — no money' },
  { key: 'budget.costs',  label: 'Budget costs',    group: 'Budget',  hint: 'Rates, line totals and the budget total' },
  { key: 'budget.margin', label: 'Budget margin',   group: 'Budget',  hint: 'Markup, agency fee and discounts' },
  { key: 'crew',          label: 'Crew',            group: 'Vendors', hint: 'Who is on the crew' },
  { key: 'dealMemos',     label: 'Deal memos',      group: 'Vendors', hint: 'Bids, awards and what vendors are paid' },
  { key: 'callSheets',    label: 'Call sheets',     group: 'Production', hint: 'Call sheets and sending them' },
  { key: 'schedule',      label: 'Schedule',        group: 'Production', hint: 'Shoot days, scenes and locations' },
  { key: 'delivery',      label: 'Delivery',        group: 'Production', hint: 'Deliverables and the client delivery page' },
  { key: 'proposals',     label: 'Proposals',       group: 'Money',   hint: 'Creating and sending proposals for this project' },
  { key: 'invoices',      label: 'Invoices',        group: 'Money',   hint: 'This project’s invoices' },
  { key: 'actuals',       label: 'Actuals',         group: 'Money',   hint: 'Actual spend, receipts and the wrap report' },
  { key: 'contract',      label: 'Contract',        group: 'Money',   hint: 'The client contract' },
  { key: 'projectTeam',   label: 'Project team',    group: 'Project', hint: 'Who is on this project, and their project roles' },
] as const

export type ProjectArea = (typeof PROJECT_AREAS)[number]['key']

export type WorkspacePermissions = Record<WorkspaceArea, Level>
export type ProjectPermissions   = Record<ProjectArea, Level>

export const WORKSPACE_AREA_KEYS = WORKSPACE_AREAS.map(a => a.key) as WorkspaceArea[]
export const PROJECT_AREA_KEYS   = PROJECT_AREAS.map(a => a.key) as ProjectArea[]

function fill<K extends string>(keys: K[], level: Level): Record<K, Level> {
  return Object.fromEntries(keys.map(k => [k, level])) as Record<K, Level>
}

/** Read a stored JSON map. Unknown keys are dropped; missing ones are NONE. */
export function readWorkspacePermissions(json: unknown): WorkspacePermissions {
  const src = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  return Object.fromEntries(WORKSPACE_AREA_KEYS.map(k => [k, toLevel(src[k])])) as WorkspacePermissions
}

export function readProjectPermissions(json: unknown): ProjectPermissions {
  const src = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  return applyProjectDependencies(
    Object.fromEntries(PROJECT_AREA_KEYS.map(k => [k, toLevel(src[k])])) as ProjectPermissions,
  )
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

/**
 * An area can't be more open than the one it depends on: seeing costs means
 * seeing the lines they're on; seeing margin means seeing the costs it's on.
 */
export const PROJECT_DEPENDENCIES: readonly { area: ProjectArea; requires: ProjectArea }[] = [
  { area: 'budget.costs',  requires: 'budget.lines' },
  { area: 'budget.margin', requires: 'budget.costs' },
]

export function applyProjectDependencies(p: ProjectPermissions): ProjectPermissions {
  const out = { ...p }
  // In declaration order, so margin is capped by the already-capped costs.
  for (const { area, requires } of PROJECT_DEPENDENCIES) {
    out[area] = minLevel(out[area], out[requires])
  }
  return out
}

/**
 * An area that only works when another is at least VIEW — but otherwise keeps
 * its own level (unlike PROJECT_DEPENDENCIES, which cap). Actuals compares
 * spend to budgeted amounts, so it needs Budget costs visible; someone can
 * still EDIT actuals while only VIEWing the budget (user decision 2026-10-05).
 *
 * Applied to the person's combined access (resolveProjectPermissions), not to
 * each stored role, so a project role can grant Actuals and rely on the
 * workspace role for budget visibility.
 */
export const PROJECT_VIEW_REQUIREMENTS: readonly { area: ProjectArea; requires: ProjectArea }[] = [
  { area: 'actuals', requires: 'budget.costs' },
]

export function applyProjectViewRequirements(p: ProjectPermissions): ProjectPermissions {
  const out = { ...p }
  for (const { area, requires } of PROJECT_VIEW_REQUIREMENTS) {
    if (out[requires] === 'NONE') out[area] = 'NONE'
  }
  return out
}

/** Areas switched off by a view requirement, for the Roles screen warning. */
export function unmetViewRequirements(p: ProjectPermissions): { area: ProjectArea; requires: ProjectArea }[] {
  return PROJECT_VIEW_REQUIREMENTS.filter(r => p[r.area] !== 'NONE' && p[r.requires] === 'NONE')
}

/**
 * Effective permissions on one project: the workspace role's baseline, raised
 * by every project role the person holds there, then dependency-capped and
 * view requirements applied.
 */
export function resolveProjectPermissions(
  baseline: ProjectPermissions,
  roleGrants: ProjectPermissions[],
): ProjectPermissions {
  const merged = { ...baseline }
  for (const grant of roleGrants) {
    for (const k of PROJECT_AREA_KEYS) merged[k] = maxLevel(merged[k], grant[k])
  }
  return applyProjectViewRequirements(applyProjectDependencies(merged))
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export const MAX_ROLES = 7

export type ProjectScopeValue = 'ALL' | 'ASSIGNED'

export interface WorkspaceRolePreset {
  systemKey:            'OWNER' | 'PRODUCER' | 'COLLABORATOR'
  name:                 string
  order:                number
  projectScope:         ProjectScopeValue
  workspacePermissions: WorkspacePermissions
  projectBaseline:      ProjectPermissions
}

export interface ProjectRolePreset {
  systemKey:   'PROJECT_LEAD' | 'ACCOUNT_MANAGER' | 'PROJECT_MANAGER' | 'TEAM_MEMBER'
  name:        string
  order:       number
  permissions: ProjectPermissions
}

const ALL_PROJECT_EDIT   = fill(PROJECT_AREA_KEYS, 'EDIT')
const ALL_PROJECT_NONE   = fill(PROJECT_AREA_KEYS, 'NONE')
const ALL_WORKSPACE_EDIT = fill(WORKSPACE_AREA_KEYS, 'EDIT')
const ALL_WORKSPACE_NONE = fill(WORKSPACE_AREA_KEYS, 'NONE')

/**
 * The seeded workspace roles. Owner and Producer reproduce today's behaviour;
 * Collaborator is today's minus budget costs (user decision 2026-10-01: line
 * items without money by default; call sheets stay editable, as today).
 */
export const WORKSPACE_ROLE_PRESETS: readonly WorkspaceRolePreset[] = [
  {
    systemKey: 'OWNER', name: 'Owner', order: 0, projectScope: 'ALL',
    workspacePermissions: ALL_WORKSPACE_EDIT,
    projectBaseline:      ALL_PROJECT_EDIT,
  },
  {
    systemKey: 'PRODUCER', name: 'Producer', order: 1, projectScope: 'ALL',
    workspacePermissions: { ...ALL_WORKSPACE_EDIT, settings: 'NONE', team: 'NONE' },
    projectBaseline:      ALL_PROJECT_EDIT,
  },
  {
    systemKey: 'COLLABORATOR', name: 'Collaborator', order: 2, projectScope: 'ASSIGNED',
    workspacePermissions: ALL_WORKSPACE_NONE,
    projectBaseline: {
      ...ALL_PROJECT_NONE,
      overview:       'VIEW',
      'budget.lines': 'VIEW',
      crew:           'VIEW',
      callSheets:     'EDIT',
      schedule:       'VIEW',
    },
  },
]

/** The seeded project roles; the first three are today's fixed team slots. */
export const PROJECT_ROLE_PRESETS: readonly ProjectRolePreset[] = [
  { systemKey: 'PROJECT_LEAD',    name: 'Project Lead',    order: 0, permissions: ALL_PROJECT_EDIT },
  { systemKey: 'ACCOUNT_MANAGER', name: 'Account Manager', order: 1, permissions: ALL_PROJECT_EDIT },
  {
    systemKey: 'PROJECT_MANAGER', name: 'Project Manager', order: 2,
    permissions: {
      ...ALL_PROJECT_EDIT,
      'budget.margin': 'NONE',
      proposals:       'NONE',
      invoices:        'NONE',
      contract:        'VIEW',
    },
  },
  { systemKey: 'TEAM_MEMBER', name: 'Team member', order: 3, permissions: ALL_PROJECT_NONE },
]

export function workspacePresetFor(key: SystemRoleKey): WorkspaceRolePreset {
  return WORKSPACE_ROLE_PRESETS.find(p => p.systemKey === key)!
}

// ─── Phase 3: custom roles ────────────────────────────────────────────────────

export interface RoleShape {
  systemKey:            string | null
  projectScope:         ProjectScopeValue
  workspacePermissions: unknown
  projectBaseline:      unknown
}

/** Clean a submitted matrix: known areas only, valid levels, caps applied. */
export function normaliseWorkspacePermissions(input: unknown): WorkspacePermissions {
  return readWorkspacePermissions(input)
}
export function normaliseProjectPermissions(input: unknown): ProjectPermissions {
  return readProjectPermissions(input)
}

export const ROLE_NAME_MAX = 40
