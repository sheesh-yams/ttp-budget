import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { InvoicePDF } from '@/components/invoice/InvoicePDF'
import type { InvoiceLineItem } from '@/types'
import React from 'react'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Token IS the credential — never accept a raw database ID here.
  const invoice = await db.invoice.findUnique({
    where: { publicToken: token },
    include: {
      client: true,
      project: true,
      workspace: {
        select: {
          name: true,
          legalName: true,
          contactEmail: true,
          website: true,
          logoUrl: true,
          logoDarkUrl: true,
          primaryColor: true,
          accentColor: true,
          wireInstructions: true,
          achInstructions: true,
          checkPayableTo: true,
          checkMailingAddress: true,
        },
      },
    },
  })

  if (!invoice || invoice.status === 'DRAFT') {
    return new NextResponse('Not found', { status: 404 })
  }

  let logoSrc: string | undefined =
    invoice.workspace.logoDarkUrl ?? invoice.workspace.logoUrl ?? undefined
  if (!logoSrc) {
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo.png')
      const logoBuffer = fs.readFileSync(logoPath)
      const isSlatesuiteDefault = (invoice.workspace.primaryColor ?? '#5D00A4') === '#5D00A4'
      if (isSlatesuiteDefault) logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch {
      // logo file missing — component falls back to the workspace name
    }
  }

  try {
    const invoiceData = {
      number:         invoice.number,
      title:          invoice.title,
      kind:           invoice.kind,
      status:         invoice.status,
      issueDate:      invoice.issueDate.toISOString(),
      dueDate:        invoice.dueDate.toISOString(),
      poNumber:       invoice.poNumber,
      lineItems:      invoice.lineItems as unknown as InvoiceLineItem[],
      subtotalCents:  invoice.subtotalCents,
      taxPct:         Number(invoice.taxPct),
      taxCents:       invoice.taxCents,
      discountCents:  invoice.discountCents,
      totalCents:     invoice.totalCents,
      amountPaidCents: invoice.amountPaidCents,
      notes:          invoice.notes,
      terms:          invoice.terms,
      publicToken:    invoice.publicToken,
      logoSrc,
      brandPrimary:   invoice.workspace.primaryColor ?? undefined,
      brandAccent:    invoice.workspace.accentColor ?? undefined,
      workspace: {
        name:                invoice.workspace.name,
        legalName:           invoice.workspace.legalName,
        contactEmail:        invoice.workspace.contactEmail,
        website:             invoice.workspace.website,
        wireInstructions:    invoice.workspace.wireInstructions,
        achInstructions:     invoice.workspace.achInstructions,
        checkPayableTo:      invoice.workspace.checkPayableTo,
        checkMailingAddress: invoice.workspace.checkMailingAddress,
      },
      client: {
        name:         invoice.client.name,
        contactName:  invoice.client.contactName,
        contactEmail: invoice.client.contactEmail,
        billingAddress: invoice.client.billingAddress,
      },
      project: {
        name: invoice.project.name,
      },
    }

    const buffer = await renderToBuffer(
      React.createElement(InvoicePDF as never, { invoice: invoiceData }) as Parameters<typeof renderToBuffer>[0]
    )

    const slug = invoice.project.name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-')
    const filename = `TTP-Invoice-${invoice.number}-${slug}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    console.error('Invoice PDF render error:', err)
    return new NextResponse(`PDF generation failed:\n\n${msg}`, { status: 500 })
  }
}
