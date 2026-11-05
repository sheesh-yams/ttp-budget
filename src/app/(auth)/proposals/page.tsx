import { requireWorkspaceArea } from '@/lib/project-access'
import { projectsWithArea } from '@/lib/money-access'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getAccess } from '@/lib/access'
import { loadDeals } from '@/lib/proposals-deals'
import { ProposalsPageClient } from '@/components/proposals/board/ProposalsPageClient'

export const metadata = { title: 'Proposals' }

export default async function ProposalsPage() {
  // The workspace Proposals list, limited to projects where the person has
  // Proposals access (Roles Phase 2a).
  await requireWorkspaceArea('proposals')
  const [workspaceId, access, visible, editable] = await Promise.all([
    getWorkspaceId(), getAccess(), projectsWithArea('proposals'), projectsWithArea('proposals', 'EDIT'),
  ])
  // Margin-blind roles get no amounts at all — same gate as Projects.
  const showMoney = access.can('dashboardMoney')

  const rows = await loadDeals(db, workspaceId, { visible, editable, showMoney })

  return <ProposalsPageClient rows={rows} showMoney={showMoney} canManageProjects={access.can('projects', 'EDIT')} />
}
