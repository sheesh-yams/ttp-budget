import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getWorkspaceId, requireRole } from '@/lib/auth'
import { ScheduleEditorClient } from '@/components/projects/schedule/ScheduleEditorClient'

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const workspaceId = await getWorkspaceId()
  const gate = await requireRole(['OWNER', 'PRODUCER', 'COLLABORATOR'])

  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  const [shootDays, schedules, scenes] = await Promise.all([
    db.shootDay.findMany({
      where: { projectId, workspaceId },
      orderBy: { orderIndex: 'asc' },
      include: { primaryLocation: { select: { id: true, name: true } } },
    }),
    db.schedule.findMany({
      where: { projectId, workspaceId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    }),
    db.scene.findMany({
      where: { projectId, workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { location: { select: { id: true, name: true } } },
    }),
  ])

  // Entries for primary (or first) schedule
  const activeSchedule = schedules.find(s => s.isPrimary) ?? schedules[0] ?? null
  const entries = activeSchedule
    ? await db.scheduleEntry.findMany({
        where: { scheduleId: activeSchedule.id, workspaceId },
        orderBy: { orderIndex: 'asc' },
        include: {
          scene: {
            include: { location: { select: { id: true, name: true } } },
          },
        },
      })
    : []

  const locations = await db.location.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, address: true },
  })

  return (
    <ScheduleEditorClient
      projectId={projectId}
      projectName={project.name}
      userRole={gate.role}
      shootDays={shootDays.map(d => ({
        id: d.id,
        date: d.date.toISOString(),
        orderIndex: d.orderIndex,
        label: d.label,
        startTime: d.startTime,
        primaryLocation: d.primaryLocation,
      }))}
      schedules={schedules.map(s => ({
        id: s.id,
        name: s.name,
        isPrimary: s.isPrimary,
      }))}
      activeScheduleId={activeSchedule?.id ?? null}
      initialEntries={entries.map(e => ({
        id: e.id,
        scheduleId: e.scheduleId,
        shootDayId: e.shootDayId,
        orderIndex: e.orderIndex,
        kind: e.kind,
        computedStartTime: e.computedStartTime,
        computedEndTime: e.computedEndTime,
        sceneId: e.sceneId,
        scene: e.scene ? {
          id: e.scene.id,
          sceneNumber: e.scene.sceneNumber,
          setting: e.scene.setting,
          description: e.scene.description,
          intExt: e.scene.intExt,
          timeOfDay: e.scene.timeOfDay,
          pageEighths: e.scene.pageEighths,
          estimatedDuration: e.scene.estimatedDuration,
          colorOverride: e.scene.colorOverride,
          castContactIds: e.scene.castContactIds,
          archived: e.scene.archived,
          location: e.scene.location,
        } : null,
        bannerType: e.bannerType,
        bannerLabel: e.bannerLabel,
        bannerDurationMin: e.bannerDurationMin,
        bannerNote: e.bannerNote,
      }))}
      allScenes={scenes.map(s => ({
        id: s.id,
        sceneNumber: s.sceneNumber,
        setting: s.setting,
        description: s.description,
        synopsis: s.synopsis,
        intExt: s.intExt,
        timeOfDay: s.timeOfDay,
        pageCount: s.pageCount,
        pageEighths: s.pageEighths,
        estimatedDuration: s.estimatedDuration,
        locationId: s.locationId,
        location: s.location,
        notes: s.notes,
        castContactIds: s.castContactIds,
        colorOverride: s.colorOverride,
        archived: s.archived,
      }))}
      locations={locations}
    />
  )
}
