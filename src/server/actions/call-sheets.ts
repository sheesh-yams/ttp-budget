'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import type { ActionResult } from '@/types'

// =============================================================================
// Crew import from budget
// =============================================================================

export async function importCrewFromBudget(
  callSheetId: string,
  budgetId: string
): Promise<ActionResult<{ added: number; crew: CrewDept[] }>> {
  try {
    const user = await getCurrentUser()

    // Verify call sheet belongs to workspace
    const cs = await db.callSheet.findFirst({
      where: { id: callSheetId, workspaceId: user.workspaceId },
      select: { id: true, projectId: true, crew: true, status: true },
    })
    if (!cs) return { success: false, error: 'Call sheet not found' }
    if (cs.status === 'FINAL') return { success: false, error: 'Cannot edit a finalized call sheet' }

    // Verify budget belongs to same workspace
    const budget = await db.budget.findFirst({
      where: { id: budgetId, workspaceId: user.workspaceId },
      select: { id: true },
    })
    if (!budget) return { success: false, error: 'Budget not found' }

    // Get primary phase and its CREW line items
    const phase =
      (await db.phase.findFirst({ where: { budgetId, isPrimary: true } })) ??
      (await db.phase.findFirst({ where: { budgetId }, orderBy: { order: 'asc' } }))
    if (!phase) return { success: false, error: 'Budget has no phases' }

    // CREW filter: matches items explicitly categorised as CREW, OR items created
    // before the lineItemCategory migration whose rate card is CREW/TALENT.
    const crewWhere = {
      OR: [
        { lineItemCategory: 'CREW' },
        { lineItemCategory: null, rateCard: { category: { in: ['CREW', 'TALENT'] } } },
      ],
    } as Prisma.LineItemWhereInput

    // Fetch all top-level accounts with their CREW line items
    const accounts = await db.account.findMany({
      where: { phaseId: phase.id, parentId: null },
      orderBy: { order: 'asc' },
      select: {
        name: true,
        lineItems: {
          where: crewWhere,
          orderBy: { order: 'asc' },
          select: { description: true, quantity: true },
        },
        children: {
          orderBy: { order: 'asc' },
          select: {
            name: true,
            lineItems: {
              where: crewWhere,
              orderBy: { order: 'asc' },
              select: { description: true, quantity: true },
            },
          },
        },
      },
    })

    // Each line item = one person. quantity is billing days, NOT headcount.
    // We count the number of line items per (dept, role) pair and create that
    // many slots — so 2 "Production Assistant" line items → 2 PA slots,
    // but 1 "Associate Producer" × 6 days → 1 AP slot.
    const incoming: Array<{ dept: string; role: string }> = []
    for (const acc of accounts) {
      const allItems = [
        ...acc.lineItems.map(i => ({ dept: acc.name, role: i.description })),
        ...acc.children.flatMap(child =>
          child.lineItems.map(i => ({ dept: child.name, role: i.description }))
        ),
      ]
      incoming.push(...allItems)
    }

    if (!incoming.length) {
      return { success: false, error: 'No crew line items found in this budget. Make sure line items are added from CREW rate cards.' }
    }

    // Count how many line items share the same (dept, role) key
    const incomingCounts = new Map<string, { dept: string; role: string; count: number }>()
    for (const { dept, role } of incoming) {
      const key = `${dept}::${role}`
      const entry = incomingCounts.get(key)
      if (entry) entry.count++
      else incomingCounts.set(key, { dept, role, count: 1 })
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

    await db.callSheet.update({
      where: { id: callSheetId },
      data: { crew: JSON.parse(JSON.stringify(newCrew)) },
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
}

export interface CrewDept {
  dept: string
  members: CrewMember[]
}

export interface ScheduleBlock {
  time: string       // "HH:MM"
  label: string
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

/** Verify a call sheet belongs to the current user's workspace, return it or throw. */
async function getOwnedSheet(id: string, workspaceId: string) {
  const cs = await db.callSheet.findFirst({
    where: { id, workspaceId },
    select: { id: true, projectId: true, status: true, publicToken: true, locationAddress: true, shootDate: true, locationLat: true, locationLng: true },
  })
  if (!cs) throw new Error('Call sheet not found')
  return cs
}

// =============================================================================
// CRUD
// =============================================================================

export async function createCallSheet(
  projectId: string,
  input: { title: string; shootDate: string; generalCall?: string }
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const user = await getCurrentUser()
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId: user.workspaceId },
      select: { id: true },
    })
    if (!project) return { success: false, error: 'Project not found' }

    const cs = await db.callSheet.create({
      data: {
        workspaceId: user.workspaceId,
        projectId,
        title: input.title,
        shootDate: new Date(input.shootDate),
        generalCall: input.generalCall ?? '07:00',
      },
      select: { id: true, publicToken: true },
    })

    revalidatePath(`/projects/${projectId}`)
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
    emergencyContact: string
    crew: CrewDept[]
    schedule: ScheduleBlock[]
    cateringInfo: string
    notes: string
  }>
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser()
    const cs = await getOwnedSheet(id, user.workspaceId)
    if (cs.status === 'FINAL') return { success: false, error: 'Cannot edit a finalized call sheet' }

    // Clear cached geo + weather when the address changes
    const addressChanging = input.locationAddress !== undefined && input.locationAddress !== cs.locationAddress

    await db.callSheet.update({
      where: { id },
      data: {
        ...(input.title              !== undefined && { title:            input.title }),
        ...(input.shootDate          !== undefined && { shootDate:        new Date(input.shootDate) }),
        ...(input.generalCall        !== undefined && { generalCall:      input.generalCall }),
        ...(input.locationName       !== undefined && { locationName:     input.locationName }),
        ...(input.locationAddress    !== undefined && { locationAddress:  input.locationAddress }),
        ...(input.parkingAddress     !== undefined && { parkingAddress:   input.parkingAddress }),
        ...(input.locationNotes      !== undefined && { locationNotes:    input.locationNotes }),
        ...(input.emergencyContact   !== undefined && { emergencyContact: input.emergencyContact }),
        ...(input.crew               !== undefined && { crew:     JSON.parse(JSON.stringify(input.crew)) }),
        ...(input.schedule           !== undefined && { schedule: JSON.parse(JSON.stringify(input.schedule)) }),
        ...(input.cateringInfo       !== undefined && { cateringInfo:     input.cateringInfo }),
        ...(input.notes              !== undefined && { notes:            input.notes }),
        ...(addressChanging && { locationLat: null, locationLng: null, hospitalInfo: null, weather: null }),
      },
    })

    revalidatePath(`/projects/${cs.projectId}`)
    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: undefined }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update call sheet' }
  }
}

export async function deleteCallSheet(id: string): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser()
    const cs = await getOwnedSheet(id, user.workspaceId)
    await db.callSheet.delete({ where: { id } })
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
    const user = await getCurrentUser()
    const cs = await getOwnedSheet(id, user.workspaceId)

    await db.callSheet.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
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
    const user = await getCurrentUser()
    const cs = await getOwnedSheet(id, user.workspaceId)

    await db.callSheet.update({
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
    const user = await getCurrentUser()
    const cs = await getOwnedSheet(id, user.workspaceId)

    await db.callSheet.update({
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
    const user = await getCurrentUser()
    const cs = await getOwnedSheet(id, user.workspaceId)

    if (!cs.locationAddress) return { success: false, error: 'No location address set — fill in the shoot address first' }

    // ── 1. Geocode via Nominatim ────────────────────────────────────────────────
    let lat = cs.locationLat
    let lng = cs.locationLng

    if (!lat || !lng) {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cs.locationAddress)}`,
        {
          headers: {
            'User-Agent': 'TTP-Budget/1.0 (budget.thethirdplace.co)',
            'Accept-Language': 'en',
          },
        }
      )
      const geoData = (await geoRes.json()) as Array<{ lat: string; lon: string }>
      if (!geoData.length) {
        return { success: false, error: 'Could not find that address — try including city and state' }
      }
      lat = parseFloat(geoData[0].lat)
      lng = parseFloat(geoData[0].lon)
    }

    // ── 2. Nearest hospital via Overpass API ────────────────────────────────────
    // Search 20 km radius; fetch up to 5 candidates and pick the closest one.
    const overpassQuery =
      `[out:json][timeout:15];` +
      `(node["amenity"="hospital"](around:20000,${lat},${lng});` +
      `way["amenity"="hospital"](around:20000,${lat},${lng}););` +
      `out center 5;`

    let hospital: HospitalInfo | null = null
    try {
      const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      })
      const ovData = (await ovRes.json()) as {
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

      if (ovData.elements.length) {
        const candidates = ovData.elements.map(el => {
          const elLat = el.lat ?? el.center?.lat ?? 0
          const elLng = el.lon ?? el.center?.lon ?? 0
          const dist = haversineKm(lat!, lng!, elLat, elLng)
          return { el, elLat, elLng, dist }
        })
        candidates.sort((a, b) => a.dist - b.dist)

        const { el, elLat, elLng, dist } = candidates[0]
        const tags = el.tags ?? {}
        const addrParts = [
          tags['addr:housenumber'],
          tags['addr:street'],
          tags['addr:city'],
          tags['addr:state'],
        ].filter(Boolean)
        const address = tags['addr:full'] ?? (addrParts.length ? addrParts.join(', ') : 'Address not available')

        hospital = {
          name:       tags.name ?? 'Hospital',
          address,
          phone:      tags.phone ?? tags['contact:phone'],
          distanceKm: Math.round(dist * 10) / 10,
          lat:        elLat,
          lng:        elLng,
        }
      }
    } catch {
      // Overpass is best-effort — don't fail the whole fetch if it's down
    }

    // ── 3. Weather via Open-Meteo ───────────────────────────────────────────────
    const dateStr = cs.shootDate.toISOString().split('T')[0]
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,precipitation_probability_max,sunrise,sunset` +
      `&timezone=auto` +
      `&start_date=${dateStr}&end_date=${dateStr}` +
      `&temperature_unit=fahrenheit&windspeed_unit=mph`

    const wRes = await fetch(weatherUrl)
    const wData = (await wRes.json()) as {
      daily: {
        temperature_2m_max:           number[]
        temperature_2m_min:           number[]
        weathercode:                  number[]
        windspeed_10m_max:            number[]
        precipitation_probability_max: number[]
        sunrise:                      string[]
        sunset:                       string[]
      }
    }

    const d = wData.daily
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
    await db.callSheet.update({
      where: { id },
      data: {
        locationLat:  lat,
        locationLng:  lng,
        weather:      JSON.parse(JSON.stringify(weather)),
        ...(hospital ? { hospitalInfo: JSON.parse(JSON.stringify(hospital)) } : {}),
      },
    })

    revalidatePath(`/projects/${cs.projectId}/call-sheets/${id}`)
    return { success: true, data: { weather, hospital, lat, lng } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to fetch location data' }
  }
}
