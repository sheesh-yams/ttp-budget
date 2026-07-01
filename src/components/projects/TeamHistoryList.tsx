'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getProjectTeamHistory, type TeamMemberHistory } from '@/server/actions/project-team'
import type { ProjectTeamRole } from '@prisma/client'

const ROLE_LABEL: Record<ProjectTeamRole, string> = {
  PROJECT_LEAD:    'PL',
  ACCOUNT_MANAGER: 'AM',
  PROJECT_MANAGER: 'PM',
}

const REASON_LABEL: Record<string, string> = {
  REPLACED:             'Replaced',
  REMOVED:              'Removed',
  USER_LEFT_WORKSPACE:  'Left workspace',
}

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const initials = (name ?? email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name ?? email} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--brand-primary, #5D00A4)', color: 'white', fontSize: 8, fontWeight: 700,
    }}>
      {initials}
    </div>
  )
}

interface Props {
  projectId: string
}

export function TeamHistoryList({ projectId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory]   = useState<TeamMemberHistory[]>([])
  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(false)

  async function load() {
    if (loaded) { setExpanded(e => !e); return }
    setExpanded(true)
    setLoading(true)
    const res = await getProjectTeamHistory(projectId)
    if (res.success) setHistory(res.data)
    setLoading(false)
    setLoaded(true)
  }

  const historical = history.filter(r => r.unassignedAt !== null)

  if (history.length === 0 && loaded && !loading) return null

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={load}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: 'hsl(var(--muted-foreground))',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        {expanded ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
        View history
      </button>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {loading && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>}
          {!loading && historical.length === 0 && (
            <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>No past assignments.</p>
          )}
          {historical.map(row => (
            <div
              key={row.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 6,
                background: 'hsl(var(--muted))',
              }}
            >
              <Avatar name={row.user.name} email={row.user.email} avatarUrl={row.user.avatarUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                  {row.user.name ?? row.user.email}
                </p>
                <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                  {ROLE_LABEL[row.role]} · {REASON_LABEL[row.unassignReason ?? ''] ?? row.unassignReason}
                  {' · '}
                  {new Date(row.unassignedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
