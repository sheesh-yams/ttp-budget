import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { CallSheetEditor } from '@/components/call-sheets/CallSheetEditor'
import type { CrewDept, ScheduleBlock, WeatherInfo, HospitalInfo, TalentMember, PointOfContact } from '@/server/actions/call-sheets'
import type { TimeFormat } from '@/lib/time-format'
import { buildScheduleSnapshot, stableStringify } from '@/lib/schedule-compute'

// Geocoding + Overpass + weather in sequence can take ~20s; extend the limit.
export const maxDuration = 30

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; csId: string }>
}) {
  const { csId } = await params
  const cs = await db.callSheet.findUnique({ where: { id: csId }, select: { title: true } })
  return { title: cs ? `${cs.title} | Call Sheet` : 'Call Sheet' }
}

export default async function CallSheetPage({
  params,
}: {
  params: Promise<{ id: string; csId: string }>
}) {
  const { id: projectId, csId } = await params
  const workspaceId = await getWorkspaceId()

  const [cs, project, budget, rolodexContacts, workspace] = await Promise.all([
    db.callSheet.findFirst({
      where: { id: csId, workspaceId },
    }),
    db.project.findFirst({
      where: { id: projectId, workspaceId },
      select: {
        id: true,
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
    }),
    db.budget.findFirst({
      where: { projectId, workspaceId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
    db.contact.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, name: true, primaryRole: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { callTimeFormat: true },
    }),
  ])

  if (!cs || !project) notFound()

  // Detect drift between the call sheet's last-synced schedule snapshot and the
  // stripboard's current state, so the editor can prompt for a re-sync.
  let scheduleDiverged = false
  if (cs.shootDayId) {
    const primarySchedule = await db.schedule.findFirst({
      where: { projectId, workspaceId, isPrimary: true },
    })
    if (primarySchedule) {
      const liveEntries = await db.scheduleEntry.findMany({
        where: { scheduleId: primarySchedule.id, shootDayId: cs.shootDayId },
        orderBy: { orderIndex: 'asc' },
        include: { scene: { include: { location: true } } },
      })
      const liveSnapshot = buildScheduleSnapshot(liveEntries)
      scheduleDiverged = stableStringify(liveSnapshot) !== stableStringify(cs.scheduleSnapshot ?? [])
    }
  }

  const initial = {
    id:              cs.id,
    projectId:       project.id,
    projectName:     project.name,
    budgetId:        budget?.id ?? null,
    title:           cs.title,
    shootDate:       cs.shootDate.toISOString(),
    generalCall:     cs.generalCall,
    status:          cs.status,
    publicToken:     cs.publicToken,
    locationName:    cs.locationName,
    locationAddress: cs.locationAddress,
    parkingAddress:  cs.parkingAddress,
    locationNotes:   cs.locationNotes,
    shootDayId:      cs.shootDayId,
    scheduleSyncedAt: cs.scheduleSyncedAt ? cs.scheduleSyncedAt.toISOString() : null,
    scheduleDiverged,
    pointOfContact:  (cs as any).pointOfContact as unknown as PointOfContact | null,
    talent:          ((cs as any).talent as unknown as TalentMember[]) ?? [],
    crew:            (cs.crew as unknown as CrewDept[])       ?? [],
    schedule:        (cs.schedule as unknown as ScheduleBlock[]) ?? [],
    cateringInfo:    cs.cateringInfo,
    notes:           cs.notes,
    weather:         cs.weather       as unknown as WeatherInfo | null,
    hospitalInfo:    cs.hospitalInfo  as unknown as HospitalInfo | null,
    otherContacts:   ((cs as any).otherContacts as unknown as import('@/server/actions/call-sheets').OtherContact[]) ?? [],
    clientContact:   project.client
      ? {
          companyName:  project.client.name,
          contactName:  project.client.contactName,
          contactEmail: project.client.contactEmail,
          contactPhone: project.client.contactPhone,
        }
      : null,
  }

  const timeFormat = (workspace?.callTimeFormat as TimeFormat | null) ?? '12H'

  return (
    <div className="pb-24">
      <CallSheetEditor initial={initial} rolodexContacts={rolodexContacts} timeFormat={timeFormat} />
    </div>
  )
}
