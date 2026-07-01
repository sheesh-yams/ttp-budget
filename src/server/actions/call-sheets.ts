'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import type { ScopedDb } from '@/lib/db-scoped'
import { Prisma } from '@prisma/client'
import type { ActionResult } from '@/types'
import { toJsonSafe } from '@/lib/json-safe'
import { generatePublicToken } from '@/lib/secure-token'
import { buildScheduleSnapshot, snapshotToScheduleBlocks } from '@/lib/schedule-compute'

// =============================================================================
// Crew import from budget
// =============================================================================

export async function importCrewFromBudget(
  callSheetId: string,
  budgetId: string
): Promise<ActionResult<{ added: number; crew: CrewDept[] }>> {
  try {
    const sdb = await getScopedDb()

    // Verify call sheet belongs to active workspace (extension scopes automatically)
    const cs = await sdb.callSheet.findFirst({
      where: { id: callSheetId },
      select: { id: true, projectId: true, crew: true, status: true },
    })
    if (!cs) return { success: false, error: 'Call sheet not found' }
    if (cs.status === 'FINAL') return { success: false, error: 'Cannot edit a finalized call sheet' }

    // Verify budget belongs to same workspace
    const budget = await sdb.budget.findFirst({
      where: { id: budgetId },
      select: { id: true },
    })
    if (!budget) return { success: false, error: 'Budget not found' }

    // Get primary phase and its CREW line items — sdb auto-scopes both queries.
    const phase =
      (await sdb.phase.findFirst({ where: { budgetId, isPrimary: true } })) ??
      (await sdb.phase.findFirst({ where: { budgetId }, orderBy: { order: 'asc' } }))
    if (!phase) return { success: false, error: 'Budget has no phases' }

    // CREW filter: matches items explicitly categorised as CREW, OR items created
    // before the lineItemCategory migration whose rate card is CREW/TALENT.
    const crewWhere = {
      OR: [
        { lineItemCategory: 'CREW' },
        { lineItemCategory: null, rateCard: { category: { in: ['CREW', 'TALENT'] } } },
      ],
    } as Prisma.LineItemWhereInput

    // Fetch all top-level accounts with their CREW line items — sdb auto-scopes.
    const accounts = await sdb.account.findMany({
      where: { phaseId: phase.id, parentId: null },
      orderBy: { order: 'asc' },
      select: {
        name: true,
        lineItems: {
          where: crewWhere,
          orderBy: { order: 'asc' },
          select: { description: true, quantity: true, quantityFormula: true },
        },
        children: {
          orderBy: { order: 'asc' },
          select: {
            name: true,
            lineItems: {
              where: crewWhere,
              orderBy: { order: 'asc' },
              select: { description: true, quantity: true, quantityFormula: true },
            },
          },
        },
      },
    })

    // Use the A value from quantityFormula as headcount.
    // "3x2" → A=3 people × B=2 days. We want 3 slots, not 2.
    // If there's no formula, quantity itself is treated as headcount.
    function headcountOf(qty: unknown, formula: string | null): number {
      const match = formula?.match(/^(\d+(?:\.\d+)?)[x×]/)
      if (match) return Math.max(1, Math.round(Number(match[1])))
      return Math.max(1, Math.round(Number(qty)))
    }

    const incoming: Array<{ dept: string; role: string; qty: number }> = []
    for (const acc of accounts) {
      const allItems = [
        ...acc.lineItems.map(i => ({
          dept: acc.name,
          role: i.description,
          qty: headcountOf(i.quantity, i.quantityFormula),
        })),
        ...acc.children.flatMap(child =>
          child.lineItems.map(i => ({
            dept: child.name,
            role: i.description,
            qty: headcountOf(i.quantity, i.quantityFormula),
          }))
        ),
      ]
      incoming.push(...allItems)
    }

    if (!incoming.length) {
      return { success: false, error: 'No crew line items found in this budget. Make sure line items are added from CREW rate cards.' }
    }

    // Sum headcounts per (dept, role) across all matching line items
    const incomingCounts = new Map<string, { dept: string; role: string; count: number }>()
    for (const { dept, role, qty } of incoming) {
      const key = `${dept}::${role}`
      const entry = incomingCounts.get(key)
      if (entry) entry.count += qty
      else incomingCounts.set(key, { dept, role, count: qty })
    }

    // Merge into existing crew
    const existingCrew = (cs.crew as unknown as CrewDept[]) ?? []
    const crewMap = new Map<string, CrewMember[]>(existingCrew.map(d => [d.dept, d.members]))

    let added = 0
    for (const { dept, role, count } of incomingCounts.values()) {
      const members = crewMap.get(dept) ?? []
      const existingForRole = members.filter(m => m.role === role).length
      const slotsNeeded = Math.max(0, count - existingForRole)
      for (let i = 0; i < slotsNeeded; i++) {
        members.push({ name: '', role, callTime: '' })
        added++
      }
      crewMap.set(dept, members)
    }

    // Preserve original dept order, then append any new depts
    const existingDeptNames = new Set(existingCrew.map(d => d.dept))
    const newCrew: CrewDept[] = [
      ...existingCrew.map(d => ({ dept: d.dept, members: crewMap.get(d.dept) ?? d.members })),
      ...Array.from(crewMap.entries())
        .filter(([name]) => !existingDeptNames.has(name))
        .map(([dept, members]) => ({ dept, members })),
    ]

    await sdb.callSheet.update({
      where: { id: callSheetId },
      data: { crew: toJsonSafe(newCrew) },
    })

    revalidatePath(`/projects/${cs.projectId}/call-sheets/${callSheetId}`)
    // Return the full updated crew so the editor can call setCrew() immediately
    // without waiting for a router.refresh() round-trip.
    return { success: true, data: { added, crew: newCrew } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to import crew' }
  }
}

// =============================================================================
// JSON field types
// =============================================================================

export interface CrewMember {
  name: string
  role: string
  callTime: string   // "HH:MM"
  phone?: string
  email?: string
  contactId?: string // Rolodex contact link (optional)
}

export interface CrewDept {
  dept: string
  members: CrewMember[]
}

/** On-screen talent (flat list, no dept grouping). */
export interface TalentMember {
  name: string
  role?: string      // character name / "Model" / "Talent"
  callTime: string   // "HH:MM"
  phone?: string
  email?: string
  contactId?: string // Rolodex contact link (optional)
}

export interface PointOfContact {
  name: string
  title?: string     // "EP", "Producer", "AD", etc.
  phone?: string
  email?: string
}

export interface ScheduleBlock {
  startTime: string  // "HH:MM"  (field was `time` in v1 — kept as fallback below)
  time?: string      // @deprecated — kept for backward-compat with existing records
  endTime?: string   // "HH:MM"
  label: string
  whoNeeded?: string // free-text: "Director, DP, 1st AD"
  notes?: string
}

export interface HospitalInfo {
  name: string
  address: string
  phone?: string
  distanceKm: number
  lat: number
  lng: number
}

/** Additional contacts on the call sheet (venue POC, client rep, etc.) */
export interface OtherContact {
  name: string
  role?: string     // "Venue Manager", "Client Rep", "Stylist" …
  company?: string
  phone?: string
  email?: string
}

export interface WeatherInfo {
  high: number       // °F
  low: number        // °F
  conditions: string // human-readable WMO code label
  windMph: number
  precipPct: number  // 0–100
  sunrise: string    // ISO datetime string
  sunset: string     // ISO datetime string
  fetchedAt: string  // ISO datetime string
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** WMO weather interpretation code → readable label. */
function wmoConditions(code: number): string {
  if (code === 0)              return 'Clear sky'
  if (code <= 3)               return 'Partly cloudy'
  if (code <= 9)               return 'Fog'
  if (code <= 29)              return 'Drizzle'
  if (code <= 39)              return 'Rain'
  if (code <= 49)              return 'Snow / Sleet'
  if (code <= 59)              return 'Freezing drizzle'
  if (code <= 69)              return 'Rain'
  if (code <= 79)              return 'Snow'
  if (code <= 84)              return 'Rain showers'
  if (code <= 86)              return 'Snow showers'
  if (code <= 99)              return 'Thunderstorm'
  return 'Unknown'
}

/** Verify a call sheet belongs to the active workspace, return it or throw. */
async function getOwnedSheet(id: string, sdb: ScopedDb) {
  const cs = await sdb.callSheet.findFirst({
    where: { id },
    select: {
      id: true, projectId: true, status: true, publicToken: true,
      locationAddress: true, shootDate: true, locationLat: true, locationLng: true,
      weather: true,
    },
  })
  if (!cs) throw new Error('Call sheet not found')
  return cs
}

// =============================================================================
// CRUD
// =============================================================================

export async function createCallSheet(
  projectId: string,
  input: { title: string; shootDate: string; generalCall?: string; shootDayId?: string }
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    // If linked to a shoot day, pull in that day's stripboard schedule + location
    // immediately so the call sheet starts populated instead of blank.
    let shootDayFields: {
      shootDayId?: string
      schedule?: ReturnType<typeof snapshotToScheduleBlocks>
      scheduleSnapshot?: ReturnType<typeof buildScheduleSnapshot>
      scheduleSyncedAt?: Date
      locationName?: string
      locationAddress?: string
      generalCall?: string
    } = {}

    if (input.shootDayId) {
      const shootDay = await sdb.shootDay.findFirst({
        where: { id: input.shootDayId, projectId },
        include: { primaryLocation: { select: { name: true, address: true } } },
      })
      if (shootDay) {
        shootDayFields.shootDayId = shootDay.id
        if (shootDay.startTime) shootDayFields.generalCall = shootDay.startTime
        if (shootDay.primaryLocation) {
          shootDayFields.locationName = shootDay.primaryLocation.name
          shootDayFields.locationAddress = shootDay.primaryLocation.address ?? undefined
        }

        const primarySchedule = await sdb.schedule.findFirst({ where: { projectId, isPrimary: true } })
        if (primarySchedule) {
          const entries = await sdb.scheduleEntry.findMany({
            where: { scheduleId: primarySchedule.id, shootDayId: shootDay.id },
            orderBy: { orderIndex: 'asc' },
            include: { scene: { include: { location: true } } },
          })
          const snapshot = buildScheduleSnapshot(entries)
          shootDayFields.schedule = snapshotToScheduleBlocks(snapshot)
          shootDayFields.scheduleSnapshot = snapshot
          shootDayFields.scheduleSyncedAt = new Date()
        }
      }
    }

    // Pre-populate crew from the project's Teams-page members — this is the source of truth
    // for who's on the project. Each assigned member carries their name/contact info;
    // unassigned placeholders carry role+dept but no name.
    const teamMembers = await sdb.projectMember.findMany({
      where: { projectId },
      orderBy: [{ department: 'asc' }, { order: 'asc' }, { name: 'asc' }],
      select: { name: true, role: true, department: true, callTime: true, phone: true, email: true, contactId: true },
    })

    // Group by department; fall back to 'Crew' when no department is set.
    const deptMap = new Map<string, CrewMember[]>()
    for (const m of teamMembers) {
      const dept = m.department ?? 'Crew'
      if (!deptMap.has(dept)) deptMap.set(dept, [])
      deptMap.get(dept)!.push({
        name:      m.name === 'Unassigned' ? '' : m.name,
        role:      m.role,
        callTime:  m.callTime ?? '',
        phone:     m.phone   ?? '',
        email:     m.email   ?? '',
        ...(m.contactId ? { contactId: m.contactId } : {}),
      })
    }

    const initialCrew: CrewDept[] = Array.from(deptMap.entries()).map(([dept, members]) => ({ dept, members }))

    const cs = await sdb.callSheet.create({
      data: {
        projectId,
        title:       input.title,
        shootDate:   new Date(input.shootDate),
        generalCall: input.generalCall ?? shootDayFields.generalCall ?? '07:00',
        publicToken: generatePublicToken(),
        crew:        initialCrew as unknown as Prisma.InputJsonValue,
        ...(shootDayFields.shootDayId        ? { shootDayId: shootDayFields.shootDayId } : {}),
        ...(shootDayFields.schedule          ? { schedule: shootDayFields.schedule } : {}),
        ...(shootDayFields.scheduleSnapshot  ? { scheduleSnapshot: shootDayFields.scheduleSnapshot, scheduleSyncedAt: shootDayFields.scheduleSyncedAt } : {}),
        ...(shootDayFields.locationName      ? { locationName: shootDayFields.locationName } : {}),
        ...(shootDayFields.locationAddress   ? { locationAddress: shootDayFields.locationAddress } : {}),
      } as unknown as Parameters<typeof sdb.callSheet.create>[0]['data'],
      select: { id: true, publicToken: true },
    })

    revalidatePath(`/projects/${projectId}`)
    if (shootDayFields.shootDayId) revalidatePath(`/projects/${projectId}/schedule`)
    return { success: true, data: cs }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to create call sheet' }
  }
}

export async function updateCallSheet(
  id: string,
  input: Partial<{
    title: string
    shootDate: string
    generalCall: string
    locationName: string
    locationAddress: string
    parkingAddress: string
    locationNotes: string
    pointOfContact: PointOfContact | null
    talent: TalentMember[]
    crew: CrewDept[]
    schedule: ScheduleBlock[]
    otherContacts: OtherContact[]
    hospitalInfo: HospitalInfo | null
    cateringInfo: string
    notes: string
  }>
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    const cs = await getOwnedSheet(id, sdb)
    if (cs.status === 'FINAL') return { success: false, error: 'Cannot edit a finalized call sheet' }

    // Clear cached geo + weather when the address changes
    const addressChanging = input.locationAddress !== undefined && input.locationAddress !== cs.locationAddress

    await sdb.callSheet.update({
      where: { id },
      data: {
        ...(input.title              !== undefined && { title:            input.title }),
        ...(input.shootDate          !== undefined && { shootDate:        new Date(input.shootDate) }),
        ...(input.generalCall        !== undefined && { generalCall:      input.generalCall }),
        ...(input.locationName       !== undefined && { locationName:     input.locationName }),
        ...(input.locationAddress    !== undefined && { locationAddress:  input.locationAddress }),
        ...(input.parkingAddress     !== undefined && { parkingAddress:   input.parkingAddress }),
        ...(input.locationNotes      !== undefined && { locationNotes:    input.locationNotes }),
        ...(input.pointOfContact     !== undefined && { pointOfContact:   toJsonSafe(input.pointOfContact) }),
        ...(input.talent             !== undefined && { talent:        toJsonSafe(input.talent) }),
        ...(input.crew               !== undefined && { crew:          toJsonSafe(input.crew) }),
        ...(input.schedule           !== undefined && { schedule:      toJsonSafe(input.schedule) }),
        ...(input.otherContacts      !== undefined && { otherContacts: toJsonSafe(input.otherContacts) }),
        ...(input.hospitalInfo       !== undefined && !addressChanging && { hospitalInfo: input.hospitalInfo ? toJsonSafe(input.hospitalInfo) : null }),
        ...(input.cateringInfo       !== undefined && { cateringInfo:  input.cateringInfo }),
        ...(input.notes              !== undefined && { notes:            input.notes }),
        ...(addressChanging && { locationLat: null, locationLng: null, hospitalInfo: null, weather: null }),
      },
    })

    // Bi-directional sync (fire-and-forget — never fails the main save):
    // 1. Push callTime changes from linked rows → ProjectMember.callTime
    // 2. When a crew row gains a contactId+name, upsert the matching ProjectMember
    if (input.crew !== undefined || input.talent !== undefined) {
      syncSheetCallTimesToMembers(cs.projectId, input.crew, input.talent, sdb).catch(() => {})
      syncSheetMembersToTeam(cs.projectId, input.crew, input.talent, sdb).catch(() => {})
    }

    revalidatePath(`/projects/${cs.projectId}`)
    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: undefined }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update call sheet' }
  }
}

// ── Sync helper: push call-sheet callTime edits back to ProjectMember rows ────

async function syncSheetCallTimesToMembers(
  projectId: string,
  crew: CrewDept[] | undefined,
  talent: TalentMember[] | undefined,
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
) {
  const updates = new Map<string, string>() // contactId → callTime
  if (crew) {
    for (const dept of crew) {
      for (const m of dept.members) {
        if (m.contactId && m.callTime) updates.set(m.contactId, m.callTime)
      }
    }
  }
  if (talent) {
    for (const t of talent) {
      if (t.contactId && t.callTime) updates.set(t.contactId, t.callTime)
    }
  }
  if (updates.size === 0) return

  const members = await sdb.projectMember.findMany({
    where: { projectId, contactId: { in: [...updates.keys()] } },
    select: { id: true, contactId: true, callTime: true },
  })

  for (const member of members) {
    if (!member.contactId) continue
    const newTime = updates.get(member.contactId)
    if (newTime !== undefined && newTime !== member.callTime) {
      await sdb.projectMember.update({ where: { id: member.id }, data: { callTime: newTime } })
    }
  }
}

// ── Sync helper: when a Rolodex-linked crew/talent row is saved, upsert the
//    matching ProjectMember so the Teams page reflects who's actually assigned.
//    Priority: fill the first unassigned placeholder for that role; otherwise create.

async function syncSheetMembersToTeam(
  projectId: string,
  crew: CrewDept[] | undefined,
  talent: TalentMember[] | undefined,
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
) {
  // Collect all linked entries that have a real name
  const entries: Array<{
    contactId: string
    name:      string
    role:      string
    callTime:  string
    phone?:    string
    email?:    string
    dept?:     string
  }> = []

  if (crew) {
    for (const dept of crew) {
      for (const m of dept.members) {
        if (m.contactId && m.name.trim()) {
          entries.push({ contactId: m.contactId, name: m.name, role: m.role, callTime: m.callTime, phone: m.phone, email: m.email, dept: dept.dept })
        }
      }
    }
  }
  if (talent) {
    for (const t of talent) {
      if (t.contactId && t.name.trim()) {
        entries.push({ contactId: t.contactId, name: t.name, role: t.role ?? '', callTime: t.callTime, phone: t.phone, email: t.email })
      }
    }
  }
  if (entries.length === 0) return

  // Load current team members once
  const existing = await sdb.projectMember.findMany({
    where: { projectId },
    select: { id: true, contactId: true, name: true, role: true, order: true },
  })

  const byContactId = new Map(
    existing.filter(m => m.contactId).map(m => [m.contactId!, m])
  )

  let maxOrder = Math.max(-1, ...existing.map(m => m.order))

  for (const entry of entries) {
    // Already on the team — callTime is handled by syncSheetCallTimesToMembers
    if (byContactId.has(entry.contactId)) continue

    // Find the first unassigned placeholder with a matching role
    const placeholder = existing.find(
      m => m.name === 'Unassigned' && m.role === entry.role && !byContactId.has(m.contactId ?? '__none__')
    )

    if (placeholder) {
      await sdb.projectMember.update({
        where: { id: placeholder.id },
        data: {
          contactId:   entry.contactId,
          name:        entry.name,
          callTime:    entry.callTime || null,
          phone:       entry.phone  || null,
          email:       entry.email  || null,
          mismatchFlag: false,
        },
      })
      // Mark as filled so subsequent entries for the same role get a fresh slot
      byContactId.set(entry.contactId, { ...placeholder, name: entry.name })
    } else {
      // No placeholder — create a fresh member
      maxOrder++
      await sdb.projectMember.create({
        data: {
          projectId,
          contactId:   entry.contactId,
          name:        entry.name,
          role:        entry.role,
          department:  entry.dept ?? null,
          email:       entry.email  || null,
          phone:       entry.phone  || null,
          callTime:    entry.callTime || null,
          rateCents:   null,
          rateUnit:    'DAY',
          mismatchFlag: false,
          order:       maxOrder,
        },
      })
      existing.push({ id: 'new', contactId: entry.contactId, name: entry.name, role: entry.role, order: maxOrder })
      byContactId.set(entry.contactId, { id: 'new', contactId: entry.contactId, name: entry.name, role: entry.role, order: maxOrder })
    }
  }

  revalidatePath(`/projects/${projectId}/crew`)
}

export async function deleteCallSheet(id: string): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    const cs = await getOwnedSheet(id, sdb)
    await sdb.callSheet.delete({ where: { id } })
    revalidatePath(`/projects/${cs.projectId}`)
    return { success: true, data: undefined }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to delete call sheet' }
  }
}

// =============================================================================
// Status transitions
// =============================================================================

export async function sendCallSheet(id: string): Promise<ActionResult<{ publicToken: string }>> {
  try {
    const sdb = await getScopedDb()
    const cs = await getOwnedSheet(id, sdb)

    // Auto-refresh weather & hospital when sending so crew gets the freshest forecast.
    // Only skip if weather was fetched within the last 3 hours (already very fresh).
    if (cs.locationAddress) {
      const existingWeather = cs.weather as { fetchedAt?: string } | null
      const fetchedAt = existingWeather?.fetchedAt ? new Date(existingWeather.fetchedAt).getTime() : 0
      const isStale = Date.now() - fetchedAt > 3 * 60 * 60 * 1000
      if (isStale) {
        // Fire-and-forget — don't block send if location fetch fails
        fetchLocationData(id).catch(() => {})
      }
    }

    // Call sheets expire 14 days after the shoot date (or from now if shoot date passed)
    const shootBase = cs.shootDate > new Date() ? cs.shootDate : new Date()
    const tokenExpiry = new Date(shootBase.getTime() + 14 * 24 * 60 * 60 * 1000)

    await sdb.callSheet.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        publicTokenExpiresAt: tokenExpiry,
      } as unknown as Parameters<typeof sdb.callSheet.update>[0]['data'],
    })

    revalidatePath(`/projects/${cs.projectId}`)
    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: { publicToken: cs.publicToken } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to send call sheet' }
  }
}

export async function finalizeCallSheet(id: string): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    const cs = await getOwnedSheet(id, sdb)

    await sdb.callSheet.update({
      where: { id },
      data: { status: 'FINAL' },
    })

    revalidatePath(`/projects/${cs.projectId}`)
    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: undefined }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to finalize call sheet' }
  }
}

export async function reopenCallSheet(id: string): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    const cs = await getOwnedSheet(id, sdb)

    await sdb.callSheet.update({
      where: { id },
      data: { status: 'DRAFT' },
    })

    revalidatePath(`/projects/${cs.projectId}`)
    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: undefined }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to reopen call sheet' }
  }
}

// =============================================================================
// Location data fetch — Nominatim geocoding + Overpass hospital + Open-Meteo
// =============================================================================

export async function fetchLocationData(id: string): Promise<ActionResult<{
  weather: WeatherInfo
  hospital: HospitalInfo | null
  lat: number
  lng: number
}>> {
  try {
    const sdb = await getScopedDb()
    const cs = await getOwnedSheet(id, sdb)

    if (!cs.locationAddress) return { success: false, error: 'No location address set — fill in the shoot address first' }

    // ── 1. Geocode via Nominatim ────────────────────────────────────────────────
    let lat = cs.locationLat
    let lng = cs.locationLng

    if (!lat || !lng) {
      /** Try a single Nominatim query; returns [lat, lng] or null. */
      async function nominatim(q: string): Promise<[number, number] | null> {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
            {
              headers: {
                'User-Agent': 'TTP-Budget/1.0 (budget.thethirdplace.co)',
                'Accept-Language': 'en',
              },
            }
          )
          const data = (await res.json()) as Array<{ lat: string; lon: string }>
          return data.length ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null
        } catch {
          return null
        }
      }

      // Pass 1 — strip suite/unit/floor which Nominatim can't resolve
      const stripped = cs.locationAddress
        .replace(/\b(suite|ste|apt|apartment|unit|floor|fl|room|rm|#)\.?\s*[\w-]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/,\s*,/g, ',')
        .trim()

      let coords = await nominatim(stripped)

      // Pass 2 — if that failed, extract only city + state/province + postal code
      // e.g. "123 Main St, Suite 4, Los Angeles, CA 90001" → "Los Angeles, CA 90001"
      if (!coords) {
        const cityStateZip = cs.locationAddress
          .split(',')
          .map(s => s.trim())
          .filter(s => /\d{5}|[A-Z]{2}/.test(s) || s.length > 3)
          .slice(-3)   // last 3 comma segments are usually city, state, zip
          .join(', ')
        if (cityStateZip) coords = await nominatim(cityStateZip)
      }

      if (!coords) {
        return {
          success: false,
          error: 'Could not geocode this address — check that it includes a city and state, or try a nearby landmark',
        }
      }
      ;[lat, lng] = coords
    }

    // ── 2 + 3. Overpass hospital + Open-Meteo weather — run in parallel ─────────
    const dateStr = cs.shootDate.toISOString().split('T')[0]

    // Both amenity=hospital AND healthcare=hospital — some NYC hospitals only have the latter.
    const overpassQuery =
      `[out:json][timeout:12];` +
      `(node["amenity"="hospital"](around:25000,${lat},${lng});` +
      `way["amenity"="hospital"](around:25000,${lat},${lng});` +
      `node["healthcare"="hospital"](around:25000,${lat},${lng});` +
      `way["healthcare"="hospital"](around:25000,${lat},${lng}););` +
      `out center 15;`

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,precipitation_probability_max,sunrise,sunset` +
      `&timezone=auto` +
      `&start_date=${dateStr}&end_date=${dateStr}` +
      `&temperature_unit=fahrenheit&windspeed_unit=mph`

    // Overpass endpoints — try primary, fall back to mirror if it hangs
    async function fetchOverpass(query: string): Promise<unknown> {
      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
      ]
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
            // Hard client-side timeout — the [timeout:12] in the query only
            // limits server processing; the HTTP connection itself can hang longer.
            signal: AbortSignal.timeout(14000),
          })
          if (!res.ok) continue
          return await res.json()
        } catch {
          // try next endpoint
        }
      }
      throw new Error('All Overpass endpoints unavailable')
    }

    const [ovResult, wResult] = await Promise.allSettled([
      fetchOverpass(overpassQuery),
      fetch(weatherUrl).then(r => r.json()),
    ])

    // ── Parse hospital ───────────────────────────────────────────────────────────
    let hospital: HospitalInfo | null = null
    if (ovResult.status === 'fulfilled') {
      try {
        const ovData = ovResult.value as {
          elements: Array<{
            type: string
            lat?: number
            lon?: number
            center?: { lat: number; lon: number }
            tags?: {
              name?: string
              phone?: string
              'contact:phone'?: string
              'addr:full'?: string
              'addr:housenumber'?: string
              'addr:street'?: string
              'addr:city'?: string
              'addr:state'?: string
            }
          }>
        }
        if (ovData.elements?.length) {
          const candidates = ovData.elements
            .map(el => {
              const elLat = el.lat ?? el.center?.lat ?? 0
              const elLng = el.lon ?? el.center?.lon ?? 0
              return { el, elLat, elLng, dist: haversineKm(lat!, lng!, elLat, elLng) }
            })
          candidates.sort((a, b) => a.dist - b.dist)

          if (candidates.length > 0) {
            const { el, elLat, elLng, dist } = candidates[0]
            const tags = el.tags ?? {}
            const addrParts = [
              tags['addr:housenumber'],
              tags['addr:street'],
              tags['addr:city'],
              tags['addr:state'],
            ].filter(Boolean)
            const address = tags['addr:full'] ?? (addrParts.length ? addrParts.join(', ') : '')

            hospital = {
              name:       tags.name ?? 'Hospital',
              address,
              phone:      tags.phone ?? tags['contact:phone'],
              distanceKm: Math.round(dist * 10) / 10,
              lat:        elLat,
              lng:        elLng,
            }
          }
        }
      } catch {
        // best-effort
      }
    }

    // ── Parse weather ────────────────────────────────────────────────────────────
    if (wResult.status === 'rejected') {
      return { success: false, error: 'Weather fetch failed — please try again' }
    }
    const wData = wResult.value as {
      daily: {
        temperature_2m_max:            number[]
        temperature_2m_min:            number[]
        weathercode:                   number[]
        windspeed_10m_max:             number[]
        precipitation_probability_max: number[]
        sunrise:                       string[]
        sunset:                        string[]
      }
    }

    const d = wData.daily
    if (!d?.temperature_2m_max?.length) {
      return {
        success: false,
        error: 'Weather unavailable — forecasts are only available within 16 days of the shoot date',
      }
    }
    const weather: WeatherInfo = {
      high:       Math.round(d.temperature_2m_max[0]),
      low:        Math.round(d.temperature_2m_min[0]),
      conditions: wmoConditions(d.weathercode[0]),
      windMph:    Math.round(d.windspeed_10m_max[0]),
      precipPct:  d.precipitation_probability_max[0] ?? 0,
      sunrise:    d.sunrise[0],
      sunset:     d.sunset[0],
      fetchedAt:  new Date().toISOString(),
    }

    // ── 4. Persist everything ────────────────────────────────────────────────────
    await sdb.callSheet.update({
      where: { id },
      data: {
        locationLat:  lat,
        locationLng:  lng,
        weather:      toJsonSafe(weather),
        ...(hospital ? { hospitalInfo: toJsonSafe(hospital) } : {}),
      },
    })

    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: { weather, hospital, lat, lng } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to fetch location data' }
  }
}
