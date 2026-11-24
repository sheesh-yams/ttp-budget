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
import { ClientPersonSelect, SOMEONE_ELSE } from '@/components/clients/ClientPersonPicker'
import { greetingName } from '@/lib/client-people'
import { formatMoney } from '@/lib/money'
import { EmailPreview } from './EmailPreview'
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

/** The greeting's person for a picker value: the picked person, else the invoice's bill-to. */
function personFor(data: NonNullable<SendData>, id: string): { name: string } | null {
  return data.people.find(p => p.id === id) ?? data.billTo
}

/** The person whose email matches the To, else SOMEONE_ELSE. */
function personIdFor(people: { id: string; email: string | null }[], email: string | null | undefined): string {
  const e = (email ?? '').trim().toLowerCase()
  return people.find(p => p.email && p.email.toLowerCase() === e)?.id ?? SOMEONE_ELSE
}

// ── Default message builder ────────────────────────────────────────────────

function buildDefaultMessage(data: NonNullable<SendData>, person?: { name: string } | null) {
  const amount = formatMoney(data.totalCents)
  const due    = format(new Date(data.dueDate), 'MMMM d, yyyy')
  return [
    `Hi ${greetingName(person, data.clientName)},`,
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

export function SendInvoiceModal({ invoiceId, trigger, onSent }: SendInvoiceModalProps) {
  const [open, setOpen]         = useState(false)
  const [tab, setTab]           = useState<Tab>('compose')
  const [data, setData]         = useState<NonNullable<SendData> | null>(null)
  const [loading, setLoading]   = useState(false)
  const [to, setTo]             = useState('')
  // The bill-to person (a ClientContact id) or SOMEONE_ELSE for a typed address.
  const [billToId, setBillToId] = useState(SOMEONE_ELSE)
  const [cc, setCc]             = useState('')
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
      const startId = result.billToId ?? personIdFor(result.people, result.clientEmail)
      setBillToId(startId)
      setCc((result.recipientEmails ?? []).join(', '))
      setSubject(buildDefaultSubject(result))
      setMessage(buildDefaultMessage(result, personFor(result, startId)))
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

  /** Picking a person sets the To (and the greeting, if the message is untouched). */
  function pickBillTo(person: { id: string; name: string; email: string | null } | null) {
    if (!data) return
    if (!person) { setBillToId(SOMEONE_ELSE); return }
    setBillToId(person.id)
    if (person.email) setTo(person.email)
    if (message === buildDefaultMessage(data, currentPerson())) setMessage(buildDefaultMessage(data, person))
  }

  function currentPerson() {
    return data ? personFor(data, billToId) : null
  }

  function handleSend() {
    if (!to.trim()) { setError('Recipient email is required.'); return }
    setError(null)

    startTransition(async () => {
      const result = await sendInvoice(invoiceId, {
        to:      to.trim(),
        cc:      cc.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean),
        subject: subject.trim() || buildDefaultSubject(data!),
        message: message.trim(),
        billToContactId: billToId !== SOMEONE_ELSE ? billToId : null,
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
                  {data.people.length > 0 && (
                    <div>
                      <Label htmlFor="inv-billto">Bill to</Label>
                      <div className="mt-1">
                        <ClientPersonSelect id="inv-billto" people={data.people} value={billToId} onChange={pickBillTo} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Shown as “Attn:” on the invoice, and they get the payment receipt.</p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="inv-to">To</Label>
                    <Input
                      id="inv-to"
                      type="email"
                      value={to}
                      onChange={e => { setTo(e.target.value); setBillToId(personIdFor(data.people, e.target.value)) }}
                      placeholder="client@example.com"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-cc">CC</Label>
                    <Input
                      id="inv-cc"
                      value={cc}
                      onChange={e => setCc(e.target.value)}
                      placeholder="accounts@client.com, manager@client.com"
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Comma-separated. A copy is also sent to you, the sender.
                    </p>
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
                  <p className="px-6 pt-4 text-xs text-muted-foreground">
                    The email below links to the invoice.{' '}
                    <a href={`/invoices/preview/${invoiceId}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                      Preview the invoice as your client will see it ↗
                    </a>
                  </p>
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
