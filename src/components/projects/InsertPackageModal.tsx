'use client'

import { useState, useTransition, useEffect } from 'react'
import { Package, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listPackages } from '@/server/actions/templates'
import { insertPackageIntoPhase } from '@/server/actions/budgets'
import { formatMoney } from '@/lib/money'
import type { TemplateStructure } from '@/types'
import type { ShootType } from '@prisma/client'

// ─── Shoot type labels / colors ───────────────────────────────────────────────

const SHOOT_LABELS: Partial<Record<ShootType, string>> = {
  MUSIC_VIDEO: 'Music Video', BRAND_CAMPAIGN: 'Brand Campaign',
  PRODUCT_SHOOT: 'Product Shoot', EVENT_RECAP: 'Event Recap',
  SOCIAL_CONTENT: 'Social Content', INFLUENCER: 'Influencer',
  DOCUMENTARY: 'Documentary', OTHER: 'Other',
}

const SHOOT_COLORS: Partial<Record<ShootType, string>> = {
  MUSIC_VIDEO:    'bg-violet-100 text-violet-700',
  BRAND_CAMPAIGN: 'bg-blue-100 text-blue-700',
  PRODUCT_SHOOT:  'bg-amber-100 text-amber-700',
  EVENT_RECAP:    'bg-green-100 text-green-700',
  SOCIAL_CONTENT: 'bg-pink-100 text-pink-700',
  INFLUENCER:     'bg-orange-100 text-orange-700',
  DOCUMENTARY:    'bg-teal-100 text-teal-700',
  OTHER:          'bg-gray-100 text-gray-600',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackageOption {
  id: string
  name: string
  description: string | null
  shootType: ShootType
  tags: ShootType[]
  structure: TemplateStructure
  itemCount: number
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  phaseId: string
  onInserted: () => void
}

export function InsertPackageModal({ open, onOpenChange, phaseId, onInserted }: Props) {
  const [packages, setPackages]   = useState<PackageOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [query, setQuery]         = useState('')
  const [selected, setSelected]   = useState<PackageOption | null>(null)
  const [inserting, startInsert]  = useTransition()
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listPackages().then(res => {
      setLoading(false)
      if (res.success) setPackages(res.data)
    })
  }, [open])

  function handleClose() {
    setSelected(null)
    setQuery('')
    setError('')
    onOpenChange(false)
  }

  function handleInsert() {
    if (!selected) return
    setError('')
    startInsert(async () => {
      const res = await insertPackageIntoPhase(phaseId, selected.structure)
      if (res.success) {
        handleClose()
        onInserted()
      } else {
        setError((res as { success: false; error: string }).error)
      }
    })
  }

  // Filter by query
  const filtered = packages.filter(p =>
    !query ||
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.description?.toLowerCase().includes(query.toLowerCase()) ||
    SHOOT_LABELS[p.shootType]?.toLowerCase().includes(query.toLowerCase()) ||
    p.tags.some(t => SHOOT_LABELS[t]?.toLowerCase().includes(query.toLowerCase()))
  )

  // Package total estimate
  function pkgTotal(pkg: PackageOption) {
    return (pkg.structure.accounts ?? []).reduce((sum, acc) =>
      sum + (acc.items ?? []).reduce((s, item) =>
        s + Math.round(item.qty * item.rateCents * (1 + item.markupPct / 100)), 0
      ), 0
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-violet-600" />
            Insert add-on package
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search packages…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Package list */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {loading && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Loading packages…</p>
            )}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Package className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-[13px] text-muted-foreground">
                  {packages.length === 0
                    ? 'No packages yet. Create some in Templates → Add-on packages.'
                    : 'No packages match your search.'}
                </p>
              </div>
            )}
            {filtered.map(pkg => {
              const isSelected = selected?.id === pkg.id
              const total      = pkgTotal(pkg)
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelected(isSelected ? null : pkg)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
                    isSelected
                      ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                      : 'border-border bg-white hover:border-violet-200 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[13px] text-foreground">{pkg.name}</p>
                      {pkg.description && (
                        <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{pkg.description}</p>
                      )}
                    </div>
                    {total > 0 && (
                      <span className="flex-shrink-0 text-[12px] font-medium tabular-nums text-foreground">
                        {formatMoney(total)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SHOOT_COLORS[pkg.shootType] ?? 'bg-gray-100 text-gray-600'}`}>
                      {SHOOT_LABELS[pkg.shootType]}
                    </span>
                    {pkg.tags
                      .filter(t => t !== pkg.shootType)
                      .map(tag => (
                        <span key={tag} className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                          {SHOOT_LABELS[tag]}
                        </span>
                      ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {pkg.itemCount} {pkg.itemCount === 1 ? 'item' : 'items'} · {(pkg.structure.accounts ?? []).length} {(pkg.structure.accounts ?? []).length === 1 ? 'section' : 'sections'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Footer */}
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-[12px] text-muted-foreground">
              {selected
                ? `"${selected.name}" will be appended as new sections.`
                : 'Select a package to insert.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!selected || inserting}
                onClick={handleInsert}
              >
                {inserting ? 'Inserting…' : 'Insert package'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
