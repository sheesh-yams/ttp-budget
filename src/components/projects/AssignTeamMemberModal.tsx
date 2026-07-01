'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, Shield, User, Eye } from 'lucide-react'
import { listEligibleUsersForProjectTeam, assignProjectTeamRole, type EligibleUser, type ProjectTeamMap } from '@/server/actions/project-team'
import type { ProjectTeamRole, UserRole } from '@prisma/client'

const ROLE_LABEL: Record<ProjectTeamRole, string> = {
  PROJECT_LEAD:    'Project Lead',
  ACCOUNT_MANAGER: 'Account Manager',
  PROJECT_MANAGER: 'Project Manager',
}

const WORKSPACE_ROLE_META: Record<UserRole, { label: string; icon: React.ElementType }> = {
  OWNER:        { label: 'Owner',        icon: Shield },
  PRODUCER:     { label: 'Producer',     icon: User },
  COLLABORATOR: { label: 'Collaborator', icon: Eye },
}

function Avatar({ name, email, avatarUrl, size = 32 }: { name: string | null; email: string; avatarUrl: string | null; size?: number }) {
  const initials = (name ?? email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (avatarUrl) {
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
  role:        ProjectTeamRole
  currentTeam: ProjectTeamMap
  onAssigned:  (role: ProjectTeamRole) => void
  onClose:     () => void
}

export function AssignTeamMemberModal({ projectId, role, currentTeam, onAssigned, onClose }: Props) {
  const [users, setUsers]       = useState<EligibleUser[]>([])
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listEligibleUsersForProjectTeam().then(res => {
      if (res.success) setUsers(res.data)
      setLoading(false)
    })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Map userId → role they currently hold on this project
  const currentRoleByUser: Record<string, ProjectTeamRole> = {}
  for (const [r, member] of Object.entries(currentTeam)) {
    if (member) currentRoleByUser[member.userId] = r as ProjectTeamRole
  }

  const filtered = users.filter(u =>
    !query || u.name?.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())
  )

  async function handlePick(user: EligibleUser) {
    const existingRole = currentRoleByUser[user.id]
    if (existingRole && existingRole === role) return // already in this exact role

    setAssigning(user.id)
    setError(null)
    const result = await assignProjectTeamRole({ projectId, role, userId: user.id })
    setAssigning(null)
    if (result.success) {
      onAssigned(role)
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
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>Assign</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'hsl(var(--foreground))' }}>{ROLE_LABEL[role]}</p>
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
          {loading && (
            <p style={{ padding: '20px 20px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p style={{ padding: '20px 20px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No members found.</p>
          )}
          {filtered.map((user, i) => {
            const meta      = WORKSPACE_ROLE_META[user.role]
            const Icon      = meta.icon
            const heldRole  = currentRoleByUser[user.id]
            const isBusy    = !!heldRole
            const isSameSlot = heldRole === role
            const isProcessing = assigning === user.id

            return (
              <button
                key={user.id}
                onClick={() => !isSameSlot && !isProcessing && handlePick(user)}
                disabled={isSameSlot || isProcessing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                  background: isSameSlot ? 'hsl(var(--muted))' : 'transparent',
                  border: 'none', cursor: isSameSlot ? 'default' : 'pointer',
                  textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSameSlot) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))' }}
                onMouseLeave={e => { if (!isSameSlot) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Avatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', marginBottom: 1 }}>
                    {user.name ?? user.email}
                  </p>
                  {user.name && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{user.email}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                    background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
                  }}>
                    <Icon style={{ width: 10, height: 10 }} />
                    {meta.label}
                  </span>
                  {isBusy && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: isSameSlot ? 'hsl(var(--muted))' : '#fef3c7',
                      color: isSameSlot ? 'hsl(var(--muted-foreground))' : '#92400e',
                    }}>
                      {isSameSlot ? 'Already assigned' : `Already: ${ROLE_LABEL[heldRole]}`}
                    </span>
                  )}
                  {isProcessing && (
                    <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>Assigning…</span>
                  )}
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
