import { Resend } from 'resend'
import { format } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'proposals@thethirdplace.co'

// Resolve the public app URL without ever using a localhost value.
// NEXT_PUBLIC_APP_URL is the canonical source. Fall through to Railway's
// auto-populated RAILWAY_PUBLIC_DOMAIN before using the hardcoded fallback.
function resolveAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    return configured.replace(/\/$/, '')
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  }
  return 'https://budget.thethirdplace.co'
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
  subject?: string
  /** Custom message from the sender — rendered above the invoice details. */
  customMessage?: string
  invoiceNumber: string
  projectName: string
  amountCents: number
  dueDate: Date
  invoiceUrl: string
  /** Per-workspace branding — falls back to the SlateSuite palette when null. */
  workspaceName?: string | null
  brandPrimary?: string | null
  brandAccent?: string | null
}

interface InvitationPayload {
  to: string
  invitedByName: string
  workspaceName: string
  role: 'OWNER' | 'PRODUCER' | 'COLLABORATOR'
  token: string
  expiresAt: Date
}

const ROLE_LABELS: Record<InvitationPayload['role'], string> = {
  OWNER:        'Owner',
  PRODUCER:     'Producer',
  COLLABORATOR: 'Collaborator',
}

export async function sendInvitationEmail(payload: InvitationPayload) {
  const { to, invitedByName, workspaceName, role, token, expiresAt } = payload
  const acceptUrl = `${APP_URL}/invite/${token}`
  const roleLabel = ROLE_LABELS[role] ?? 'Member'

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
  const { to, subject, customMessage, invoiceNumber, projectName, amountCents, dueDate, invoiceUrl } = payload
  const primary   = payload.brandPrimary || '#5D00A4'
  const accent    = payload.brandAccent  || '#04FFCC'
  const brandName = payload.workspaceName || 'The Third Place Creative'
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100)

  const defaultSubject = `Invoice ${invoiceNumber} — ${amount} due ${format(dueDate, 'MMM d, yyyy')}`

  // Convert plain-text message to HTML paragraphs
  const messageHtml = customMessage
    ? customMessage
        .split('\n')
        .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6">${line}</p>`)
        .join('')
    : `<p style="margin:0 0 12px;font-size:15px;color:#333">Please find your invoice details below.</p>`

  await resend.emails.send({
    from: FROM,
    to,
    subject: subject ?? defaultSubject,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F4FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4FA;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E8E3EF">

        <!-- Header -->
        <tr>
          <td style="background:#0A0612;padding:28px 36px;display:flex;align-items:center;justify-content:space-between">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${accent}">${brandName}</p>
          </td>
        </tr>

        <!-- Invoice badge -->
        <tr>
          <td style="background:${primary};padding:12px 36px">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.7)">Invoice</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.02em">${invoiceNumber}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px">
            ${messageHtml}

            <!-- Invoice details table -->
            <table cellpadding="0" cellspacing="0" style="background:#F7F4FA;border-radius:8px;padding:20px 24px;margin:24px 0;width:100%;box-sizing:border-box">
              <tr>
                <td style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:4px">Project</td>
                <td style="font-size:14px;color:#1a1a1a;text-align:right;font-weight:500">${projectName}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;padding-top:12px">Amount due</td>
                <td style="font-size:20px;color:${primary};text-align:right;font-weight:700;padding-top:12px;letter-spacing:-0.01em">${amount}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:12px;border-top:1px solid #E8E3EF">
                  <p style="margin:0;font-size:12px;color:#888">Due by <strong style="color:#1a1a1a">${format(dueDate, 'MMMM d, yyyy')}</strong></p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-top:8px">
              <tr>
                <td>
                  <a href="${invoiceUrl}" style="display:inline-block;background:${primary};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px">
                    View &amp; Pay Invoice →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0;font-size:12px;color:#aaa">
              Or copy this link: <a href="${invoiceUrl}" style="color:${primary};word-break:break-all">${invoiceUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #F0EBF7;padding:16px 36px">
            <p style="margin:0;font-size:11px;color:#ccc">The Third Place Creative · This invoice was sent via TTP Budget</p>
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
