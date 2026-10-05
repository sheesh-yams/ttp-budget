import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { asciiPdfFilename, renderSignedDealMemoPdf } from '@/lib/deal-memo-pdf'

// The signed deal memo as a PDF — public, token-only (the vendor link's
// token), rate-limited by middleware (`publicPdf`). Only signed memos; one
// cancelled after signing still downloads, marked cancelled.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (typeof token !== 'string' || token.length < 16) return new NextResponse('Not found', { status: 404 })

  const memo = await db.dealMemo.findUnique({
    where:  { publicToken: token },
    select: {
      id: true, sentSnapshot: true, signedAt: true, signatureName: true, signatureEmail: true, signatureIp: true, cancelledAt: true,
      workspace: { select: { name: true, logoUrl: true, primaryColor: true } },
    },
  })
  if (!memo?.signedAt) return new NextResponse('Not found', { status: 404 })

  try {
    const { filename, buffer } = await renderSignedDealMemoPdf(memo)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':        'application/pdf',
        // Headers must be ByteStrings: ASCII fallback + RFC 5987 UTF-8 name.
        'Content-Disposition': `inline; filename="${asciiPdfFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[deal memo pdf]', memo.id, err)
    return new NextResponse('Could not generate the PDF', { status: 500 })
  }
}
