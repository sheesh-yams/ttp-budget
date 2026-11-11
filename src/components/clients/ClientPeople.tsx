'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Globe, Mail, MapPin, Pencil, Phone, Plus, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { addClientContact, deleteClientContact, updateClientContact, updateClientDefaults } from '@/server/actions/clients'
import { parseEmailList } from '@/lib/client-recipients'
import type { ClientPageData } from '@/lib/client-page'
import {
  CLIENT_ROLES, ROLE_HINT, ROLE_LABEL, defaultBillTo, defaultOnSet, defaultPreparedFor, normalizeRoles, type ClientRole,
} from '@/lib/client-people'

const card = 'rounded-[10px] border border-[#E8E0F0] bg-white shadow-sm'
const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

type Contact = ClientPageData['contacts'][number]

function useSavedFlash() {
  const [flash, setFlash] = useState(false)
  return { flash, show: () => { setFlash(true); setTimeout(() => setFlash(false), 1500) } }
}

// ─── People ──────────────────────────────────────────────────────────────────

const ROLE_CHIP: Record<ClientRole, string> = {
  BILLING:   'bg-emerald-100 text-emerald-700',
  PROPOSALS: 'bg-blue-100 text-blue-700',
  ON_SET:    'bg-amber-100 text-amber-800',
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>
}

/** Who each document goes to by default, in one line per document. */
function routingLines(people: Contact[]): string[] {
  const names = (list: Contact[]) => list.map(p => p.name).join(', ')
  const bill = defaultBillTo(people)
  const prop = defaultPreparedFor(people)
  const onSet = defaultOnSet(people)
  return [
    `Invoices: ${bill ? bill.name : 'no one yet'}`,
    `Proposals: ${prop.length ? names(prop) : 'no one yet'}`,
    `Call sheets: ${onSet.length ? names(onSet) : 'no one yet'}`,
  ]
}

export function ClientPeople({ client, contacts, canEdit }: {
  client:   ClientPageData['client']
  contacts: Contact[]
  canEdit:  boolean
}) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()
  const website = client.website ? (client.website.startsWith('http') ? client.website : `https://${client.website}`) : null

  async function remove(c: Contact) {
    const ok = await confirm(
      c.isMain
        ? `Remove ${c.name}? They're the main contact — ${client.name} will have no main contact until you pick another. Documents already sent keep their name.`
        : `Remove ${c.name} from ${client.name}? Documents already sent keep their name.`,
      { title: 'Remove person', confirmLabel: 'Remove' },
    )
    if (!ok) return
    setError(null)
    start(async () => {
      const res = await deleteClientContact(c.id)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      router.refresh()
    })
  }

  return (
    <section className={`${card} px-4 py-4`}>
      {ConfirmDialog}
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionTitle}>People</h2>
        {canEdit && (
          <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" /> Add person
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one yet. Add the people you work with at {client.name}.</p>
      ) : (
        <ul className="space-y-3">
          {contacts.map(c => (
            <li key={c.id} className="group">
              <div className="flex flex-wrap items-center gap-1.5">
                <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                {c.isMain && <Chip cls="bg-violet-100 text-violet-700">Main</Chip>}
                {normalizeRoles(c.roles).map(r => <Chip key={r} cls={ROLE_CHIP[r]}>{ROLE_LABEL[r]}</Chip>)}
                {canEdit && (
                  <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                    <button type="button" aria-label={`Remove ${c.name}`} onClick={() => remove(c)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </span>
                )}
              </div>
              {c.title && <p className="pl-[18px] text-xs text-muted-foreground">{c.title}</p>}
              {c.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 pl-[18px] text-xs text-muted-foreground hover:text-foreground">
                  <Mail className="h-3 w-3" /><span className="truncate">{c.email}</span>
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 pl-[18px] text-xs text-muted-foreground hover:text-foreground">
                  <Phone className="h-3 w-3" />{c.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {(website || client.billingAddress) && (
        <div className="mt-4 space-y-1.5 border-t border-[#F1ECF6] pt-3">
          {website && (
            <a href={website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Globe className="h-3 w-3" /><span className="truncate">{website.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
          {client.billingAddress && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="whitespace-pre-line">{client.billingAddress}</span>
            </p>
          )}
        </div>
      )}

      {contacts.length > 0 && (
        <div className="mt-3 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
          {routingLines(contacts).map(l => <p key={l}>{l}</p>)}
          <p className="pt-0.5">Change the person on any single invoice, proposal or call sheet.</p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {canEdit && (
        <ContactDialog
          clientId={client.id}
          contact={editing === 'new' ? null : editing}
          firstPerson={contacts.length === 0}
          open={editing !== null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
    </section>
  )
}

function ContactDialog({ clientId, contact, firstPerson, open, onClose, onSaved }: {
  clientId:    string
  contact:     Contact | null
  /** Adding the client's first person — they start as Main. */
  firstPerson: boolean
  open:        boolean
  onClose:     () => void
  onSaved:     () => void
}) {
  const [name, setName]     = useState('')
  const [title, setTitle]   = useState('')
  const [email, setEmail]   = useState('')
  const [phone, setPhone]   = useState('')
  const [isMain, setIsMain] = useState(false)
  const [roles, setRoles]   = useState<ClientRole[]>([])
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()
  const [lastOpen, setLastOpen] = useState(false)

  // Fresh fields each time it opens.
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setName(contact?.name ?? ''); setTitle(contact?.title ?? ''); setEmail(contact?.email ?? '')
      setPhone(contact?.phone ?? ''); setIsMain(contact ? contact.isMain : firstPerson)
      setRoles(normalizeRoles(contact?.roles ?? [])); setError(null)
    }
  }

  function toggleRole(r: ClientRole) {
    setRoles(prev => (prev.includes(r) ? prev.filter(x => x !== r) : normalizeRoles([...prev, r])))
  }

  function save() {
    setError(null)
    start(async () => {
      const input = { name, title, email, phone, isMain, roles }
      const res = contact ? await updateClientContact(contact.id, input) : await addClientContact(clientId, input)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !pending) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{contact ? 'Edit person' : 'Add person'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cc-name">Name</Label>
            <Input id="cc-name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-title">Title</Label>
            <Input id="cc-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Accounts Payable, Brand Producer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-email">Email</Label>
              <Input id="cc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-phone">Phone</Label>
              <Input id="cc-phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Their role</legend>
            {CLIENT_ROLES.map(r => (
              <label key={r} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)} className="mt-0.5" />
                <span>{ROLE_LABEL[r]}<span className="block text-xs text-muted-foreground">{ROLE_HINT[r]} by default</span></span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={isMain} onChange={e => setIsMain(e.target.checked)} className="mt-0.5" />
            <span>
              Main contact
              <span className="block text-xs text-muted-foreground">The client&rsquo;s primary contact — used wherever no role applies. Only one person can be Main.</span>
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending || !name.trim()}>{pending ? 'Saving…' : contact ? 'Save' : 'Add'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Billing defaults ────────────────────────────────────────────────────────

export function ClientDefaults({ client, workspaceDueDays, canEdit }: {
  client:           ClientPageData['client']
  workspaceDueDays: number
  canEdit:          boolean
}) {
  const router = useRouter()
  const initial = {
    terms:      client.paymentTermsDays == null ? '' : String(client.paymentTermsDays),
    invoiceCc:  client.invoiceCcEmails.join(', '),
    proposalCc: client.proposalCcEmails.join(', '),
  }
  const [terms, setTerms]           = useState(initial.terms)
  const [invoiceCc, setInvoiceCc]   = useState(initial.invoiceCc)
  const [proposalCc, setProposalCc] = useState(initial.proposalCc)
  const [error, setError]           = useState<string | null>(null)
  const [pending, start]            = useTransition()
  const saved = useSavedFlash()
  const dirty = terms !== initial.terms || invoiceCc !== initial.invoiceCc || proposalCc !== initial.proposalCc

  function save() {
    setError(null)
    const t = terms.trim()
    const days = t === '' ? null : Number(t)
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) { setError('Payment terms must be 0–365 days.'); return }
    const inv = parseEmailList(invoiceCc)
    const prop = parseEmailList(proposalCc)
    const bad = [...inv.invalid, ...prop.invalid][0]
    if (bad) { setError(`“${bad}” isn’t a valid email.`); return }
    start(async () => {
      const res = await updateClientDefaults(client.id, { paymentTermsDays: days, invoiceCcEmails: inv.emails, proposalCcEmails: prop.emails })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      saved.show()
      router.refresh()
    })
  }

  if (!canEdit) {
    return (
      <section className={`${card} space-y-2 px-4 py-4`}>
        <h2 className={sectionTitle}>Billing defaults</h2>
        <p className="text-sm">Payment terms: {client.paymentTermsDays == null ? `Workspace default (${workspaceDueDays} days)` : `Net ${client.paymentTermsDays}`}</p>
        <p className="text-sm">Invoice CC: {client.invoiceCcEmails.join(', ') || '—'}</p>
        <p className="text-sm">Proposal CC: {client.proposalCcEmails.join(', ') || '—'}</p>
      </section>
    )
  }

  return (
    <section className={`${card} px-4 py-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionTitle}>Billing defaults</h2>
        {saved.flash && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> Saved</span>}
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cd-terms">Payment terms (days)</Label>
          <Input id="cd-terms" inputMode="numeric" value={terms} onChange={e => setTerms(e.target.value)} placeholder={`Workspace default (${workspaceDueDays})`} />
          <p className="text-[11px] text-muted-foreground">New invoices fall due this many days after the invoice date.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cd-icc">Always CC on invoices</Label>
          <Input id="cd-icc" value={invoiceCc} onChange={e => setInvoiceCc(e.target.value)} placeholder="ap@client.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cd-pcc">Always CC on proposals</Label>
          <Input id="cd-pcc" value={proposalCc} onChange={e => setProposalCc(e.target.value)} placeholder="producer@client.com" />
          <p className="text-[11px] text-muted-foreground">Anyone copied on a proposal can also e-sign it.</p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setTerms(initial.terms); setInvoiceCc(initial.invoiceCc); setProposalCc(initial.proposalCc); setError(null) }}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">These fill in new invoices and proposals. You can still change them before sending.</p>
      </div>
    </section>
  )
}
