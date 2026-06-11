'use client'

import { formatMoney } from '@/lib/money'
import type { ProjectMetrics } from './projects-types'
import { TrendingUp, TrendingDown, Minus, Briefcase, FileText, CheckCircle } from 'lucide-react'

interface Props {
  metrics: ProjectMetrics
}

export function ProjectMetricsStrip({ metrics }: Props) {
  const qChange = metrics.wonLastQuarterCents > 0
    ? ((metrics.wonThisQuarterCents - metrics.wonLastQuarterCents) / metrics.wonLastQuarterCents) * 100
    : null

  const overdueLabel = metrics.overdueCount > 0
    ? `${metrics.overdueCount} overdue`
    : 'all current'

  return (
    <div
      className="rounded-2xl p-1"
      style={{
        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
      }}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 rounded-xl overflow-hidden">
        {/* Pipeline */}
        <MetricCard
          label="Pipeline"
          value={formatMoney(metrics.pipelineValueCents)}
          sub={`${metrics.pipelineCount} sent proposal${metrics.pipelineCount === 1 ? '' : 's'}`}
          icon={<TrendingUp className="w-4 h-4" />}
        />

        {/* Active projects */}
        <MetricCard
          label="Active Projects"
          value={String(metrics.activeCount)}
          sub={
            metrics.upcomingShootCount > 0
              ? `${metrics.upcomingShootCount} shoot${metrics.upcomingShootCount === 1 ? '' : 's'} this month`
              : 'no shoots this month'
          }
          icon={<Briefcase className="w-4 h-4" />}
        />

        {/* Outstanding */}
        <MetricCard
          label="Outstanding Invoices"
          value={formatMoney(metrics.outstandingCents)}
          sub={overdueLabel}
          subAlert={metrics.overdueCount > 0}
          icon={<FileText className="w-4 h-4" />}
        />

        {/* Won this quarter */}
        <MetricCard
          label="Won This Quarter"
          value={formatMoney(metrics.wonThisQuarterCents)}
          sub={
            qChange !== null
              ? `${qChange >= 0 ? '+' : ''}${Math.round(qChange)}% vs last quarter`
              : 'first quarter of data'
          }
          trend={qChange}
          icon={<CheckCircle className="w-4 h-4" />}
        />
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  subAlert = false,
  trend,
  icon,
}: {
  label: string
  value: string
  sub: string
  subAlert?: boolean
  trend?: number | null
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white/10 backdrop-blur-sm px-5 py-4 flex flex-col gap-1 hover:bg-white/15 transition-colors">
      <div className="flex items-center justify-between text-white/70">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      <div className="flex items-center gap-1.5">
        {trend !== null && trend !== undefined && (
          <TrendIcon trend={trend} />
        )}
        <span
          className="text-xs"
          style={{ color: subAlert ? '#fca5a5' : 'rgba(255,255,255,0.65)' }}
        >
          {sub}
        </span>
      </div>
    </div>
  )
}

function TrendIcon({ trend }: { trend: number }) {
  if (Math.abs(trend) < 1) {
    return <Minus className="w-3 h-3 text-white/50" />
  }
  if (trend > 0) {
    return <TrendingUp className="w-3 h-3 text-emerald-300" />
  }
  return <TrendingDown className="w-3 h-3 text-red-300" />
}
