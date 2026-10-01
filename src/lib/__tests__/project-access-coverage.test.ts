// Fails the build if any page under /projects/[id] stops checking project
// access — so a new project tab can't silently skip the Collaborator
// assignment check (layouts alone don't guard: they don't re-run on
// sibling navigation).

import fs from 'fs'
import path from 'path'

const PROJECT_DIR = path.join(process.cwd(), 'src/app/(auth)/projects/[id]')

// Tabs that expose project money — Owner/Producer only.
const FINANCIAL_TABS = [
  'actuals/page.tsx',
  'actuals/wrap/page.tsx',
  'receipts/page.tsx',
  'invoices/page.tsx',
  'contract/page.tsx',
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

  it.each(FINANCIAL_TABS)('%s is Owner/Producer only', rel => {
    const src = fs.readFileSync(path.join(PROJECT_DIR, rel), 'utf8')
    expect(src).toMatch(/await requireProducerPageAccess\(\)/)
  })
})

// Workspace-level Owner/Producer sections: every page under each one must
// 404 for Collaborators (the sidebar hiding them is not the barrier).
const AUTH_DIR = path.join(process.cwd(), 'src/app/(auth)')
const PRODUCER_SECTIONS = ['clients', 'proposals', 'invoices', 'rates', 'templates', 'library', 'rolodex']

describe('Owner/Producer section guards', () => {
  const all = PRODUCER_SECTIONS.flatMap(section =>
    pages(path.join(AUTH_DIR, section)).map(rel => path.join(section, rel)),
  )

  it.each(all)('%s is Owner/Producer only', rel => {
    const src = fs.readFileSync(path.join(AUTH_DIR, rel), 'utf8')
    expect(src).toMatch(/await requireProducerPageAccess\(\)/)
  })
})
