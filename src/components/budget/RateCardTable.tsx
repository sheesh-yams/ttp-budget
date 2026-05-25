'use client'

import { useState } from 'react'
import type { RateCard } from '@prisma/client'
import { formatMoney } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'
import { toggleFavorite } from '@/server/actions/rates'
import { RateCardModal } from './RateCardModal'
import { useRouter } from 'next/navigation'

const categoryLabels: Record<string, string> = {
  CREW: 'Crew', EQUIPMENT: 'Equipment', POST: 'Post', LOCATION: 'Location',
  TALENT: 'Talent', TRAVEL: 'Travel', CATERING: 'Catering',
  INSURANCE: 'Insurance', PRODUCTION_FEE: 'Prod. fee', MISC: 'Misc',
}

const unitLabels: Record<string, string> = {
  HOUR: 'Hour', HALF_DAY: 'Half day', DAY: 'Day',
  WEEK: 'Week', FLAT: 'Flat', EACH: 'Each', MILE: 'Mile',
}

export function RateCardTable({ rateCards }: { rateCards: RateCard[] }) {
  const router = useRouter()
  const [editingCard, setEditingCard] = useState<RateCard | null>(null)

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="grid grid-cols-[1fr_120px_100px_110px_40px] border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          <span>Role</span>
          <span>Category</span>
          <span>Unit</span>
          <span className="text-right">Default rate</span>
          <span />
        </div>
        {rateCards.map((card) => (
          <div
            key={card.id}
            className="grid grid-cols-[1fr_120px_100px_110px_40px] items-center border-b border-violet-50 px-4 py-3 text-[13px] last:border-0 hover:bg-muted/20"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFavorite(card.id, !card.isFavorite).then(() => router.refresh())}
                className="text-muted-foreground hover:text-violet-600 transition-colors"
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={card.isFavorite ? 'currentColor' : 'none'}
                />
              </button>
              <span className="font-medium text-foreground">{card.role}</span>
            </div>
            <span>
              <Badge variant="default">{categoryLabels[card.category] ?? card.category}</Badge>
            </span>
            <span className="text-muted-foreground">
              {unitLabels[card.defaultUnit] ?? card.defaultUnit}
            </span>
            <span className="text-right font-medium tabular text-foreground">
              {formatMoney(card.defaultRateCents)}
            </span>
            <button
              className="text-[11px] text-violet-600 hover:underline"
              onClick={() => setEditingCard(card)}
            >
              Edit
            </button>
          </div>
        ))}
        {rateCards.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No rate cards yet. Add your first rate above.
          </p>
        )}
      </div>

      <RateCardModal
        open={editingCard !== null}
        onOpenChange={v => { if (!v) setEditingCard(null) }}
        card={editingCard}
        onSaved={() => { setEditingCard(null); router.refresh() }}
      />
    </>
  )
}
