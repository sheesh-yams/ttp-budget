import Link from 'next/link'
import type { ProjectWithClient } from '@/types'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import { parseLocalDate } from '@/lib/time-format'

const shootTypeLabels: Record<string, string> = {
  MUSIC_VIDEO:    'Music video',
  BRAND_CAMPAIGN: 'Brand campaign',
  PRODUCT_SHOOT:  'Product shoot',
  EVENT_RECAP:    'Event recap',
  SOCIAL_CONTENT: 'Social content',
  INFLUENCER:     'Influencer',
  DOCUMENTARY:    'Documentary',
  OTHER:          'Other',
}

interface Props {
  projects: ProjectWithClient[]
}

export function RecentProjects({ projects }: Props) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-medium text-foreground">Recent projects</p>
        <Link href="/projects" className="text-[12px] text-violet-600 hover:underline">
          View all →
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          <span>Project</span>
          <span>Client</span>
          <span>Type</span>
          <span>Status</span>
          <span className="text-right">Value</span>
        </div>
        {projects.slice(0, 5).map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] items-center border-b border-violet-50 px-4 py-3 text-[13px] transition-colors last:border-0 hover:bg-muted/30"
          >
            <div>
              <p className="font-medium text-foreground">{project.name}</p>
              {project.shootStartDate && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Shoot: {parseLocalDate(project.shootStartDate)!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            <span className="text-foreground">{project.client.name}</span>
            <span className="text-[12px] text-muted-foreground">
              {shootTypeLabels[project.shootType] ?? project.shootType}
            </span>
            <span>
              <Badge variant={project.status.toLowerCase() as 'active' | 'lead' | 'wrapped'}>
                {project.status.charAt(0) + project.status.slice(1).toLowerCase()}
              </Badge>
            </span>
            <span className="text-right font-medium tabular text-foreground">—</span>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No projects yet.{' '}
            <Link href="/projects" className="text-violet-600 hover:underline">
              Create your first →
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
