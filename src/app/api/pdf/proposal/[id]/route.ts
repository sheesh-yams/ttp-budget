import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

  // Use frozen budget snapshot if present, fall back to live query for legacy proposals
  const proposalContent = proposal.content as Record<string, unknown>
  const snapshot = proposalContent?.budgetSnapshot as {
    accounts: unknown[]
    totalCents: number
  } | undefined

  let accounts: unknown[]
  let totalCents: number

  if (snapshot?.accounts) {
    accounts = snapshot.accounts
    totalCents = snapshot.totalCents
  } else {
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
    accounts = rawAccounts.map(acc => ({
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

    totalCents = (accounts as unknown[]).reduce<number>(
      (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
      0
    )
  }

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

    // Dynamic imports keep @react-pdf/renderer and the PDF components in the
    // same module resolution context at runtime, preventing the duplicate-React-
    // instance problem that causes reconciler error #31.
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { ProposalPDF }    = await import('@/components/proposal/ProposalPDF')

    type RenderInput = Parameters<typeof renderToBuffer>[0]
    const buffer = await renderToBuffer(
      React.createElement(ProposalPDF as never, {
        proposal: serialisedProposal,
        accounts,
        totalCents,
      }) as unknown as RenderInput
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
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    console.error('PDF render error:', err)
    return new NextResponse(`PDF generation failed:\n\n${msg}`, { status: 500 })
  }
}
