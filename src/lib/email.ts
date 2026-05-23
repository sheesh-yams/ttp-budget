import { Resend } from 'resend'
import { format } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'proposals@thethirdplace.co'

interface ProposalApprovedPayload {
  to: string
  proposalTitle: string
  clientName: string
  signatureName: string
  approvedAt: Date
  proposalUrl: string
}

export async function sendProposalApprovedEmail(payload: ProposalApprovedPayload) {
  const { to, proposalTitle, clientName, signatureName, approvedAt, proposalUrl } = payload

  await resend.emails.send({
    from: FROM,
    to,
    subject: `✓ Approved: ${proposalTitle}`,
    html: `
      <p>Your proposal has been approved.</p>
      <table>
        <tr><td><strong>Proposal</strong></td><td>${proposalTitle}</td></tr>
        <tr><td><strong>Client</strong></td><td>${clientName}</td></tr>
        <tr><td><strong>Signed by</strong></td><td>${signatureName}</td></tr>
        <tr><td><strong>Approved at</strong></td><td>${format(approvedAt, 'PPpp')}</td></tr>
      </table>
      <p><a href="${proposalUrl}">View proposal →</a></p>
      <p style="color:#888">Time to send the deposit invoice.</p>
    `,
  })
}

interface InvoiceSentPayload {
  to: string
  invoiceNumber: string
  projectName: string
  amountCents: number
  dueDate: Date
  invoiceUrl: string
}

export async function sendInvoiceEmail(payload: InvoiceSentPayload) {
  const { to, invoiceNumber, projectName, amountCents, dueDate, invoiceUrl } = payload
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100)

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Invoice ${invoiceNumber} — ${amount} due ${format(dueDate, 'MMM d, yyyy')}`,
    html: `
      <p>Please find your invoice below.</p>
      <table>
        <tr><td><strong>Invoice</strong></td><td>${invoiceNumber}</td></tr>
        <tr><td><strong>Project</strong></td><td>${projectName}</td></tr>
        <tr><td><strong>Amount due</strong></td><td>${amount}</td></tr>
        <tr><td><strong>Due date</strong></td><td>${format(dueDate, 'MMMM d, yyyy')}</td></tr>
      </table>
      <p><a href="${invoiceUrl}">View invoice →</a></p>
    `,
  })
}
