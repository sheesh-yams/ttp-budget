'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { StatusCounts } from './projects-types'

interface Props {
  statusCounts: StatusCounts
  current: string
}

const PILLS = [
  { key: 'all',      label: 'All' },
  { key: 'lead',     label: 'Lead' },
  { key: 'active',   label: 'Active' },
  { key: 'wrapped',  label: 'Wrapped' },
  { key: 'archived', label: 'Archived' },
] as const

export function ProjectStatusPills({ statusCounts, current }: Props) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  const navigate = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (status === 'all') {
        params.delete('status')
      } else {
        params.set('status', status)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const totalAll =
    statusCounts.lead + statusCounts.active + statusCounts.wrapped

  function countFor(key: string): number {
    if (key === 'all')      return totalAll
    if (key === 'lead')     return statusCounts.lead
    if (key === 'active')   return statusCounts.active
    if (key === 'wrapped')  return statusCounts.wrapped
    if (key === 'archived') return statusCounts.archived
    return 0
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PILLS.map(pill => {
        const isActive = current === pill.key || (pill.key === 'all' && !current)
        const count    = countFor(pill.key)

        return (
          <button
            key={pill.key}
            onClick={() => navigate(pill.key)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
              'transition-all border',
              isActive
                ? 'text-white border-transparent shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900',
            ].join(' ')}
            style={
              isActive
                ? {
                    background: pill.key === 'all' || pill.key === 'active'
                      ? 'var(--brand-primary)'
                      : pill.key === 'lead'
                      ? 'var(--brand-accent)'
                      : '#6b7280',
                  }
                : undefined
            }
          >
            {pill.label}
            <span
              className={[
                'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                isActive ? 'bg-white/25' : 'bg-gray-100 text-gray-500',
              ].join(' ')}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
