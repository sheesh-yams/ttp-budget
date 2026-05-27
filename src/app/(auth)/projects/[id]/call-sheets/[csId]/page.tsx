import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { CallSheetEditor } from '@/components/call-sheets/CallSheetEditor'
import type { CrewDept, ScheduleBlock, WeatherInfo, HospitalInfo } from '@/server/actions/call-sheets'

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
      select: { id: true, name: true },
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
    emergencyContact:cs.emergencyContact,
    crew:            (cs.crew as unknown as CrewDept[])       ?? [],
    schedule:        (cs.schedule as unknown as ScheduleBlock[]) ?? [],
    cateringInfo:    cs.cateringInfo,
    notes:           cs.notes,
    weather:         cs.weather    as unknown as WeatherInfo | null,
    hospitalInfo:    cs.hospitalInfo as unknown as HospitalInfo | null,
  }

  return (
    <div className="pb-24">
      <CallSheetEditor initial={initial} />
    </div>
  )
}
