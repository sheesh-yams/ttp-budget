import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Mail, Phone, Instagram, Globe, DollarSign, Calendar, ClipboardList } from 'lucide-react'
import { getContactById, getContactCallSheets, getCrewRoles } from '@/server/actions/rolodex'
import { ContactDetailClient } from '@/components/rolodex/ContactDetailClient'
import { formatMoney } from '@/lib/money'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await getContactById(id)
  return { title: contact ? `${contact.name} — Rolodex` : 'Contact not found' }
}

const RATE_UNIT_LABEL: Record<string, string> = {
  HOUR:     'per hour',
  HALF_DAY: 'per half-day',
  DAY:      'per day',
  WEEK:     'per week',
  FLAT:     'flat',
  EACH:     'each',
  MILE:     'per mile',
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT: { label: 'Draft', bg: '#f3f4f6', color: '#4b5563' },
  SENT:  { label: 'Sent',  bg: '#dbeafe', color: '#1d4ed8' },
  FINAL: { label: 'Final', bg: '#dcfce7', color: '#15803d' },
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  LEAD:     'Lead',
  ACTIVE:   'Active',
  WRAPPED:  'Wrapped',
  ARCHIVED: 'Archived',
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [contact, callSheets, crewRoles] = await Promise.all([
    getContactById(id),
    getContactCallSheets(id),
    getCrewRoles(),
  ])

  if (!contact) notFound()

  const secondaryRoles = Array.isArray(contact.secondaryRoles) ? contact.secondaryRoles as string[] : []

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/rolodex"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Rolodex
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{contact.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">{contact.primaryRole}</span>
            {secondaryRoles.map(r => (
              <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {r}
              </span>
            ))}
          </div>
        </div>
        <ContactDetailClient contact={contact} crewRoles={crewRoles} />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {contact.phone && (
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={contact.phone} href={`tel:${contact.phone}`} />
        )}
        {contact.email && (
          <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={contact.email} href={`mailto:${contact.email}`} />
        )}
        {contact.instagram && (
          <InfoRow icon={<Instagram className="h-4 w-4" />} label="Instagram" value={contact.instagram} href={`https://instagram.com/${contact.instagram.replace('@','')}`} />
        )}
        {contact.website && (
          <InfoRow icon={<Globe className="h-4 w-4" />} label="Website" value={contact.website} href={contact.website} />
        )}
        {contact.defaultRateCents != null && (
          <InfoRow
            icon={<DollarSign className="h-4 w-4" />}
            label="Default rate"
            value={`${formatMoney(contact.defaultRateCents)} ${RATE_UNIT_LABEL[contact.defaultRateUnit] ?? contact.defaultRateUnit}`}
          />
        )}
      </div>

      {/* Notes */}
      {contact.notes && (
        <div className="rounded-lg border border-border/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {/* Projects */}
      {contact.projectMembers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Projects ({contact.projectMembers.length})
          </h2>
          <div className="divide-y rounded-lg border border-border/60 overflow-hidden">
            {contact.projectMembers.map((pm, i) => (
              <Link
                key={i}
                href={`/projects/${pm.project.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{pm.project.name}</p>
                  {pm.role && <p className="text-xs text-muted-foreground">{pm.role}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {pm.rateCents != null && (
                    <span className="text-xs text-muted-foreground">
                      {formatMoney(pm.rateCents)}{pm.rateUnit ? ` / ${pm.rateUnit.toLowerCase()}` : ''}
                    </span>
                  )}
                  {pm.project.shootStartDate && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(pm.project.shootStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{PROJECT_STATUS_LABEL[pm.project.status] ?? pm.project.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Call sheets */}
      {callSheets.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Call sheets ({callSheets.length})
          </h2>
          <div className="divide-y rounded-lg border border-border/60 overflow-hidden">
            {callSheets.map(cs => {
              const st = STATUS_LABEL[cs.status] ?? STATUS_LABEL.DRAFT
              return (
                <Link
                  key={cs.id}
                  href={`/projects/${cs.projectId}/call-sheets/${cs.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cs.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{cs.projectName}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {cs.shootDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {contact.projectMembers.length === 0 && callSheets.length === 0 && (
        <p className="text-sm text-muted-foreground">No projects or call sheets yet.</p>
      )}
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
}) {
  const content = (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  )
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>
  }
  return content
}
