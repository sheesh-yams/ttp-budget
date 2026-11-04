import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { renderShotListPdf } from '@/lib/shot-list-pdf'
import { asciiPdfFilename } from '@/lib/deal-memo-pdf'
import { shareExpiry } from '@/lib/shot-list'

// The shot list PDF behind a share link — public, keyed by the list's token,
// rate-limited by middleware (`publicPdf`). Same checks as /sl/[token]:
// sharing on and not expired. Crew notes are left out.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (typeof token !== 'string' || token.length < 16 || token.length > 100) return new NextResponse('Not found', { status: 404 })

  const list = await db.shotList.findUnique({
    where: { publicToken: token },
    select: {
      projectId: true, workspaceId: true, shareEnabled: true, shareEnabledAt: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      workspace: { select: { name: true, logoUrl: true, primaryColor: true } },
    },
  })
  if (!list || !list.shareEnabled) return new NextResponse('Not found', { status: 404 })

  const lastDay = await db.shootDay.findFirst({
    where: { projectId: list.projectId, workspaceId: list.workspaceId },
    orderBy: { date: 'desc' }, select: { date: true },
  })
  const expires = shareExpiry(list.shareEnabledAt, lastDay?.date ?? null)
  if (!expires || expires < new Date()) return new NextResponse('This link has expired', { status: 410 })

  try {
    const { filename, buffer } = await renderShotListPdf({
      projectId: list.projectId, workspaceId: list.workspaceId, projectName: list.project.name,
      clientName: list.project.client?.name ?? null, workspace: list.workspace, includeNotes: false,
    })
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${asciiPdfFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[shot list share pdf]', err)
    return new NextResponse('Could not generate the PDF', { status: 500 })
  }
}
