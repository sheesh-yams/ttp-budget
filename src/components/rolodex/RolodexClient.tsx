'use client'

import { useState, useMemo } from 'react'
import { Search, LayoutGrid, List, Plus, Users } from 'lucide-react'
import { ContactCard } from './ContactCard'
import { ContactModal } from './ContactModal'
import { archiveContact, type ContactRow } from '@/server/actions/rolodex'
import { formatMoney } from '@/lib/money'

const UNIT_SHORT: Record<string, string> = {
  HOUR:     '/hr',
  HALF_DAY: '/½ day',
  DAY:      '/day',
  WEEK:     '/wk',
  FLAT:     ' flat',
  EACH:     '/ea',
  MILE:     '/mi',
}

interface Props {
  contacts: ContactRow[]
}

export function RolodexClient({ contacts: initial }: Props) {
  const [contacts, setContacts] = useState(initial)
  const [view,      setView]    = useState<'grid' | 'list'>('grid')
  const [query,     setQuery]   = useState('')
  const [creating,  setCreating] = useState(false)

  const filtered = useMemo(() => {
    if (!query.trim()) return contacts
    const q = query.toLowerCase()
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.primaryRole.toLowerCase().includes(q) ||
      (Array.isArray(c.secondaryRoles) && (c.secondaryRoles as string[]).some(r => r.toLowerCase().includes(q)))
    )
  }, [contacts, query])

  // Remove archived contacts from local state immediately (optimistic)
  function handleArchived(id: string) {
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or role…"
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setView('grid')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              view === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l ${
              view === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>

        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add contact
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Users className="mb-3 h-10 w-10 text-muted-foreground/30" />
          {query ? (
            <>
              <p className="font-medium text-foreground">No contacts match &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different search term.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">Your Rolodex is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">Add your first contact to start building your crew directory.</p>
              <button
                onClick={() => setCreating(true)}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Add contact
              </button>
            </>
          )}
        </div>
      )}

      {/* Card grid */}
      {view === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onArchived={() => handleArchived(contact.id)}
            />
          ))}
        </div>
      )}

      {/* List / table view */}
      {view === 'list' && filtered.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Secondary roles</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Rate</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Projects</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(contact => {
                const secondaryRoles = Array.isArray(contact.secondaryRoles)
                  ? contact.secondaryRoles as string[]
                  : []
                const projectCount = contact.projectMembers?.length ?? 0
                return (
                  <ContactListRow
                    key={contact.id}
                    contact={contact}
                    secondaryRoles={secondaryRoles}
                    projectCount={projectCount}
                    onArchived={() => handleArchived(contact.id)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <ContactModal
          contact={null}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

// ── List row (separate component so it has its own editing state) ─────────────

function ContactListRow({
  contact,
  secondaryRoles,
  projectCount,
  onArchived,
}: {
  contact:        ContactRow
  secondaryRoles: string[]
  projectCount:   number
  onArchived:     () => void
}) {
  const [editing,   setEditing]   = useState(false)
  const [archiving, setArchiving] = useState(false)

  const name = contact.name
  const initials = (() => {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  })()

  async function handleArchive() {
    if (!confirm(`Archive ${contact.name}?`)) return
    setArchiving(true)
    await archiveContact(contact.id)
    onArchived()
    setArchiving(false)
  }

  return (
    <>
      <tr className="group bg-card hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--brand-primary, #5D00A4)' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{contact.name}</p>
              {contact.email && <p className="text-xs text-muted-foreground truncate">{contact.email}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs font-medium text-primary">{contact.primaryRole}</td>
        <td className="px-4 py-3 hidden md:table-cell">
          <div className="flex flex-wrap gap-1">
            {secondaryRoles.slice(0, 3).map(r => (
              <span
                key={r}
                className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {r}
              </span>
            ))}
            {secondaryRoles.length > 3 && (
              <span className="text-[10px] text-muted-foreground/60">+{secondaryRoles.length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right text-xs hidden sm:table-cell">
          {contact.defaultRateCents != null
            ? <>{formatMoney(contact.defaultRateCents)}<span className="text-muted-foreground/60">{UNIT_SHORT[contact.defaultRateUnit] ?? ''}</span></>
            : <span className="text-muted-foreground/50">—</span>
          }
        </td>
        <td className="px-4 py-3 text-center text-xs text-muted-foreground hidden sm:table-cell">{projectCount}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setEditing(true)}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Edit"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-muted transition-colors disabled:opacity-40"
              title="Archive"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12v4M14 12v4" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {editing && (
        <ContactModal
          contact={contact}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

