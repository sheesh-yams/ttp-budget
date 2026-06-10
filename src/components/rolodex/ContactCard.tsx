'use client'

import { useState } from 'react'
import { Mail, Phone, Instagram, Globe, Edit2, Archive } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { archiveContact, type ContactRow } from '@/server/actions/rolodex'
import { ContactModal } from './ContactModal'
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

function Initials({ name }: { name: string }) {
  const parts   = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  return <span>{initials}</span>
}

interface Props {
  contact:    ContactRow
  crewRoles?: string[]
  onArchived?: () => void
}

export function ContactCard({ contact, crewRoles = [], onArchived }: Props) {
  const [editing,   setEditing]   = useState(false)
  const [archiving, setArchiving] = useState(false)
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  const secondaryRoles = Array.isArray(contact.secondaryRoles)
    ? contact.secondaryRoles as string[]
    : []

  const projectCount = contact.projectMembers?.length ?? 0

  async function handleArchive() {
    const ok = await confirmDialog(
      `${contact.name} will be hidden from the Rolodex. Their project history is preserved.`,
      { title: 'Archive contact?', confirmLabel: 'Archive' }
    )
    if (!ok) return
    setArchiving(true)
    await archiveContact(contact.id)
    onArchived?.()
    setArchiving(false)
  }

  return (
    <>
      {ConfirmDialog}
      <div className="group relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        {/* Action buttons — revealed on hover */}
        <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md bg-background/90 p-1.5 text-muted-foreground hover:text-foreground shadow-sm border transition-colors"
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="rounded-md bg-background/90 p-1.5 text-muted-foreground hover:text-red-500 shadow-sm border transition-colors disabled:opacity-40"
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Avatar + Identity */}
        <div className="px-5 pt-5 pb-4">
          <div
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ background: 'var(--brand-primary, #5D00A4)' }}
          >
            {contact.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.avatarUrl}
                alt={contact.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <Initials name={contact.name} />
            )}
          </div>

          <p className="text-sm font-semibold text-foreground leading-tight">{contact.name}</p>
          <p className="mt-0.5 text-xs font-medium text-primary">{contact.primaryRole}</p>

          {secondaryRoles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {secondaryRoles.map(r => (
                <span
                  key={r}
                  className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Contact info */}
        {(contact.email || contact.phone || contact.instagram || contact.website) && (
          <div className="border-t px-5 py-3 space-y-1.5">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Phone className="h-3 w-3 flex-shrink-0" />
                {contact.phone}
              </a>
            )}
            {contact.instagram && (
              <a
                href={`https://instagram.com/${contact.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Instagram className="h-3 w-3 flex-shrink-0" />
                @{contact.instagram}
              </a>
            )}
            {contact.website && (
              <a
                href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                <Globe className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{contact.website}</span>
              </a>
            )}
          </div>
        )}

        {/* Rate + projects footer */}
        <div className="flex items-center justify-between border-t px-5 py-2.5">
          <span className="text-xs text-muted-foreground">
            {contact.defaultRateCents != null
              ? <>{formatMoney(contact.defaultRateCents)}<span className="text-muted-foreground/60">{UNIT_SHORT[contact.defaultRateUnit] ?? ''}</span></>
              : <span className="text-muted-foreground/50">No rate set</span>
            }
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {projectCount === 0 ? 'No projects' : `${projectCount} project${projectCount === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {editing && (
        <ContactModal
          contact={contact}
          crewRoles={crewRoles}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
