import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { ProposalPDF } from '@/components/proposal/ProposalPDF'
import { sumAccount, type AccountInput } from '@/lib/totals'
import React from 'react'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const proposal = await db.proposal.findUnique({
    where: { publicToken: id },
    include: {
      project: { include: { client: true } },
      workspace: {
        select: {
          name: true, legalName: true,
          contactEmail: true, website: true,
        },
      },
    },
  })

  if (!proposal || proposal.status === 'DRAFT') {
    return new NextResponse('Not found', { status: 404 })
  }

  // Fetch line items from primary phase
  const primaryPhase = await db.phase.findFirst({
    where: { budgetId: proposal.budgetId, isPrimary: true },
    include: {
      accounts: {
        where: { parentId: null },
        orderBy: { order: 'asc' },
        include: {
          lineItems: { orderBy: { order: 'asc' } },
          children: {
            orderBy: { order: 'asc' },
            include: { lineItems: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  }) ?? await db.phase.findFirst({
    where: { budgetId: proposal.budgetId },
    orderBy: { order: 'asc' },
    include: {
      accounts: {
        where: { parentId: null },
        orderBy: { order: 'asc' },
        include: {
          lineItems: { orderBy: { order: 'asc' } },
          children: {
            orderBy: { order: 'asc' },
            include: { lineItems: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  })

  const rawAccounts = primaryPhase?.accounts ?? []
  const accounts = rawAccounts.map(acc => ({
    ...acc,
    lineItems: acc.lineItems.map(i => ({
      ...i, quantity: Number(i.quantity), markupPct: i.markupPct != null ? Number(i.markupPct) : null,
    })),
    children: acc.children.map(child => ({
      ...child,
      lineItems: child.lineItems.map(i => ({
        ...i, quantity: Number(i.quantity), markupPct: i.markupPct != null ? Number(i.markupPct) : null,
      })),
    })),
  }))

  const totalCents = accounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
    0
  )

  try {
    const serialisedProposal = {
      id:           proposal.id,
      title:        proposal.title,
      publicToken:  proposal.publicToken,
      version:      proposal.version,
      content:      proposal.content,
      createdAt:    proposal.createdAt.toISOString(),
      expiresAt:    proposal.expiresAt?.toISOString()  ?? null,
      project: {
        name:           proposal.project.name,
        shootType:      proposal.project.shootType,
        shootStartDate: proposal.project.shootStartDate?.toISOString() ?? null,
        shootEndDate:   proposal.project.shootEndDate?.toISOString()   ?? null,
        client: { name: proposal.project.client.name },
      },
      workspace: {
        name:         proposal.workspace.name,
        legalName:    proposal.workspace.legalName,
        contactEmail: proposal.workspace.contactEmail,
        website:      proposal.workspace.website,
      },
    }

    const buffer = await renderToBuffer(
      React.createElement(ProposalPDF as never, {
        proposal: serialisedProposal,
        accounts,
        totalCents,
      }) as React.ReactElement<DocumentProps>
    )

    const slug = proposal.project.name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-')
    const filename = `TTP-Proposal-${slug}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
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
