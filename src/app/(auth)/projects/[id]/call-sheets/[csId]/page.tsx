import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { CallSheetEditor } from '@/components/call-sheets/CallSheetEditor'
import type { CrewDept, ScheduleBlock, WeatherInfo, HospitalInfo, TalentMember, PointOfContact } from '@/server/actions/call-sheets'

// Geocoding + Overpass + weather in sequence can take ~20s; extend the limit.
export const maxDuration = 30

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; csId: string }>
}) {
  const { csId } = await params
  const cs = await db.callSheet.findUnique({ where: { id: csId }, select: { title: true } })
  return { title: cs ? `${cs.title} — TTP Budget` : 'Call Sheet' }
}

export default async function CallSheetPage({
  params,
}: {
  params: Promise<{ id: string; csId: string }>
}) {
  const { id: projectId, csId } = await params
  const user = await getCurrentUser()

  const [cs, project, budget] = await Promise.all([
    db.callSheet.findFirst({
      where: { id: csId, workspaceId: user.workspaceId },
    }),
    db.project.findFirst({
      where: { id: projectId, workspaceId: user.workspaceId },
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
      where: { projectId, workspaceId: user.workspaceId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
  ])

  if (!cs || !project) notFound()

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

  return (
    <div className="pb-24">
      <CallSheetEditor initial={initial} />
    </div>
  )
}
