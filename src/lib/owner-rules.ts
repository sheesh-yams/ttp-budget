// "Only Owners touch Owners" (user decision 2026-10-05, roles 2c). Plain,
// pure module so the rules are unit-tested and shared by the team and role
// admin code.

import {
  atLeast, readProjectPermissions, readWorkspacePermissions,
  PROJECT_AREA_KEYS, WORKSPACE_AREA_KEYS, type RoleShape,
} from '@/lib/permissions'

export const OWNER_ONLY_ERROR = 'Only an Owner can change who is an Owner.'
export const HELD_ROLE_ERROR  = 'You can’t change a role you hold yourself — ask an Owner.'

/** A change that makes someone Owner or changes an existing Owner. */
export function touchesOwner(currentKey: string | null | undefined, nextKey: string | null | undefined): boolean {
  return currentKey === 'OWNER' || nextKey === 'OWNER'
}

/** Whether a team admin may make this Owner-related change. */
export function mayChangeOwnership(callerIsOwner: boolean, currentKey: string | null | undefined, nextKey: string | null | undefined): boolean {
  return callerIsOwner || !touchesOwner(currentKey, nextKey)
}

/** Editing / deleting a role the caller holds would let them promote themselves. */
export function mayEditRole(callerIsOwner: boolean, callerHoldsRole: boolean): boolean {
  return callerIsOwner || !callerHoldsRole
}

export const BEYOND_OWN_ERROR = 'You can only give out access you have yourself — ask an Owner.'

/**
 * A non-Owner team admin can't grant (create, edit, assign or invite with) a
 * role more open than their own — otherwise they could build a bigger role and
 * put a second account of theirs in it (roles 2c).
 */
export function roleWithin(caller: RoleShape, candidate: RoleShape): boolean {
  if (candidate.systemKey === 'OWNER') return caller.systemKey === 'OWNER'
  if (caller.systemKey === 'OWNER') return true
  if (candidate.projectScope === 'ALL' && caller.projectScope !== 'ALL') return false
  const cw = readWorkspacePermissions(caller.workspacePermissions), nw = readWorkspacePermissions(candidate.workspacePermissions)
  const cb = readProjectPermissions(caller.projectBaseline),        nb = readProjectPermissions(candidate.projectBaseline)
  return WORKSPACE_AREA_KEYS.every(k => atLeast(cw[k], nw[k])) && PROJECT_AREA_KEYS.every(k => atLeast(cb[k], nb[k]))
}

/** Same cap for a project role's permissions, against the caller's project baseline. */
export function projectPermsWithin(caller: RoleShape, permissions: unknown): boolean {
  if (caller.systemKey === 'OWNER') return true
  const cb = readProjectPermissions(caller.projectBaseline), np = readProjectPermissions(permissions)
  return PROJECT_AREA_KEYS.every(k => atLeast(cb[k], np[k]))
}
