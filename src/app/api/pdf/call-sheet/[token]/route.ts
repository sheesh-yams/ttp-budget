import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { renderCallSheetPdf } from '@/lib/call-sheet-pdf'
import { asciiPdfFilename } from '@/lib/deal-memo-pdf'

// The call sheet as a PDF — public, keyed by the sheet's share-link token
// (the same credential as /cs/[token]), rate-limited by middleware
// (`publicPdf`). Expired links are refused; drafts render marked DRAFT.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (typeof token !== 'string' || token.length < 16 || token.length > 100) return new NextResponse('Not found', { status: 404 })

  const cs = await db.callSheet.findUnique({
    where: { publicToken: token },
    include: {
      project: { select: { name: true, client: { select: { name: true, contactName: true, contactEmail: true, contactPhone: true } } } },
      workspace: { select: { name: true, logoUrl: true, primaryColor: true, accentColor: true, callTimeFormat: true } },
    },
  })
  if (!cs) return new NextResponse('Not found', { status: 404 })
  if (cs.publicTokenExpiresAt && cs.publicTokenExpiresAt < new Date()) return new NextResponse('This link has expired', { status: 410 })

  // "DAY 1 OF 2" when the sheet is linked to a shoot day.
  let dayLabel: string | null = null
  if (cs.shootDayId) {
    const days = await db.shootDay.findMany({
      where: { projectId: cs.projectId, workspaceId: cs.workspaceId },
      orderBy: [{ orderIndex: 'asc' }, { date: 'asc' }], select: { id: true },
    })
    const i = days.findIndex(d => d.id === cs.shootDayId)
    if (i >= 0) dayLabel = `DAY ${i + 1} OF ${days.length}`
  }

  try {
    const { filename, buffer } = await renderCallSheetPdf(cs, dayLabel)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${asciiPdfFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[call sheet pdf]', cs.id, err)
    return new NextResponse('Could not generate the PDF', { status: 500 })
  }
}
