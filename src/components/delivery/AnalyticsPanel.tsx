'use client'

import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronUp, Eye, Users } from 'lucide-react'
import type { AssetStat } from '@/server/actions/delivery'

interface Asset {
  id:    string
  title: string
  status: 'DRAFT' | 'SHARED'
}

interface Props {
  assets:    Asset[]
  analytics: AssetStat[]
}

function fmt(date: Date | string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AnalyticsPanel({ assets, analytics }: Props) {
  const [open, setOpen] = useState(false)

  const statsMap = new Map(analytics.map(s => [s.assetId, s]))

  const totalViews   = analytics.reduce((sum, s) => sum + s.viewCount, 0)
  const totalUnique  = analytics.reduce((sum, s) => sum + s.uniqueViewers, 0)
  const sharedAssets = assets.filter(a => a.status === 'SHARED').length

  return (
    <div className="rounded-xl border bg-card">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Analytics</span>
          {totalViews > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {totalViews} view{totalViews !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        }
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Summary row */}
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <Stat label="Total views"    value={totalViews}   icon={<Eye className="h-3.5 w-3.5" />} />
            <Stat label="Unique viewers" value={totalUnique}  icon={<Users className="h-3.5 w-3.5" />} />
            <Stat label="Shared assets"  value={sharedAssets} icon={<BarChart2 className="h-3.5 w-3.5" />} />
          </div>

          {/* Per-asset table */}
          {assets.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No assets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Asset</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground w-20">Views</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground w-20">Unique</th>
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground w-32">First view</th>
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground w-32">Last view</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(asset => {
                    const stat = statsMap.get(asset.id)
                    const hasViews = (stat?.viewCount ?? 0) > 0
                    return (
                      <tr key={asset.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${asset.status === 'SHARED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="truncate font-medium text-foreground">{asset.title}</span>
                            {asset.status === 'DRAFT' && (
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">(draft)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={hasViews ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                            {stat?.viewCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={hasViews ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                            {stat?.uniqueViewers ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {hasViews ? (
                            <span className="text-foreground">{fmt(stat!.firstViewAt)}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {hasViews ? (
                            <span className="text-foreground">{fmt(stat!.lastViewAt)}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-3">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide font-semibold">{label}</span>
      </div>
      <span className="text-xl font-bold text-foreground">{value}</span>
    </div>
  )
}
