'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  AlertCircle, Archive, ArrowLeft, Check, Globe, Mail, MapPin, Pencil, Phone, Plus, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatMoney } from '@/lib/money'
import { stageLabel } from '@/lib/project-phase'
import { STATUS_LABEL, type DealStage } from '@/lib/proposals-board'
import type { ClientPageData } from '@/lib/client-page'
import { archiveClient, updateClientNotes } from '@/server/actions/clients'
import { ClientModal } from './ClientModal'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import { NewInvoiceButton } from '@/components/invoices/NewInvoiceButton'
import type { InvoiceableProject } from '@/components/invoices/NewStandaloneInvoiceModal'
import type { ShootType } from '@prisma/client'

export interface ClientDeal {
  key: string; projectId: string; projectName: string
  title: string; status: string; stage: DealStage
  version: number; viewCount: number
  sentAt: string | null; decidedAt: string | null; token: string
  valueCents: number | null
}

export interface ClientPipeline {
  openCents: number; openCount: number
  wonCount: number; decidedCount: number
  avgWonCents: number | null
}

interface Props {
  data:         ClientPageData
  /** Null when the person has no Proposals access. */
  proposals:    ClientDeal[] | null
  showInvoices: boolean
  /** Null without money access. */
  pipeline:     ClientPipeline | null
  canEdit:      boolean
  newProject:   { templates: { id: string; name: string; shootType: ShootType; description: string | null }[] } | null
  newInvoice:   { projects: InvoiceableProject[]; canCreateProject: boolean; invoiceExpiryDays: number } | null
}

const card = 'rounded-[10px] border border-[#E8E0F0] bg-white shadow-sm'
const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

const fmtDate = (iso: string | null) => (iso ? format(new Date(iso), 'MMM d, yyyy') : '—')

function ago(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/)
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  return (
    <div className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full bg-violet-100 text-lg font-bold uppercase text-violet-700">
      {letters}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' }) {
  const color = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-500' : tone === 'amber' ? 'text-amber-600' : 'text-foreground'
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="mb-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p className={`truncate text-[17px] font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

const STAGE_CHIP: Record<DealStage, string> = {
  ns:   'bg-gray-100 text-gray-600',
  out:  'bg-violet-100 text-violet-700',
  won:  'bg-emerald-100 text-emerald-700',
  lost: 'bg-gray-100 text-gray-500',
}

const PROJECT_CHIP: Record<string, string> = {
  LEAD:     'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  WRAPPED:  'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

/** Invoice status as the client sees it: partial and overdue win over the stored label. */
function invoiceChip(inv: ClientPageData['invoices'][number], now: number): { label: string; cls: string } {
  const balance = inv.totalCents - inv.amountPaidCents
  if (inv.status === 'VOID')  return { label: 'Void',  cls: 'bg-gray-100 text-gray-500' }
  if (inv.status === 'DRAFT') return { label: 'Draft', cls: 'bg-gray-100 text-gray-600' }
  if (inv.status === 'PAID' || balance <= 0) return { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' }
  if (new Date(inv.dueDate).getTime() < now) return { label: 'Overdue', cls: 'bg-red-100 text-red-700' }
  if (inv.amountPaidCents > 0) return { label: 'Partial', cls: 'bg-amber-100 text-amber-800' }
  return inv.status === 'VIEWED'
    ? { label: 'Viewed', cls: 'bg-violet-100 text-violet-700' }
    : { label: 'Sent', cls: 'bg-blue-100 text-blue-700' }
}

const PREVIEW = 8

export function ClientDetail({ data, proposals, showInvoices, pipeline, canEdit, newProject, newInvoice }: Props) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const { client, projects, invoices, money, activity } = data
  const now = Date.now()

  const [editOpen, setEditOpen]           = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [showArchived, setShowArchived]   = useState(false)
  const [allInvoices, setAllInvoices]     = useState(false)
  const [archivedInvoices, setArchivedInvoices] = useState(false)
  const [archiveError, setArchiveError]   = useState<string | null>(null)
  const [archiving, startArchive]         = useTransition()

  const liveProjects     = projects.filter(p => !p.archived)
  const archivedProjects = projects.filter(p => p.archived)
  const shownProjects    = showArchived ? projects : liveProjects

  // Open first (overdue at the top), then everything else newest first.
  const sortedInvoices = useMemo(() => {
    const rank = (i: (typeof invoices)[number]) => {
      const c = invoiceChip(i, now).label
      return c === 'Overdue' ? 0 : c === 'Partial' || c === 'Sent' || c === 'Viewed' ? 1 : 2
    }
    return invoices
      .filter(i => archivedInvoices || !i.archived)
      .sort((a, b) => Number(a.archived) - Number(b.archived) || rank(a) - rank(b) || (a.issueDate < b.issueDate ? 1 : -1))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, archivedInvoices])
  const liveInvoiceCount     = invoices.filter(i => !i.archived).length
  const archivedInvoiceCount = invoices.length - liveInvoiceCount
  const shownInvoices = allInvoices ? sortedInvoices : sortedInvoices.slice(0, PREVIEW)

  async function handleArchive() {
    const ok = await confirm(
      `Archive ${client.name}? It leaves the Clients list. Its projects, proposals and invoices aren't touched.`,
      { title: 'Archive client', confirmLabel: 'Archive' },
    )
    if (!ok) return
    setArchiveError(null)
    startArchive(async () => {
      const res = await archiveClient(client.id)
      if (!res.success) { setArchiveError((res as { success: false; error: string }).error); return }
      router.push('/clients')
    })
  }

  const website = client.website ? (client.website.startsWith('http') ? client.website : `https://${client.website}`) : null

  return (
    <div className="space-y-5">
      {ConfirmDialog}

      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Clients
      </Link>

      {client.archived && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This client is archived. It&rsquo;s hidden from the Clients list and from new-project pickers.
        </p>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={client.logoUrl} alt={client.name} className="h-14 w-14 shrink-0 rounded-full border border-border/40 object-contain" />
          ) : (
            <Initials name={client.name} />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-foreground">{client.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[client.legalName, `Client since ${format(new Date(client.createdAt), 'MMM yyyy')}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {newProject && (
            <Button size="sm" onClick={() => setNewProjectOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New project
            </Button>
          )}
          {newInvoice && (
            <NewInvoiceButton
              variant="outline"
              projects={newInvoice.projects}
              clients={[{ id: client.id, name: client.name }]}
              canCreateProject={newInvoice.canCreateProject}
              invoiceExpiryDays={newInvoice.invoiceExpiryDays}
              defaultClientId={client.id}
            />
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {canEdit && !client.archived && (
            <Button size="sm" variant="ghost" onClick={handleArchive} disabled={archiving}>
              <Archive className="mr-1.5 h-3.5 w-3.5" /> {archiving ? 'Archiving…' : 'Archive'}
            </Button>
          )}
        </div>
      </div>
      {archiveError && <p className="text-sm text-destructive">{archiveError}</p>}

      {client.specialNotes?.trim() && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Account note</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-amber-800">{client.specialNotes}</p>
          </div>
        </div>
      )}

      {/* ── Money ── */}
      {money && (
        <div className={`${card} grid grid-cols-2 divide-x divide-y divide-[#EEE8F4] sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6`}>
          <Stat label="Billed" value={formatMoney(money.billedCents)} />
          <Stat label="Collected" value={formatMoney(money.collectedCents)} tone={money.collectedCents > 0 ? 'green' : undefined}
            sub={money.lastPaidAt ? `Last paid ${ago(money.lastPaidAt)}` : undefined} />
          <Stat label="Outstanding" value={money.outstandingCents > 0 ? formatMoney(money.outstandingCents) : '—'}
            sub={money.openCount ? `${money.openCount} open invoice${money.openCount === 1 ? '' : 's'}` : undefined} />
          <Stat label="Overdue" value={money.overdueCents > 0 ? formatMoney(money.overdueCents) : '—'} tone={money.overdueCents > 0 ? 'red' : undefined}
            sub={money.overdueCount ? `${money.overdueCount} invoice${money.overdueCount === 1 ? '' : 's'}` : undefined} />
          {pipeline && (
            <Stat label="Open pipeline" value={pipeline.openCents > 0 ? formatMoney(pipeline.openCents) : '—'}
              sub={pipeline.openCount ? `${pipeline.openCount} proposal${pipeline.openCount === 1 ? '' : 's'} out` : undefined} />
          )}
          {pipeline && (
            <Stat label="Win rate"
              value={pipeline.decidedCount ? `${Math.round((pipeline.wonCount / pipeline.decidedCount) * 100)}%` : '—'}
              sub={pipeline.decidedCount
                ? `${pipeline.wonCount} of ${pipeline.decidedCount}${pipeline.avgWonCents ? ` · avg ${formatMoney(pipeline.avgWonCents)}` : ''}`
                : 'Nothing decided yet'} />
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Left: projects, proposals, invoices ── */}
        <div className="space-y-5 lg:col-span-2">
          <section className={card}>
            <header className="flex items-center justify-between border-b border-[#EEE8F4] px-4 py-3">
              <h2 className={sectionTitle}>Projects <span className="text-muted-foreground/60">· {liveProjects.length}</span></h2>
              {archivedProjects.length > 0 && (
                <button type="button" onClick={() => setShowArchived(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                  {showArchived ? 'Hide archived' : `Show archived (${archivedProjects.length})`}
                </button>
              )}
            </header>
            {shownProjects.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <ul className="divide-y divide-[#F1ECF6]">
                {shownProjects.map(p => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${p.archived ? 'text-muted-foreground' : 'text-foreground'}`}>{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.shootStart ? `Shoot ${format(new Date(`${p.shootStart}T12:00:00Z`), 'MMM d, yyyy')}` : `Created ${fmtDate(p.createdAt)}`}
                        </p>
                      </div>
                      {p.valueCents !== null && (
                        <div className="hidden text-right sm:block">
                          <p className="text-sm font-semibold tabular-nums">{p.valueCents > 0 ? formatMoney(p.valueCents) : '—'}</p>
                          {!!p.collectedCents && <p className="text-[11px] tabular-nums text-emerald-600">{formatMoney(p.collectedCents)} collected</p>}
                        </div>
                      )}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROJECT_CHIP[p.archived ? 'ARCHIVED' : p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {p.archived ? 'Archived' : stageLabel(p.status, p.phase)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {proposals && (
            <section className={card}>
              <header className="border-b border-[#EEE8F4] px-4 py-3">
                <h2 className={sectionTitle}>Proposals <span className="text-muted-foreground/60">· {proposals.length}</span></h2>
              </header>
              {proposals.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No proposals yet.</p>
              ) : (
                <ul className="divide-y divide-[#F1ECF6]">
                  {proposals.map(p => (
                    <li key={p.key}>
                      <Link href={`/projects/${p.projectId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{p.title?.trim() || p.projectName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              p.title?.trim() && p.title.trim() !== p.projectName ? p.projectName : null,
                              p.version > 1 ? `v${p.version}` : null,
                              p.stage === 'won' || p.stage === 'lost'
                                ? (p.decidedAt ? `${STATUS_LABEL[p.status] ?? p.status} ${fmtDate(p.decidedAt)}` : null)
                                : p.sentAt ? `Sent ${fmtDate(p.sentAt)}` : null,
                              p.stage === 'out' ? (p.viewCount > 0 ? `Viewed ${p.viewCount}×` : 'Not opened') : null,
                            ].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {p.valueCents !== null && (
                          <p className="hidden text-sm font-semibold tabular-nums sm:block">{p.valueCents > 0 ? formatMoney(p.valueCents) : '—'}</p>
                        )}
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STAGE_CHIP[p.stage]}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {showInvoices && (
            <section className={card}>
              <header className="flex items-center justify-between border-b border-[#EEE8F4] px-4 py-3">
                <h2 className={sectionTitle}>Invoices <span className="text-muted-foreground/60">· {liveInvoiceCount}</span></h2>
                <div className="flex items-center gap-3">
                  {archivedInvoiceCount > 0 && (
                    <button type="button" onClick={() => setArchivedInvoices(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                      {archivedInvoices ? 'Hide archived' : `Show archived (${archivedInvoiceCount})`}
                    </button>
                  )}
                  {sortedInvoices.length > PREVIEW && (
                    <button type="button" onClick={() => setAllInvoices(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                      {allInvoices ? 'Show fewer' : `Show all ${sortedInvoices.length}`}
                    </button>
                  )}
                </div>
              </header>
              {sortedInvoices.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <ul className="divide-y divide-[#F1ECF6]">
                  {shownInvoices.map(inv => {
                    const chip = inv.archived ? { label: 'Archived', cls: 'bg-gray-100 text-gray-500' } : invoiceChip(inv, now)
                    const balance = Math.max(0, inv.totalCents - inv.amountPaidCents)
                    const open = chip.label === 'Overdue' || chip.label === 'Partial' || chip.label === 'Sent' || chip.label === 'Viewed'
                    return (
                      <li key={inv.id}>
                        <Link href={`/projects/${inv.project.id}/invoices`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {inv.number}{inv.title ? <span className="font-normal text-muted-foreground"> · {inv.title}</span> : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {inv.project.name} · {open ? `Due ${fmtDate(inv.dueDate)}` : `Issued ${fmtDate(inv.issueDate)}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">{formatMoney(open ? balance : inv.totalCents)}</p>
                            {open && inv.amountPaidCents > 0 && (
                              <p className="text-[11px] tabular-nums text-muted-foreground">of {formatMoney(inv.totalCents)}</p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip.cls}`}>{chip.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* ── Right: contact, notes, activity ── */}
        <div className="space-y-5">
          <section className={`${card} space-y-2.5 px-4 py-4`}>
            <h2 className={sectionTitle}>Contact</h2>
            {!client.contactName && !client.contactEmail && !client.contactPhone && !website && !client.billingAddress && (
              <p className="text-sm text-muted-foreground">No contact details yet.</p>
            )}
            {client.contactName && <p className="flex items-center gap-2 text-sm"><User className="h-3.5 w-3.5 text-muted-foreground" />{client.contactName}</p>}
            {client.contactEmail && (
              <a href={`mailto:${client.contactEmail}`} className="flex items-center gap-2 text-sm text-foreground hover:underline">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{client.contactEmail}</span>
              </a>
            )}
            {client.contactPhone && (
              <a href={`tel:${client.contactPhone}`} className="flex items-center gap-2 text-sm text-foreground hover:underline">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />{client.contactPhone}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-foreground hover:underline">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            {client.billingAddress && (
              <p className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="whitespace-pre-line">{client.billingAddress}</span>
              </p>
            )}
          </section>

          <NotesEditor key={client.notes ?? ''} clientId={client.id} initial={client.notes ?? ''} canEdit={canEdit} />

          <section className={`${card} px-4 py-4`}>
            <h2 className={`${sectionTitle} mb-3`}>Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {activity.map((a, i) => (
                  <li key={`${a.kind}-${a.at}-${i}`} className="flex gap-2.5">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      a.kind === 'invoice.paid' || a.kind === 'proposal.won' ? 'bg-emerald-500'
                        : a.kind.endsWith('.viewed') ? 'bg-violet-500'
                        : a.kind === 'proposal.declined' ? 'bg-gray-400'
                        : 'bg-blue-500'}`} />
                    <div className="min-w-0">
                      <Link href={a.href} className="block truncate text-sm text-foreground hover:underline">{a.text}</Link>
                      <p className="text-[11px] text-muted-foreground" title={fmtDate(a.at)}>{ago(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {canEdit && (
        <ClientModal
          open={editOpen}
          onOpenChange={setEditOpen}
          existing={client}
          onSaved={() => { setEditOpen(false); router.refresh() }}
        />
      )}
      {newProject && (
        <NewProjectModal
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          clients={[{ id: client.id, name: client.name }]}
          templates={newProject.templates}
          defaultClientId={client.id}
        />
      )}
    </div>
  )
}

function NotesEditor({ clientId, initial, canEdit }: { clientId: string; initial: string; canEdit: boolean }) {
  const router = useRouter()
  const [value, setValue]   = useState(initial)
  const [saved, setSaved]   = useState(initial)
  const [error, setError]   = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, start]    = useTransition()
  const dirty = value !== saved

  function save() {
    setError(null)
    start(async () => {
      const res = await updateClientNotes(clientId, value)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      setSaved(value)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1500)
      router.refresh()
    })
  }

  return (
    <section className={`${card} px-4 py-4`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className={sectionTitle}>Notes</h2>
        {justSaved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> Saved</span>}
      </div>
      {canEdit ? (
        <>
          <Textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={5}
            placeholder="Anything worth remembering about this client…"
            className="text-sm"
          />
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
          {dirty && (
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setValue(saved); setError(null) }} disabled={pending}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
            </div>
          )}
        </>
      ) : (
        <p className="whitespace-pre-line text-sm text-foreground">{saved || <span className="text-muted-foreground">No notes.</span>}</p>
      )}
    </section>
  )
}
