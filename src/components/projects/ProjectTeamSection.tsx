'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import {
  getProjectTeamList,
  setProjectTeamRole,
  removeFromProjectTeam,
  type ProjectRoleOption,
  type TeamRow,
} from '@/server/actions/project-team'
import { AssignTeamMemberModal } from './AssignTeamMemberModal'
import { TeamHistoryList } from './TeamHistoryList'
import type { UserRole } from '@prisma/client'

const WORKSPACE_ROLE_LABEL: Record<UserRole, string> = {
  OWNER:        'Owner',
  PRODUCER:     'Producer',
  COLLABORATOR: 'Collaborator',
}

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const initials = (name ?? email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
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

function TeamRowItem({
  row, roles, canEdit, onChanged,
}: {
  row:       TeamRow
  roles:     ProjectRoleOption[]
  canEdit:   boolean
  onChanged: () => void
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<{ success: boolean }>) {
    setBusy(true)
    setError(null)
    const res = await fn()
    setBusy(false)
    if (res.success) onChanged()
    else setError((res as unknown as { error: string }).error)
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={row.user.name} email={row.user.email} avatarUrl={row.user.avatarUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
            {row.user.name ?? row.user.email}
          </p>
          <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
            {row.user.name ? `${row.user.email} · ` : ''}{WORKSPACE_ROLE_LABEL[row.user.role]}
          </p>
        </div>
        {canEdit ? (
          <select
            value={row.projectRoleId ?? ''}
            disabled={busy}
            onChange={e => run(() => setProjectTeamRole({ teamRowId: row.id, projectRoleId: e.target.value }))}
            title="Project role"
            style={{
              fontSize: 12, padding: '4px 6px', borderRadius: 6, flexShrink: 0, maxWidth: 160,
              border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
            }}
          >
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
            {row.roleName}
          </span>
        )}
        {canEdit && (
          <button
            onClick={() => run(() => removeFromProjectTeam({ teamRowId: row.id }))}
            disabled={busy}
            title="Remove from project"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5, flexShrink: 0,
              background: 'transparent', border: 'none', cursor: busy ? 'default' : 'pointer',
              color: 'hsl(var(--muted-foreground))', opacity: busy ? 0.5 : 1,
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
      {error && <p style={{ marginTop: 4, fontSize: 11, color: 'hsl(var(--destructive))' }}>{error}</p>}
    </div>
  )
}

interface Props {
  projectId: string
  /** Ignored — whether the viewer can edit comes from their project permissions. */
  isEditor?: boolean
}

export function ProjectTeamSection({ projectId }: Props) {
  const [data, setData]       = useState<{ rows: TeamRow[]; roles: ProjectRoleOption[]; canEdit: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)

  const load = useCallback(async () => {
    const res = await getProjectTeamList(projectId)
    if (res.success) setData(res.data)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ padding: '12px 0', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading team…</div>
  }
  if (!data) return null

  return (
    <>
      {data.rows.length === 0 && (
        <p style={{ padding: '8px 0', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No one on this project yet.</p>
      )}
      {data.rows.map(row => (
        <TeamRowItem key={row.id} row={row} roles={data.roles} canEdit={data.canEdit} onChanged={load} />
      ))}

      {data.canEdit && (
        <button
          onClick={() => setAdding(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '10px 0 2px',
            fontSize: 13, color: 'hsl(var(--muted-foreground))',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <Plus style={{ width: 13, height: 13 }} />
          Add person
        </button>
      )}

      <TeamHistoryList projectId={projectId} />

      {adding && (
        <AssignTeamMemberModal
          projectId={projectId}
          roles={data.roles}
          currentRows={data.rows}
          onAssigned={() => load()}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  )
}
