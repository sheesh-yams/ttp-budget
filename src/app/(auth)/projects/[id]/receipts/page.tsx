import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getProjectReceipts } from '@/server/actions/receipts'
import { ReceiptsPageClient } from '@/components/actuals/ReceiptsPageClient'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({ where: { id, workspaceId }, select: { name: true } })
  return { title: project ? `Receipts — ${project.name}` : 'Receipts' }
}

export default async function ReceiptsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  // Fetch all receipts for this project, newest-first
  const receipts = await getProjectReceipts(project.id)

  return (
    <div>
      <Link
        href={`/projects/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {project.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Receipts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage receipts for this project. Attach them to actuals entries to reconcile spend.
        </p>
      </div>

      <ReceiptsPageClient
        projectId={project.id}
        initialReceipts={receipts}
      />
    </div>
  )
}
