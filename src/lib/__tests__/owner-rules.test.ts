import { mayChangeOwnership, mayEditRole, touchesOwner } from '../owner-rules'

describe('only Owners touch Owners', () => {
  it('flags any change into or out of Owner', () => {
    expect(touchesOwner('OWNER', 'PRODUCER')).toBe(true)
    expect(touchesOwner('COLLABORATOR', 'OWNER')).toBe(true)
    expect(touchesOwner('COLLABORATOR', 'PRODUCER')).toBe(false)
    expect(touchesOwner(null, null)).toBe(false)
  })
  it('a non-Owner team admin manages everyone else', () => {
    expect(mayChangeOwnership(false, 'COLLABORATOR', 'PRODUCER')).toBe(true)
    expect(mayChangeOwnership(false, null, 'COLLABORATOR')).toBe(true)
    expect(mayChangeOwnership(false, 'OWNER', 'PRODUCER')).toBe(false)
    expect(mayChangeOwnership(false, 'PRODUCER', 'OWNER')).toBe(false)
  })
  it('an Owner can do it all', () => {
    expect(mayChangeOwnership(true, 'OWNER', 'PRODUCER')).toBe(true)
    expect(mayChangeOwnership(true, 'PRODUCER', 'OWNER')).toBe(true)
  })
})

describe('no editing a role you hold (no self-promotion)', () => {
  it('blocks non-Owners on their own roles only', () => {
    expect(mayEditRole(false, true)).toBe(false)
    expect(mayEditRole(false, false)).toBe(true)
    expect(mayEditRole(true, true)).toBe(true)
  })
})

describe('a non-Owner can only grant what they have', () => {
  const { roleWithin, projectPermsWithin } = jest.requireActual('../owner-rules') as typeof import('../owner-rules')
  const { WORKSPACE_ROLE_PRESETS } = jest.requireActual('../permissions') as typeof import('../permissions')
  const p = (k: string) => WORKSPACE_ROLE_PRESETS.find(x => x.systemKey === k)!
  const shape = (k: string, over: object = {}) => ({ systemKey: k === 'custom' ? null : k, projectScope: p(k === 'custom' ? 'COLLABORATOR' : k).projectScope, workspacePermissions: p(k === 'custom' ? 'COLLABORATOR' : k).workspacePermissions, projectBaseline: p(k === 'custom' ? 'COLLABORATOR' : k).projectBaseline, ...over })
  const teamAdmin = shape('custom', { workspacePermissions: { ...p('COLLABORATOR').workspacePermissions, team: 'EDIT' } })

  it('blocks granting a bigger role (the second-account trick)', () => {
    expect(roleWithin(teamAdmin, shape('PRODUCER'))).toBe(false)
    expect(roleWithin(teamAdmin, shape('OWNER'))).toBe(false)
  })
  it('allows equal-or-smaller roles', () => {
    expect(roleWithin(teamAdmin, shape('COLLABORATOR'))).toBe(true)
    expect(roleWithin(teamAdmin, teamAdmin)).toBe(true)
  })
  it('ALL scope needs ALL scope', () => {
    expect(roleWithin(teamAdmin, shape('custom', { projectScope: 'ALL' }))).toBe(false)
  })
  it('Owners are uncapped', () => {
    expect(roleWithin(shape('OWNER'), shape('PRODUCER'))).toBe(true)
    expect(projectPermsWithin(shape('OWNER'), { budget: 'EDIT' })).toBe(true)
  })
  it('caps project roles at the caller’s project baseline', () => {
    expect(projectPermsWithin(teamAdmin, { overview: 'VIEW' })).toBe(true)
    expect(projectPermsWithin(teamAdmin, { invoices: 'EDIT' })).toBe(false)
  })
})
