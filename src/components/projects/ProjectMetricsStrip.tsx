'use client'

import { formatMoney } from '@/lib/money'
import type { ProjectMetrics } from './projects-types'
import {
  TrendingUp, TrendingDown, Minus,
  Briefcase, Receipt, Trophy,
  Send,
} from 'lucide-react'

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

  const pipelineSub = `${metrics.pipelineCount} project${metrics.pipelineCount === 1 ? '' : 's'} in play`

  const qChangeSub = qChange !== null
    ? `${qChange >= 0 ? '+' : ''}${Math.round(qChange)}% vs last quarter`
    : 'first quarter of data'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Pipeline */}
      <MetricCard
        label="Pipeline"
        value={formatMoney(metrics.pipelineValueCents)}
        sub={pipelineSub}
        iconBg="#dbeafe"
        iconColor="#1d4ed8"
        icon={<Send className="w-6 h-6" />}
      />

      {/* Open projects (LEAD + ACTIVE) */}
      <MetricCard
        label="Open Projects"
        value={String(metrics.activeCount)}
        sub={
          metrics.upcomingShootCount > 0
            ? `${metrics.upcomingShootCount} shoot${metrics.upcomingShootCount === 1 ? '' : 's'} this month`
            : 'no shoots this month'
        }
        iconBg="#ede9fe"
        iconColor="#6d28d9"
        icon={<Briefcase className="w-6 h-6" />}
      />

      {/* Outstanding invoices */}
      <MetricCard
        label="Outstanding"
        value={formatMoney(metrics.outstandingCents)}
        sub={overdueLabel}
        subAlert={metrics.overdueCount > 0}
        iconBg="#fef3c7"
        iconColor="#b45309"
        icon={<Receipt className="w-6 h-6" />}
      />

      {/* Won this quarter */}
      <MetricCard
        label="Won This Quarter"
        value={formatMoney(metrics.wonThisQuarterCents)}
        sub={qChangeSub}
        trend={qChange}
        iconBg="#d1fae5"
        iconColor="#047857"
        icon={<Trophy className="w-6 h-6" />}
      />
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
  iconBg,
  iconColor,
}: {
  label: string
  value: string
  sub: string
  subAlert?: boolean
  trend?: number | null
  icon: React.ReactNode
  iconBg: string
  iconColor: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
      {/* Icon circle */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 tracking-tight mt-0.5 truncate">{value}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {trend !== null && trend !== undefined && (
            <TrendIcon trend={trend} />
          )}
          <span
            className="text-xs truncate"
            style={{ color: subAlert ? '#ef4444' : '#9ca3af' }}
          >
            {sub}
          </span>
        </div>
      </div>
    </div>
  )
}

function TrendIcon({ trend }: { trend: number }) {
  if (Math.abs(trend) < 1) {
    return <Minus className="w-3 h-3 text-gray-400 flex-shrink-0" />
  }
  if (trend > 0) {
    return <TrendingUp className="w-3 h-3 text-emerald-500 flex-shrink-0" />
  }
  return <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
}
