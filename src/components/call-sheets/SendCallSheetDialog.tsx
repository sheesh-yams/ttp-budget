'use client'

// "Send to crew": review who gets the call sheet, fill in missing emails, add
// a note, send one personal email each — and see Sent / Opened / Confirmed.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Check, AlertCircle, Mail, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatTime, type TimeFormat } from '@/lib/time-format'
import { getCallSheetSendList, sendCallSheetEmails, type SendListPerson, type CrewDept, type TalentMember, type OtherContact } from '@/server/actions/call-sheets'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GROUP_LABEL = { CREW: 'Crew', TALENT: 'Talent', OTHER: 'Other contacts' } as const
type Filter = 'ALL' | 'UNCONFIRMED' | 'CHANGED'

function ago(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function StatusPill({ p }: { p: SendListPerson }) {
  if (p.lastError && p.status === 'NOT_SENT') return <span className="text-[11px] text-destructive">Failed</span>
  const styles: Record<SendListPerson['status'], string> = {
    NOT_SENT: 'border-border text-muted-foreground',
    SENT: 'border-blue-200 bg-blue-50 text-blue-700',
    OPENED: 'border-violet-200 bg-violet-50 text-violet-700',
    CONFIRMED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
  const label = { NOT_SENT: 'Not sent', SENT: `Sent ${ago(p.lastSentAt)}`, OPENED: 'Opened', CONFIRMED: 'Confirmed' }[p.status]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[p.status]}`}>
      {p.status === 'CONFIRMED' && <Check className="h-3 w-3" />}{label}
    </span>
  )
}

export function SendCallSheetDialog({ open, callSheetId, timeFormat, onClose, onSent, onShareOnly }: {
  open: boolean
  callSheetId: string
  timeFormat: TimeFormat
  onClose: () => void
  /** After a send (some may have failed). `sheet` = the people lists when
   *  typed emails were saved into them — the editor must adopt them. */
  onSent: (sentCount: number, sheet: { crew: CrewDept[]; talent: TalentMember[]; otherContacts: OtherContact[] } | null) => void
  /** "Just get the share link" — the old behaviour, no emails. */
  onShareOnly: () => void
}) {
  const [people, setPeople] = useState<SendListPerson[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [results, setResults] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  async function load(keepSelection = false) {
    setLoadError(null)
    const res = await getCallSheetSendList(callSheetId)
    if (!res.success) { setLoadError((res as { success: false; error: string }).error); return }
    const list = res.data.people
    setPeople(list)
    if (!keepSelection) {
      const anySent = list.some(p => p.status !== 'NOT_SENT')
      // First send: everyone with an email. Re-send: new people and anyone
      // whose details changed since their last email.
      setSelected(new Set(list.filter(p => p.email && (!anySent || p.status === 'NOT_SENT' || p.changes.length > 0)).map(p => p.ref)))
    }
  }

  useEffect(() => {
    if (!open) return
    setPeople(null); setTyped({}); setNote(''); setFilter('ALL'); setResults({}); setError(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open only
  }, [open, callSheetId])

  const anySent = !!people?.some(p => p.status !== 'NOT_SENT')
  const visible = useMemo(() => (people ?? []).filter(p =>
    filter === 'ALL' ? true
      : filter === 'UNCONFIRMED' ? p.status !== 'CONFIRMED'
      : p.changes.length > 0), [people, filter])
  const counts = useMemo(() => {
    const list = people ?? []
    return {
      sent: list.filter(p => p.status !== 'NOT_SENT').length,
      opened: list.filter(p => p.status === 'OPENED' || p.status === 'CONFIRMED').length,
      confirmed: list.filter(p => p.status === 'CONFIRMED').length,
    }
  }, [people])

  const emailOf = (p: SendListPerson) => p.email ?? typed[p.ref]?.trim() ?? ''
  const chosen = (people ?? []).filter(p => selected.has(p.ref))
  const invalid = chosen.filter(p => !EMAIL_RE.test(emailOf(p)))
  const updates = chosen.filter(p => p.status !== 'NOT_SENT').length

  function toggle(ref: string, on?: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (on ?? !next.has(ref)) next.add(ref); else next.delete(ref)
      return next
    })
  }

  function selectFiltered(on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const p of visible) if (on) next.add(p.ref); else next.delete(p.ref)
      return next
    })
  }

  function send() {
    if (chosen.length === 0) { setError('Pick at least one person.'); return }
    if (invalid.length) { setError(`Add a valid email for ${invalid.map(p => p.name || 'someone').join(', ')}.`); return }
    setError(null)
    start(async () => {
      const res = await sendCallSheetEmails(callSheetId, {
        people: chosen.map(p => ({ ref: p.ref, ...(p.email ? {} : { email: emailOf(p) }) })),
        note: note.trim() || undefined,
      })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      const byRef: Record<string, { ok: boolean; error?: string }> = {}
      for (const r of res.data.results) byRef[r.ref] = { ok: r.ok, error: r.error }
      setResults(byRef)
      const ok = res.data.results.filter(r => r.ok).length
      onSent(ok, res.data.sheet)
      // Keep the failed ones ticked for a retry.
      setSelected(new Set(res.data.results.filter(r => !r.ok).map(r => r.ref)))
      setTyped({})
      await load(true)
    })
  }

  const sentOk = Object.values(results).filter(r => r.ok).length
  const sentFailed = Object.values(results).filter(r => !r.ok).length

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !pending) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{anySent ? 'Send an update' : 'Send to crew'}</DialogTitle>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !people ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the people on this call sheet…</p>
        ) : people.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">There’s nobody on this call sheet yet — add crew, talent or contacts first.</p>
        ) : (
          <>
            {anySent && (
              <p className="text-xs text-muted-foreground">
                Sent to {counts.sent} · {counts.opened} opened · <span className="font-medium text-foreground">{counts.confirmed} confirmed</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'UNCONFIRMED', 'CHANGED'] as Filter[]).map(f => (
                <button
                  key={f} type="button" onClick={() => setFilter(f)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/60'}`}
                >
                  {{ ALL: 'Everyone', UNCONFIRMED: 'Unconfirmed', CHANGED: 'Details changed' }[f]}
                </button>
              ))}
              <span className="ml-auto flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => selectFiltered(true)}>Select shown</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => selectFiltered(false)}>Clear</button>
              </span>
            </div>

            <div className="space-y-4">
              {(['CREW', 'TALENT', 'OTHER'] as const).map(g => {
                const rows = visible.filter(p => p.group === g)
                if (rows.length === 0) return null
                return (
                  <div key={g}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[g]}</p>
                    <ul className="divide-y rounded-lg border">
                      {rows.map(p => {
                        const on = selected.has(p.ref)
                        const res = results[p.ref]
                        return (
                          <li key={p.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                            <input
                              type="checkbox" checked={on} onChange={() => toggle(p.ref)}
                              className="h-4 w-4 accent-primary" aria-label={`Send to ${p.name}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {p.name || <span className="italic text-muted-foreground">No name</span>}
                                {p.role && <span className="ml-1.5 font-normal text-muted-foreground">{p.role}</span>}
                              </p>
                              {p.email ? (
                                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                              ) : (
                                <Input
                                  type="email" value={typed[p.ref] ?? ''} placeholder="Add their email"
                                  onChange={e => { setTyped(t => ({ ...t, [p.ref]: e.target.value })); if (e.target.value) toggle(p.ref, true) }}
                                  className="mt-1 h-7 text-xs"
                                />
                              )}
                              {p.changes.length > 0 && (
                                <p className="mt-0.5 text-[11px] text-amber-700">Changed since last email: {p.changes.join(' · ')}</p>
                              )}
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">{p.callTime ? formatTime(p.callTime, timeFormat) : '—'}</span>
                            {res ? (
                              res.ok
                                ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check className="h-3 w-3" /> Sent</span>
                                : <span className="inline-flex items-center gap-1 text-[11px] text-destructive" title={res.error}><AlertCircle className="h-3 w-3" /> Failed</span>
                            ) : <StatusPill p={p} />}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
              {visible.length === 0 && <p className="text-sm text-muted-foreground">Nobody matches this filter.</p>}
            </div>

            <div>
              <label htmlFor="cs-send-note" className="mb-1 block text-xs font-medium text-muted-foreground">Note (optional, included in every email)</label>
              <textarea
                id="cs-send-note" value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000}
                placeholder="e.g. Parking is tight — carpool if you can."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {(sentOk > 0 || sentFailed > 0) && (
              <p className={`text-sm ${sentFailed ? 'text-destructive' : 'text-emerald-700'}`}>
                {sentOk > 0 && <>✓ Sent to {sentOk}. </>}
                {sentFailed > 0 && <>{sentFailed} couldn’t be sent — they’re still ticked to try again.</>}
              </p>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onShareOnly} disabled={pending} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            Just get the share link (no emails)
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>{sentOk ? 'Done' : 'Cancel'}</Button>
            <Button onClick={send} disabled={pending || !people || chosen.length === 0}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              {pending ? 'Sending…'
                : chosen.length === 0 ? 'Send'
                : updates > 0 && updates === chosen.length ? `Send update to ${chosen.length}`
                : `Send to ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
