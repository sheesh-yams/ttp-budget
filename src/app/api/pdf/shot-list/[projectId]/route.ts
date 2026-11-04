import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProjectAccess } from '@/lib/access'
import { renderShotListPdf } from '@/lib/shot-list-pdf'
import { asciiPdfFilename } from '@/lib/deal-memo-pdf'

// The shot list PDF for signed-in people with Shot list access (not a public
// route — middleware requires a session). Includes crew notes.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const access = await getProjectAccess(projectId)
  if (!access || !access.can('shotList')) return new NextResponse('Not found', { status: 404 })

  const project = await db.project.findFirst({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true, client: { select: { name: true } }, workspace: { select: { name: true, logoUrl: true, primaryColor: true } } },
  })
  if (!project) return new NextResponse('Not found', { status: 404 })

  try {
    const { filename, buffer } = await renderShotListPdf({
      projectId, workspaceId: project.workspaceId, projectName: project.name,
      clientName: project.client?.name ?? null, workspace: project.workspace, includeNotes: true,
    })
    return pdfResponse(filename, buffer)
  } catch (err) {
    console.error('[shot list pdf]', projectId, err)
    return new NextResponse('Could not generate the PDF', { status: 500 })
  }
}

function pdfResponse(filename: string, buffer: Buffer) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${asciiPdfFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control':       'private, no-store',
    },
  })
}
