'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, MoreHorizontal, UserX, RefreshCw } from 'lucide-react'
import {
  getProjectTeam,
  unassignProjectTeamRole,
  type ProjectTeamMap,
  type TeamMember,
} from '@/server/actions/project-team'
import { AssignTeamMemberModal } from './AssignTeamMemberModal'
import { TeamHistoryList } from './TeamHistoryList'
import type { ProjectTeamRole } from '@prisma/client'

const ROLES: ProjectTeamRole[] = ['PROJECT_LEAD', 'ACCOUNT_MANAGER', 'PROJECT_MANAGER']

const ROLE_LABEL: Record<ProjectTeamRole, string> = {
  PROJECT_LEAD:    'Project Lead',
  ACCOUNT_MANAGER: 'Account Manager',
  PROJECT_MANAGER: 'Project Manager',
}

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const initials = (name ?? email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name ?? email} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--brand-primary, #5D00A4)', color: 'white', fontSize: 11, fontWeight: 700,
    }}>
      {initials}
    </div>
  )
}

// Kebab menu for an assigned slot
function SlotMenu({
  projectId,
  role,
  team,
  onReplace,
  onRemoved,
}: {
  projectId: string
  role:      ProjectTeamRole
  team:      ProjectTeamMap
  onReplace: () => void
  onRemoved: () => void
}) {
  const [open, setOpen]         = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeVisibility, setRemoveVisibility] = useState(false)
  const [confirm, setConfirm]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleRemove() {
    setRemoving(true)
    const res = await unassignProjectTeamRole({ projectId, role, removeVisibility })
    setRemoving(false)
    if (res.success) {
      setOpen(false)
      setConfirm(false)
      onRemoved()
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => { setOpen(o => !o); setConfirm(false) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 5,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'hsl(var(--muted-foreground))',
        }}
        title="Options"
      >
        <MoreHorizontal style={{ width: 14, height: 14 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 30, zIndex: 100,
          background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          minWidth: 180, overflow: 'hidden',
        }}>
          {!confirm ? (
            <>
              <button
                onClick={() => { setOpen(false); onReplace() }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'hsl(var(--foreground))', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <RefreshCw style={{ width: 13, height: 13 }} />
                Replace
              </button>
              <button
                onClick={() => setConfirm(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'hsl(var(--destructive))', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <UserX style={{ width: 13, height: 13 }} />
                Remove
              </button>
            </>
          ) : (
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'hsl(var(--foreground))', fontWeight: 500 }}>Remove from this role?</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={removeVisibility}
                  onChange={e => setRemoveVisibility(e.target.checked)}
                  style={{ width: 13, height: 13 }}
                />
                Also remove project visibility
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setConfirm(false)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: '1px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', fontSize: 12 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: 'none', background: 'hsl(var(--destructive))', color: 'white', cursor: removing ? 'default' : 'pointer', fontSize: 12, opacity: removing ? 0.6 : 1 }}
                >
                  {removing ? '…' : 'Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Single role slot row
function RoleSlot({
  projectId,
  role,
  member,
  team,
  isEditor,
  onAssign,
  onRefresh,
}: {
  projectId: string
  role:      ProjectTeamRole
  member:    TeamMember | null
  team:      ProjectTeamMap
  isEditor:  boolean
  onAssign:  (role: ProjectTeamRole) => void
  onRefresh: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid hsl(var(--border))',
    }}>
      {/* Role label */}
      <span style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {ROLE_LABEL[role]}
      </span>

      {member ? (
        <>
          <Avatar name={member.user.name} email={member.user.email} avatarUrl={member.user.avatarUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
              {member.user.name ?? member.user.email}
            </p>
            {member.user.name && (
              <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{member.user.email}</p>
            )}
          </div>
          {isEditor && (
            <SlotMenu
              projectId={projectId}
              role={role}
              team={team}
              onReplace={() => onAssign(role)}
              onRemoved={onRefresh}
            />
          )}
        </>
      ) : (
        <>
          {/* Empty slot */}
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            border: '1.5px dashed hsl(var(--border))',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditor ? (
              <button
                onClick={() => onAssign(role)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 13, color: 'hsl(var(--muted-foreground))',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <Plus style={{ width: 13, height: 13 }} />
                Add {ROLE_LABEL[role]}
              </button>
            ) : (
              <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Unassigned</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface Props {
  projectId: string
  isEditor:  boolean
}

export function ProjectTeamSection({ projectId, isEditor }: Props) {
  const [team, setTeam]       = useState<ProjectTeamMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<ProjectTeamRole | null>(null)

  async function load() {
    const res = await getProjectTeam(projectId)
    if (res.success) setTeam(res.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  if (loading) {
    return <div style={{ padding: '12px 0', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading team…</div>
  }

  if (!team) return null

  return (
    <>
      {ROLES.map(role => (
        <RoleSlot
          key={role}
          projectId={projectId}
          role={role}
          member={team[role]}
          team={team}
          isEditor={isEditor}
          onAssign={r => setAssigning(r)}
          onRefresh={load}
        />
      ))}

      <TeamHistoryList projectId={projectId} />

      {assigning && (
        <AssignTeamMemberModal
          projectId={projectId}
          role={assigning}
          currentTeam={team}
          onAssigned={() => load()}
          onClose={() => setAssigning(null)}
        />
      )}
    </>
  )
}
