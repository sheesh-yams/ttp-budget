import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { LibraryPageClient } from '@/components/library/LibraryPageClient'

export const metadata = { title: 'Global Library' }

export default async function LibraryPage() {
  const workspaceId = await getWorkspaceId()

  const [globalRates, globalTemplates, workspaceRates, workspaceTemplates] = await Promise.all([
    db.globalRateCard.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { role: 'asc' }] }),
    db.globalTemplate.findMany({ orderBy: [{ templateKind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
    db.rateCard.findMany({ where: { workspaceId, archivedAt: null }, select: { role: true, id: true } }),
    db.budgetTemplate.findMany({ where: { workspaceId }, select: { name: true, id: true } }),
  ])

  // Build lookup sets so the client knows what's already in the workspace
  const workspaceRoleMap  = new Map(workspaceRates.map(r => [r.role, r.id]))
  const workspaceNameMap  = new Map(workspaceTemplates.map(t => [t.name, t.id]))

  const ratesWithStatus = globalRates.map(r => ({
    id:               r.id,
    role:             r.role,
    category:         r.category as string,
    defaultUnit:      r.defaultUnit as string,
    defaultRateCents: r.defaultRateCents,
    notes:            r.notes,
    isFeatured:       r.isFeatured,
    inWorkspace:      workspaceRoleMap.has(r.role),
    workspaceId:      workspaceRoleMap.get(r.role) ?? null,
  }))

  const templatesWithStatus = globalTemplates.map(t => {
    const structure = t.structure as { accounts?: Array<{ items?: unknown[] }> }
    const itemCount = (structure.accounts ?? []).reduce(
      (sum, a) => sum + (a.items?.length ?? 0), 0
    )
    return {
      id:           t.id,
      name:         t.name,
      description:  t.description,
      shootType:    t.shootType as string,
      templateKind: t.templateKind as string,
      isFeatured:   t.isFeatured,
      itemCount,
      inWorkspace:  workspaceNameMap.has(t.name),
      workspaceId:  workspaceNameMap.get(t.name) ?? null,
    }
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-ink">Global library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse the built-in catalog and add items to your workspace. Your copies are independent — editing them never affects the global library.
        </p>
      </div>

      <LibraryPageClient
        rates={ratesWithStatus}
        templates={templatesWithStatus}
      />
    </div>
  )
}
