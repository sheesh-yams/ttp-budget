import { loadClientPeople } from '@/lib/client-people-load'
import { readSheetContacts, sheetClientContacts, type ClientContactPick } from '@/lib/client-people'
import { getAccess } from '@/lib/access'
import { notFound } from 'next/navigation'
import { requireProjectAccess, requireProjectArea } from '@/lib/project-access'
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
  const { id: projectId, csId } = await params
  // Scoped to this workspace and project — never resolve a title by id alone.
  const workspaceId = await getWorkspaceId()
  const cs = await db.callSheet.findFirst({ where: { id: csId, projectId, workspaceId }, select: { title: true } })
  return { title: cs ? `${cs.title} | Call Sheet` : 'Call Sheet' }
}

export default async function CallSheetPage({
  params,
}: {
  params: Promise<{ id: string; csId: string }>
}) {
  const { id: projectId, csId } = await params
  await requireProjectAccess(projectId)
  const projectAccess = await requireProjectArea(projectId, 'callSheets')
  const workspaceId = await getWorkspaceId()

  const [cs, project, budget, rolodexContacts, workspace] = await Promise.all([
    // Must belong to THIS project — the access check above is for projectId,
    // so a call sheet from another project must not render under it.
    db.callSheet.findFirst({
      where: { id: csId, projectId, workspaceId },
    }),
    db.project.findFirst({
      where: { id: projectId, workspaceId },
      select: {
        id: true,
        name: true,
        client: {
          select: {
            id: true,
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
    // The rolodex picker needs the Rolodex permission — otherwise no
    // workspace contact list.
    !(await getAccess()).can('rolodex') ? Promise.resolve([]) : db.contact.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, name: true, primaryRole: true, email: true, phone: true, dietaryTags: true, dietaryNotes: true },
      orderBy: { name: 'asc' },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { callTimeFormat: true },
    }),
  ])

  if (!cs || !project) notFound()

  // Dietary needs for the people on this sheet (and the project's crew), from
  // their Rolodex contacts — internal planning info for the editor only; the
  // sent call sheet never shows it. Anyone who can open this call sheet sees
  // these, Rolodex access or not.
  const sheetContactIds = [
    ...((cs.crew as unknown as CrewDept[]) ?? []).flatMap(d => d.members ?? []).map(m => m.contactId),
    ...((cs.talent as unknown as TalentMember[]) ?? []).map(t => t.contactId),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)
  const crewContactIds = (await db.projectMember.findMany({
    where: { projectId, workspaceId, contactId: { not: null } }, select: { contactId: true },
  })).map(m => m.contactId as string)
  const linked = await db.contact.findMany({
    where:  { workspaceId, id: { in: [...new Set([...sheetContactIds, ...crewContactIds])] } },
    select: { id: true, dietaryTags: true, dietaryNotes: true },
  })
  const dietary: Record<string, { tags: string[]; notes: string | null }> = {}
  for (const c of [...linked, ...rolodexContacts]) dietary[c.id] = { tags: c.dietaryTags, notes: c.dietaryNotes }

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

  const canEditSheet = projectAccess.can('callSheets', 'EDIT')
  const clientPeople = canEditSheet && project.client ? await loadClientPeople(db, workspaceId, project.client.id) : []
  const storedClient = readSheetContacts((cs as unknown as { clientContacts?: unknown }).clientContacts)
  // What the crew sees (hidden phones/emails blanked).
  const shownClient  = sheetClientContacts(storedClient, project.client)
  // Picked: the stored people still on the client, with their hide settings;
  // an older sheet (nothing stored) shows the main contact, so the Main
  // person starts ticked.
  const pickedClient: ClientContactPick[] = storedClient
    ? storedClient.flatMap(x => (x.contactId && clientPeople.some(p => p.id === x.contactId)
        ? [{ id: x.contactId, hidePhone: x.hidePhone, hideEmail: x.hideEmail }] : []))
    : clientPeople.filter(p => p.isMain).map(p => ({ id: p.id }))

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
    emailSummary: await (async () => {
      const rows = await db.callSheetRecipient.findMany({
        where: { callSheetId: cs.id, workspaceId, lastSentAt: { not: null } },
        select: { firstViewedAt: true, confirmedAt: true },
      })
      return {
        sent: rows.length,
        opened: rows.filter(r => r.firstViewedAt || r.confirmedAt).length,
        confirmed: rows.filter(r => r.confirmedAt).length,
      }
    })(),
    pointOfContact:  (cs as any).pointOfContact as unknown as PointOfContact | null,
    talent:          ((cs as any).talent as unknown as TalentMember[]) ?? [],
    crew:            (cs.crew as unknown as CrewDept[])       ?? [],
    schedule:        (cs.schedule as unknown as ScheduleBlock[]) ?? [],
    cateringInfo:    cs.cateringInfo,
    notes:           cs.notes,
    weather:         cs.weather       as unknown as WeatherInfo | null,
    hospitalInfo:    cs.hospitalInfo  as unknown as HospitalInfo | null,
    otherContacts:   ((cs as any).otherContacts as unknown as import('@/server/actions/call-sheets').OtherContact[]) ?? [],
    // Client contacts on the sheet: what it shows now, and (for editors) the
    // client's people to pick from, preticked with what's shown.
    client: project.client ? {
      companyName: project.client.name,
      shown:       shownClient,
      people:      clientPeople,
      picked:      pickedClient,
    } : null,
  }

  const timeFormat = (workspace?.callTimeFormat as TimeFormat | null) ?? '12H'

  return (
    <div className="pb-24">
      <CallSheetEditor initial={initial} rolodexContacts={rolodexContacts} dietary={dietary} timeFormat={timeFormat} readOnly={!canEditSheet} />
    </div>
  )
}
