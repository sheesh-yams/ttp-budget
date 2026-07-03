/**
 * /invoices/preview/[id]
 *
 * Authenticated invoice preview page — renders any invoice regardless of
 * status (including DRAFT), so users can review before sending.
 *
 * Never accessible without a valid Clerk session (protected by auth layout).
 * paymentEnabled is always false here — this is a preview, not a payment page.
 */

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { InvoicePublicView } from '@/components/invoice/InvoicePublicView'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `Invoice Preview`, robots: { index: false } }
}

export default async function InvoicePreviewPage({ params }: Props) {
  const { id } = await params
  const workspaceId = await getWorkspaceId()

  const invoice = await db.invoice.findFirst({
    where: { id, workspaceId },   // scoped to the user's workspace
    include: {
      client: true,
      project: true,
      workspace: {
        select: {
          name:                true,
          legalName:           true,
          logoUrl:             true,
          logoDarkUrl:         true,
          primaryColor:        true,
          accentColor:         true,
          wireInstructions:    true,
          achInstructions:     true,
          checkPayableTo:      true,
          checkMailingAddress: true,
          defaultInvoiceTerms: true,
          contactEmail:        true,
          contactPhone:        true,
          website:             true,
          addressLine1:        true,
          addressLine2:        true,
          city:                true,
          region:              true,
          postalCode:          true,
          country:             true,
        },
      },
    },
  })

  if (!invoice) notFound()

  return (
    <>
      {/* Preview banner */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 9999,
        background: '#0A0612',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: '#5D00A4',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            borderRadius: 4,
            padding: '2px 8px',
          }}>
            Preview
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            This is how your client will see the invoice
          </span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>
          {invoice.number} · {invoice.status}
        </span>
      </div>

      {/* Offset content below the banner */}
      <div style={{ paddingTop: 44 }}>
        <InvoicePublicView invoice={invoice} paymentEnabled={false} />
      </div>
    </>
  )
}
