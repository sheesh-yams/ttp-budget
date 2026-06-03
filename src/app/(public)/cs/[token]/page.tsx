import { notFound } from 'next/navigation'
import { MapPin, Phone, Clock, Hospital, Cloud, Calendar, User } from 'lucide-react'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { ExpiredLinkPage } from '@/components/public/ExpiredLinkPage'
import { RateLimitedPage } from '@/components/public/RateLimitedPage'
import type {
  CrewDept,
  ScheduleBlock,
  WeatherInfo,
  HospitalInfo,
  TalentMember,
  PointOfContact,
  OtherContact,
} from '@/server/actions/call-sheets'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cs = await db.callSheet.findUnique({ where: { publicToken: token }, select: { title: true } })
  return { title: cs ? `${cs.title} — Call Sheet` : 'Call Sheet' }
}

/** Backward-compat: old records use `time`, new ones use `startTime`. */
function startOf(block: ScheduleBlock): string {
  return block.startTime ?? block.time ?? ''
}

export default async function PublicCallSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const reqHeaders = await headers()
  const ip = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await checkRateLimit(`callsheet:${ip}`)
  if (!allowed) return <RateLimitedPage />

  const cs = await db.callSheet.findUnique({
    where: { publicToken: token },
    include: {
      project: {
        select: {
          name: true,
          client: {
            select: {
              name: true,
              contactName: true,
              contactEmail: true,
              contactPhone: true,
            },
          },
        },
      },
      workspace: { select: { name: true, logoUrl: true } },
    },
  })

  if (!cs) notFound()

  // ── Expiry check ──────────────────────────────────────────────────────────
  const csExpiry = (cs as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
  if (csExpiry && csExpiry < new Date()) {
    return <ExpiredLinkPage type="call-sheet" />
  }

  const isDraft = cs.status === 'DRAFT'

  const crew           = (cs.crew          as unknown as CrewDept[])      ?? []
  const schedule       = (cs.schedule      as unknown as ScheduleBlock[]) ?? []
  const weather        = cs.weather        as unknown as WeatherInfo | null
  const hospital       = cs.hospitalInfo   as unknown as HospitalInfo | null
  const talent         = ((cs as any).talent        as unknown as TalentMember[])  ?? []
  const pointOfContact = (cs as any).pointOfContact as unknown as PointOfContact | null
  const otherContacts  = ((cs as any).otherContacts as unknown as OtherContact[])  ?? []
  const client         = cs.project.client

  const shootDateDisplay = new Date(cs.shootDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
  const weatherDateDisplay = new Date(cs.shootDate).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

  const mapsUrl = cs.locationAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(cs.locationAddress)}`
    : null

  const sunrise = weather
    ? new Date(weather.sunrise).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null
  const sunset = weather
    ? new Date(weather.sunset).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  // Combine client contact + other contacts for the unified section
  const hasAnyContacts =
    (client && (client.contactName || client.contactEmail || client.contactPhone)) ||
    otherContacts.length > 0

  return (
    <div className="min-h-screen bg-gray-50 pb-16">

      {/* ── Draft preview banner ── */}
      {isDraft && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2.5 flex items-center gap-2 sticky top-0 z-50">
          <span className="text-xs font-bold uppercase tracking-wide text-amber-800">Draft Preview</span>
          <span className="text-xs text-amber-700 opacity-80">— This call sheet has not been sent. Content may change.</span>
        </div>
      )}

      {/* ── Hero header (full width) ── */}
      <div className="bg-[#0a0a0a] text-white px-4 pt-10 pb-8">
        <div className="max-w-6xl mx-auto">
          {cs.workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cs.workspace.logoUrl} alt={cs.workspace.name} className="h-7 mb-6 opacity-80" />
          ) : (
            <p className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-6">{cs.workspace.name}</p>
          )}

          <p className="text-sm text-white/60 mb-1">{cs.project.name}</p>
          <h1 className="text-2xl font-bold mb-4">{cs.title}</h1>

          <div className="flex items-center gap-2 text-white/70 text-sm mb-6">
            <Calendar className="h-4 w-4" />
            {shootDateDisplay}
          </div>

          <div className="rounded-2xl bg-white/10 px-6 py-5 inline-block">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">General Call</p>
            <p className="text-5xl font-black tracking-tight">{cs.generalCall}</p>
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">

          {/* ── LEFT column: weather / location / contacts / hospital ── */}
          <div className="space-y-5">

            {/* Weather — full card with large temp */}
            {weather && (
              <div className="rounded-xl bg-sky-50 border border-sky-200 overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-sky-200">
                  <Cloud className="h-4 w-4 text-sky-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Weather</p>
                  <span className="ml-auto text-[10px] text-sky-500">{weatherDateDisplay}</span>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-4xl font-black text-sky-900">{weather.high}°</span>
                    <span className="text-xl text-sky-500 mb-0.5">/ {weather.low}°F</span>
                  </div>
                  <p className="text-sm font-semibold text-sky-800 mb-4">{weather.conditions}</p>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-sky-700">
                    <span>💨 {weather.windMph} mph wind</span>
                    <span>🌧 {weather.precipPct}% rain</span>
                    <span>🌅 Sunrise {sunrise}</span>
                    <span>🌇 Sunset {sunset}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Location */}
            {(cs.locationName || cs.locationAddress) && (
              <Card title="Location" icon={<MapPin className="h-4 w-4 text-muted-foreground" />}>
                {cs.locationName && (
                  <p className="font-semibold text-foreground">{cs.locationName}</p>
                )}
                {cs.locationAddress && (
                  mapsUrl ? (
                    <a href={mapsUrl} className="text-sm text-blue-600 hover:underline block mt-0.5">
                      {cs.locationAddress}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5">{cs.locationAddress}</p>
                  )
                )}
                {cs.parkingAddress && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <span className="font-medium text-foreground">Parking: </span>
                    {cs.parkingAddress}
                  </p>
                )}
                {cs.locationNotes && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{cs.locationNotes}</p>
                )}
              </Card>
            )}

            {/* Point of contact */}
            {pointOfContact?.name && (
              <Card title="Point of Contact" icon={<User className="h-4 w-4 text-muted-foreground" />}>
                <p className="text-sm font-semibold text-foreground">{pointOfContact.name}</p>
                {pointOfContact.title && (
                  <p className="text-xs text-muted-foreground mb-2">{pointOfContact.title}</p>
                )}
                {pointOfContact.phone && (
                  <a href={`tel:${pointOfContact.phone}`} className="text-sm text-blue-600 hover:underline block mt-1">
                    📞 {pointOfContact.phone}
                  </a>
                )}
                {pointOfContact.email && (
                  <a href={`mailto:${pointOfContact.email}`} className="text-sm text-blue-600 hover:underline block mt-0.5">
                    ✉️ {pointOfContact.email}
                  </a>
                )}
              </Card>
            )}

            {/* Client / Other Contacts — unified section */}
            {hasAnyContacts && (
              <Card title="Client / Other Contacts" icon={<Phone className="h-4 w-4 text-muted-foreground" />}>
                <div className="divide-y divide-border/60 -mx-4 -mb-4">
                  {/* Client contact (from project) */}
                  {client && (client.contactName || client.contactEmail || client.contactPhone) && (
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{client.name}</p>
                          {client.contactName && (
                            <p className="text-xs text-muted-foreground">{client.contactName}</p>
                          )}
                          {client.contactPhone && (
                            <a href={`tel:${client.contactPhone}`} className="text-sm text-blue-600 hover:underline block mt-1">
                              📞 {client.contactPhone}
                            </a>
                          )}
                          {client.contactEmail && (
                            <a href={`mailto:${client.contactEmail}`} className="text-sm text-blue-600 hover:underline block mt-0.5">
                              ✉️ {client.contactEmail}
                            </a>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5">Client</span>
                      </div>
                    </div>
                  )}
                  {/* Other contacts */}
                  {otherContacts.map((c, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{c.name || '—'}</p>
                          {(c.role || c.company) && (
                            <p className="text-xs text-muted-foreground">
                              {[c.role, c.company].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {c.phone && (
                            <a href={`tel:${c.phone}`} className="text-sm text-blue-600 hover:underline block mt-1">
                              📞 {c.phone}
                            </a>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="text-sm text-blue-600 hover:underline block mt-0.5">
                              ✉️ {c.email}
                            </a>
                          )}
                        </div>
                        {c.role && (
                          <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5">{c.role}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Hospital */}
            {hospital && (
              <div className="rounded-xl bg-white border border-border/60 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-red-50">
                  <Hospital className="h-4 w-4 text-red-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Nearest Hospital</p>
                  <span className="ml-auto text-[11px] text-red-400">{hospital.distanceKm} km</span>
                </div>
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">{hospital.name}</p>
                  {hospital.address && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{hospital.address}</p>
                  )}
                  {hospital.phone && (
                    <a href={`tel:${hospital.phone}`} className="text-sm font-medium text-blue-600 hover:underline mt-2 block">
                      📞 {hospital.phone}
                    </a>
                  )}
                  <a
                    href={`https://maps.apple.com/?q=${encodeURIComponent(`${hospital.name}${hospital.address ? ' ' + hospital.address : ''}`)}`}
                    className="text-xs text-blue-600 hover:underline mt-1 block"
                  >
                    Open in Maps →
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT column: schedule / talent / crew / catering / notes ── */}
          <div className="space-y-5">

            {/* Schedule */}
            {schedule.length > 0 && (
              <Card title="Schedule" icon={<Clock className="h-4 w-4 text-muted-foreground" />}>
                <div className="divide-y divide-border/60 -mx-4 -mb-4">
                  {schedule.map((block, i) => (
                    <div key={i} className="flex items-start gap-4 px-4 py-3">
                      <div className="shrink-0 pt-0.5 min-w-[90px]">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {startOf(block)}
                          {block.endTime && (
                            <span className="font-normal text-muted-foreground"> – {block.endTime}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{block.label}</p>
                        {block.whoNeeded && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-medium">Who: </span>{block.whoNeeded}
                          </p>
                        )}
                        {block.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">{block.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Talent */}
            {talent.length > 0 && (
              <Card title="Talent" icon={null}>
                <div className="divide-y divide-border/60 -mx-4 -mb-4">
                  {talent.map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{t.name || '—'}</p>
                        {t.role && <p className="text-xs text-muted-foreground">{t.role}</p>}
                        <div className="flex flex-wrap gap-x-3 mt-0.5">
                          {t.phone && (
                            <a href={`tel:${t.phone}`} className="text-xs text-blue-600 hover:underline">
                              {t.phone}
                            </a>
                          )}
                          {t.email && (
                            <a href={`mailto:${t.email}`} className="text-xs text-blue-600 hover:underline">
                              {t.email}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="font-mono text-base font-bold text-foreground">{t.callTime || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Crew by dept */}
            {crew.map((dept, di) => (
              <Card key={di} title={dept.dept} icon={null}>
                <div className="divide-y divide-border/60 -mx-4 -mb-4">
                  {dept.members.map((m, mi) => (
                    <div key={mi} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{m.name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{m.role}</p>
                        <div className="flex flex-wrap gap-x-3 mt-0.5">
                          {m.phone && (
                            <a href={`tel:${m.phone}`} className="text-xs text-blue-600 hover:underline">
                              {m.phone}
                            </a>
                          )}
                          {m.email && (
                            <a href={`mailto:${m.email}`} className="text-xs text-blue-600 hover:underline">
                              {m.email}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="font-mono text-base font-bold text-foreground">{m.callTime || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {/* Catering */}
            {cs.cateringInfo && (
              <Card title="Catering" icon={null}>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{cs.cateringInfo}</p>
              </Card>
            )}

            {/* Notes */}
            {cs.notes && (
              <Card title="Notes" icon={null}>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{cs.notes}</p>
              </Card>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground pt-8">
          {cs.workspace.name} · Generated by TTP Budget
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// Card helper
// =============================================================================

function Card({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-white border border-border/60 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div className="px-4 py-4">
        {children}
      </div>
    </div>
  )
}
