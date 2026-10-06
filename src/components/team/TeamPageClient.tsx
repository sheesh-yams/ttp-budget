'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Clock, X, UserPlus, Shield, User, Eye, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { inviteTeamMember, revokeInvitation, removeWorkspaceMember } from '@/server/actions/team'
import { assignWorkspaceRole } from '@/server/actions/roles'
import { getActiveProjectRolesForUser } from '@/server/actions/project-team'
import type { SystemRoleKey } from '@/lib/permissions'

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<SystemRoleKey, { label: string; icon: React.ElementType; badge: string; blurb: string }> = {
  OWNER:        { label: 'Owner',        icon: Shield, badge: 'bg-violet-100 text-violet-700 hover:bg-violet-100', blurb: 'Full access — settings, billing, members.' },
  PRODUCER:     { label: 'Producer',     icon: User,   badge: 'bg-muted text-muted-foreground hover:bg-muted',     blurb: 'Create budgets, proposals, and invoices.' },
  COLLABORATOR: { label: 'Collaborator', icon: Eye,    badge: 'bg-blue-100 text-blue-700 hover:bg-blue-100',       blurb: 'Assigned projects only · margin-blind budgets.' },
}

/** A workspace role offered on this page (built-in or custom). */
export interface RoleOption {
  id:        string
  name:      string
  systemKey: string | null
}

function metaFor(systemKey: string | null) {
  return systemKey && systemKey in ROLE_META
    ? ROLE_META[systemKey as SystemRoleKey]
    : { label: '', icon: Users, badge: 'bg-amber-50 text-amber-800 hover:bg-amber-50', blurb: 'Custom role — see Settings → Roles.' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id:            string
  name:          string | null
  email:         string
  avatarUrl:     string | null
  roleId:        string | null
  roleName:      string | null
  /** OWNER / PRODUCER / COLLABORATOR for built-in roles, null for custom. */
  roleSystemKey: string | null
  createdAt:     string
  isCurrentUser: boolean
}

interface PendingInvite {
  id:            string
  email:         string
  roleName:      string | null
  roleSystemKey: string | null
  invitedByName: string | null
  expiresAt:     string
  createdAt:     string
}

interface RemoveCandidate {
  id:          string
  name:        string | null
  email:       string
  activeRoles: { projectName: string; role: string }[]
}

interface Props {
  members:            Member[]
  pendingInvitations: PendingInvite[]
  /** Team & roles EDIT — member and invite controls (roles 2c). */
  isOwner:            boolean
  /** The viewer is an Owner — only Owners touch Owners (owner-rules.ts). */
  callerIsOwner?:     boolean
  roles:              RoleOption[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const initials = (name ?? email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={name ?? email} className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
    )
  }
  return (
    <div
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
      style={{ background: 'var(--brand-primary, #5D00A4)' }}
    >
      {initials}
    </div>
  )
}

function RoleBadge({ name, systemKey }: { name: string; systemKey: string | null }) {
  const meta = metaFor(systemKey)
  const Icon = meta.icon
  return (
    <Badge className={`gap-1 font-medium ${meta.badge}`}>
      <Icon className="h-3 w-3" />
      {name}
    </Badge>
  )
}

// Inline role editor for an existing member (Team & roles EDIT). `roles` is
// already filtered: non-Owners never see the Owner role here.
function MemberRoleSelect({ userId, roleId, roles }: { userId: string; roleId: string | null; roles: RoleOption[] }) {
  const router = useRouter()
  const [value, setValue]  = useState<string>(roleId ?? '')
  const [isPending, start] = useTransition()
  const [error, setError]  = useState<string | null>(null)

  function onChange(next: string) {
    const prev = value
    setValue(next)
    setError(null)
    start(async () => {
      const res = await assignWorkspaceRole(userId, next)
      if (res.success) {
        router.refresh()
      } else {
        setValue(prev) // revert optimistic change
        setError((res as { success: false; error: string }).error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Select value={value} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map(r => (
            <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  PROJECT_LEAD:    'Project Lead',
  ACCOUNT_MANAGER: 'Account Manager',
  PROJECT_MANAGER: 'Project Manager',
}

export function TeamPageClient({ members, pendingInvitations, isOwner, callerIsOwner = true, roles: allRoles }: Props) {
  // Non-Owner team admins can't grant Owner, or change / remove an Owner.
  const roles = callerIsOwner ? allRoles : allRoles.filter(r => r.systemKey !== 'OWNER')
  const ownerRoleId = allRoles.find(r => r.systemKey === 'OWNER')?.id ?? null
  const locked = (m: { roleId: string | null; roleSystemKey: string | null }) =>
    !callerIsOwner && (m.roleId ? m.roleId === ownerRoleId : m.roleSystemKey === 'OWNER')
  const router = useRouter()
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRoleId, setInviteRoleId] = useState<string>(
    roles.find(r => r.systemKey === 'PRODUCER')?.id ?? roles[0]?.id ?? '',
  )
  const [inviteError, setInviteError]   = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [isPending, startTransition]    = useTransition()
  const [revoking, setRevoking]         = useState<string | null>(null)

  // Removal confirmation state
  const [removeCandidate, setRemoveCandidate] = useState<RemoveCandidate | null>(null)
  const [removing, setRemoving]               = useState(false)
  const [removeError, setRemoveError]         = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviteError(null)
    setInviteSuccess(false)

    startTransition(async () => {
      const result = await inviteTeamMember(inviteEmail.trim(), inviteRoleId)
      if (result.success) {
        setInviteEmail('')
        setInviteSuccess(true)
        router.refresh()
        setTimeout(() => setInviteSuccess(false), 4000)
      } else {
        setInviteError((result as { success: false; error: string }).error)
      }
    })
  }

  async function handleRevoke(invitationId: string) {
    setRevoking(invitationId)
    const result = await revokeInvitation(invitationId)
    setRevoking(null)
    if (result.success) router.refresh()
  }

  async function handleRemoveClick(member: Member) {
    setRemoveError(null)
    const rolesResult = await getActiveProjectRolesForUser(member.id)
    const activeRoles = rolesResult.success ? rolesResult.data : []
    setRemoveCandidate({
      id:          member.id,
      name:        member.name,
      email:       member.email,
      activeRoles: activeRoles.map(r => ({ projectName: r.projectName, role: r.role })),
    })
  }

  async function handleConfirmRemove() {
    if (!removeCandidate) return
    setRemoving(true)
    setRemoveError(null)
    const result = await removeWorkspaceMember(removeCandidate.id)
    setRemoving(false)
    if (result.success) {
      setRemoveCandidate(null)
      router.refresh()
    } else {
      setRemoveError((result as { success: false; error: string }).error)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── Current members ───────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Members <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{members.length}</span>
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {members.map((member, i) => (
            <div
              key={member.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${i < members.length - 1 ? 'border-b' : ''}`}
            >
              <Avatar name={member.name} email={member.email} avatarUrl={member.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {member.name ?? member.email}
                  </span>
                  {member.isCurrentUser && (
                    <span className="text-[10px] font-medium text-muted-foreground">(you)</span>
                  )}
                </div>
                {member.name && (
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                )}
              </div>
              {member.isCurrentUser || !isOwner || locked(member)
                ? <RoleBadge name={member.roleName ?? 'No role'} systemKey={member.roleSystemKey} />
                : (
                  <div className="flex items-center gap-2">
                    <MemberRoleSelect userId={member.id} roleId={member.roleId} roles={roles} />
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveClick(member)}
                        className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Remove from workspace"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Pending invitations ───────────────────────────────────────────── */}
      {pendingInvitations.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Pending invitations
            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-700">{pendingInvitations.length}</span>
          </h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {pendingInvitations.map((invite, i) => (
              <div
                key={invite.id}
                className={`flex items-center gap-3 px-4 py-3 ${i < pendingInvitations.length - 1 ? 'border-b' : ''}`}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{invite.email}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires {new Date(invite.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <RoleBadge name={invite.roleName ?? 'Collaborator'} systemKey={invite.roleName ? invite.roleSystemKey : 'COLLABORATOR'} />
                {isOwner && (callerIsOwner || invite.roleSystemKey !== 'OWNER') && <button
                  onClick={() => handleRevoke(invite.id)}
                  disabled={revoking === invite.id}
                  className="ml-2 flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  title="Revoke invitation"
                >
                  <X className="h-4 w-4" />
                </button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Invite form ───────────────────────────────────────────────────── */}
      {isOwner && <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Invite someone
        </h2>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@studio.com"
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {roles.map(r => {
                  const meta = metaFor(r.systemKey)
                  const Icon = meta.icon
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setInviteRoleId(r.id)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        inviteRoleId === r.id
                          ? 'border-[var(--brand-primary,#5D00A4)] bg-violet-50 text-violet-700'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-medium">{r.name}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-tight opacity-70">{meta.blurb}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {inviteError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                ✓ Invitation sent! They&rsquo;ll receive an email with a link to join.
              </p>
            )}

            <Button type="submit" disabled={isPending || !inviteEmail.trim()} className="w-full">
              {isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </form>
        </div>
      </section>}

      {/* ── Remove member confirmation ─────────────────────────────────────── */}
      {removeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border shadow-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground">
              Remove {removeCandidate.name ?? removeCandidate.email} from workspace?
            </h3>

            {removeCandidate.activeRoles.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                <p className="text-xs font-medium text-amber-800 mb-2">
                  They currently hold these project roles:
                </p>
                {removeCandidate.activeRoles.map((r, i) => (
                  <p key={i} className="text-xs text-amber-700">
                    · {ROLE_LABEL[r.role] ?? r.role} on <span className="font-medium">{r.projectName}</span>
                  </p>
                ))}
                <p className="text-xs text-amber-700 mt-2">
                  These will be marked as vacated. History will be preserved.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              This will revoke their access to the workspace immediately.
            </p>

            {removeError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{removeError}</p>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <Button
                variant="outline"
                onClick={() => { setRemoveCandidate(null); setRemoveError(null) }}
                disabled={removing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmRemove}
                disabled={removing}
              >
                {removing ? 'Removing…' : 'Remove member'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
