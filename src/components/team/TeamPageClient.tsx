'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Clock, X, UserPlus, Shield, User, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { inviteTeamMember, revokeInvitation, changeMemberRole } from '@/server/actions/team'
import type { UserRole } from '@prisma/client'

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, { label: string; icon: React.ElementType; badge: string; blurb: string }> = {
  OWNER:        { label: 'Owner',        icon: Shield, badge: 'bg-violet-100 text-violet-700 hover:bg-violet-100', blurb: 'Full access — settings, billing, members.' },
  PRODUCER:     { label: 'Producer',     icon: User,   badge: 'bg-muted text-muted-foreground hover:bg-muted',     blurb: 'Create budgets, proposals, and invoices.' },
  COLLABORATOR: { label: 'Collaborator', icon: Eye,    badge: 'bg-blue-100 text-blue-700 hover:bg-blue-100',       blurb: 'Assigned projects only · margin-blind budgets.' },
}

const ROLE_ORDER: UserRole[] = ['COLLABORATOR', 'PRODUCER', 'OWNER']

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id:            string
  name:          string | null
  email:         string
  avatarUrl:     string | null
  role:          UserRole
  createdAt:     string
  isCurrentUser: boolean
}

interface PendingInvite {
  id:            string
  email:         string
  role:          UserRole
  invitedByName: string | null
  expiresAt:     string
  createdAt:     string
}

interface Props {
  members:            Member[]
  pendingInvitations: PendingInvite[]
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

function RoleBadge({ role }: { role: UserRole }) {
  const meta = ROLE_META[role]
  const Icon = meta.icon
  return (
    <Badge className={`gap-1 font-medium ${meta.badge}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  )
}

// Owner-only inline role editor for an existing member. The whole Team page is
// already OWNER-gated, so every viewer here may reassign others' roles.
function MemberRoleSelect({ userId, role }: { userId: string; role: UserRole }) {
  const router = useRouter()
  const [value, setValue]  = useState<UserRole>(role)
  const [isPending, start] = useTransition()
  const [error, setError]  = useState<string | null>(null)

  function onChange(next: string) {
    const nextRole = next as UserRole
    const prev = value
    setValue(nextRole)
    setError(null)
    start(async () => {
      const res = await changeMemberRole(userId, nextRole)
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
          {ROLE_ORDER.map(r => (
            <SelectItem key={r} value={r} className="text-xs">{ROLE_META[r].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamPageClient({ members, pendingInvitations }: Props) {
  const router = useRouter()
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRole, setInviteRole]     = useState<UserRole>('PRODUCER')
  const [inviteError, setInviteError]   = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [isPending, startTransition]    = useTransition()
  const [revoking, setRevoking]         = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviteError(null)
    setInviteSuccess(false)

    startTransition(async () => {
      const result = await inviteTeamMember(inviteEmail.trim(), inviteRole)
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
              {member.isCurrentUser
                ? <RoleBadge role={member.role} />
                : <MemberRoleSelect userId={member.id} role={member.role} />}
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
                <RoleBadge role={invite.role} />
                <button
                  onClick={() => handleRevoke(invite.id)}
                  disabled={revoking === invite.id}
                  className="ml-2 flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  title="Revoke invitation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Invite form ───────────────────────────────────────────────────── */}
      <section>
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
                {ROLE_ORDER.map(r => {
                  const meta = ROLE_META[r]
                  const Icon = meta.icon
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInviteRole(r)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        inviteRole === r
                          ? 'border-[var(--brand-primary,#5D00A4)] bg-violet-50 text-violet-700'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-medium">{meta.label}</span>
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
      </section>
    </div>
  )
}
