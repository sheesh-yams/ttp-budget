import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ProjectCallSheets } from '@/components/call-sheets/ProjectCallSheets'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()
  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: { name: true },
  })
  return { title: project ? `${project.name} | Call Sheets` : 'Call Sheets' }
}

export default async function CallSheetsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const project = await db.project.findFirst({
    where: { id, workspaceId },
    select: {
      id:             true,
      name:           true,
      shootStartDate: true,
      callSheets: {
        orderBy: { shootDate: 'asc' },
        select: {
          id:          true,
          title:       true,
          shootDate:   true,
          generalCall: true,
          status:      true,
          publicToken: true,
        },
      },
    },
  })

  if (!project) notFound()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Call Sheets</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Create and share call sheets with your crew for each shoot day.
        </p>
      </div>

      <ProjectCallSheets
        callSheets={project.callSheets.map(cs => ({
          ...cs,
          shootDate: cs.shootDate.toISOString(),
        }))}
        projectId={project.id}
        projectName={project.name}
        shootStartDate={project.shootStartDate?.toISOString() ?? null}
      />
    </div>
  )
}
