'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { searchContacts, createContact, type ContactSearchResult } from '@/server/actions/rolodex'
import { createDealMemo } from '@/server/actions/deal-memos'
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
  const [roleName, setRoleName] = useState(roleLabel)
  const [newMode, setNewMode]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      searchContacts(query).then(setResults).catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  function reset() {
    setQuery(''); setNewMode(false); setNewName(''); setNewEmail(''); setError(null); setRoleName(roleLabel)
  }

  function openMemo(contactId: string) {
    setError(null)
    startTransition(async () => {
      const res = await createDealMemo({
        projectId, lineItemId, contactId, roleLabel: lineItemId ? undefined : roleName,
      })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      reset()
      onClose()
      router.push(`/projects/${projectId}/deal-memos/${res.data.id}`)
    })
  }

  function addNewPerson() {
    const role = (lineItemId ? roleLabel : roleName).trim()
    if (!newName.trim()) { setError('Enter their name.'); return }
    if (!role) { setError('Give the role a name.'); return }
    setError(null)
    startTransition(async () => {
      const created = await createContact({
        name: newName.trim(), primaryRole: role, email: newEmail.trim() || null,
        secondaryRoles: [], defaultRateUnit: 'DAY', hasKit: false,
      })
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
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
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
            <button
              type="button"
              onClick={() => { setNewMode(true); setNewName(query) }}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add a new person to the rolodex
            </button>
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
              <Button onClick={addNewPerson} disabled={isPending}>{isPending ? 'Adding…' : 'Add and start bid'}</Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
