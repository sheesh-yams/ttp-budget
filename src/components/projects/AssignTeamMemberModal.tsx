'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, Shield, User, Eye } from 'lucide-react'
import {
  listEligibleUsersForProjectTeam,
  addToProjectTeam,
  type EligibleUser,
  type ProjectRoleOption,
  type TeamRow,
} from '@/server/actions/project-team'
import type { UserRole } from '@prisma/client'

const WORKSPACE_ROLE_META: Record<UserRole, { label: string; icon: React.ElementType }> = {
  OWNER:        { label: 'Owner',        icon: Shield },
  PRODUCER:     { label: 'Producer',     icon: User },
  COLLABORATOR: { label: 'Collaborator', icon: Eye },
}

function Avatar({ name, email, avatarUrl, size = 32 }: { name: string | null; email: string; avatarUrl: string | null; size?: number }) {
  const initials = (name ?? email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name ?? email} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--brand-primary, #5D00A4)',
      color: 'white', fontSize: size * 0.35, fontWeight: 700,
    }}>
      {initials}
    </div>
  )
}

interface Props {
  projectId:   string
  roles:       ProjectRoleOption[]
  currentRows: TeamRow[]
  onAssigned:  () => void
  onClose:     () => void
}

export function AssignTeamMemberModal({ projectId, roles, currentRows, onAssigned, onClose }: Props) {
  const [users, setUsers]       = useState<EligibleUser[]>([])
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [roleId, setRoleId]     = useState(roles.find(r => r.systemKey === 'TEAM_MEMBER')?.id ?? roles[0]?.id ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listEligibleUsersForProjectTeam(projectId).then(res => {
      if (res.success) setUsers(res.data)
      else setError((res as { success: false; error: string }).error)
      setLoading(false)
    })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [projectId])

  // userId → the project roles they already hold here
  const heldBy: Record<string, TeamRow[]> = {}
  for (const row of currentRows) (heldBy[row.userId] ??= []).push(row)

  const filtered = users.filter(u =>
    !query || u.name?.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())
  )

  async function handlePick(user: EligibleUser) {
    if (heldBy[user.id]?.some(r => r.projectRoleId === roleId)) return
    setAssigning(user.id)
    setError(null)
    const result = await addToProjectTeam({ projectId, userId: user.id, projectRoleId: roleId })
    setAssigning(null)
    if (result.success) {
      onAssigned()
      onClose()
    } else {
      setError((result as { success: false; error: string }).error)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'hsl(var(--background))',
        borderRadius: 14, border: '1px solid hsl(var(--border))',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>Add to project</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13, color: 'hsl(var(--foreground))' }}>
              as
              <select
                value={roleId}
                onChange={e => setRoleId(e.target.value)}
                style={{ fontSize: 13, fontWeight: 600, padding: '2px 6px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
              >
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, background: 'hsl(var(--muted))', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'hsl(var(--muted))', borderRadius: 8, padding: '6px 10px' }}>
            <Search style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'hsl(var(--foreground))' }}
            />
          </div>
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <p style={{ padding: '20px 20px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>}
          {!loading && filtered.length === 0 && <p style={{ padding: '20px 20px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No members found.</p>}
          {filtered.map((user, i) => {
            const meta       = WORKSPACE_ROLE_META[user.role]
            const Icon       = meta.icon
            const held       = heldBy[user.id] ?? []
            const hasThisOne = held.some(r => r.projectRoleId === roleId)
            const busy       = assigning === user.id

            return (
              <button
                key={user.id}
                onClick={() => !hasThisOne && !busy && handlePick(user)}
                disabled={hasThisOne || busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                  background: hasThisOne ? 'hsl(var(--muted))' : 'transparent',
                  border: 'none', cursor: hasThisOne ? 'default' : 'pointer',
                  textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!hasThisOne) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))' }}
                onMouseLeave={e => { if (!hasThisOne) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Avatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', marginBottom: 1 }}>{user.name ?? user.email}</p>
                  {user.name && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{user.email}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                    <Icon style={{ width: 10, height: 10 }} />
                    {meta.label}
                  </span>
                  {held.length > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: hasThisOne ? 'hsl(var(--muted))' : '#fef3c7',
                      color: hasThisOne ? 'hsl(var(--muted-foreground))' : '#92400e',
                    }}>
                      {hasThisOne ? 'Already in this role' : `On project: ${held.map(r => r.roleName).join(', ')}`}
                    </span>
                  )}
                  {busy && <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>Adding…</span>}
                </div>
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid hsl(var(--border))', flexShrink: 0 }}>
            <p style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
