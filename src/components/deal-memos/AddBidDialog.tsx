'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { searchContacts, createContact, type ContactSearchResult } from '@/server/actions/rolodex'
import { createDealMemo } from '@/server/actions/deal-memos'
import { listContractTemplateOptions, type ContractTemplateOption } from '@/server/actions/contract-templates'
import { formatMoney } from '@/lib/money'
import { UNIT_SUFFIX } from './labels'

interface Props {
  projectId:  string
  open:       boolean
  onClose:    () => void
  /** Budget line this bid is for; null = someone hired outside the budget. */
  lineItemId: string | null
  roleLabel:  string
}

export function AddBidDialog({ projectId, open, onClose, lineItemId, roleLabel }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<ContactSearchResult[]>([])
  // The query the current results belong to — so the inline "add them" form
  // only appears once the search for exactly what was typed has come back.
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const [roleName, setRoleName] = useState(roleLabel)
  const [newMode, setNewMode]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [error, setError]       = useState<string | null>(null)
  // Contract template for the memo's terms — the default one pre-selected.
  const [templates, setTemplates] = useState<ContractTemplateOption[]>([])
  const [templateId, setTemplateId] = useState('')
  useEffect(() => {
    if (!open) return
    listContractTemplateOptions('VENDOR').then(r => {
      if (!r.success) return
      setTemplates(r.data)
      // '' = no template: the server uses the default template, or (none set)
      // the blocks marked "attach by default".
      setTemplateId(r.data.find(t => t.isDefault)?.id ?? '')
    }).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      searchContacts(query, projectId)
        .then(r => { setResults(r); setSearchedQuery(query) })
        .catch(() => { setResults([]); setSearchedQuery(query) })
    }, 200)
    return () => clearTimeout(t)
  }, [query, open, projectId])

  function reset() {
    setQuery(''); setNewMode(false); setNewName(''); setNewEmail(''); setError(null); setRoleName(roleLabel)
    setSearchedQuery(null)
  }

  const noMatch = query.trim() !== '' && searchedQuery === query && results.length === 0

  function openMemo(contactId: string) {
    setError(null)
    startTransition(async () => {
      const res = await createDealMemo({
        projectId, lineItemId, contactId, roleLabel: lineItemId ? undefined : roleName,
        templateId: templateId || null,
      })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      reset()
      onClose()
      router.push(`/projects/${projectId}/deal-memos/${res.data.id}`)
    })
  }

  function addNewPerson(name: string) {
    const role = (lineItemId ? roleLabel : roleName).trim()
    if (!name.trim()) { setError('Enter their name.'); return }
    if (!role) { setError('Give the role a name.'); return }
    setError(null)
    startTransition(async () => {
      const created = await createContact({
        name: name.trim(), primaryRole: role, email: newEmail.trim() || null,
        secondaryRoles: [], defaultRateUnit: 'DAY', hasKit: false,
      }, projectId)
      if (!created.success) { setError((created as { success: false; error: string }).error); return }
      openMemo(created.data.id)
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lineItemId ? `Add a bid — ${roleLabel}` : 'Add someone outside the budget'}</DialogTitle>
        </DialogHeader>

        {!lineItemId && (
          <div className="space-y-1.5">
            <Label htmlFor="bid-role">Role</Label>
            <Input id="bid-role" value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="e.g. Production Assistant" />
          </div>
        )}

        {templates.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="bid-template">Contract template</Label>
            <select
              id="bid-template" value={templateId} onChange={e => setTemplateId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {!templates.some(t => t.isDefault) && <option value="">Blocks marked default</option>}
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''} · {t.blockCount} block{t.blockCount === 1 ? '' : 's'}</option>
              ))}
            </select>
          </div>
        )}

        {!newMode ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                placeholder="Search your rolodex by name, role or email"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && noMatch) { e.preventDefault(); emailRef.current?.focus() } }}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {noMatch ? (
                // Nobody by that name — finish adding them right here; the
                // search text is their name.
                <form
                  className="space-y-3 p-4"
                  onSubmit={e => { e.preventDefault(); addNewPerson(query) }}
                >
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{query.trim()}</span> isn’t in your rolodex yet. Add them and start the bid:
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="bid-inline-email">Email (optional)</Label>
                    <Input
                      id="bid-inline-email" ref={emailRef} type="email" value={newEmail}
                      placeholder="name@example.com" onChange={e => setNewEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isPending}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    {isPending ? 'Adding…' : `Add ${query.trim()} and start bid`}
                  </Button>
                </form>
              ) : results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {query.trim() ? 'Searching…' : 'No people in your rolodex yet — type a name to add someone.'}
                </p>
              ) : results.map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => openMemo(c.id)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/50 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.primaryRole}</span>
                  </span>
                  {c.defaultRateCents ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatMoney(c.defaultRateCents)}{UNIT_SUFFIX[c.defaultRateUnit]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {/* When there ARE matches but none is the right person */}
            {!noMatch && results.length > 0 && (
              <button
                type="button"
                onClick={() => { setNewMode(true); setNewName(query) }}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" /> Not listed? Add a new person
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bid-name">Name</Label>
              <Input id="bid-name" autoFocus value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-email">Email (optional)</Label>
              <Input id="bid-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setNewMode(false)} disabled={isPending}>Back to search</Button>
              <Button onClick={() => addNewPerson(newName)} disabled={isPending}>{isPending ? 'Adding…' : 'Add and start bid'}</Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
