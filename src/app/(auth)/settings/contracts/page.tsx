import Link from 'next/link'
import { requireWorkspaceArea } from '@/lib/project-access'
import { listContractBlocks } from '@/server/actions/contract-blocks'
import { getDealMemoDefaults } from '@/server/actions/deal-memos'
import { ContractBlocksManager } from '@/components/settings/contracts/ContractBlocksManager'
import { ContractTemplatesManager } from '@/components/settings/contracts/ContractTemplatesManager'
import { listContractTemplates } from '@/server/actions/contract-templates'
import { DealMemoDefaultsPanel } from '@/components/settings/contracts/DealMemoDefaultsPanel'
import { BUILT_IN_DEAL_MEMO_DEFAULTS } from '@/lib/deal-memo-defaults'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Contracts' }

export default async function ContractsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>
}) {
  // Roles 2b: the clause library and deal memo defaults are Settings.
  const access = await requireWorkspaceArea('settings')
  const canEdit = access.can('settings', 'EDIT')
  const { for: forParam } = await searchParams
  const audience = forParam === 'vendor' ? 'VENDOR' : 'CLIENT'

  const [blocksRes, defaultsRes, templatesRes] = await Promise.all([
    listContractBlocks(audience),
    audience === 'VENDOR' ? getDealMemoDefaults() : Promise.resolve(null),
    listContractTemplates(audience),
  ])
  const blocks = blocksRes.success ? blocksRes.data : []
  const templates = templatesRes.success ? templatesRes.data : []
  const hasDefaultTemplate = templates.some(t => t.isDefault)
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

      {!canEdit && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          View only — your role can see the clause library but not change it.
        </p>
      )}
      <fieldset disabled={!canEdit} className="contents">
        {audience === 'VENDOR' && <DealMemoDefaultsPanel initial={defaults} />}

        <ContractTemplatesManager key={`t-${audience}`} audience={audience} templates={templates} blocks={blocks} />

        <h2 className="mb-1 text-base font-semibold text-foreground">Block library</h2>
        {/* key forces a fresh manager (and its create dialog) per audience */}
        <ContractBlocksManager key={audience} blocks={blocks} audience={audience} hasDefaultTemplate={hasDefaultTemplate} />
      </fieldset>
    </div>
  )
}
