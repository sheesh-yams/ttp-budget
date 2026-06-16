'use client'

/**
 * SendInvoiceModal
 *
 * Two-tab dialog:
 *   Compose — editable To / Subject / Message fields, pre-filled from
 *             getInvoiceSendData() server action
 *   Preview — live-rendered HTML preview matching what Resend will send
 *
 * On Send: calls the sendInvoice() server action with the composed fields,
 * which marks the invoice SENT and fires the actual email via Resend.
 */

import { useState, useEffect, useTransition } from 'react'
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getInvoiceSendData, sendInvoice } from '@/server/actions/invoices'
import { formatMoney } from '@/lib/money'
import { format } from 'date-fns'

// ── Types ──────────────────────────────────────────────────────────────────

type SendData = Awaited<ReturnType<typeof getInvoiceSendData>>

interface SendInvoiceModalProps {
  invoiceId: string
  /** Render prop — receives open() so any element can trigger the modal. */
  trigger: (open: () => void) => React.ReactNode
  onSent?: () => void
}

type Tab = 'compose' | 'preview'

// ── Default message builder ────────────────────────────────────────────────

function buildDefaultMessage(data: NonNullable<SendData>) {
  const amount = formatMoney(data.totalCents)
  const due    = format(new Date(data.dueDate), 'MMMM d, yyyy')
  return [
    `Hi ${data.clientName},`,
    '',
    `Please find Invoice ${data.number} attached for ${data.projectName}.`,
    '',
    `Amount due: ${amount}`,
    `Due date: ${due}`,
    '',
    `You can view and pay your invoice securely online using the button below.`,
    '',
    `Thank you for your business!`,
    '',
    data.workspaceName,
  ].join('\n')
}

function buildDefaultSubject(data: NonNullable<SendData>) {
  const amount = formatMoney(data.totalCents)
  const due    = format(new Date(data.dueDate), 'MMM d, yyyy')
  return `Invoice ${data.number} — ${amount} due ${due}`
}

// ── Email HTML preview renderer ────────────────────────────────────────────

function EmailPreview({
  data,
  subject,
  message,
}: {
  data: NonNullable<SendData>
  subject: string
  message: string
}) {
  const amount  = formatMoney(data.totalCents)
  const dueDate = format(new Date(data.dueDate), 'MMMM d, yyyy')
  // Mirror the real branded email (sendInvoiceEmail) so the preview is accurate.
  const primary   = data.brandPrimary || '#5D00A4'
  const accent    = data.brandAccent  || '#04FFCC'
  const brandName = data.workspaceName || 'The Third Place Creative'

  const messageHtml = message
    .split('\n')
    .map(line =>
      line.trim() === ''
        ? '<br>'
        : `<p style="margin:0 0 12px;font-size:14px;color:#333;line-height:1.6">${line}</p>`
    )
    .join('')

  const invoiceUrl = `${window.location.origin}/i/${data.publicToken}`

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#F7F4FA', padding: 24, minHeight: '100%' }}>
      {/* Subject line */}
      <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fff', borderRadius: 6, border: '1px solid #E8E3EF' }}>
        <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Subject: </span>
        <span style={{ fontSize: 13, color: '#333' }}>{subject}</span>
      </div>

      {/* Email body */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E8E3EF', maxWidth: 520, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: '#0A0612', padding: '20px 28px' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>
            {brandName}
          </p>
        </div>

        {/* Brand-colored invoice badge */}
        <div style={{ background: primary, padding: '12px 28px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>Invoice</p>
          <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{data.number}</p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px' }}>
          <div dangerouslySetInnerHTML={{ __html: messageHtml }} />

          {/* Detail table */}
          <div style={{ background: '#F7F4FA', borderRadius: 8, padding: '16px 20px', margin: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Project</span>
              <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{data.projectName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount due</span>
              <span style={{ fontSize: 18, color: primary, fontWeight: 700 }}>{amount}</span>
            </div>
            <div style={{ paddingTop: 12, borderTop: '1px solid #E8E3EF', fontSize: 12, color: '#888' }}>
              Due by <strong style={{ color: '#1a1a1a' }}>{dueDate}</strong>
            </div>
          </div>

          {/* CTA */}
          <a
            href={invoiceUrl}
            style={{ display: 'inline-block', background: primary, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '11px 22px', borderRadius: 8 }}
          >
            View &amp; Pay Invoice →
          </a>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #F0EBF7', padding: '12px 28px' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#ccc' }}>The Third Place Creative · Sent via TTP Budget</p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function SendInvoiceModal({ invoiceId, trigger, onSent }: SendInvoiceModalProps) {
  const [open, setOpen]         = useState(false)
  const [tab, setTab]           = useState<Tab>('compose')
  const [data, setData]         = useState<NonNullable<SendData> | null>(null)
  const [loading, setLoading]   = useState(false)
  const [to, setTo]             = useState('')
  const [subject, setSubject]   = useState('')
  const [message, setMessage]   = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [sent, setSent]         = useState(false)
  const [isPending, startTransition] = useTransition()

  // Fetch send data when modal opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setSent(false)
    setTab('compose')

    getInvoiceSendData(invoiceId).then(result => {
      if (!result) {
        setError('Could not load invoice data.')
        setLoading(false)
        return
      }
      setData(result)
      setTo(result.clientEmail ?? '')
      setSubject(buildDefaultSubject(result))
      setMessage(buildDefaultMessage(result))
      setLoading(false)
    })
  }, [open, invoiceId])

  function handleOpen() {
    setOpen(true)
  }

  function handleClose() {
    if (isPending) return
    setOpen(false)
  }

  function handleSend() {
    if (!to.trim()) { setError('Recipient email is required.'); return }
    setError(null)

    startTransition(async () => {
      const result = await sendInvoice(invoiceId, {
        to:      to.trim(),
        subject: subject.trim() || buildDefaultSubject(data!),
        message: message.trim(),
      })

      if (result.success) {
        setSent(true)
        setTimeout(() => {
          setOpen(false)
          onSent?.()
        }, 1800)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <>
      {trigger(handleOpen)}

      <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Send Invoice
            </DialogTitle>
          </DialogHeader>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Success */}
          {sent && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-semibold text-foreground">Invoice sent!</p>
              <p className="text-sm text-muted-foreground">Email delivered to {to}</p>
            </div>
          )}

          {/* Main form */}
          {!loading && !sent && data && (
            <>
              {/* Tabs */}
              <div className="flex border-b shrink-0">
                {(['compose', 'preview'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                      tab === t
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Compose tab */}
              {tab === 'compose' && (
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  <div>
                    <Label htmlFor="inv-to">To</Label>
                    <Input
                      id="inv-to"
                      type="email"
                      value={to}
                      onChange={e => setTo(e.target.value)}
                      placeholder="client@example.com"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-subject">Subject</Label>
                    <Input
                      id="inv-subject"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-message">Message</Label>
                    <Textarea
                      id="inv-message"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={10}
                      className="mt-1 font-mono text-sm resize-none"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      The invoice details and payment link are appended automatically below your message.
                    </p>
                  </div>
                </div>
              )}

              {/* Preview tab */}
              {tab === 'preview' && (
                <div className="flex-1 overflow-y-auto bg-muted/30">
                  <EmailPreview data={data} subject={subject} message={message} />
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-4 border-t shrink-0">
                {error && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={handleClose} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button onClick={handleSend} disabled={isPending || !to.trim()}>
                    {isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Sending…</>
                    ) : (
                      <><Send className="h-3.5 w-3.5 mr-2" /> Send Invoice</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Error state */}
          {!loading && !sent && error && !data && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
