'use client'

// Invoice-first billing. Start from the invoice:
//   • New project — a won project is created behind it, with a budget that
//     matches the invoice (createInvoiceFirst, mode 'new').
//   • Existing project — bill any project; on a won project it's added scope,
//     counted on top of the agreed total.
// "Create & send" creates the invoice, then opens the usual send dialog.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Plus, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { calcInvoiceTotals, localISODate, addDaysISO } from '@/lib/invoice-totals'
import { createInvoiceFirst } from '@/server/actions/invoice-first'
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal'
import { InvoiceLineRowsEditor, blankRow, rowToCents, rowToLineItem, rowsError, type Row } from '@/components/invoices/InvoiceLineRows'

export interface InvoiceableProject {
  id:         string
  name:       string
  clientName: string
  /** Has an approved proposal — an invoice on it is added scope. */
  won:        boolean
}

interface Props {
  open:             boolean
  onOpenChange:     (open: boolean) => void
  /** Projects this person can invoice (Invoices edit), non-archived. */
  projects?:        InvoiceableProject[]
  clients?:         { id: string; name: string }[]
  /** Projects + budget + proposals + invoices edit — may start a new project. */
  canCreateProject?: boolean
  /** Opened from a project page: billing is for this project only. */
  lockedProject?:   InvoiceableProject
  invoiceExpiryDays?: number
}

type Mode = 'new' | 'existing'

interface Created { invoiceId: string; number: string; projectId: string; scopeAddition: boolean; mode: Mode }

export function NewStandaloneInvoiceModal({
  open, onOpenChange, projects = [], clients = [], canCreateProject = false, lockedProject, invoiceExpiryDays = 30,
}: Props) {
  const router = useRouter()
  const initialMode: Mode = lockedProject || !canCreateProject ? 'existing' : 'new'

  const [mode, setMode]             = useState<Mode>(initialMode)
  // New project
  const [projectName, setProjectName] = useState('')
  const [clientId, setClientId]     = useState('')
  const [newClient, setNewClient]   = useState(false)
  const [clientName, setClientName] = useState('')
  // Existing project
  const [projectId, setProjectId]   = useState(lockedProject?.id ?? '')
  const [search, setSearch]         = useState('')
  // Invoice
  const [rows, setRows]             = useState<Row[]>(() => [blankRow()])
  const [title, setTitle]           = useState('')
  const [issueDate, setIssueDate]   = useState(() => localISODate())
  const [dueDate, setDueDate]       = useState(() => addDaysISO(localISODate(), invoiceExpiryDays))
  const [dueTouched, setDueTouched] = useState(false)
  const [taxText, setTaxText]       = useState('0')
  const [discountText, setDiscountText] = useState('')
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState<false | 'draft' | 'send'>(false)
  const [error, setError]           = useState('')
  const [created, setCreated]       = useState<Created | null>(null)
  const [sendAfter, setSendAfter]   = useState(false)
  const [countAsScope, setCountAsScope] = useState(true)

  // Fresh form each time it opens.
  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setProjectName(''); setClientId(''); setNewClient(false); setClientName('')
    setProjectId(lockedProject?.id ?? ''); setSearch('')
    setRows([blankRow()]); setTitle('')
    setIssueDate(localISODate()); setDueDate(addDaysISO(localISODate(), invoiceExpiryDays)); setDueTouched(false)
    setTaxText('0'); setDiscountText(''); setNotes('')
    setSubmitting(false); setError(''); setCreated(null); setSendAfter(false); setCountAsScope(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selectedProject = lockedProject ?? projects.find(p => p.id === projectId) ?? null
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? projects.filter(p => `${p.name} ${p.clientName}`.toLowerCase().includes(q)) : projects
  }, [projects, search])

  const taxPct        = Math.max(0, parseFloat(taxText) || 0)
  const discountInput = Math.max(0, Math.round((parseFloat(discountText) || 0) * 100))
  const { subtotalCents, discountCents, taxCents, totalCents } = calcInvoiceTotals({
    lineTotalsCents: rows.map(rowToCents),
    discountCents:   discountInput,
    taxPct,
  })

  const subjectName = mode === 'new' ? projectName.trim() : selectedProject?.name ?? ''
  const isWonProject = mode === 'existing' && !!selectedProject?.won
  const isScope      = isWonProject && countAsScope
  const autoTitle   = subjectName ? `${isScope ? 'Added scope' : 'Invoice'} — ${subjectName}` : 'Invoice'

  async function submit(send: boolean) {
    setError('')
    if (mode === 'new') {
      if (!projectName.trim()) { setError('Enter a project name.'); return }
      if (newClient ? !clientName.trim() : !clientId) { setError(newClient ? 'Enter a client name.' : 'Choose a client.'); return }
    } else if (!selectedProject) { setError('Choose a project to bill.'); return }
    if (!issueDate || !dueDate) { setError('Invoice and due dates are required.'); return }
    if (dueDate < issueDate) { setError('The due date can’t be before the invoice date.'); return }
    const rowsProblem = rowsError(rows, { requireQuantity: true })
    if (rowsProblem) { setError(rowsProblem); return }

    setSubmitting(send ? 'send' : 'draft')
    try {
      const shared = {
        title:         title.trim() || autoTitle,
        issueDate,
        dueDate,
        lineItems:     rows.map(rowToLineItem),
        taxPct,
        discountCents: discountCents || undefined,
        notes:         notes.trim() || undefined,
      }
      const res = mode === 'new'
        ? await createInvoiceFirst({
            mode: 'new', projectName: projectName.trim(),
            ...(newClient ? { clientName: clientName.trim() } : { clientId }),
            ...shared,
          })
        : await createInvoiceFirst({ mode: 'existing', projectId: selectedProject!.id, scopeAddition: isScope, ...shared })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      setCreated({ ...res.data, mode })
      setSendAfter(send)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Created ────────────────────────────────────────────────────────────────
  if (created) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Invoice {created.number} created
            </DialogTitle>
            <DialogDescription>
              {created.mode === 'new'
                ? 'A won project was created with a budget that matches this invoice.'
                : created.scopeAddition
                  ? 'Added to the project as extra scope, on top of its agreed total.'
                  : 'Added to the project. It’s saved as a draft.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {created.mode === 'new' && (
              <Button variant="outline" asChild>
                <Link href={`/projects/${created.projectId}`} onClick={() => onOpenChange(false)}>Open project</Link>
              </Button>
            )}
            <SendInvoiceModal
              invoiceId={created.invoiceId}
              onSent={() => { onOpenChange(false); router.refresh() }}
              trigger={openSend => (
                <>
                  {sendAfter && <OpenOnMount open={openSend} />}
                  <Button variant={sendAfter ? 'outline' : 'default'} onClick={openSend}>Send invoice</Button>
                </>
              )}
            />
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{lockedProject ? (lockedProject.won ? 'Bill added scope' : 'New invoice') : 'New invoice'}</DialogTitle>
          {lockedProject && (
            <DialogDescription>{lockedProject.name} · {lockedProject.clientName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Who it's for */}
          {!lockedProject && (
            <div>
              <Label className="mb-2 block text-sm">Bill to</Label>
              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  active={mode === 'new'} disabled={!canCreateProject}
                  title="New project" hint={canCreateProject ? 'Creates a won project behind the invoice' : 'Needs project and budget edit access'}
                  onClick={() => setMode('new')}
                />
                <ModeButton
                  active={mode === 'existing'} disabled={projects.length === 0}
                  title="Existing project" hint={projects.length ? 'Bill a project — added scope if it’s won' : 'No projects you can invoice'}
                  onClick={() => setMode('existing')}
                />
              </div>
            </div>
          )}

          {mode === 'new' && !lockedProject && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="if-project">Project name</Label>
                <Input id="if-project" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Hulu — Promo pickup" autoFocus />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Client</Label>
                  <button
                    type="button"
                    className="text-xs text-violet-600 hover:underline"
                    onClick={() => { setNewClient(v => !v); setClientId(''); setClientName('') }}
                  >
                    {newClient ? 'Select existing' : '+ New client'}
                  </button>
                </div>
                {newClient ? (
                  <Input placeholder="Client name" value={clientName} onChange={e => setClientName(e.target.value)} />
                ) : (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {mode === 'existing' && !lockedProject && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects or clients…" className="pl-8" />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {filtered.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No matching projects.</p>}
                {filtered.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProjectId(p.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40',
                      projectId === p.id && 'bg-[#F5EDFA]',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.clientName}</span>
                    </span>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      p.won ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800',
                    )}>
                      {p.won ? 'Won' : 'Not won'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'existing' && selectedProject && (isWonProject ? (
            <div className={cn('rounded-lg px-3 py-2 text-xs', isScope ? 'bg-blue-50 text-blue-800' : 'bg-muted/50 text-muted-foreground')}>
              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input type="checkbox" checked={countAsScope} onChange={e => setCountAsScope(e.target.checked)} className="h-3.5 w-3.5" />
                Count as added scope
              </label>
              <p className="mt-1 pl-5">
                {isScope
                  ? 'Billed on top of the agreed total and added to the project’s value.'
                  : 'Part of the agreed total (e.g. re-issuing a voided invoice). The project’s value won’t change.'}
              </p>
            </div>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              This project has no won proposal. This invoice won’t change its value.
            </p>
          ))}

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Line items</Label>
              <button
                type="button"
                onClick={() => setRows(r => [...r, blankRow()])}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>
            <InvoiceLineRowsEditor rows={rows} onChange={setRows} autoFocusFirst={!!lockedProject} />
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="if-title">Title</Label>
            <Input id="if-title" placeholder={autoTitle} value={title} onChange={e => setTitle(e.target.value)} className="mt-1" />
          </div>

          {/* Dates + tax + discount */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="if-issue">Invoice date</Label>
              <Input
                id="if-issue" type="date" value={issueDate} className="mt-1"
                onChange={e => {
                  const v = e.target.value
                  setIssueDate(v)
                  // Keep the usual payment window unless the due date was set by hand.
                  if (v && !dueTouched) setDueDate(addDaysISO(v, invoiceExpiryDays))
                }}
              />
            </div>
            <div>
              <Label htmlFor="if-due">Due date</Label>
              <Input
                id="if-due" type="date" value={dueDate} min={issueDate || undefined} className="mt-1"
                onChange={e => { setDueDate(e.target.value); setDueTouched(true) }}
              />
            </div>
            <div>
              <Label htmlFor="if-tax">Tax %</Label>
              <Input id="if-tax" type="number" min={0} max={100} step={0.01} value={taxText} onChange={e => setTaxText(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="if-discount">Discount ($)</Label>
              <Input id="if-discount" type="number" min={0} step={0.01} value={discountText} onChange={e => setDiscountText(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="if-notes">Notes (optional)</Label>
            <textarea
              id="if-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any notes visible to the client…"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Totals */}
          <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span>Discount</span>
                <span className="tabular-nums">−{formatMoney(discountCents)}</span>
              </div>
            )}
            {taxPct > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Tax ({taxPct}%)</span>
                <span className="tabular-nums">{formatMoney(taxCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-bold text-foreground pt-1 border-t">
              <span>Invoice total</span>
              <span className="text-xl tabular-nums">{formatMoney(totalCents)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!submitting}>Cancel</Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => submit(false)} disabled={!!submitting}>
            {submitting === 'draft' ? 'Creating…' : 'Create draft'}
          </Button>
          <Button onClick={() => submit(true)} disabled={!!submitting}>
            {submitting === 'send' ? 'Creating…' : <>Create &amp; send</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModeButton({ active, disabled, title, hint, onClick }: {
  active: boolean; disabled?: boolean; title: string; hint: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-[#5D00A4] bg-[#F5EDFA] text-[#5D00A4]' : 'border-border hover:border-[#c9a8f0] hover:bg-muted/30 text-foreground',
      )}
    >
      <span className="block font-medium">{title}</span>
      <span className={cn('block text-xs', active ? 'text-[#8B4FC3]' : 'text-muted-foreground')}>{hint}</span>
    </button>
  )
}

/** Opens the send dialog once, right after "Create & send". */
function OpenOnMount({ open }: { open: () => void }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    open()
  }, [open])
  return null
}
