import { listContractBlocks } from '@/server/actions/contract-blocks'
import { ContractBlocksManager } from '@/components/settings/contracts/ContractBlocksManager'

export const metadata = { title: 'Contract Blocks' }

export default async function ContractsSettingsPage() {
  const result = await listContractBlocks()
  const blocks = result.success ? result.data : []

  return (
    <div>
      <ContractBlocksManager blocks={blocks} />
    </div>
  )
}
