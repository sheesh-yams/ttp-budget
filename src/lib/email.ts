import { Resend } from 'resend'
import { format } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'proposals@thethirdplace.co'

// Resolve the public app URL without ever using a localhost value.
// NEXT_PUBLIC_APP_URL may be set to localhost in dev env files that leaked
// into Vercel — fall through to VERCEL_URL (set automatically on every deploy)
// before using the hardcoded fallback.
function resolveAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    return configured.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'https://ttp-budget-3lvh.vercel.app'
}

const APP_URL = resolveAppUrl()

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

interface InvitationPayload {
  to: string
  invitedByName: string
  workspaceName: string
  role: 'OWNER' | 'PRODUCER'
  token: string
  expiresAt: Date
}

export async function sendInvitationEmail(payload: InvitationPayload) {
  const { to, invitedByName, workspaceName, role, token, expiresAt } = payload
  const acceptUrl = `${APP_URL}/invite/${token}`
  const roleLabel = role === 'OWNER' ? 'Owner' : 'Producer'

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${invitedByName} invited you to join ${workspaceName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F4FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4FA;padding:40px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E8E3EF">
        <!-- Header -->
        <tr>
          <td style="background:#0A0612;padding:28px 32px">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#04FFCC">TTP Budget</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 32px">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0A0612">You're invited</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#555">
              <strong>${invitedByName}</strong> invited you to join <strong>${workspaceName}</strong> on TTP Budget.
            </p>
            <table cellpadding="0" cellspacing="0" style="background:#F7F4FA;border-radius:8px;padding:16px 20px;margin-bottom:28px;width:100%">
              <tr>
                <td style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:4px">Workspace</td>
                <td style="font-size:14px;color:#1a1a1a;text-align:right">${workspaceName}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;padding-top:8px">Your role</td>
                <td style="font-size:14px;color:#1a1a1a;text-align:right;padding-top:8px">${roleLabel}</td>
              </tr>
            </table>
            <a href="${acceptUrl}" style="display:inline-block;background:#5D00A4;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px">
              Accept invitation →
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#aaa">
              This invitation expires ${format(expiresAt, 'MMMM d, yyyy')}. If you weren't expecting this, you can safely ignore it.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #F0EBF7;padding:16px 32px">
            <p style="margin:0;font-size:11px;color:#ccc">TTP Budget · Production budgeting for creative teams</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  })
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
