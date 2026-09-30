import Link from 'next/link'
import { listContractBlocks } from '@/server/actions/contract-blocks'
import { getDealMemoDefaults } from '@/server/actions/deal-memos'
import { ContractBlocksManager } from '@/components/settings/contracts/ContractBlocksManager'
import { DealMemoDefaultsPanel } from '@/components/settings/contracts/DealMemoDefaultsPanel'
import { BUILT_IN_DEAL_MEMO_DEFAULTS } from '@/lib/deal-memo-defaults'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Contract Blocks' }

export default async function ContractsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>
}) {
  const { for: forParam } = await searchParams
  const audience = forParam === 'vendor' ? 'VENDOR' : 'CLIENT'

  const [blocksRes, defaultsRes] = await Promise.all([
    listContractBlocks(audience),
    audience === 'VENDOR' ? getDealMemoDefaults() : Promise.resolve(null),
  ])
  const blocks = blocksRes.success ? blocksRes.data : []
  const defaults = defaultsRes && defaultsRes.success ? defaultsRes.data : BUILT_IN_DEAL_MEMO_DEFAULTS

  const tabs = [
    { key: 'CLIENT', label: 'Client proposals', href: '/settings/contracts' },
    { key: 'VENDOR', label: 'Crew & vendor deal memos', href: '/settings/contracts?for=vendor' },
  ] as const

  return (
    <div>
      <div className="mb-6 inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              audience === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {audience === 'VENDOR' && <DealMemoDefaultsPanel initial={defaults} />}

      {/* key forces a fresh manager (and its create dialog) per audience */}
      <ContractBlocksManager key={audience} blocks={blocks} audience={audience} />
    </div>
  )
}
