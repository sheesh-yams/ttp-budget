import { notFound } from 'next/navigation'
import { MapPin, Phone, Clock, Hospital, Cloud, Calendar } from 'lucide-react'
import { db } from '@/lib/db'
import type { CrewDept, ScheduleBlock, WeatherInfo, HospitalInfo } from '@/server/actions/call-sheets'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cs = await db.callSheet.findUnique({ where: { publicToken: token }, select: { title: true } })
  return { title: cs ? `${cs.title} — Call Sheet` : 'Call Sheet' }
}

export default async function PublicCallSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const cs = await db.callSheet.findUnique({
    where: { publicToken: token },
    include: {
      project: { select: { name: true } },
      workspace: { select: { name: true, logoUrl: true } },
    },
  })

  if (!cs || cs.status === 'DRAFT') notFound()

  const crew     = (cs.crew     as unknown as CrewDept[])        ?? []
  const schedule = (cs.schedule as unknown as ScheduleBlock[])   ?? []
  const weather  = cs.weather     as unknown as WeatherInfo | null
  const hospital = cs.hospitalInfo as unknown as HospitalInfo | null

  const shootDate = new Date(cs.shootDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
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

  return (
    <div className="min-h-screen bg-gray-50 pb-16">

      {/* ── Hero header ── */}
      <div className="bg-[#0a0a0a] text-white px-4 pt-10 pb-8">
        {cs.workspace.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cs.workspace.logoUrl} alt={cs.workspace.name} className="h-7 mb-6 opacity-80" />
        )}
        {!cs.workspace.logoUrl && (
          <p className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-6">{cs.workspace.name}</p>
        )}

        <p className="text-sm text-white/60 mb-1">{cs.project.name}</p>
        <h1 className="text-2xl font-bold mb-4">{cs.title}</h1>

        <div className="flex items-center gap-2 text-white/70 text-sm mb-6">
          <Calendar className="h-4 w-4" />
          {shootDate}
        </div>

        {/* Big call time */}
        <div className="rounded-2xl bg-white/10 px-6 py-5 inline-block">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">General Call</p>
          <p className="text-5xl font-black tracking-tight">{cs.generalCall}</p>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-5 max-w-lg mx-auto">

        {/* ── Weather strip ── */}
        {weather && (
          <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 flex items-center gap-4">
            <Cloud className="h-5 w-5 text-sky-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-900">{weather.conditions} · {weather.high}° / {weather.low}°F</p>
              <p className="text-xs text-sky-600">
                💨 {weather.windMph} mph · 🌧 {weather.precipPct}% rain ·
                🌅 {sunrise} · 🌇 {sunset}
              </p>
            </div>
          </div>
        )}

        {/* ── Location ── */}
        {(cs.locationName || cs.locationAddress) && (
          <Card title="Location" icon={<MapPin className="h-4 w-4 text-muted-foreground" />}>
            {cs.locationName && (
              <p className="font-semibold text-foreground">{cs.locationName}</p>
            )}
            {cs.locationAddress && (
              mapsUrl ? (
                <a
                  href={mapsUrl}
                  className="text-sm text-blue-600 hover:underline block mt-0.5"
                >
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

        {/* ── Emergency + hospital ── */}
        {(cs.emergencyContact || hospital) && (
          <Card title="Emergency" icon={<Phone className="h-4 w-4 text-red-500" />}>
            {cs.emergencyContact && (
              <p className="text-sm text-foreground font-medium">{cs.emergencyContact}</p>
            )}
            {hospital && (
              <div className="mt-3 pt-3 border-t border-border/60">
                <div className="flex items-start gap-2">
                  <Hospital className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{hospital.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{hospital.address}</p>
                    <p className="text-xs text-muted-foreground">{hospital.distanceKm} km away</p>
                    {hospital.phone && (
                      <a href={`tel:${hospital.phone}`} className="text-sm font-medium text-blue-600 hover:underline mt-1 block">
                        {hospital.phone}
                      </a>
                    )}
                    <a
                      href={`https://maps.apple.com/?q=${encodeURIComponent(`${hospital.name} ${hospital.address}`)}`}
                      className="text-xs text-blue-600 hover:underline mt-1 block"
                    >
                      Open in Maps →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Schedule ── */}
        {schedule.length > 0 && (
          <Card title="Schedule" icon={<Clock className="h-4 w-4 text-muted-foreground" />}>
            <div className="divide-y divide-border/60 -mx-4 -mb-4">
              {schedule.map((block, i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-3">
                  <span className="font-mono text-sm font-bold text-foreground w-12 shrink-0 pt-0.5">{block.time}</span>
                  <div>
                    <p className="text-sm text-foreground">{block.label}</p>
                    {block.notes && <p className="text-xs text-muted-foreground mt-0.5">{block.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Crew by dept ── */}
        {crew.length > 0 && crew.map((dept, di) => (
          <Card
            key={di}
            title={dept.dept}
            icon={null}
          >
            <div className="divide-y divide-border/60 -mx-4 -mb-4">
              {dept.members.map((m, mi) => (
                <div key={mi} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                    {m.phone && (
                      <a href={`tel:${m.phone}`} className="text-xs text-blue-600 hover:underline mt-0.5 block">
                        {m.phone}
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-mono text-base font-bold text-foreground">{m.callTime || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}

        {/* ── Catering + notes ── */}
        {cs.cateringInfo && (
          <Card title="Catering" icon={null}>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{cs.cateringInfo}</p>
          </Card>
        )}

        {cs.notes && (
          <Card title="Notes" icon={null}>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{cs.notes}</p>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
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
