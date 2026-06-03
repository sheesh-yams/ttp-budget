import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { InvoicePublicView } from '@/components/invoice/InvoicePublicView'
import { recordInvoiceView } from '@/server/actions/invoices'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { ExpiredLinkPage } from '@/components/public/ExpiredLinkPage'
import { RateLimitedPage } from '@/components/public/RateLimitedPage'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const invoice = await db.invoice.findUnique({
    where: { publicToken: token },
    include: { client: true },
  })
  if (!invoice) return { title: 'Invoice not found' }
  return {
    title: `Invoice ${invoice.number} — The Third Place Creative`,
    robots: { index: false },
  }
}

export default async function PublicInvoicePage({ params }: Props) {
  const { token } = await params

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await checkRateLimit(`invoice:${ip}`)
  if (!allowed) return <RateLimitedPage />

  const invoice = await db.invoice.findUnique({
    where: { publicToken: token },
    include: {
      client: true,
      project: true,
      workspace: {
        select: {
          name: true,
          legalName: true,
          logoUrl: true,
          wireInstructions: true,
          achInstructions: true,
          checkPayableTo: true,
          checkMailingAddress: true,
          defaultInvoiceTerms: true,
          contactEmail: true,
          website: true,
        },
      },
    },
  })

  if (!invoice || invoice.status === 'DRAFT') {
    notFound()
  }

  // ── Expiry check ──────────────────────────────────────────────────────────
  const invoiceExpiry = (invoice as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
  if (invoiceExpiry && invoiceExpiry < new Date()) {
    return <ExpiredLinkPage type="invoice" />
  }
  const ua = headersList.get('user-agent') ?? ''
  void recordInvoiceView(invoice.id, ip, ua)

  return <InvoicePublicView invoice={invoice} />
}
