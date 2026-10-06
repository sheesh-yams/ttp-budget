// Fails the build if any page under /projects/[id] stops checking project
// access — so a new project tab can't silently skip the Collaborator
// assignment check (layouts alone don't guard: they don't re-run on
// sibling navigation).

import fs from 'fs'
import path from 'path'

const PROJECT_DIR = path.join(process.cwd(), 'src/app/(auth)/projects/[id]')

// Tabs that expose project money — each gated on its permission area (roles
// Phase 2a), not just "can open the project".
const FINANCIAL_TABS: [string, string][] = [
  ['actuals/page.tsx',      'actuals'],
  ['actuals/wrap/page.tsx', 'actuals'],
  ['receipts/page.tsx',     'actuals'],
  ['invoices/page.tsx',     'invoices'],
  ['contract/page.tsx',     'contract'],
]

function pages(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return pages(full, base)
    return e.name === 'page.tsx' ? [path.relative(base, full)] : []
  })
}

describe('project page access guards', () => {
  const all = pages(PROJECT_DIR)

  it('finds the project pages', () => {
    expect(all.length).toBeGreaterThanOrEqual(15)
  })

  it.each(all)('%s calls requireProjectAccess', rel => {
    const src = fs.readFileSync(path.join(PROJECT_DIR, rel), 'utf8')
    expect(src).toMatch(/await requireProjectAccess\(/)
  })

  it.each(FINANCIAL_TABS)('%s requires the %s area', (rel, area) => {
    const src = fs.readFileSync(path.join(PROJECT_DIR, rel), 'utf8')
    expect(src).toMatch(new RegExp(`await requireProjectArea\\(id, '${area}'\\)`))
  })

  it('the wrap report also requires Budget margin', () => {
    const src = fs.readFileSync(path.join(PROJECT_DIR, 'actuals/wrap/page.tsx'), 'utf8')
    expect(src).toMatch(/can\('budget\.margin'\)\) notFound\(\)/)
  })
})

const AUTH_DIR = path.join(process.cwd(), 'src/app/(auth)')

// Workspace sections (roles 2b): every page under each one must check its
// permission area itself — the sidebar hiding them is not the barrier.
const WORKSPACE_SECTIONS: [string, string][] = [
  ['clients', 'clients'], ['rolodex', 'rolodex'],
  ['rates', 'library'], ['templates', 'library'], ['library', 'library'],
  ['settings', 'settings'],
]

describe('workspace section guards', () => {
  const all = WORKSPACE_SECTIONS.flatMap(([section, area]) =>
    pages(path.join(AUTH_DIR, section))
      // Settings → Roles is gated on Team & roles by listRoles (roles 2c).
      .filter(rel => !(section === 'settings' && rel.startsWith('roles')))
      .map(rel => [path.join(section, rel), area] as [string, string]),
  )

  it('finds the workspace pages', () => {
    expect(all.length).toBeGreaterThanOrEqual(10)
  })

  it.each(all)('%s requires the %s area', (rel, area) => {
    const src = fs.readFileSync(path.join(AUTH_DIR, rel), 'utf8')
    expect(src).toMatch(new RegExp(`await requireWorkspaceArea\\('${area}'\\)`))
  })
})

// Workspace money lists (roles Phase 2a): every page must check its
// permission — the list on the workspace area, a single record on its project.
describe('workspace money section guards', () => {
  const all = ['proposals', 'invoices'].flatMap(section =>
    pages(path.join(AUTH_DIR, section)).map(rel => [path.join(section, rel), section] as [string, string]),
  )

  it.each(all)('%s checks the %s permission', (rel, area) => {
    const src = fs.readFileSync(path.join(AUTH_DIR, rel), 'utf8')
    expect(src).toMatch(new RegExp(`await requireWorkspaceArea\\('${area}'\\)|requireMoneyPermission\\(\\{ \\w+Id: id \\}, '${area}', 'VIEW'\\)`))
  })
})

// Team & roles (roles 2c): the Team page and Settings → Roles check the team
// permission themselves (the sidebar hiding them is not the barrier).
describe('team & roles page guards', () => {
  it.each(['team/page.tsx', 'settings/roles/page.tsx'])('%s calls requireTeamViewer', rel => {
    const src = fs.readFileSync(path.join(AUTH_DIR, rel), 'utf8')
    expect(src).toMatch(/await requireTeamViewer\(\)/)
  })
})
