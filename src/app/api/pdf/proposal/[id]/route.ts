import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { ProposalPDF } from '@/components/proposal/ProposalPDF'
import React from 'react'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // id here is the publicToken — no auth needed, but token must be valid
  const proposal = await db.proposal.findUnique({
    where: { publicToken: params.id },
    include: {
      project: { include: { client: true } },
      budget: true,
      workspace: true,
    },
  })

  if (!proposal || proposal.status === 'DRAFT') {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const buffer = await renderToBuffer(
      React.createElement(ProposalPDF, { proposal })
    )

    const filename = `TTP-Proposal-${proposal.project.name.replace(/[^a-z0-9]/gi, '-')}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('PDF render error:', err)
    return new NextResponse('PDF generation failed', { status: 500 })
  }
}
