'use client'

import { X } from 'lucide-react'
import { ProjectTeamSection } from './ProjectTeamSection'

interface Props {
  projectId:   string
  projectName: string
  onClose:     () => void
}

export function EditTeamModal({ projectId, projectName, onClose }: Props) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 460,
        background: 'hsl(var(--background))',
        borderRadius: 14, border: '1px solid hsl(var(--border))',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
              Team
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'hsl(var(--foreground))' }}>
              {projectName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 6,
              background: 'hsl(var(--muted))', border: 'none', cursor: 'pointer',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <ProjectTeamSection projectId={projectId} isEditor={true} />
        </div>
      </div>
    </div>
  )
}
