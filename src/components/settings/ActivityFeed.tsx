import type { AuditEventRow } from '@/lib/audit'

// ── Human-readable labels for each action ────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  'proposal.sent':             'Proposal sent',
  'proposal.approved':         'Proposal approved by client',
  'proposal.lost':             'Proposal marked as lost',
  'invoice.sent':              'Invoice sent',
  'invoice.paid':              'Invoice marked as paid',
  'member.invited':            'Team member invited',
  'member.joined':             'Team member joined',
  'workspace.delete_requested': 'Workspace deletion requested',
  'token.regenerated':         'Public link regenerated',
}

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

function entitySuffix(event: AuditEventRow): string {
  const meta = event.metadata
  if (!meta) return ''

  if (event.action === 'proposal.approved') {
    const name = meta.signatureName as string | undefined
    return name ? ` · Signed by ${name}` : ''
  }
  if (event.action === 'member.invited' || event.action === 'member.joined') {
    const email = meta.email as string | undefined
    const role  = meta.role  as string | undefined
    return email ? ` · ${email}${role ? ` (${role})` : ''}` : ''
  }
  if (event.action === 'invoice.paid') {
    const method = meta.paymentMethod as string | undefined
    return method ? ` · via ${method}` : ''
  }
  if (event.action === 'token.regenerated' && event.entityType) {
    return ` · ${event.entityType}`
  }
  return ''
}

function actorLabel(actorId: string | null): string {
  if (!actorId || actorId === 'public') return 'Client'
  return 'Team'
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  events: AuditEventRow[]
}

export function ActivityFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3">
        No activity recorded yet. Events appear here as your team sends proposals, invoices, and manages members.
      </p>
    )
  }

  return (
    <ol className="divide-y border rounded-lg overflow-hidden">
      {events.map(event => (
        <li key={event.id} className="flex items-start justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/20 transition-colors">
          <div className="min-w-0">
            <p className="text-sm text-foreground leading-snug">
              {actionLabel(event.action)}
              <span className="text-muted-foreground">{entitySuffix(event)}</span>
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {actorLabel(event.actorId)}
            </p>
          </div>
          <time
            className="shrink-0 text-xs text-muted-foreground pt-0.5"
            dateTime={new Date(event.createdAt).toISOString()}
            title={new Date(event.createdAt).toLocaleString()}
          >
            {timeAgo(event.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  )
}
